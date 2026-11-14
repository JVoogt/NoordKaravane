import crypto from "crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createCampaignsWorkflow, createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { codeFor } from "./code"
import { cohortFor } from "./cohort"
import type { VoucherProgram } from "./config"
import { originatingCarts } from "./origin"

/**
 * The cart attribute the min-spend rule reads (DD8). Measured on a real Medusa 2.22.2 + Postgres by
 * `voucher-probe.ts` Part A (see the plan's Verification Notes, Task 1.2): `original_item_total` is the VAT-inclusive,
 * pre-discount shelf total, with or without a tax region, and it survives a cart refresh. `item_total` is
 * post-discount (the rule cancels itself on the next refresh); `item_subtotal` and `original_item_subtotal` are
 * ex VAT once a tax rate exists. Re-measure after any Medusa upgrade.
 */
export const MIN_SPEND_ATTRIBUTE: string = "original_item_total"

export type VoucherView = { code: string; expires_at: string; value: number; min_spend: number; currency: "zar"; used: boolean }
export type IssueResult = { status: "created" | "existing"; voucher: VoucherView }

export class CapReachedError extends Error {}
export class ProgramEndedError extends Error {}
/**
 * The program is live but this month's cohort campaign already ended (for example its end was moved in admin). Not a
 * ProgramEndedError: the program itself has not ended. Nothing is created; the campaign is never extended (M3).
 */
export class CampaignEndedError extends Error {
  constructor(readonly campaign_identifier: string) {
    super(`campaign ${campaign_identifier} has ended`)
  }
}
export class VoucherRevokedError extends Error {}
/** The code's campaign is missing or has no end, so no `expires_at` can be given (M6). Nothing is created. */
export class ExpiryUnknownError extends Error {}

const PROMO_FIELDS = ["id", "code", "status", "used", "limit", "deleted_at", "metadata", "campaign_id"]

function emailHash(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
}

async function findPromotionByCode(container: MedusaContainer, code: string): Promise<any | null> {
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const [p] = await promotionModule.listPromotions({ code }, { select: PROMO_FIELDS, relations: ["campaign", "application_method"], withDeleted: true })
  return p ?? null
}

function view(p: any): VoucherView {
  const endsAt = p.campaign?.ends_at ?? null
  if (!endsAt) throw new ExpiryUnknownError(`voucher ${p.code} has no campaign end (campaign ${p.campaign_id ?? "missing"})`)
  return {
    code: p.code,
    expires_at: new Date(endsAt).toISOString(),
    value: Number(p.metadata?.value_zar ?? p.application_method?.value ?? 0),
    min_spend: Number(p.metadata?.min_spend_zar ?? 0),
    currency: "zar",
    used: p.limit != null && Number(p.used ?? 0) >= Number(p.limit),
  }
}

async function findCampaign(container: MedusaContainer, campaign_identifier: string): Promise<any | null> {
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const [c] = await promotionModule.listCampaigns({ campaign_identifier }, { select: ["id", "campaign_identifier", "ends_at"] })
  return c ?? null
}

/**
 * Find the campaign by identifier, else create it; a failed create re-reads (a concurrent request won), else rethrows.
 * `ends_at` is null for an existing campaign without an end (never turned into the epoch).
 */
export async function findOrCreateCampaign(
  container: MedusaContainer,
  args: { campaign_identifier: string; ends_at: Date }
): Promise<{ id: string; ends_at: Date | null }> {
  const toResult = (c: any) => ({ id: c.id, ends_at: c.ends_at ? new Date(c.ends_at) : null })
  const existing = await findCampaign(container, args.campaign_identifier)
  if (existing) return toResult(existing)
  try {
    const { result } = await createCampaignsWorkflow(container).run({
      input: { campaignsData: [{ name: args.campaign_identifier, campaign_identifier: args.campaign_identifier, starts_at: null, ends_at: args.ends_at }] },
    } as any)
    return toResult((result as any[])[0])
  } catch (e) {
    const winner = await findCampaign(container, args.campaign_identifier)
    if (winner) return toResult(winner)
    throw e
  }
}

/** The one promotion creator (DD7), shared by the hook and the import. */
export async function createVoucherPromotion(
  container: MedusaContainer,
  input: { code: string; campaign_id: string; value_zar: number; min_spend_zar: number; metadata: Record<string, unknown> }
): Promise<{ id: string; code: string }> {
  const { result } = await createPromotionsWorkflow(container).run({
    input: {
      promotionsData: [
        {
          code: input.code,
          type: "standard",
          status: "active",
          is_automatic: false,
          is_tax_inclusive: true,
          limit: 1,
          campaign_id: input.campaign_id,
          application_method: { type: "fixed", target_type: "order", allocation: "across", value: input.value_zar, currency_code: "zar" },
          rules: [{ attribute: MIN_SPEND_ATTRIBUTE, operator: "gte", values: [String(input.min_spend_zar)] }],
          metadata: input.metadata,
        },
      ],
    },
  } as any)
  const p = (result as any[])[0]
  return { id: p.id, code: p.code }
}

/**
 * Find-or-create the single-use code for (program, ref). Throws VoucherRevokedError (RD2), ProgramEndedError (RD3,
 * the program's fixed end passed), CampaignEndedError (the program is live but this month's cohort campaign already
 * ended, M3), CapReachedError, or ExpiryUnknownError (the campaign is missing or has no end, M6); anything else is
 * unexpected and rethrown. Never stores or logs the raw email.
 */
export async function issueVoucher(
  container: MedusaContainer,
  args: { program: VoucherProgram; ref: string; email: string; secret: string; now?: Date }
): Promise<IssueResult> {
  const { program, ref } = args
  const now = args.now ?? new Date()
  const code = codeFor(program, ref, args.secret)

  const found = await findPromotionByCode(container, code)
  if (found) {
    if (found.deleted_at || found.status !== "active") throw new VoucherRevokedError(`voucher ${code} was revoked`)
    return { status: "existing", voucher: view(found) }
  }

  if (program.ends_at && new Date(program.ends_at).getTime() <= now.getTime()) throw new ProgramEndedError(`program ${program.name} has ended`)

  const cohort = cohortFor(program, now)
  const existingCampaign = await findCampaign(container, cohort.campaign_identifier)
  if (existingCampaign) {
    // Refuse rather than extend: extending would also move the expiry of every code already issued in the cohort.
    if (!existingCampaign.ends_at) throw new ExpiryUnknownError(`campaign ${existingCampaign.campaign_identifier} has no end`)
    if (new Date(existingCampaign.ends_at).getTime() <= now.getTime()) throw new CampaignEndedError(String(existingCampaign.campaign_identifier))
    const promotionModule = container.resolve(Modules.PROMOTION) as any
    const inCampaign = (await promotionModule.listPromotions({ campaign_id: existingCampaign.id }, { select: ["id"] })) as any[]
    if (inCampaign.length >= program.monthly_cap) throw new CapReachedError(`program ${program.name} reached its monthly cap`)
  }
  const campaign = existingCampaign
    ? { id: existingCampaign.id, ends_at: new Date(existingCampaign.ends_at) }
    : await findOrCreateCampaign(container, cohort)
  if (!campaign.ends_at) throw new ExpiryUnknownError(`campaign ${cohort.campaign_identifier} has no end`)
  const expiresAt = campaign.ends_at

  try {
    await createVoucherPromotion(container, {
      code,
      campaign_id: campaign.id,
      value_zar: program.value_zar,
      min_spend_zar: program.min_spend_zar,
      metadata: {
        program: program.name,
        ref,
        email_hash: emailHash(args.email),
        value_zar: program.value_zar,
        min_spend_zar: program.min_spend_zar,
        source: "hook",
      },
    })
  } catch (e) {
    const winner = await findPromotionByCode(container, code)
    if (winner) return { status: "existing", voucher: view(winner) }
    throw e
  }
  return {
    status: "created",
    voucher: {
      code,
      expires_at: expiresAt.toISOString(),
      value: program.value_zar,
      min_spend: program.min_spend_zar,
      currency: "zar",
      used: false,
    },
  }
}

/**
 * DD9. Campaigns whose identifier starts with `${program}-${month}`; issued = their non-deleted promotion count; a
 * redemption is an order_promotion link from any of their promotions (soft-deleted included, R-M1) to an order that is
 * not canceled, not a draft (H2), has an `order_cart` link (so a converted draft never counts) AND whose originating
 * cart carried an adjustment with the promotion's code at completion (the same source as the cancel revert, RD6; a
 * code added to the order later never counts). Never reads promotion.used (G19).
 */
export async function voucherReport(
  container: MedusaContainer,
  args: { program: string; month: string }
): Promise<{ issued: number; redeemed: number; discount_value_zar: number }> {
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const prefix = `${args.program}-${args.month}`
  const campaigns = ((await promotionModule.listCampaigns({ campaign_identifier: { $like: `${prefix}%` } }, { select: ["id", "campaign_identifier"] })) as any[]).filter(
    (c) => String(c.campaign_identifier).startsWith(prefix)
  )
  if (!campaigns.length) return { issued: 0, redeemed: 0, discount_value_zar: 0 }
  const promotions = (await promotionModule.listPromotions(
    { campaign_id: campaigns.map((c) => c.id) },
    { select: ["id", "code", "metadata", "campaign_id", "deleted_at"], relations: ["application_method"], withDeleted: true }
  )) as any[]
  if (!promotions.length) return { issued: 0, redeemed: 0, discount_value_zar: 0 }

  const { data: links } = await query.graph({
    entity: "order_promotion",
    fields: ["order_id", "promotion_id"],
    filters: { promotion_id: promotions.map((p) => p.id) },
  })
  const orderIds = [...new Set((links as any[]).map((l) => l.order_id))]
  const orders = new Map<string, any>()
  if (orderIds.length) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "status", "is_draft_order"],
      filters: { id: orderIds },
    })
    for (const o of data as any[]) if (o.status !== "canceled" && o.status !== "draft" && !o.is_draft_order) orders.set(o.id, o)
  }
  const { carts, missing } = await originatingCarts(query, [...orders.keys()])
  // An order linked to a cart that cannot be read is not counted; say so once per report, not once per order.
  if (missing.length)
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn("vouchers.report cart not found, orders not counted " + JSON.stringify({ program: args.program, month: args.month, missing }))
  const cartCodes = new Map([...carts].map(([orderId, c]) => [orderId, new Set([...c.amounts.keys()].map((k) => k.toUpperCase()))]))

  const byId = new Map(promotions.map((p) => [p.id, p]))
  let redeemed = 0
  let discount = 0
  for (const l of links as any[]) {
    const p = byId.get(l.promotion_id)
    if (!p || !orders.has(l.order_id)) continue
    if (!cartCodes.get(l.order_id)?.has(String(p.code).toUpperCase())) continue
    redeemed += 1
    discount += Number(p.metadata?.value_zar ?? p.application_method?.value ?? 0)
  }
  return { issued: promotions.filter((p) => !p.deleted_at).length, redeemed, discount_value_zar: discount }
}
