import crypto from "crypto"

/** Accepted clock skew either side of now, in seconds (DD3). */
export const SIGNATURE_WINDOW_S = 300

const HEX64 = /^[0-9a-f]{64}$/
const DECIMAL = /^\d{1,12}$/

/** Lowercase hex HMAC-SHA256 of `${timestamp}.${payload}` (DD3). POST payload = raw body; GET payload = originalUrl. */
export function signVoucherRequest(secret: string, timestamp: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")
}

/**
 * True only for a non-empty secret, a decimal timestamp within ±SIGNATURE_WINDOW_S of now, and a 64-char lowercase
 * hex signature that equals the HMAC. Constant-time compare on equal-length buffers. Never throws.
 */
export function verifyVoucherRequest(args: {
  secret: string
  timestamp: string | undefined
  signature: string | undefined
  payload: string
  nowS?: number
}): boolean {
  const { secret, timestamp, signature, payload } = args
  if (!secret || !timestamp || !signature) return false
  if (!DECIMAL.test(timestamp) || !HEX64.test(signature)) return false
  const nowS = args.nowS ?? Math.floor(Date.now() / 1000)
  if (Math.abs(nowS - Number(timestamp)) > SIGNATURE_WINDOW_S) return false
  const expected = Buffer.from(signVoucherRequest(secret, timestamp, payload), "hex")
  const given = Buffer.from(signature, "hex")
  if (expected.length !== given.length) return false
  return crypto.timingSafeEqual(expected, given)
}
