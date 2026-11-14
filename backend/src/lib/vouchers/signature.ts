import crypto from "crypto"

/** Accepted clock skew either side of now, in seconds (DD3). */
export const SIGNATURE_WINDOW_S = 300

const HEX64 = /^[0-9a-f]{64}$/
const DECIMAL = /^\d{1,12}$/

/** Lowercase hex HMAC-SHA256 of `${timestamp}.${payload}` (DD3). POST payload = raw body; GET payload = originalUrl. */
export function signVoucherRequest(secret: string, timestamp: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")
}

/** Why a signed request was refused (M2). Logged only; the caller always gets the same 401. */
export type VoucherAuthFailure = "missing_headers" | "malformed" | "stale_timestamp" | "bad_signature"

/**
 * Null only for a non-empty secret, a decimal timestamp within ±SIGNATURE_WINDOW_S of now, and a 64-char lowercase
 * hex signature that equals the HMAC; otherwise the reason. Constant-time compare on equal-length buffers. Never throws.
 */
export function voucherRequestFailure(args: {
  secret: string
  timestamp: string | undefined
  signature: string | undefined
  payload: string
  nowS?: number
}): VoucherAuthFailure | null {
  const { secret, timestamp, signature, payload } = args
  if (!timestamp || !signature) return "missing_headers"
  if (!DECIMAL.test(timestamp) || !HEX64.test(signature)) return "malformed"
  const nowS = args.nowS ?? Math.floor(Date.now() / 1000)
  if (Math.abs(nowS - Number(timestamp)) > SIGNATURE_WINDOW_S) return "stale_timestamp"
  if (!secret) return "bad_signature"
  const expected = Buffer.from(signVoucherRequest(secret, timestamp, payload), "hex")
  const given = Buffer.from(signature, "hex")
  if (expected.length !== given.length) return "bad_signature"
  return crypto.timingSafeEqual(expected, given) ? null : "bad_signature"
}

/** True only when voucherRequestFailure finds nothing wrong. */
export function verifyVoucherRequest(args: Parameters<typeof voucherRequestFailure>[0]): boolean {
  return voucherRequestFailure(args) === null
}

type HeaderBag = { headers: Record<string, string | string[] | undefined> }

function header(req: HeaderBag, name: string): string | undefined {
  const v = req.headers[name]
  return typeof v === "string" ? v : undefined
}

/**
 * DD3 auth for both voucher routes. On rejection logs `vouchers.auth rejected: <reason>` (a VoucherAuthFailure code),
 * never the payload, the signature or the secret.
 */
export function authorized(req: HeaderBag, secret: string, payload: string, logger: { warn: (m: string) => void }): boolean {
  const failure = voucherRequestFailure({ secret, timestamp: header(req, "x-nk-timestamp"), signature: header(req, "x-nk-signature"), payload })
  if (failure) logger.warn(`vouchers.auth rejected: ${failure}`)
  return failure === null
}
