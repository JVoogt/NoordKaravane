import crypto from "crypto"

/** PayFast URL-encoding: encodeURIComponent semantics, uppercase hex, spaces as "+". */
export function pfEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
}

/**
 * Builds the PayFast parameter string. Order is preserved as given (PayFast requires the
 * order in which the fields appear in the form / ITN body), blank values and `signature`
 * are skipped, and the passphrase is appended when set.
 */
export function buildParamString(data: Record<string, unknown>, passphrase?: string): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (k === "signature") continue
    if (v === undefined || v === null || String(v).trim() === "") continue
    parts.push(`${k}=${pfEncode(String(v))}`)
  }
  if (passphrase && passphrase.trim()) parts.push(`passphrase=${pfEncode(passphrase)}`)
  return parts.join("&")
}

export function generateSignature(data: Record<string, unknown>, passphrase?: string): string {
  return crypto.createHash("md5").update(buildParamString(data, passphrase)).digest("hex")
}

export function verifySignature(data: Record<string, unknown>, passphrase?: string): boolean {
  const given = String(data.signature ?? "").toLowerCase()
  if (!given) return false
  const expected = generateSignature(data, passphrase)
  if (given.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

// PayFast ITN source ranges (https://developers.payfast.co.za/docs#step_4_confirm_payment)
const PAYFAST_CIDRS = ["197.97.145.144/28", "41.74.179.192/27", "102.216.36.0/28", "102.216.36.128/28"]
const PAYFAST_IPS = ["144.126.193.139"]

function ipToInt(ip: string): number | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  return ((+m[1] << 24) | (+m[2] << 16) | (+m[3] << 8) | +m[4]) >>> 0
}

export function isPayfastIp(rawIp: string | undefined | null): boolean {
  if (!rawIp) return false
  const ip = rawIp.replace(/^::ffff:/, "")
  if (PAYFAST_IPS.includes(ip)) return true
  const n = ipToInt(ip)
  if (n === null) return false
  return PAYFAST_CIDRS.some((cidr) => {
    const [base, bits] = cidr.split("/")
    const b = ipToInt(base)!
    const mask = bits === "0" ? 0 : (~0 << (32 - +bits)) >>> 0
    return (n & mask) >>> 0 === (b & mask) >>> 0
  })
}

export function amountsMatch(expected: number, gross: string | number): boolean {
  return Math.abs(Number(expected) - Number(gross)) <= 0.01
}

export function payfastHost(sandbox: boolean): string {
  return sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za"
}
