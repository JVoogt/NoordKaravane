import { codeFor, crockfordBase32 } from "../code"
import type { VoucherProgram } from "../config"

const program: VoucherProgram = {
  name: "test-prog",
  value_zar: 50,
  min_spend_zar: 250,
  validity_days: 45,
  code_prefix: "TST",
  monthly_cap: 5,
  enabled: true,
}
const secret = "test-secret"

describe("crockfordBase32", () => {
  it("encodes MSB-first in 5-bit groups with the Crockford alphabet", () => {
    // Vectors computed independently in python (bit-by-bit over int.from_bytes).
    expect(crockfordBase32(Buffer.from([0xff]))).toBe("ZW")
    expect(crockfordBase32(Buffer.alloc(5))).toBe("00000000")
    expect(crockfordBase32(Buffer.from([1, 2, 3]))).toBe("04106")
  })
})

describe("codeFor", () => {
  it("is PREFIX-REF-SUFFIX with a known suffix", () => {
    expect(codeFor(program, "abc", secret)).toBe("TST-ABC-NJ52W0D")
  })

  it("is deterministic", () => {
    expect(codeFor(program, "abc", secret)).toBe(codeFor(program, "abc", secret))
  })

  it("starts with the program prefix and has a 7-char suffix", () => {
    const code = codeFor(program, "ref-1", secret)
    expect(code.startsWith("TST-REF-1-")).toBe(true)
    expect(code.split("-").pop()).toHaveLength(7)
  })

  it("matches the charset ^[A-Z0-9-]+$", () => {
    for (const ref of ["abc", "A-b-9", "x".repeat(40), "0"]) expect(codeFor(program, ref, secret)).toMatch(/^[A-Z0-9-]+$/)
  })

  it("gives a different code for a different program", () => {
    const other = { ...program, name: "other-prog" }
    expect(codeFor(other, "abc", secret)).toBe("TST-ABC-6TB1ZKX")
  })

  it("keeps the ref case inside the HMAC (abc vs ABC differ in the suffix)", () => {
    expect(codeFor(program, "ABC", secret)).toBe("TST-ABC-G2SSQ92")
    expect(codeFor(program, "ABC", secret)).not.toBe(codeFor(program, "abc", secret))
  })

  it("gives a different suffix for a different secret", () => {
    expect(codeFor(program, "abc", "another")).not.toBe(codeFor(program, "abc", secret))
  })
})
