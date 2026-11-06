import fs from "fs"
import path from "path"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { getBusinessConfig } from "../lib/business"

const SA_PROVIDER = "sa-courier_sa-courier" // identifier_id of the fulfilment provider


/**
 * Idempotent seed. Run: npx medusa exec ./src/scripts/seed.ts
 * Reads the catalogue from CATALOGUE_PATH (default ../catalogue/products.json).
 */
export default async function seed({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(Modules.FULFILLMENT)
  const pricing = container.resolve(Modules.PRICING)
  const storeModule = container.resolve(Modules.STORE)
  const biz = getBusinessConfig()
  const shipping = biz.shipping
  const found = async (entity: string, filters: Record<string, unknown>, fields = ["id"]) =>
    ((await query.graph({ entity, fields, filters })).data as any[])[0]

  // Sales channel
  logger.info("Seeding sales channel...")
  let channel = await found("sales_channel", { name: "Webshop" })
  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Webshop", description: "noordkaravane.co.za/shop" }] },
    })
    channel = result[0]
  }

  // Region (ZAR, ZA)
  logger.info("Seeding region...")
  let region = await found("region", { name: "South Africa" })
  if (!region) {
    const providers = ["pp_eft_eft"]
    if (process.env.PAYFAST_ENABLED === "true") providers.push("pp_payfast_payfast")
    const { result } = await createRegionsWorkflow(container).run({
      input: { regions: [{ name: "South Africa", currency_code: "zar", countries: ["za"], payment_providers: providers }] },
    })
    region = result[0]
  }
  // Tax-inclusive prices for ZAR and for this region.
  for (const [attribute, value] of [["currency_code", "zar"], ["region_id", region.id]] as const) {
    const existing = await pricing.listPricePreferences({ attribute, value } as any)
    if (!existing.length) await pricing.createPricePreferences({ attribute, value, is_tax_inclusive: true } as any)
  }

  // Store defaults
  const [store] = await storeModule.listStores()
  if (store) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          name: "Noord Karavane",
          supported_currencies: [{ currency_code: "zar", is_default: true }],
          default_sales_channel_id: channel.id,
          default_region_id: region.id,
        },
      },
    })
  }

  // Stock location
  logger.info("Seeding stock location, fulfilment set, shipping profile...")
  let location = await found("stock_location", { name: "Noord Karavane Workshop" })
  if (!location) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: { locations: [{ name: "Noord Karavane Workshop", address: { city: "Pretoria North", country_code: "ZA", address_1: "252 General Beyers Street", postal_code: "0182", province: "Gauteng" } }] },
    })
    location = result[0]
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: location.id, add: [channel.id] },
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: SA_PROVIDER },
    })
  }

  // Shipping profile
  let profile = ((await fulfillment.listShippingProfiles({ type: "default" })) as any[])[0]
  if (!profile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    })
    profile = result[0]
  }

  // Fulfilment set + service zone ZA
  let fset: any = ((await fulfillment.listFulfillmentSets({ name: "South Africa courier" }, { relations: ["service_zones"] })) as any[])[0]
  if (!fset) {
    fset = await fulfillment.createFulfillmentSets({
      name: "South Africa courier",
      type: "shipping",
      service_zones: [{ name: "South Africa", geo_zones: [{ country_code: "za", type: "country" }] }],
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fset.id },
    })
    fset = ((await fulfillment.listFulfillmentSets({ id: fset.id }, { relations: ["service_zones"] })) as any[])[0]
  }
  const zone = fset.service_zones[0]

  // Shipping options (calculated by the sa-courier provider: weight-banded, see config/business.json)
  const free = `free over R${shipping.free_shipping_threshold_zar} (parcels up to ${shipping.free_shipping_max_weight_g / 1000}kg)`
  const wanted = [
    { id: "pudo-locker", name: "Pudo Locker (locker-to-locker)", description: `R${shipping.pudo_locker_price_zar} for small parcels up to ${shipping.pudo_max_weight_g / 1000}kg, ${free}` },
    { id: "tcg-door", name: "The Courier Guy (door-to-door)", description: `From R${shipping.tcg_bands[0].price_zar} by parcel weight, ${free}` },
    ...(shipping.collect_from_workshop
      ? [{ id: "workshop-collect", name: "Collect from the workshop (Pretoria North)", description: "Free. We email you when it is ready, Mon to Thu 08:00 to 16:00, Fri 08:00 to 14:00" }]
      : []),
  ]
  const existingOptions = (await fulfillment.listShippingOptions({ service_zone: { id: zone.id } } as any)) as any[]
  const toCreate = wanted.filter((w) => !existingOptions.some((o) => o.name === w.name))
  if (toCreate.length) {
    await createShippingOptionsWorkflow(container).run({
      input: toCreate.map((w) => ({
        name: w.name,
        price_type: "calculated",
        provider_id: SA_PROVIDER,
        service_zone_id: zone.id,
        shipping_profile_id: profile.id,
        type: { label: w.name, description: w.description, code: w.id },
        data: { id: w.id },
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      })) as any,
    })
  }

  // Publishable key
  logger.info("Seeding publishable API key...")
  let key: any = await found("api_key", { title: "Webshop", type: "publishable" }, ["id", "token"])
  if (!key) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: "Webshop", type: "publishable", created_by: "" }] },
    })
    key = result[0]
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [channel.id] } })
  }

  // Categories (hierarchy from catalogue/categories.json, mirrors the Woo store)
  logger.info("Seeding categories...")
  const catPath = path.resolve(process.cwd(), process.env.CATEGORIES_PATH || "../catalogue/categories.json")
  const cats: { handle: string; name: string; parent_handle: string | null }[] = fs.existsSync(catPath)
    ? JSON.parse(fs.readFileSync(catPath, "utf8"))
    : []
  const catByName: Record<string, string> = {}
  const loadCats = async () =>
    ((await query.graph({ entity: "product_category", fields: ["id", "handle", "name"] })).data as any[])
  for (const pass of [null, "child"] as const) {
    const have = await loadCats()
    const todo = cats.filter((c) => (pass === null ? !c.parent_handle : !!c.parent_handle) && !have.some((h) => h.handle === c.handle))
    if (todo.length) {
      await createProductCategoriesWorkflow(container).run({
        input: {
          product_categories: todo.map((c) => ({
            name: c.name,
            handle: c.handle,
            is_active: true,
            parent_category_id: c.parent_handle ? have.find((h) => h.handle === c.parent_handle)?.id : undefined,
          })),
        },
      })
    }
  }
  for (const c of await loadCats()) catByName[c.name] = c.id

  // Products
  const cataloguePath = path.resolve(process.cwd(), process.env.CATALOGUE_PATH || "../catalogue/products.json")
  if (!fs.existsSync(cataloguePath)) {
    logger.warn(`Catalogue not found at ${cataloguePath}; skipping products.`)
  } else {
    const catalogue = JSON.parse(fs.readFileSync(cataloguePath, "utf8")) as any[]
    const site = (process.env.SITE_URL || "https://noordkaravane.co.za").replace(/\/$/, "")
    const imageBase = (process.env.IMAGE_BASE_URL || `${site}/shop`).replace(/\/$/, "")
    const imgUrl = (src: string) => (src.startsWith("http") ? src : `${imageBase}${src}`)
    const existing = ((await query.graph({ entity: "product", fields: ["handle"] })).data as any[]).map((p) => p.handle)
    const products = catalogue
      .filter((d) => !existing.includes(d.handle))
      .map((d) => {
        // Simple products still need one option + one variant in Medusa.
        const options: { title: string; values: string[] }[] = d.options?.length
          ? d.options.map((o: any) => ({ title: o.name, values: o.values }))
          : [{ title: "Default", values: ["Default"] }]
        const variants: any[] = d.variants?.length
          ? d.variants
          : [{ sku: d.sku, price_zar: d.price_zar, weight_g: d.weight_g, options: {} }]
        return {
          title: d.title,
          handle: d.handle,
          description: d.description,
          status: d.in_stock === false ? ProductStatus.DRAFT : ProductStatus.PUBLISHED,
          weight: d.weight_g,
          shipping_profile_id: profile.id,
          category_ids: (d.categories ?? []).map((n: string) => catByName[n]).filter(Boolean),
          sales_channels: [{ id: channel.id }],
          thumbnail: d.images?.[0] ? imgUrl(d.images[0].src) : undefined,
          images: (d.images ?? []).map((i: any) => ({ url: imgUrl(i.src) })),
          metadata: {
            source_id: d.source_id,
            source_url: d.source_url,
            ship_tier: d.ship_tier,
            tags: d.tags,
            description_html: d.description_html,
            dropship_supplier: d.dropship_supplier ?? null,
          },
          options,
          variants: variants.map((v: any) => ({
            title: Object.values(v.options ?? {}).join(" / ") || "Default",
            sku: v.sku,
            manage_inventory: false, // Woo exposes no stock counts; flip per product in Admin once counts are known
            weight: v.weight_g ?? d.weight_g,
            options: Object.keys(v.options ?? {}).length ? v.options : { Default: "Default" },
            prices: [{ amount: Number(v.price_zar ?? d.price_zar), currency_code: "zar" }],
          })),
        }
      })
    if (products.length) {
      logger.info(`Creating ${products.length} product(s)...`)
      // chunked so a failure points at a small batch and memory stays low on the Pi
      for (let n = 0; n < products.length; n += 10) {
        await createProductsWorkflow(container).run({ input: { products: products.slice(n, n + 10) as any } })
      }
    } else {
      logger.info("All catalogue products already exist.")
    }
  }

  logger.info("Seed finished.")
  logger.info(`PUBLISHABLE API KEY (set PUBLIC_MEDUSA_PUBLISHABLE_KEY): ${key.token}`)
}
