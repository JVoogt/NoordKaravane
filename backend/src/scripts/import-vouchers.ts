import fs from "fs"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateCampaignsWorkflow } from "@medusajs/medusa/core-flows"
import { ImportRejectedError, campaignEndsAtUpdate, planImport } from "../lib/vouchers/import"
import { createVoucherPromotion, findOrCreateCampaign } from "../lib/vouchers/service"

/**
 * One-off cutover import of existing single-use codes (CONTRACTS.md, Vouchers).
 *
 *   VOUCHERS_IMPORT_FILE=/path/rows.json [VOUCHERS_IMPORT_DRY_RUN=1] npx medusa exec ./src/scripts/import-vouchers.ts
 *
 * Idempotent: codes that already exist (soft-deleted included) are skipped. A rejected row aborts the whole run
 * before any write, with every rejection printed and a non-zero exit. A write failure mid-run logs how far it got
 * (`vouchers.import failed`) and exits non-zero; a rerun skips what was created. Never commit an import file.
 */
export default async function importVouchers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const file = process.env.VOUCHERS_IMPORT_FILE
  if (!file) throw new Error("import-vouchers: set VOUCHERS_IMPORT_FILE")
  const dryRun = process.env.VOUCHERS_IMPORT_DRY_RUN === "1"
  const rows: unknown = JSON.parse(fs.readFileSync(file, "utf8"))

  const candidates = Array.isArray(rows)
    ? rows.map((r: any) => (typeof r?.code === "string" ? r.code.trim().toUpperCase() : null)).filter((c): c is string => Boolean(c))
    : []
  const existing = candidates.length
    ? ((await promotionModule.listPromotions({ code: candidates }, { select: ["code"], withDeleted: true })) as any[])
    : []
  const existingCodes = new Set(existing.map((p) => String(p.code)))

  let plan: ReturnType<typeof planImport>
  try {
    plan = planImport(rows, existingCodes, new Date())
  } catch (e) {
    if (e instanceof ImportRejectedError) {
      for (const r of e.rejections) logger.error(`vouchers.import rejected ${JSON.stringify(r)}`)
      logger.error(`vouchers.import aborted: ${e.rejections.length} rejected row(s), nothing written`)
    }
    throw e
  }
  for (const code of plan.skipped_expired) logger.info(`vouchers.import skipped expired ${code}`)
  for (const code of plan.skipped_existing) logger.info(`vouchers.import skipped existing ${code}`)

  const campaignsExtended: string[] = []
  const planned = plan.campaigns.reduce((n, g) => n + g.rows.length, 0)
  let created = 0
  let failedCampaign: string | null = null
  let failedCode: string | null = null
  try {
    for (const group of plan.campaigns) {
      failedCampaign = group.campaign_identifier
      failedCode = null
      if (dryRun) {
        const [c] = await promotionModule.listCampaigns({ campaign_identifier: group.campaign_identifier }, { select: ["id", "ends_at"] })
        if (c && c.ends_at && campaignEndsAtUpdate(new Date(c.ends_at), group.ends_at)) campaignsExtended.push(group.campaign_identifier)
        logger.info(
          `vouchers.import plan ${JSON.stringify({ campaign: group.campaign_identifier, ends_at: group.ends_at.toISOString(), exists: Boolean(c), codes: group.rows.map((r) => r.code) })}`
        )
        continue
      }
      const campaign = await findOrCreateCampaign(container, { campaign_identifier: group.campaign_identifier, ends_at: group.ends_at })
      // An open-ended campaign (ends_at null) is never "extended", matching the dry run.
      const newEnd = campaign.ends_at ? campaignEndsAtUpdate(campaign.ends_at, group.ends_at) : null
      if (newEnd) {
        await updateCampaignsWorkflow(container).run({ input: { campaignsData: [{ id: campaign.id, ends_at: newEnd }] } } as any)
        campaignsExtended.push(group.campaign_identifier)
      }
      for (const row of group.rows) {
        failedCode = row.code
        await createVoucherPromotion(container, {
          code: row.code,
          campaign_id: campaign.id,
          value_zar: row.value_zar,
          min_spend_zar: row.min_spend_zar,
          metadata: { program: row.program, ref: null, email_hash: null, value_zar: row.value_zar, min_spend_zar: row.min_spend_zar, source: "import" },
        })
        created += 1
      }
    }
  } catch (e: any) {
    // A write failed mid-run: say how far it got, then fail the run. A rerun skips the codes already created.
    logger.error(
      "vouchers.import failed " +
        JSON.stringify({ created, planned, failed_campaign: failedCampaign, failed_code: failedCode, message: String(e?.message ?? e) })
    )
    throw e
  }
  const summary = {
    dry_run: dryRun,
    created,
    planned,
    skipped_existing: plan.skipped_existing.length,
    skipped_expired: plan.skipped_expired.length,
    campaigns_extended: campaignsExtended,
  }
  console.log("VOUCHERS_IMPORT_SUMMARY " + JSON.stringify(summary))
}
