import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { getVoucherProgram } from "../../../lib/vouchers/config"
import { CapReachedError, ProgramEndedError, VoucherRevokedError, issueVoucher } from "../../../lib/vouchers/service"
import { verifyVoucherRequest } from "../../../lib/vouchers/signature"

const issueBody = z
  .object({
    program: z.string().regex(/^[a-z0-9-]{1,40}$/),
    ref: z.string().regex(/^[A-Za-z0-9-]{1,40}$/),
    email: z.string().email().max(254),
  })
  .strict()

function header(req: MedusaRequest, name: string): string | undefined {
  const v = req.headers[name]
  return typeof v === "string" ? v : undefined
}

/** DD3 auth for both voucher routes. Logs the reason on rejection, never the payload. */
export function authorized(req: MedusaRequest, secret: string, payload: string, logger: { warn: (m: string) => void }): boolean {
  const timestamp = header(req, "x-nk-timestamp")
  const signature = header(req, "x-nk-signature")
  if (!timestamp || !signature) {
    logger.warn("vouchers.auth rejected: missing signature headers")
    return false
  }
  if (!verifyVoucherRequest({ secret, timestamp, signature, payload })) {
    logger.warn("vouchers.auth rejected: invalid or stale signature")
    return false
  }
  return true
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
    logger.warn("vouchers.auth rejected: no raw body")
    return res.status(401).json({ error: "unauthorized" })
  }
  const raw = rawBuf.toString("utf8")
  if (!authorized(req, secret, raw, logger)) return res.status(401).json({ error: "unauthorized" })

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return res.status(400).json({ error: "invalid_body" })
  }
  const parsed = issueBody.safeParse(json)
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" })
  const { program: name, ref, email } = parsed.data

  const program = getVoucherProgram(name)
  if (!program) return res.status(400).json({ error: "unknown_program" })

  const log = (result: string) => logger.info("vouchers.issue " + JSON.stringify({ program: name, ref, result }))
  try {
    const out = await issueVoucher(req.scope, { program, ref, email, secret })
    log(out.status)
    return res.status(out.status === "created" ? 201 : 200).json(out.voucher)
  } catch (e: any) {
    if (e instanceof ProgramEndedError) {
      log("ended")
      return res.status(400).json({ error: "program_ended" })
    }
    if (e instanceof VoucherRevokedError) {
      log("revoked")
      return res.status(409).json({ error: "revoked" })
    }
    if (e instanceof CapReachedError) {
      log("cap")
      return res.status(429).json({ error: "cap_reached" })
    }
    log("error")
    logger.error("vouchers.issue failed " + JSON.stringify({ program: name, ref, message: String(e?.message ?? e) }))
    return res.status(500).json({ error: "internal" })
  }
}
