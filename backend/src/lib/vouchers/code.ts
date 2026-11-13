import crypto from "crypto"
import type { VoucherProgram } from "./config"

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const SUFFIX_LENGTH = 7

/** Crockford base32, MSB-first 5-bit groups, the last group zero-padded on the right, no padding characters. */
export function crockfordBase32(buf: Buffer): string {
  let out = ""
  let acc = 0
  let bits = 0
  for (const byte of buf) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD[(acc >> (bits - 5)) & 31]
      bits -= 5
    }
    acc &= (1 << bits) - 1
  }
  if (bits > 0) out += CROCKFORD[(acc << (5 - bits)) & 31]
  return out
}

/**
 * DD5: `${code_prefix}-${REF}-${S}`, S = first 7 Crockford base32 chars of HMAC-SHA256(secret, `${program}:${ref}`).
 * The ref keeps its case inside the HMAC; the whole code is uppercase.
 */
export function codeFor(program: VoucherProgram, ref: string, secret: string): string {
  const mac = crypto.createHmac("sha256", secret).update(`${program.name}:${ref}`).digest()
  return `${program.code_prefix}-${ref}-${crockfordBase32(mac).slice(0, SUFFIX_LENGTH)}`.toUpperCase()
}
