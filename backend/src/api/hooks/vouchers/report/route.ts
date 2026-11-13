import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { voucherReport } from "../../../../lib/vouchers/service"
import { authorized } from "../../../../lib/vouchers/signature"

const reportQuery = z
  .object({
    program: z.string().regex(/^[a-z0-9-]{1,40}$/),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  })
  .strict()

/**
 * GET /hooks/vouchers/report?program=<name>&month=<YYYY-MM>: issued, redeemed and discount value for the campaigns
 * whose identifier starts with `${program}-${month}`. Signed over the exact originalUrl. 404 while the secret is unset.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const secret = process.env.VOUCHER_HOOK_SECRET
  if (!secret) return res.sendStatus(404)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  if (!authorized(req, secret, req.originalUrl, logger)) return res.status(401).json({ error: "unauthorized" })

  const parsed = reportQuery.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: "invalid_query" })
  try {
    return res.status(200).json(await voucherReport(req.scope, parsed.data))
  } catch (e: any) {
    logger.error("vouchers.report failed " + JSON.stringify({ ...parsed.data, message: String(e?.message ?? e) }))
    return res.status(500).json({ error: "internal" })
  }
}
