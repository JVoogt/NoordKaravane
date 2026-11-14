import fs from "fs"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createCampaignsWorkflow, createPromotionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Imports the Kampi host sticker-kit codes: one single-use code per host that makes up to `max_kits` sticker kits
 * free. It never touches delivery: the host pays the courier fee or collects (JP, 2026-11-14).
 *
 *   HOST_KIT_CODES_FILE=/path/rows.json HOST_KIT_CODES_ENDS_AT=2026-11-22T23:59:59+02:00 \
 *     [HOST_KIT_CODES_DRY_RUN=1] npx medusa exec ./src/scripts/import-host-kit-codes.ts
 *
 * rows.json: [{ "code": "KAMPI-QR-7F3KQ", "max_kits": 2, "host_id": "<kampi user id>", "listing_ids": "1418 1502" }]
 * Never commit an import file: it maps codes to hosts.
 *
 * Each promotion: 100% off, items only, product = the sticker kit, at most max_kits units, usable once, in the
 * campaign `kampi-host-qr-2026` that ends at HOST_KIT_CODES_ENDS_AT.
 *
 * Idempotent: a code that already exists (soft-deleted included) is skipped. A rejected row aborts the run before
 * any write. A write failure mid-run reports how far it got and exits non-zero; a rerun skips what was created.
 * Self-contained on purpose (no ../lib imports), so the compiled file can run in an image built before this branch.
 */
export const HOST_KIT_HANDLE = "kampi-host-sticker-kit-qr"
export const HOST_KIT_CAMPAIGN = "kampi-host-qr-2026"
export const HOST_KIT_PROGRAM = "kampi-host-qr"
const CODE_RE = /^KAMPI-QR-[A-Z0-9]{5}$/
const MAX_KITS_LIMIT = 20
const BATCH = 25

export type HostKitRow = { code: string; max_kits: number; host_id: string; listing_ids: string }
export type HostKitPlan = { create: HostKitRow[]; skipped_existing: string[]; rejected: { index: number; reason: string }[] }

/** Validates the file and splits it into rows to create and codes that already exist. Pure. */
export function planHostKitImport(rows: unknown, existingCodes: Set<string>): HostKitPlan {
  const plan: HostKitPlan = { create: [], skipped_existing: [], rejected: [] }
  if (!Array.isArray(rows)) return { ...plan, rejected: [{ index: -1, reason: "the file must hold a JSON array" }] }
  const seen = new Set<string>()
  rows.forEach((raw: any, index) => {
    const code = typeof raw?.code === "string" ? raw.code.trim().toUpperCase() : ""
    const maxKits = Number(raw?.max_kits)
    const hostId = typeof raw?.host_id === "string" ? raw.host_id.trim() : ""
    const listingIds = String(raw?.listing_ids ?? "")
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
    const reject = (reason: string) => plan.rejected.push({ index, reason })
    if (!CODE_RE.test(code)) return reject(`code "${code}" does not match KAMPI-QR-XXXXX`)
    if (seen.has(code)) return reject(`code ${code} appears twice in the file`)
    seen.add(code)
    if (!Number.isInteger(maxKits) || maxKits < 1 || maxKits > MAX_KITS_LIMIT) return reject(`${code}: max_kits must be a whole number from 1 to ${MAX_KITS_LIMIT}`)
    if (!hostId) return reject(`${code}: host_id is missing`)
    if (!listingIds.length || listingIds.some((id) => !/^\d+$/.test(id))) return reject(`${code}: listing_ids must be listing numbers`)
    if (listingIds.length !== maxKits) return reject(`${code}: ${listingIds.length} listing number(s) for max_kits ${maxKits}`)
    if (existingCodes.has(code)) return plan.skipped_existing.push(code)
    plan.create.push({ code, max_kits: maxKits, host_id: hostId, listing_ids: listingIds.join(" ") })
  })
  return plan
}

/** The promotion for one host. Pure. */
export function hostKitPromotion(row: HostKitRow, productId: string, campaignId: string) {
  return {
    code: row.code,
    type: "standard",
    status: "active",
    is_automatic: false,
    is_tax_inclusive: true,
    limit: 1,
    campaign_id: campaignId,
    application_method: {
      type: "percentage",
      target_type: "items",
      allocation: "each",
      value: 100,
      max_quantity: row.max_kits,
      currency_code: "zar",
      target_rules: [{ attribute: "items.product.id", operator: "in", values: [productId] }],
    },
    metadata: { program: HOST_KIT_PROGRAM, source: "import", host_id: row.host_id, listing_ids: row.listing_ids, max_kits: row.max_kits },
  }
}

export default async function importHostKitCodes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const file = process.env.HOST_KIT_CODES_FILE
  if (!file) throw new Error("import-host-kit-codes: set HOST_KIT_CODES_FILE")
  const endsAtRaw = process.env.HOST_KIT_CODES_ENDS_AT
  // An offset is required: "2026-11-22T23:59:59" would be read in the server's zone, which is not SAST on the Pi.
  if (!endsAtRaw || !/(Z|[+-]\d{2}:\d{2})$/.test(endsAtRaw) || Number.isNaN(Date.parse(endsAtRaw)))
    throw new Error("import-host-kit-codes: set HOST_KIT_CODES_ENDS_AT to an ISO datetime with an offset, e.g. 2026-11-22T23:59:59+02:00")
  const endsAt = new Date(endsAtRaw)
  if (endsAt.getTime() <= Date.now()) throw new Error("import-host-kit-codes: HOST_KIT_CODES_ENDS_AT is in the past")
  const dryRun = process.env.HOST_KIT_CODES_DRY_RUN === "1"

  const rows: unknown = JSON.parse(fs.readFileSync(file, "utf8"))
  const candidates = Array.isArray(rows)
    ? rows.map((r: any) => (typeof r?.code === "string" ? r.code.trim().toUpperCase() : null)).filter((c): c is string => Boolean(c))
    : []
  const existing = candidates.length ? ((await promotionModule.listPromotions({ code: candidates }, { select: ["code"], withDeleted: true })) as any[]) : []
  const plan = planHostKitImport(rows, new Set(existing.map((p) => String(p.code))))
  if (plan.rejected.length) {
    for (const r of plan.rejected) logger.error(`host-kit-codes rejected ${JSON.stringify(r)}`)
    throw new Error(`import-host-kit-codes: ${plan.rejected.length} rejected row(s), nothing written`)
  }

  const product = ((await query.graph({ entity: "product", fields: ["id", "status"], filters: { handle: HOST_KIT_HANDLE } })).data as any[])[0]
  if (!product) throw new Error(`import-host-kit-codes: product ${HOST_KIT_HANDLE} not found; run add-host-sticker-kit first. Nothing written.`)

  const summary = {
    dry_run: dryRun,
    product_id: product.id,
    product_status: product.status,
    campaign: HOST_KIT_CAMPAIGN,
    ends_at: endsAt.toISOString(),
    planned: plan.create.length,
    kits_planned: plan.create.reduce((n, r) => n + r.max_kits, 0),
    skipped_existing: plan.skipped_existing.length,
    created: 0,
  }
  if (dryRun || !plan.create.length) {
    console.log("HOST_KIT_CODES_SUMMARY " + JSON.stringify(summary))
    return
  }

  let campaign = ((await promotionModule.listCampaigns({ campaign_identifier: HOST_KIT_CAMPAIGN }, { select: ["id", "ends_at"] })) as any[])[0]
  if (!campaign) {
    const { result } = await createCampaignsWorkflow(container).run({
      input: { campaignsData: [{ name: HOST_KIT_CAMPAIGN, campaign_identifier: HOST_KIT_CAMPAIGN, starts_at: null, ends_at: endsAt }] },
    } as any)
    campaign = (result as any[])[0]
  } else if (!campaign.ends_at || new Date(campaign.ends_at).getTime() !== endsAt.getTime()) {
    // The campaign's own end date decides when codes stop working; this script never moves it.
    logger.warn(
      `host-kit-codes: campaign ${HOST_KIT_CAMPAIGN} already exists and ends at ${campaign.ends_at ?? "never"}, not ${endsAt.toISOString()}; new codes follow the campaign`
    )
  }

  try {
    for (let i = 0; i < plan.create.length; i += BATCH) {
      const batch = plan.create.slice(i, i + BATCH)
      await createPromotionsWorkflow(container).run({ input: { promotionsData: batch.map((r) => hostKitPromotion(r, product.id, campaign.id)) } } as any)
      summary.created += batch.length
    }
  } catch (e: any) {
    logger.error("host-kit-codes failed " + JSON.stringify({ ...summary, message: String(e?.message ?? e) }))
    throw e
  }
  console.log("HOST_KIT_CODES_SUMMARY " + JSON.stringify(summary))
}
