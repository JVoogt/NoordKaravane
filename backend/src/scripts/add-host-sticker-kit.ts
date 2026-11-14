import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow, deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Adds the "Kampi Host Sticker Kit with QR" product. Idempotent: an existing product with the handle is left as it
 * is and reported.
 *
 *   [HOST_KIT_STATUS=published] [HOST_KIT_REPLACE_DRAFT=1] npx medusa exec ./src/scripts/add-host-sticker-kit.ts
 *
 * HOST_KIT_REPLACE_DRAFT=1 deletes an existing DRAFT of the kit and creates it again from this file (used when the
 * kit's contents or variants change before launch). A published kit is never deleted; host codes point at the
 * product id, so replace the draft before importing codes, not after.
 *
 * Created as a DRAFT unless HOST_KIT_STATUS=published: every QR sticker is printed for one Kampi listing, so the
 * kit must not be orderable before a checkout can capture the listing number and the printer is lined up. Publish it
 * in Admin when that is true.
 *
 * Self-contained on purpose (no ../lib imports), so the compiled file can run in an image built before this branch.
 * The same product is in catalogue/products.json (in_stock false), so a later seed skips it by handle.
 */
export const HOST_KIT_HANDLE = "kampi-host-sticker-kit-qr"
const SKU = "KAMPI-KIT-QR"
const COLOUR_OPTION = "Sticker colour"
// One vinyl colour per kit for the cut stickers (side stickers, square, logos), so they show on a dark or a light camper.
const COLOURS = [
  { value: "White", sku: `${SKU}-WHT` },
  { value: "Khaki", sku: `${SKU}-KHK` },
  { value: "Black", sku: `${SKU}-BLK` },
]
const PRICE_ZAR = 550
const WEIGHT_G = 350
const CATEGORIES = ["KampiHost Essentials", "Stickers & Decals"]
const TAGS = ["kampi.co.za", "Stickers", "Vehicle decal", "QR"]
const CONTENTS = [
  "1 x QR sticker printed for your listing (400 x 400 mm)",
  '2 x "Rent me / Huur my" side stickers (840 x 190 mm)',
  '1 x "Rent me" square (300 x 300 mm)',
  "2 x Kampi stickers (500 x 121 mm)",
  "4 x Kampi stickers (300 x 73 mm)",
  "2 x pre-departure checklist stickers (105 x 148 mm)",
  "2 x tyre pressure labels (70 x 30 mm)",
  "1 x ZA sticker (200 x 130 mm)",
  "1 x licence disc frame (90 x 90 mm)",
  "A placement guide",
]
const INTRO =
  "One kit per camper. The 400 mm QR sticker goes on the back of your camper and sends anyone who scans it straight to your own Kampi listing. Choose white, khaki or black for the side stickers and logos, so they show up on your camper."
const OUTRO =
  "Each QR sticker is printed for one specific camper, so we need your Kampi listing number with the order. Courier to your door or a locker, or collect for free at Noord Karavane in Pretoria North, where we can also fit the stickers for you."
const DESCRIPTION = `${INTRO} The kit includes: ${CONTENTS.join(", ")}. ${OUTRO}`
const DESCRIPTION_HTML = `<p>${INTRO}</p><p>The kit includes:</p><ul>${CONTENTS.map((c) => `<li>${c}</li>`).join("")}</ul><p>${OUTRO}</p>`
const IMAGES = ["/products/kampi-host-sticker-kit-qr-1.webp", "/products/kampi-host-sticker-kit-qr-2.webp"]

export default async function addHostStickerKit({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any
  const status = process.env.HOST_KIT_STATUS === "published" ? ProductStatus.PUBLISHED : ProductStatus.DRAFT

  const existing = (
    (await query.graph({ entity: "product", fields: ["id", "status", "variants.id", "variants.sku"], filters: { handle: HOST_KIT_HANDLE } })).data as any[]
  )[0]
  const replaceDraft = process.env.HOST_KIT_REPLACE_DRAFT === "1"
  if (existing && replaceDraft) {
    if (existing.status !== "draft") throw new Error(`add-host-sticker-kit: the kit is ${existing.status}; only a draft is ever replaced`)
    await deleteProductsWorkflow(container).run({ input: { ids: [existing.id] } } as any)
    logger.info(`add-host-sticker-kit: deleted draft ${existing.id} to recreate it`)
  } else if (existing) {
    console.log("HOST_KIT_PRODUCT " + JSON.stringify({ created: false, id: existing.id, status: existing.status, variants: (existing.variants ?? []).map((v: any) => v.sku) }))
    return
  }

  // Same lookups as the seed: the default shipping profile, the store's default channel, categories by name.
  const profile = ((await fulfillment.listShippingProfiles({ type: "default" })) as any[])[0]
  if (!profile) throw new Error("add-host-sticker-kit: no default shipping profile; run the seed first")
  const [store] = (await container.resolve(Modules.STORE).listStores()) as any[]
  const channelId: string | undefined = store?.default_sales_channel_id
  if (!channelId) throw new Error("add-host-sticker-kit: the store has no default sales channel; run the seed first")
  const cats = (await query.graph({ entity: "product_category", fields: ["id", "name"], filters: { name: CATEGORIES } })).data as any[]
  const missing = CATEGORIES.filter((n) => !cats.some((c) => c.name === n))
  if (missing.length) logger.warn(`add-host-sticker-kit: categories not found, product left out of them: ${missing.join(", ")}`)

  const site = (process.env.SITE_URL || "https://noordkaravane.co.za").replace(/\/$/, "")
  const imageBase = (process.env.IMAGE_BASE_URL || `${site}/shop`).replace(/\/$/, "")

  const { result } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Kampi Host Sticker Kit with QR",
          handle: HOST_KIT_HANDLE,
          description: DESCRIPTION,
          status,
          weight: WEIGHT_G,
          shipping_profile_id: profile.id,
          category_ids: cats.map((c) => c.id),
          sales_channels: [{ id: channelId }],
          thumbnail: `${imageBase}${IMAGES[0]}`,
          images: IMAGES.map((src) => ({ url: `${imageBase}${src}` })),
          metadata: {
            source_id: null,
            source_url: null,
            ship_tier: "small",
            freight_quote: false,
            tags: TAGS,
            description_html: DESCRIPTION_HTML,
            dropship_supplier: null,
            made_to_order: true,
            // one Kampi listing number per kit must travel with the order (the QR print file is picked by it)
            requires_kampi_listing_numbers: true,
          },
          options: [{ title: COLOUR_OPTION, values: COLOURS.map((c) => c.value) }],
          variants: COLOURS.map((c) => ({
            title: c.value,
            sku: c.sku,
            manage_inventory: false,
            weight: WEIGHT_G,
            options: { [COLOUR_OPTION]: c.value },
            prices: [{ amount: PRICE_ZAR, currency_code: "zar" }],
          })),
        },
      ],
    },
  } as any)
  const product = (result as any[])[0]
  console.log(
    "HOST_KIT_PRODUCT " + JSON.stringify({ created: true, id: product.id, status: product.status, variants: (product.variants ?? []).map((v: any) => v.sku), price_zar: PRICE_ZAR })
  )
}
