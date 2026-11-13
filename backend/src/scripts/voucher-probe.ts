import fs from "fs"
import path from "path"
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  addDraftOrderPromotionWorkflow,
  addShippingMethodToCartWorkflow,
  addToCartWorkflow,
  beginDraftOrderEditWorkflow,
  cancelOrderWorkflow,
  completeCartWorkflow,
  confirmDraftOrderEditWorkflow,
  convertDraftOrderWorkflow,
  createCampaignsWorkflow,
  createCartWorkflow,
  createOrderWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  createProductsWorkflow,
  createPromotionsWorkflow,
  createTaxRegionsWorkflow,
  deleteLineItemsWorkflow,
  deletePromotionsWorkflow,
  deleteTaxRegionsWorkflow,
  updateCampaignsWorkflow,
  updateCartPromotionsWorkflow,
  updateCartWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows"
import eftUnpaidOrders from "../jobs/eft-unpaid-orders"
import { sastMonth } from "../lib/vouchers/cohort"
import { getVoucherProgram, type VoucherProgram } from "../lib/vouchers/config"
import { ONE_CODE_MESSAGE } from "../lib/vouchers/lifecycle"
import { CapReachedError, MIN_SPEND_ATTRIBUTE, issueVoucher, voucherReport } from "../lib/vouchers/service"

/**
 * Real-Medusa voucher probe. NEVER run it against production: it creates products, carts, orders and promotions.
 *
 *   VOUCHER_PROBE=1 VOUCHER_PROBE_PART=attributes npx medusa exec ./src/scripts/voucher-probe.ts
 *
 * Refuses to run unless VOUCHER_PROBE=1 and the DATABASE_URL database name contains "probe" or "staging".
 * Part A (attributes) needs a fresh, seeded probe DB (see CONTRACTS.md, Vouchers). Amounts come from
 * VOUCHER_PROBE_MIN (minimum spend) and VOUCHER_PROBE_VALUE (discount); variants are priced MIN-1, MIN, 1 and 100.
 * Prints one line `VOUCHER_PROBE_SUMMARY {json}` and exits non-zero when a required check fails.
 */

const PROBE_HANDLE = "voucher-probe-product"
const EFT_PROVIDER = "pp_eft_eft"
const CANDIDATES = ["original_item_total", "item_total", "item_subtotal", "original_item_subtotal"] as const
const PROBE_EMAIL = "probe@example.com"
const ADDRESS = {
  first_name: "Probe",
  last_name: "Shopper",
  address_1: "1 Probe Street",
  city: "Pretoria",
  postal_code: "0182",
  country_code: "za",
  phone: "0820000000",
}

const CART_FIELDS = [
  "id",
  "email",
  "customer_id",
  "promotions.id",
  "promotions.code",
  "promotions.is_automatic",
  "discount_total",
  "item_total",
  "original_item_total",
  "item_subtotal",
  "original_item_subtotal",
  "item_discount_total",
  "subtotal",
  "total",
  "shipping_total",
  "items.id",
  "items.variant_id",
  "items.quantity",
  "items.total",
  "items.subtotal",
  "items.original_total",
  "items.adjustments.code",
  "items.adjustments.amount",
  "shipping_methods.id",
  "shipping_methods.amount",
  "shipping_methods.shipping_option_id",
  "shipping_methods.adjustments.code",
  "shipping_methods.adjustments.amount",
]

function guard() {
  if (process.env.VOUCHER_PROBE !== "1") throw new Error("voucher-probe: set VOUCHER_PROBE=1 (probe DB only)")
  let db = ""
  try {
    db = new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "")
  } catch {
    db = ""
  }
  if (!/probe|staging/.test(db)) throw new Error(`voucher-probe: refusing to run on database "${db}" (name must contain probe or staging)`)
}

export type ProbeEnv = {
  container: MedusaContainer
  query: any
  promotion: any
  region: { id: string }
  channel: { id: string }
  options: Record<string, string>
  variants: { below: string; min: string; one: string; hundred: string }
  MIN: number
  VALUE: number
}

const num = (v: unknown) => (v == null ? null : Number(v))

async function getCart(env: ProbeEnv, id: string): Promise<any> {
  const { data } = await env.query.graph({ entity: "cart", fields: CART_FIELDS, filters: { id } })
  return data[0]
}

function snapshot(cart: any) {
  return {
    codes: (cart.promotions ?? []).filter(Boolean).map((p: any) => p.code),
    discount_total: num(cart.discount_total),
    item_total: num(cart.item_total),
    original_item_total: num(cart.original_item_total),
    item_subtotal: num(cart.item_subtotal),
    original_item_subtotal: num(cart.original_item_subtotal),
    item_discount_total: num(cart.item_discount_total),
    subtotal: num(cart.subtotal),
    total: num(cart.total),
    shipping_total: num(cart.shipping_total),
    shipping: (cart.shipping_methods ?? []).map((m: any) => num(m.amount)),
    lines: (cart.items ?? []).map((i: any) => ({ qty: i.quantity, total: num(i.total), subtotal: num(i.subtotal), original_total: num(i.original_total) })),
  }
}

async function newCart(env: ProbeEnv, items: { variant_id: string; quantity: number }[]): Promise<string> {
  const { result } = await createCartWorkflow(env.container).run({
    input: { region_id: env.region.id, sales_channel_id: env.channel.id, currency_code: "zar", email: PROBE_EMAIL, items } as any,
  })
  return (result as any).id
}

async function applyCodes(env: ProbeEnv, cartId: string, codes: string[], action: "add" | "remove" | "replace" = "add") {
  try {
    await updateCartPromotionsWorkflow(env.container).run({ input: { cart_id: cartId, promo_codes: codes, action } as any })
    return { error: null as string | null }
  } catch (e: any) {
    return { error: String(e?.message ?? e) }
  }
}

async function addShipping(env: ProbeEnv, cartId: string, optionKey: string) {
  await addShippingMethodToCartWorkflow(env.container).run({ input: { cart_id: cartId, options: [{ id: env.options[optionKey] }] } as any })
}

/** Workshop collection, addresses and an EFT payment session: everything complete-cart needs. */
async function prepareEft(env: ProbeEnv, cartId: string) {
  const cart = await getCart(env, cartId)
  if (!(cart.shipping_methods ?? []).length) await addShipping(env, cartId, "workshop-collect")
  await updateCartWorkflow(env.container).run({ input: { id: cartId, shipping_address: ADDRESS, billing_address: ADDRESS } as any })
  const { result: pc } = await createPaymentCollectionForCartWorkflow(env.container).run({ input: { cart_id: cartId } as any })
  const pcId = (pc as any)?.id ?? (pc as any)?.[0]?.id
  await createPaymentSessionsWorkflow(env.container).run({ input: { payment_collection_id: pcId, provider_id: EFT_PROVIDER } as any })
}

async function completeOnly(env: ProbeEnv, cartId: string): Promise<{ order_id: string | null; error: string | null }> {
  try {
    const { result } = await completeCartWorkflow(env.container).run({ input: { id: cartId } as any })
    return { order_id: (result as any).id, error: null }
  } catch (e: any) {
    return { order_id: null, error: String(e?.message ?? e) }
  }
}

/** prepareEft + complete. Returns the order id, or the error message. */
async function completeWithEft(env: ProbeEnv, cartId: string): Promise<{ order_id: string | null; error: string | null }> {
  try {
    await prepareEft(env, cartId)
  } catch (e: any) {
    return { order_id: null, error: String(e?.message ?? e) }
  }
  return completeOnly(env, cartId)
}

async function promotionUsed(env: ProbeEnv, code: string): Promise<number | null> {
  const [p] = await env.promotion.listPromotions({ code }, { select: ["id", "code", "used", "limit"] })
  return p ? Number(p.used) : null
}

async function makeCampaign(env: ProbeEnv, identifier: string, endsAt: Date): Promise<string> {
  const { result } = await createCampaignsWorkflow(env.container).run({
    input: { campaignsData: [{ name: identifier, campaign_identifier: identifier, starts_at: null, ends_at: endsAt }] } as any,
  })
  return (result as any)[0].id
}

/** DD7 shape with an arbitrary attribute, for the measurement. */
async function makePromotion(env: ProbeEnv, code: string, campaignId: string, attribute: string): Promise<string> {
  const { result } = await createPromotionsWorkflow(env.container).run({
    input: {
      promotionsData: [
        {
          code,
          type: "standard",
          status: "active",
          is_automatic: false,
          is_tax_inclusive: true,
          limit: 1,
          campaign_id: campaignId,
          application_method: { type: "fixed", target_type: "order", allocation: "across", value: env.VALUE, currency_code: "zar" },
          rules: [{ attribute, operator: "gte", values: [String(env.MIN)] }],
          metadata: { source: "probe" },
        },
      ],
    } as any,
  })
  return (result as any)[0].id
}

async function loadEnv(container: MedusaContainer): Promise<Omit<ProbeEnv, "variants"> & { variants: ProbeEnv["variants"] | null }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const promotion = container.resolve(Modules.PROMOTION)
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any
  const one = async (entity: string, filters: Record<string, unknown>, fields = ["id"]) =>
    (((await query.graph({ entity, fields, filters })) as any).data as any[])[0]
  const region = await one("region", { name: "South Africa" })
  const channel = await one("sales_channel", { name: "Webshop" })
  if (!region || !channel) throw new Error("voucher-probe: run the seed first (no South Africa region or Webshop channel)")
  const opts = (await fulfillment.listShippingOptions({}, { select: ["id", "data"] })) as any[]
  const options: Record<string, string> = {}
  for (const o of opts) if (o.data?.id) options[o.data.id] = o.id
  const MIN = Number(process.env.VOUCHER_PROBE_MIN ?? 400)
  const VALUE = Number(process.env.VOUCHER_PROBE_VALUE ?? 50)
  const product = await one("product", { handle: PROBE_HANDLE }, ["id", "variants.id", "variants.sku"])
  let variants: ProbeEnv["variants"] | null = null
  if (product) {
    const bySku = Object.fromEntries((product.variants ?? []).map((v: any) => [v.sku, v.id]))
    variants = { below: bySku["PROBE-BELOW"], min: bySku["PROBE-MIN"], one: bySku["PROBE-ONE"], hundred: bySku["PROBE-HUNDRED"] }
  }
  return { container, query, promotion, region, channel, options, variants, MIN, VALUE }
}

async function createProbeProduct(env: Omit<ProbeEnv, "variants">): Promise<ProbeEnv["variants"]> {
  const fulfillment = env.container.resolve(Modules.FULFILLMENT) as any
  const profile = ((await fulfillment.listShippingProfiles({ type: "default" })) as any[])[0]
  const v = (sku: string, label: string, amount: number) => ({
    title: label,
    sku,
    manage_inventory: false,
    weight: 100,
    options: { Price: label },
    prices: [{ amount, currency_code: "zar" }],
  })
  const { result } = await createProductsWorkflow(env.container).run({
    input: {
      products: [
        {
          title: "Voucher probe product",
          handle: PROBE_HANDLE,
          status: "published",
          weight: 100,
          shipping_profile_id: profile.id,
          sales_channels: [{ id: env.channel.id }],
          options: [{ title: "Price", values: ["below", "min", "one", "hundred"] }],
          variants: [
            v("PROBE-BELOW", "below", env.MIN - 1),
            v("PROBE-MIN", "min", env.MIN),
            v("PROBE-ONE", "one", 1),
            v("PROBE-HUNDRED", "hundred", 100),
          ],
        },
      ],
    } as any,
  })
  const bySku = Object.fromEntries(((result as any)[0].variants as any[]).map((x) => [x.sku, x.id]))
  return { below: bySku["PROBE-BELOW"], min: bySku["PROBE-MIN"], one: bySku["PROBE-ONE"], hundred: bySku["PROBE-HUNDRED"] }
}

const DAY = 86_400_000

/** S-A1..S-A4 for one candidate attribute in one tax setup. */
async function measureCandidate(env: ProbeEnv, attr: string, setup: "A" | "B") {
  const code = `PROBE-${attr.toUpperCase().replace(/_/g, "-")}-${setup}`
  const camp = await makeCampaign(env, `probe-${attr.replace(/_/g, "-")}-${setup.toLowerCase()}`, new Date(Date.now() + DAY))
  await makePromotion(env, code, camp, attr)
  const out: Record<string, any> = { code }

  // S-A1: MIN-1
  const c1 = await newCart(env, [{ variant_id: env.variants.below, quantity: 1 }])
  const a1 = await applyCodes(env, c1, [code])
  out.A1 = { error: a1.error, ...snapshot(await getCart(env, c1)) }

  // S-A2: exactly MIN
  const c2 = await newCart(env, [{ variant_id: env.variants.min, quantity: 1 }])
  const a2 = await applyCodes(env, c2, [code])
  out.A2 = { error: a2.error, ...snapshot(await getCart(env, c2)) }

  // S-A3: refresh survival on the A2 cart
  try {
    await addShipping(env, c2, "workshop-collect")
    await addToCartWorkflow(env.container).run({ input: { cart_id: c2, items: [{ variant_id: env.variants.one, quantity: 1 }] } as any })
    let cart = await getCart(env, c2)
    const oneLine = cart.items.find((i: any) => i.variant_id === env.variants.one)
    await deleteLineItemsWorkflow(env.container).run({ input: { cart_id: c2, ids: [oneLine.id] } as any })
    cart = await getCart(env, c2)
    const minLine = cart.items.find((i: any) => i.variant_id === env.variants.min)
    await updateLineItemInCartWorkflow(env.container).run({ input: { cart_id: c2, item_id: minLine.id, update: { quantity: 2 } } as any })
    await updateLineItemInCartWorkflow(env.container).run({ input: { cart_id: c2, item_id: minLine.id, update: { quantity: 1 } } as any })
    out.A3 = { error: null, ...snapshot(await getCart(env, c2)) }
  } catch (e: any) {
    out.A3 = { error: String(e?.message ?? e), ...snapshot(await getCart(env, c2)) }
  }

  // S-A4: MIN-1 + 100 (at or above MIN), apply, then drop the 100 line
  const c4 = await newCart(env, [
    { variant_id: env.variants.below, quantity: 1 },
    { variant_id: env.variants.hundred, quantity: 1 },
  ])
  const a4 = await applyCodes(env, c4, [code])
  const before = snapshot(await getCart(env, c4))
  let cart4 = await getCart(env, c4)
  const hLine = cart4.items.find((i: any) => i.variant_id === env.variants.hundred)
  let dropErr: string | null = null
  try {
    await deleteLineItemsWorkflow(env.container).run({ input: { cart_id: c4, ids: [hLine.id] } as any })
  } catch (e: any) {
    dropErr = String(e?.message ?? e)
  }
  cart4 = await getCart(env, c4)
  out.A4 = { error: a4.error ?? dropErr, before, after: snapshot(cart4) }

  out.qualifies =
    !out.A1.discount_total &&
    out.A2.discount_total === env.VALUE &&
    out.A3.discount_total === env.VALUE &&
    out.A4.before.discount_total === env.VALUE &&
    !out.A4.after.discount_total
  return out
}

async function partA(env: ProbeEnv, summary: Record<string, any>) {
  const tax = env.container.resolve(Modules.TAX) as any
  // Fresh-DB guard: fixed names collide with unique indexes, and setup A needs the as-seeded tax state.
  const campaigns = (await env.promotion.listCampaigns({}, { select: ["campaign_identifier"] })) as any[]
  const promos = (await env.promotion.listPromotions({}, { select: ["code"] })) as any[]
  const regions = (await tax.listTaxRegions({ country_code: "za" })) as any[]
  if (
    env.variants ||
    campaigns.some((c) => String(c.campaign_identifier).startsWith("probe-")) ||
    promos.some((p) => String(p.code).startsWith("PROBE-")) ||
    regions.length
  ) {
    throw new Error("Part A needs a fresh probe DB: run Reset/Seed")
  }
  env.variants = await createProbeProduct(env)

  const matrix: Record<string, Record<string, any>> = {}
  for (const attr of CANDIDATES) matrix[attr] = { A: await measureCandidate(env, attr, "A") }

  let taxRegionId: string | null = null
  try {
    const { result } = await createTaxRegionsWorkflow(env.container).run({
      input: [{ country_code: "za", provider_id: "tp_system", default_tax_rate: { rate: 15, name: "VAT", code: "VAT" } }] as any,
    })
    taxRegionId = (result as any)[0].id
    summary.setupB = { tax_region_id: taxRegionId, rate: 15 }
    for (const attr of CANDIDATES) matrix[attr].B = await measureCandidate(env, attr, "B")
  } finally {
    if (taxRegionId) await deleteTaxRegionsWorkflow(env.container).run({ input: { ids: [taxRegionId] } as any })
    summary.setupB_deleted = Boolean(taxRegionId)
  }

  summary.matrix = matrix
  const qualifying = CANDIDATES.filter((a) => matrix[a].A?.qualifies && matrix[a].B?.qualifies)
  summary.qualifying = qualifying
  const chosen = qualifying.includes("original_item_total")
    ? "original_item_total"
    : qualifying.includes("item_total")
      ? "item_total"
      : qualifying[0] ?? null
  summary.chosen = chosen
  if (!chosen) {
    summary.stop = "no attribute qualifies in both setups (HITL)"
    return
  }

  const freshCode = async (tag: string, ends = new Date(Date.now() + DAY)) => {
    const code = `PROBE-${tag}`
    const camp = await makeCampaign(env, `probe-${tag.toLowerCase()}`, ends)
    await makePromotion(env, code, camp, chosen)
    return { code, campaignId: camp }
  }
  const minCart = () => newCart(env, [{ variant_id: env.variants.min, quantity: 1 }])

  // S-A6: ended campaign
  {
    const { code, campaignId } = await freshCode("ENDED")
    await updateCampaignsWorkflow(env.container).run({ input: { campaignsData: [{ id: campaignId, ends_at: new Date(Date.now() - DAY) }] } as any })
    const c = await minCart()
    const r = await applyCodes(env, c, [code])
    summary.SA6 = { error: r.error, ...snapshot(await getCart(env, c)) }
  }

  // S-A7: used code, and two concurrent completions of one fresh code
  let order1: string | null = null
  {
    const { code } = await freshCode("USED1")
    const c = await minCart()
    await applyCodes(env, c, [code])
    const applied = snapshot(await getCart(env, c))
    const done = await completeWithEft(env, c)
    order1 = done.order_id
    const usedAfter = await promotionUsed(env, code)
    const c2 = await minCart()
    const r = await applyCodes(env, c2, [code])
    summary.SA7_code1 = { code, applied, complete: done, used_after_complete: usedAfter, reapply: { error: r.error, ...snapshot(await getCart(env, c2)) } }

    const { code: code2 } = await freshCode("USED2")
    const x = await minCart()
    const y = await minCart()
    await applyCodes(env, x, [code2])
    await applyCodes(env, y, [code2])
    const before = [snapshot(await getCart(env, x)).codes, snapshot(await getCart(env, y)).codes]
    const results = await Promise.all([completeWithEft(env, x), completeWithEft(env, y)])
    summary.SA7_code2 = { code: code2, codes_before: before, results, used: await promotionUsed(env, code2) }
  }

  // S-A8: cancel the code #1 order the way the EFT job does (record only)
  if (order1) {
    const code = "PROBE-USED1"
    let err: string | null = null
    try {
      await cancelOrderWorkflow(env.container).run({ input: { order_id: order1 } as any })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    const used = await promotionUsed(env, code)
    const c = await minCart()
    const r = await applyCodes(env, c, [code])
    const snap = snapshot(await getCart(env, c))
    summary.SA8 = { order_id: order1, cancel_error: err, used_after_cancel: used, reapply: { error: r.error, ...snap } }
    const reverted = used === 0 || snap.codes.includes(code)
    // With src/workflows/hooks/vouchers.ts loaded our own cancel hook reverts, so "native" cannot be told apart.
    summary.SA8_revert_observed = reverted
    summary.SA8_native_revert = summary.hooks_loaded ? "unknown (hooks loaded)" : reverted
  } else {
    summary.SA8 = { error: "no S-A7 order to cancel" }
  }

  // S-A9: free-shipping cart, then the place()-style update (record only)
  {
    const { code } = await freshCode("SHIP")
    const c = await newCart(env, [
      { variant_id: env.variants.min, quantity: 4 },
      { variant_id: env.variants.hundred, quantity: 2 },
    ])
    let shipErr: string | null = null
    try {
      await addShipping(env, c, "tcg-door")
    } catch (e: any) {
      shipErr = String(e?.message ?? e)
    }
    const p1 = snapshot(await getCart(env, c))
    const r = await applyCodes(env, c, [code])
    const p2 = snapshot(await getCart(env, c))
    let updErr: string | null = null
    try {
      await updateCartWorkflow(env.container).run({
        input: { id: c, email: "probe2@example.com", shipping_address: ADDRESS, billing_address: ADDRESS, metadata: { probe: "SA9" } } as any,
      })
    } catch (e: any) {
      updErr = String(e?.message ?? e)
    }
    const p3 = snapshot(await getCart(env, c))
    summary.SA9 = { code, ship_error: shipErr, apply_error: r.error, update_error: updErr, before_code: p1, after_code: p2, after_update: p3 }
  }
}

type Checks = { name: string; pass: boolean; detail: unknown }[]

function check(checks: Checks, name: string, pass: boolean, detail: unknown = null) {
  checks.push({ name, pass, detail })
}

function program(name: string): VoucherProgram {
  const p = getVoucherProgram(name)
  if (!p) throw new Error(`voucher-probe: program ${name} is not enabled in BUSINESS_CONFIG_PATH`)
  return p
}

function secret(): string {
  const s = process.env.VOUCHER_HOOK_SECRET
  if (!s) throw new Error("voucher-probe: VOUCHER_HOOK_SECRET must be set for Parts B and C")
  return s
}

async function promotionByCode(env: ProbeEnv, code: string): Promise<any> {
  const [p] = await env.promotion.listPromotions({ code }, { relations: ["campaign", "application_method", "rules", "rules.values"] })
  return p
}

async function codeCount(env: ProbeEnv, code: string): Promise<number> {
  return ((await env.promotion.listPromotions({ code }, { select: ["id"], withDeleted: true })) as any[]).length
}

async function issue(env: ProbeEnv, p: VoucherProgram, ref: string, now?: Date) {
  return issueVoucher(env.container, { program: p, ref, email: `${ref.toLowerCase()}@example.com`, secret: secret(), now })
}

/** The codes on an order's line-item and shipping-method adjustments. */
async function orderAdjustmentCodes(env: ProbeEnv, orderId: string): Promise<string[]> {
  const { data } = await env.query.graph({
    entity: "order",
    fields: ["id", "items.adjustments.code", "shipping_methods.adjustments.code"],
    filters: { id: orderId },
  })
  const o = (data as any[])[0] ?? {}
  return [...(o.items ?? []), ...(o.shipping_methods ?? [])].flatMap((h: any) => (h?.adjustments ?? []).map((a: any) => a?.code)).filter(Boolean)
}

/**
 * S-B14 steps 6-9 (H1, H2, R-M1): a code on a non-cart order. An admin draft order (draft-order workflows, as the admin
 * routes run them) gets the code while it is unused, so its adjustment registered no usage. A cart order then redeems
 * the code (used 1). Cancelling the converted draft must not give that use back. The code is a single-use promotion
 * WITHOUT the min-spend rule (an admin-minted code; measured: a DD7 code with the rule gets no adjustment on a draft
 * order) in its own future cohort campaign, so no other report baseline moves, and its `PROBE-` prefix keeps it out of
 * Part C's program-code count.
 */
async function draftOrderSteps(env: ProbeEnv, summary: Record<string, any>, checks: Checks) {
  const month = "2031-05"
  const X = "PROBE-DRAFT1"
  const campaignId = await makeCampaign(env, `kampi-review-${month}`, new Date("2031-07-01T00:00:00Z"))
  await createPromotionsWorkflow(env.container).run({
    input: {
      promotionsData: [
        {
          code: X,
          type: "standard",
          status: "active",
          is_automatic: false,
          is_tax_inclusive: true,
          limit: 1,
          campaign_id: campaignId,
          application_method: { type: "fixed", target_type: "order", allocation: "across", value: env.VALUE, currency_code: "zar" },
          metadata: { source: "probe" },
        },
      ],
    } as any,
  })
  const r0 = await voucherReport(env.container, { program: "kampi-review", month })
  const out: Record<string, any> = { code: X, r0 }
  let draftId: string | null = null
  try {
    const { result } = await createOrderWorkflow(env.container).run({
      input: {
        status: "draft",
        is_draft_order: true,
        region_id: env.region.id,
        sales_channel_id: env.channel.id,
        currency_code: "zar",
        email: PROBE_EMAIL,
        shipping_address: ADDRESS,
        billing_address: ADDRESS,
        items: [{ variant_id: env.variants.min, quantity: 1 }],
      } as any,
    })
    draftId = (result as any).id
    await beginDraftOrderEditWorkflow(env.container).run({ input: { order_id: draftId } as any })
    await addDraftOrderPromotionWorkflow(env.container).run({ input: { order_id: draftId, promo_codes: [X] } as any })
    await confirmDraftOrderEditWorkflow(env.container).run({ input: { order_id: draftId, confirmed_by: "voucher-probe" } as any })
  } catch (e: any) {
    out.draft_error = String(e?.message ?? e)
  }
  out.draft_id = draftId
  if (draftId) {
    out.draft_codes = await orderAdjustmentCodes(env, draftId)
    const { data: links } = await env.query.graph({ entity: "order_promotion", fields: ["order_id", "promotion_id"], filters: { order_id: draftId } })
    const { data: cartLinks } = await env.query.graph({ entity: "order_cart", fields: ["order_id", "cart_id"], filters: { order_id: draftId } })
    out.draft_order_promotion_links = (links as any[]).length
    out.draft_order_cart_links = (cartLinks as any[]).length
  }
  out.used_after_draft = await promotionUsed(env, X)
  out.report_with_draft = await voucherReport(env.container, { program: "kampi-review", month })
  if (draftId) {
    try {
      await convertDraftOrderWorkflow(env.container).run({ input: { id: draftId } as any })
    } catch (e: any) {
      out.convert_error = String(e?.message ?? e)
    }
  }
  const cartOrderCart = await newCart(env, [{ variant_id: env.variants.min, quantity: 1 }])
  await applyCodes(env, cartOrderCart, [X])
  out.cart_order = await completeWithEft(env, cartOrderCart)
  out.used_after_cart_order = await promotionUsed(env, X)
  if (draftId) {
    try {
      await cancelOrderWorkflow(env.container).run({ input: { order_id: draftId } as any })
    } catch (e: any) {
      out.cancel_error = String(e?.message ?? e)
    }
  }
  out.used_after_draft_cancel = await promotionUsed(env, X)
  // R-M1: deleting a redeemed code drops it from issued but keeps its redemption (the cart order above).
  out.report_before_delete = await voucherReport(env.container, { program: "kampi-review", month })
  const pX = await promotionByCode(env, X)
  await deletePromotionsWorkflow(env.container).run({ input: { ids: [pX.id] } as any })
  out.report_after_delete = await voucherReport(env.container, { program: "kampi-review", month })
  summary.SB14_draft = out
  check(
    checks,
    "S-B14.6 a draft order carries the code without registering usage",
    Boolean(draftId) && !out.draft_error && (out.draft_codes ?? []).includes(X) && out.draft_order_cart_links === 0 && out.used_after_draft === 0,
    out
  )
  check(checks, "S-B14.7 report skips the draft order (H2)", out.draft_order_promotion_links >= 1 && out.report_with_draft.redeemed === r0.redeemed, out)
  check(
    checks,
    "S-B14.8 cancelling a non-cart order gives nothing back (H1)",
    !out.convert_error && Boolean(out.cart_order.order_id) && out.used_after_cart_order === 1 && !out.cancel_error && out.used_after_draft_cancel === 1,
    out
  )
  check(
    checks,
    "S-B14.9 a deleted code keeps its redemption, not its issue (R-M1)",
    out.report_before_delete.issued === 1 &&
      out.report_before_delete.redeemed === 1 &&
      out.report_after_delete.issued === 0 &&
      out.report_after_delete.redeemed === 1 &&
      out.report_after_delete.discount_value_zar === env.VALUE,
    out
  )
}

/** Part B: service, report, revert-on-cancel (S-B14) and the completion backstop (S-B15 step 8). */
async function partB(env: ProbeEnv, summary: Record<string, any>, checks: Checks) {
  const review = program("kampi-review")
  const month = sastMonth(new Date())
  const minCart = () => newCart(env, [{ variant_id: env.variants.min, quantity: 1 }])

  // S-B1
  const b1 = await issue(env, review, "PROBE1")
  const p1 = await promotionByCode(env, b1.voucher.code)
  const rule = (p1.rules ?? [])[0]
  const shape = {
    status: p1.status,
    is_automatic: p1.is_automatic,
    is_tax_inclusive: p1.is_tax_inclusive,
    limit: p1.limit,
    type: p1.type,
    am: { type: p1.application_method?.type, target_type: p1.application_method?.target_type, allocation: p1.application_method?.allocation, value: Number(p1.application_method?.value), currency_code: p1.application_method?.currency_code },
    rule: { attribute: rule?.attribute, operator: rule?.operator, values: (rule?.values ?? []).map((v: any) => v.value) },
    campaign: p1.campaign?.campaign_identifier,
    metadata: p1.metadata,
  }
  summary.SB1 = { result: b1, shape }
  check(checks, "S-B1 created", b1.status === "created", b1)
  check(
    checks,
    "S-B1 DD7 shape",
    shape.status === "active" &&
      shape.is_automatic === false &&
      shape.is_tax_inclusive === true &&
      shape.limit === 1 &&
      shape.type === "standard" &&
      shape.am.type === "fixed" &&
      shape.am.target_type === "order" &&
      shape.am.allocation === "across" &&
      shape.am.value === review.value_zar &&
      shape.am.currency_code === "zar" &&
      shape.rule.attribute === MIN_SPEND_ATTRIBUTE &&
      shape.rule.operator === "gte" &&
      JSON.stringify(shape.rule.values) === JSON.stringify([String(review.min_spend_zar)]) &&
      shape.campaign === `kampi-review-${month}` &&
      shape.metadata?.source === "hook" &&
      !JSON.stringify(shape.metadata).includes("@"),
    shape
  )

  // S-B2
  const b2 = await issue(env, review, "PROBE1")
  summary.SB2 = b2
  check(checks, "S-B2 existing, same code and expiry", b2.status === "existing" && b2.voucher.code === b1.voucher.code && b2.voucher.expires_at === b1.voucher.expires_at, b2)

  // S-B3: concurrent, same ref
  const b3 = await Promise.allSettled([issue(env, review, "PROBE3"), issue(env, review, "PROBE3")])
  const b3codes = b3.map((r) => (r.status === "fulfilled" ? r.value.voucher.code : `rejected: ${(r as any).reason?.message}`))
  const b3count = await codeCount(env, b3codes[0])
  summary.SB3 = { statuses: b3.map((r) => (r.status === "fulfilled" ? r.value.status : "rejected")), codes: b3codes, rows: b3count }
  check(checks, "S-B3 one promotion, same code", b3codes[0] === b3codes[1] && b3count === 1, summary.SB3)

  // S-B4: concurrent first issues of a new month
  const future = new Date("2031-03-15T10:00:00Z")
  await Promise.allSettled([issue(env, review, "PROBE4A", future), issue(env, review, "PROBE4B", future)])
  const b4camps = (await env.promotion.listCampaigns({ campaign_identifier: "kampi-review-2031-03" }, { select: ["id"] })) as any[]
  const b4promos = b4camps.length ? ((await env.promotion.listPromotions({ campaign_id: b4camps.map((c) => c.id) }, { select: ["code"] })) as any[]) : []
  summary.SB4 = { campaigns: b4camps.length, promotions: b4promos.length }
  check(checks, "S-B4 one campaign", b4camps.length === 1 && b4promos.length === 2, summary.SB4)

  // S-B5: cap 2
  const cap = program("probe-cap2")
  const a = await issue(env, cap, "CAPA")
  await issue(env, cap, "CAPB")
  let capErr: string | null = null
  try {
    await issue(env, cap, "CAPC")
  } catch (e: any) {
    capErr = e instanceof CapReachedError ? "CapReachedError" : String(e?.message ?? e)
  }
  const capCamp = (await env.promotion.listCampaigns({ campaign_identifier: `probe-cap2-${month}` }, { select: ["id"] })) as any[]
  const capCount = ((await env.promotion.listPromotions({ campaign_id: capCamp.map((c) => c.id) }, { select: ["id"] })) as any[]).length
  summary.SB5 = { first: a.voucher.code, third: capErr, promotions: capCount }
  check(checks, "S-B5 cap", capErr === "CapReachedError" && capCount === 2, summary.SB5)

  // S-B6: min spend boundary, redemption, report
  const below = await newCart(env, [{ variant_id: env.variants.below, quantity: 1 }])
  await applyCodes(env, below, [b1.voucher.code])
  const belowSnap = snapshot(await getCart(env, below))
  const at = await minCart()
  await applyCodes(env, at, [b1.voucher.code])
  const atSnap = snapshot(await getCart(env, at))
  const done = await completeWithEft(env, at)
  const used = await promotionUsed(env, b1.voucher.code)
  let report: any
  try {
    report = await voucherReport(env.container, { program: "kampi-review", month })
  } catch (e: any) {
    report = { error: String(e?.message ?? e) }
  }
  summary.SB6 = { below: belowSnap, at: atSnap, complete: done, used, report, order_promotion_query: report.error ? "failed" : "query.graph entity order_promotion by promotion_id" }
  check(
    checks,
    "S-B6 boundary, redemption and report",
    !belowSnap.discount_total &&
      atSnap.discount_total === review.value_zar &&
      Boolean(done.order_id) &&
      used === 1 &&
      report.issued >= 1 &&
      report.redeemed === 1 &&
      report.discount_value_zar === review.value_zar,
    summary.SB6
  )

  // S-B12 setup: a dedicated code, soft-deleted here; the HTTP matrix then POSTs the same ref and expects 409.
  const b12 = await issue(env, review, "PROBE12")
  const p12 = await promotionByCode(env, b12.voucher.code)
  await deletePromotionsWorkflow(env.container).run({ input: { ids: [p12.id] } as any })
  summary.SB12_setup = { ref: "PROBE12", code: b12.voucher.code, deleted: (await promotionByCode(env, b12.voucher.code)) === undefined }

  // S-B14: cancel gives the code back (direct cancel)
  const c = await issue(env, review, "PROBE14")
  const C = c.voucher.code
  const r0 = await voucherReport(env.container, { program: "kampi-review", month })
  const o1Cart = await minCart()
  await applyCodes(env, o1Cart, [C])
  const o1 = await completeWithEft(env, o1Cart)
  const s1 = { order: o1, used: await promotionUsed(env, C), report: await voucherReport(env.container, { program: "kampi-review", month }) }
  let cancelErr: string | null = null
  try {
    await cancelOrderWorkflow(env.container).run({ input: { order_id: o1.order_id } as any })
  } catch (e: any) {
    cancelErr = String(e?.message ?? e)
  }
  const s2 = { cancel_error: cancelErr, used: await promotionUsed(env, C) }
  const again = await minCart()
  const ra = await applyCodes(env, again, [C])
  const s3 = { error: ra.error, ...snapshot(await getCart(env, again)) }
  const s4 = await voucherReport(env.container, { program: "kampi-review", month })
  const o2 = await completeWithEft(env, again)
  const s5 = { order: o2, used: await promotionUsed(env, C), report: await voucherReport(env.container, { program: "kampi-review", month }) }
  summary.SB14 = { code: C, r0, step1: s1, step2: s2, step3: s3, step4: s4, step5: s5 }
  check(checks, "S-B14.1 redeem", Boolean(o1.order_id) && s1.used === 1 && s1.report.redeemed === r0.redeemed + 1, s1)
  check(checks, "S-B14.2 cancel reverts", !cancelErr && s2.used === 0, s2)
  check(checks, "S-B14.3 applies again", s3.codes.includes(C) && s3.discount_total === review.value_zar, s3)
  check(checks, "S-B14.4 report excludes the cancelled order", s4.redeemed === r0.redeemed && s4.discount_value_zar === r0.discount_value_zar, s4)
  check(checks, "S-B14.5 re-redeem counts once", Boolean(o2.order_id) && s5.used === 1 && s5.report.redeemed === r0.redeemed + 1, s5)
  await draftOrderSteps(env, summary, checks)

  // S-B15 step 8: forged second cart_promotion link, then completeCartWorkflow
  const c1 = (await issue(env, review, "PROBE15X")).voucher.code
  const c2 = (await issue(env, review, "PROBE15Y")).voucher.code
  const forged = await minCart()
  await applyCodes(env, forged, [c1])
  await prepareEft(env, forged)
  const link = env.container.resolve(ContainerRegistrationKeys.LINK) as any
  const p2 = await promotionByCode(env, c2)
  await link.create({ [Modules.CART]: { cart_id: forged }, [Modules.PROMOTION]: { promotion_id: p2.id } })
  const codesBefore = snapshot(await getCart(env, forged)).codes
  const res8 = await completeOnly(env, forged)
  const { data: cartAfter } = await env.query.graph({ entity: "cart", fields: ["id", "completed_at"], filters: { id: forged } })
  const s8 = { codes_before: codesBefore, complete: res8, completed_at: cartAfter[0]?.completed_at ?? null, used: [await promotionUsed(env, c1), await promotionUsed(env, c2)] }
  summary.SB15_step8 = s8
  check(
    checks,
    "S-B15.8 backstop refuses a forged two-code cart",
    codesBefore.length === 2 && !res8.order_id && res8.error === ONE_CODE_MESSAGE && !s8.completed_at && s8.used[0] === 0 && s8.used[1] === 0,
    s8
  )

  // Codes for the HTTP matrix S-B15 steps 1-7 (each applies on its own to a cart at the MIN variant).
  summary.http_codes = {
    C1: (await issue(env, review, "PROBEH1")).voucher.code,
    C2: (await issue(env, review, "PROBEH2")).voucher.code,
    min_variant: env.variants.min,
    one_variant: env.variants.one,
    region_id: env.region.id,
    workshop_option: env.options["workshop-collect"],
  }
}

/** Part C (run last, with eft_payment_window_hours 0): the EFT unpaid auto-cancel gives the code back (S-B16). */
async function partC(env: ProbeEnv, summary: Record<string, any>, checks: Checks) {
  const review = program("kampi-review")
  const month = sastMonth(new Date())
  const C3 = (await issue(env, review, "PROBE16")).voucher.code
  const cart = await newCart(env, [{ variant_id: env.variants.min, quantity: 1 }])
  await applyCodes(env, cart, [C3])
  const r0 = await voucherReport(env.container, { program: "kampi-review", month })
  const done = await completeWithEft(env, cart)
  const usedAfter = await promotionUsed(env, C3)
  const r1 = await voucherReport(env.container, { program: "kampi-review", month })
  // The job cancels EVERY unpaid EFT order in the probe DB, so the report drops by the number of program
  // redemptions on the orders it cancelled, not by 1. Count those from the orders' adjustments around the job.
  const orderFields = ["id", "status", "items.adjustments.code", "shipping_methods.adjustments.code"]
  const prefix = `${review.code_prefix}-`
  const carriesProgramCode = (o: any) =>
    [...(o.items ?? []), ...(o.shipping_methods ?? [])].some((h: any) => (h?.adjustments ?? []).some((a: any) => String(a?.code ?? "").startsWith(prefix)))
  const { data: before } = await env.query.graph({ entity: "order", fields: orderFields, filters: { status: { $ne: "canceled" } } })
  await eftUnpaidOrders(env.container)
  const { data: afterRows } = await env.query.graph({ entity: "order", fields: ["id", "status"], filters: { id: (before as any[]).map((o) => o.id) } })
  const nowCanceled = new Set((afterRows as any[]).filter((o) => o.status === "canceled").map((o) => o.id))
  const cancelledRedemptions = (before as any[]).filter((o) => nowCanceled.has(o.id) && carriesProgramCode(o)).length
  const { data } = await env.query.graph({ entity: "order", fields: ["id", "status", "metadata"], filters: { id: done.order_id } })
  const order = data[0]
  const usedAfterJob = await promotionUsed(env, C3)
  const again = await newCart(env, [{ variant_id: env.variants.min, quantity: 1 }])
  await applyCodes(env, again, [C3])
  const againSnap = snapshot(await getCart(env, again))
  const r2 = await voucherReport(env.container, { program: "kampi-review", month })
  summary.SB16 = {
    code: C3,
    order_id: done.order_id,
    complete_error: done.error,
    used_after_complete: usedAfter,
    r0,
    r1,
    job_canceled_orders: nowCanceled.size,
    job_canceled_program_redemptions: cancelledRedemptions,
    order_status: order?.status,
    eft_auto_canceled_at: order?.metadata?.eft_auto_canceled_at ?? null,
    used_after_job: usedAfterJob,
    reapply: againSnap,
    r2,
  }
  check(
    checks,
    "S-B16 EFT auto-cancel gives the code back",
    Boolean(done.order_id) &&
      usedAfter === 1 &&
      r1.redeemed === r0.redeemed + 1 &&
      order?.status === "canceled" &&
      Boolean(order?.metadata?.eft_auto_canceled_at) &&
      usedAfterJob === 0 &&
      againSnap.codes.includes(C3) &&
      againSnap.discount_total === review.value_zar &&
      nowCanceled.has(String(done.order_id)) &&
      cancelledRedemptions >= 1 &&
      r2.redeemed === r1.redeemed - cancelledRedemptions,
    summary.SB16
  )

  // Three fresh, unused codes for Phase 2 (real-terms scratch program).
  summary.live_codes = {
    PROBE_LIVE_CODE: (await issue(env, review, "LIVE1")).voucher.code,
    PROBE_LIVE_CODE_2: (await issue(env, review, "LIVE2")).voucher.code,
    PROBE_LIVE_CODE_3: (await issue(env, review, "LIVE3")).voucher.code,
  }
}

export default async function voucherProbe({ container }: ExecArgs) {
  guard()
  const part = process.env.VOUCHER_PROBE_PART
  const hooksLoaded = fs.existsSync(path.join(process.cwd(), "src/workflows/hooks/vouchers.ts"))
  const loaded = await loadEnv(container)
  const env = loaded as ProbeEnv
  const summary: Record<string, any> = { part, hooks_loaded: hooksLoaded, MIN: env.MIN, VALUE: env.VALUE }
  const checks: Checks = []
  if (part === "attributes") await partA(env, summary)
  else if (part === "service" || part === "lifecycle") {
    if (!hooksLoaded || !env.variants) throw new Error("voucher-probe: Parts B and C need the hooks file and a DB that ran Part A")
    if (part === "service") await partB(env, summary, checks)
    else await partC(env, summary, checks)
    summary.checks = checks
    summary.failed = checks.filter((c) => !c.pass).map((c) => c.name)
  } else throw new Error(`voucher-probe: unknown VOUCHER_PROBE_PART "${part}" (attributes|service|lifecycle)`)
  console.log("VOUCHER_PROBE_SUMMARY " + JSON.stringify(summary))
  if (summary.stop || summary.failed?.length) process.exitCode = 1
}
