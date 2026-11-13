import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { getVoucherProgram } from "../../../lib/vouchers/config"
import {
  CampaignEndedError,
  CapReachedError,
  ExpiryUnknownError,
  ProgramEndedError,
  VoucherRevokedError,
  issueVoucher,
} from "../../../lib/vouchers/service"
import { authorized } from "../../../lib/vouchers/signature"

const PROGRAM = /^[a-z0-9-]{1,40}$/
const REF = /^[A-Za-z0-9-]{1,40}$/

const issueBody = z
  .object({
    program: z.string().regex(PROGRAM),
    ref: z.string().regex(REF),
    email: z.string().email().max(254),
  })
  .strict()

/** A field of an unvalidated body, only when it passes its own pattern (never an email or arbitrary text in a log). */
function safeField(json: unknown, key: "program" | "ref", pattern: RegExp): string | null {
  const v = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>)[key] : undefined
  return typeof v === "string" && pattern.test(v) ? v : null
}

/**
 * POST /hooks/vouchers: issue (or return) the single-use code for {program, ref, email}. Signed per CONTRACTS.md
 * (Vouchers). 404 while VOUCHER_HOOK_SECRET is unset. Terms come only from config; the body cannot carry them.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const secret = process.env.VOUCHER_HOOK_SECRET
  if (!secret) return res.sendStatus(404)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  const rawBuf: Buffer | undefined = (req as any).rawBody
  if (!rawBuf) {
    // The body parser keeps raw bytes only for the content types it parses (JSON, text, urlencoded); anything else, or an
    // empty body, has none to verify. A urlencoded body does reach the signature check: 401 unless correctly signed,
    // then 400 invalid_body because it is not JSON.
    logger.warn("vouchers.issue rejected: unsupported_content_type")
    return res.status(415).json({ error: "unsupported_content_type" })
  }
  const raw = rawBuf.toString("utf8")
  if (!authorized(req, secret, raw, logger)) return res.status(401).json({ error: "unauthorized" })

  const logResult = (program: string | null, ref: string | null, result: string) =>
    logger.info("vouchers.issue " + JSON.stringify({ program, ref, result }))
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    logResult(null, null, "invalid_body")
    return res.status(400).json({ error: "invalid_body" })
  }
  const parsed = issueBody.safeParse(json)
  if (!parsed.success) {
    logResult(safeField(json, "program", PROGRAM), safeField(json, "ref", REF), "invalid_body")
    return res.status(400).json({ error: "invalid_body" })
  }
  const { program: name, ref, email } = parsed.data

  const program = getVoucherProgram(name)
  if (!program) {
    logResult(name, ref, "unknown_program")
    return res.status(400).json({ error: "unknown_program" })
  }

  const log = (result: string) => logResult(name, ref, result)
  try {
    const out = await issueVoucher(req.scope, { program, ref, email, secret })
    log(out.status)
    return res.status(out.status === "created" ? 201 : 200).json(out.voucher)
  } catch (e: any) {
    if (e instanceof ProgramEndedError) {
      log("ended")
      return res.status(400).json({ error: "program_ended" })
    }
    if (e instanceof CampaignEndedError) {
      // The program is live but this month's cohort campaign ended (its end was moved in admin): staff must act.
      logger.warn("vouchers.issue " + JSON.stringify({ program: name, ref, result: "campaign_ended", campaign: e.campaign_identifier }))
      return res.status(400).json({ error: "campaign_ended" })
    }
    if (e instanceof VoucherRevokedError) {
      log("revoked")
      return res.status(409).json({ error: "revoked" })
    }
    if (e instanceof CapReachedError) {
      log("cap")
      return res.status(429).json({ error: "cap_reached" })
    }
    if (e instanceof ExpiryUnknownError) {
      log("expiry_unknown")
      logger.error("vouchers.issue failed " + JSON.stringify({ program: name, ref, message: String(e.message) }))
      return res.status(500).json({ error: "expiry_unknown" })
    }
    log("error")
    logger.error("vouchers.issue failed " + JSON.stringify({ program: name, ref, message: String(e?.message ?? e) }))
    return res.status(500).json({ error: "internal" })
  }
}
