import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  updateCartPromotionsWorkflow,
  updateCartWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { HOST_KIT_HANDLE, HOST_KIT_PROGRAM } from "./import-host-kit-codes"

/**
 * Real-Medusa proof that a host kit code makes the sticker kits free and nothing else. NEVER run it against
 * production: it publishes the kit, creates carts and places an order.
 *
 *   HOST_KIT_PROBE=1 npx medusa exec ./src/scripts/host-kit-probe.ts
 *
 * Needs a seeded probe DB with add-host-sticker-kit and import-host-kit-codes already run. Refuses to run unless
 * HOST_KIT_PROBE=1 and the DATABASE_URL database name contains "probe" or "staging".
 * Prints `HOST_KIT_PROBE_SUMMARY {json}` and exits non-zero when a check fails.
 */
const OTHER_HANDLE = "kampi-sticker-pack"
const EFT_PROVIDER = "pp_eft_eft"
const ADDRESS = { first_name: "Probe", last_name: "Host", address_1: "1 Probe Street", city: "Pretoria", postal_code: "0182", country_code: "za", phone: "0820000000" }
const FIELDS = [
  "id",
  "total",
  "item_total",
  "discount_total",
  "shipping_total",
  "promotions.code",
  "items.quantity",
  "items.total",
  "items.original_total",
  "items.product_id",
  "items.adjustments.code",
  "items.adjustments.amount",
  "shipping_methods.amount",
  "shipping_methods.adjustments.amount",
]
const num = (v: unknown) => Number((v as any)?.numeric ?? (v as any)?.value ?? v ?? 0)

function guard() {
  if (process.env.HOST_KIT_PROBE !== "1") throw new Error("host-kit-probe: set HOST_KIT_PROBE=1 (probe DB only)")
  let db = ""
  try {
    db = new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "")
  } catch {
    db = ""
  }
  if (!/probe|staging/.test(db)) throw new Error(`host-kit-probe: refusing to run on database "${db}" (name must contain probe or staging)`)
}

export default async function hostKitProbe({ container }: ExecArgs) {
  guard()
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const one = async (entity: string, filters: Record<string, unknown>, fields = ["id"]) => ((await query.graph({ entity, fields, filters })).data as any[])[0]

  const region = await one("region", { name: "South Africa" })
  const channel = await one("sales_channel", { name: "Webshop" })
  const kit = await one("product", { handle: HOST_KIT_HANDLE }, ["id", "status", "variants.id"])
  const other = await one("product", { handle: OTHER_HANDLE }, ["id", "variants.id"])
  if (!region || !channel || !kit || !other) throw new Error("host-kit-probe: seed, add-host-sticker-kit and import-host-kit-codes must run first")
  if (kit.status !== "published") await updateProductsWorkflow(container).run({ input: { selector: { id: kit.id }, update: { status: "published" } } } as any)
  const kitVariant: string = kit.variants[0].id
  const otherVariant: string = other.variants[0].id

  const opts = (await fulfillment.listShippingOptions({}, { select: ["id", "data"] })) as any[]
  const options: Record<string, string> = {}
  for (const o of opts) if (o.data?.id) options[o.data.id] = o.id
  const collect = options["workshop-collect"]
  const courierKey = Object.keys(options).find((k) => k !== "workshop-collect")
  if (!collect || !courierKey) throw new Error(`host-kit-probe: need workshop-collect and one courier option, found ${Object.keys(options).join(", ")}`)

  const promos = (await promotionModule.listPromotions({}, { select: ["code", "metadata", "used"], take: 1000 })) as any[]
  const hostCodes = promos.filter((p) => p.metadata?.program === HOST_KIT_PROGRAM && !p.used)
  const pick = (kits: number, skip: string[] = []) => hostCodes.find((p) => Number(p.metadata.max_kits) === kits && !skip.includes(p.code))?.code as string | undefined
  const two = pick(2)
  const twoB = pick(2, [two ?? ""])
  const single = pick(1)
  if (!two || !twoB || !single) throw new Error("host-kit-probe: need two unused 2-kit codes and one unused 1-kit code")

  const getCart = async (id: string) => one("cart", { id }, FIELDS)
  const newCart = async (items: { variant_id: string; quantity: number }[]) =>
    ((await createCartWorkflow(container).run({ input: { region_id: region.id, sales_channel_id: channel.id, currency_code: "zar", email: "probe@example.com", items } as any })).result as any)
      .id as string
  const apply = async (cartId: string, code: string) => {
    try {
      await updateCartPromotionsWorkflow(container).run({ input: { cart_id: cartId, promo_codes: [code], action: "add" } as any })
      return null
    } catch (e: any) {
      return String(e?.message ?? e)
    }
  }
  const ship = (cartId: string, optionId: string) => addShippingMethodToCartWorkflow(container).run({ input: { cart_id: cartId, options: [{ id: optionId }] } as any })
  const view = async (cartId: string) => {
    const c = await getCart(cartId)
    const lines = (c.items ?? []) as any[]
    return {
      total: num(c.total),
      discount: num(c.discount_total),
      shipping: num(c.shipping_total),
      shipping_adjusted: (c.shipping_methods ?? []).some((m: any) => (m.adjustments ?? []).length > 0),
      kit_total: lines.filter((l) => l.product_id === kit.id).reduce((n, l) => n + num(l.total), 0),
      kit_full: lines.filter((l) => l.product_id === kit.id).reduce((n, l) => n + num(l.original_total), 0),
      other_total: lines.filter((l) => l.product_id === other.id).reduce((n, l) => n + num(l.total), 0),
      other_full: lines.filter((l) => l.product_id === other.id).reduce((n, l) => n + num(l.original_total), 0),
      codes: (c.promotions ?? []).map((p: any) => p.code),
    }
  }

  const checks: Record<string, { pass: boolean; detail: unknown }> = {}
  const check = (name: string, pass: boolean, detail: unknown) => (checks[name] = { pass, detail })

  // 1. 2 kits + another product + courier: kits free, other product full price, courier charged in full
  const c1 = await newCart([{ variant_id: kitVariant, quantity: 2 }, { variant_id: otherVariant, quantity: 1 }])
  const e1 = await apply(c1, two)
  await ship(c1, options[courierKey])
  const v1 = await view(c1)
  check(
    "1_kits_free_other_full_courier_charged",
    !e1 && v1.kit_total === 0 && v1.other_total === v1.other_full && v1.other_full > 0 && v1.shipping > 0 && !v1.shipping_adjusted && v1.total === v1.other_full + v1.shipping,
    { courier: courierKey, error: e1, ...v1 }
  )

  // 2. same cart contents with collection: only the other product is paid for
  const c2 = await newCart([{ variant_id: kitVariant, quantity: 2 }, { variant_id: otherVariant, quantity: 1 }])
  const e2 = await apply(c2, two)
  await ship(c2, collect)
  const v2 = await view(c2)
  check("2_collection_total_is_other_product_only", !e2 && v2.total === v2.other_full && v2.kit_total === 0, { error: e2, ...v2 })

  // 4. a 1-kit host adding 2 kits: one free, one full price
  const c4 = await newCart([{ variant_id: kitVariant, quantity: 2 }])
  const e4 = await apply(c4, single)
  const v4 = await view(c4)
  check("4_one_kit_code_frees_one_of_two", !e4 && v4.kit_total === v4.kit_full / 2 && v4.discount === v4.kit_full / 2, { error: e4, ...v4 })

  // 6. a 2-kit host adding 3 kits: two free, one full price
  const c6 = await newCart([{ variant_id: kitVariant, quantity: 3 }])
  const e6 = await apply(c6, twoB)
  const v6 = await view(c6)
  check("6_two_kit_code_frees_two_of_three", !e6 && v6.kit_total === v6.kit_full / 3, { error: e6, ...v6 })

  // 3. kits only + collection: total R0, and the order can be placed with EFT
  const c3 = await newCart([{ variant_id: kitVariant, quantity: 2 }])
  const e3 = await apply(c3, two)
  await ship(c3, collect)
  const v3 = await view(c3)
  let order: string | null = null
  let orderError: string | null = null
  try {
    await updateCartWorkflow(container).run({ input: { id: c3, shipping_address: ADDRESS, billing_address: ADDRESS } as any })
    const { result: pc } = await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: c3 } as any })
    const pcId = (pc as any)?.id ?? (pc as any)?.[0]?.id
    let sessionError: string | null = null
    try {
      await createPaymentSessionsWorkflow(container).run({ input: { payment_collection_id: pcId, provider_id: EFT_PROVIDER } as any })
    } catch (e: any) {
      sessionError = String(e?.message ?? e)
    }
    order = ((await completeCartWorkflow(container).run({ input: { id: c3 } as any })).result as any).id
    if (sessionError) orderError = `payment session: ${sessionError} (order still placed)`
  } catch (e: any) {
    orderError = String(e?.message ?? e)
  }
  check("3_zero_total_order_can_be_placed", !e3 && v3.total === 0 && Boolean(order), { error: e3, total: v3.total, order, order_error: orderError })

  // 5. the code was used by that order: a second cart does not get the discount
  const c5 = await newCart([{ variant_id: kitVariant, quantity: 2 }])
  const e5 = await apply(c5, two)
  const v5 = await view(c5)
  check("5_used_code_gives_nothing_again", Boolean(order) && v5.discount === 0 && v5.kit_total === v5.kit_full, { error: e5, ...v5 })

  const failed = Object.entries(checks).filter(([, c]) => !c.pass).map(([n]) => n)
  console.log("HOST_KIT_PROBE_SUMMARY " + JSON.stringify({ passed: Object.keys(checks).length - failed.length, failed, checks }))
  if (failed.length) throw new Error(`host-kit-probe: ${failed.length} check(s) failed: ${failed.join(", ")}`)
}
