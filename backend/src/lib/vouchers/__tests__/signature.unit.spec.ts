import { SIGNATURE_WINDOW_S, signVoucherRequest, verifyVoucherRequest } from "../signature"

const secret = "test-secret"
const ts = "1900000000"
const body = '{"program":"test-prog","ref":"abc","email":"a@example.com"}'
const now = Number(ts)

describe("voucher request signature", () => {
  it("signs as lowercase hex HMAC-SHA256 of `${timestamp}.${payload}`", () => {
    // Known-good vector, computed once with: printf '1900000000.hello' | openssl dgst -sha256 -hmac test-secret
    expect(signVoucherRequest(secret, ts, "hello")).toBe("b58cccc6fb0c30498b087faafbb6e005d50f6fca774b82f675a380a35b194856")
  })

  it("accepts a valid signature", () => {
    const sig = signVoucherRequest(secret, ts, body)
    expect(verifyVoucherRequest({ secret, timestamp: ts, signature: sig, payload: body, nowS: now })).toBe(true)
  })

  it("rejects a tampered body", () => {
    const sig = signVoucherRequest(secret, ts, body)
    expect(verifyVoucherRequest({ secret, timestamp: ts, signature: sig, payload: body.replace("abc", "abd"), nowS: now })).toBe(false)
  })

  it("rejects a tampered timestamp", () => {
    const sig = signVoucherRequest(secret, ts, body)
    expect(verifyVoucherRequest({ secret, timestamp: String(now + 1), signature: sig, payload: body, nowS: now })).toBe(false)
  })

  it("rejects a stale timestamp (now - 301) and a future one (now + 301)", () => {
    for (const t of [now - 301, now + 301]) {
      const sig = signVoucherRequest(secret, String(t), body)
      expect(verifyVoucherRequest({ secret, timestamp: String(t), signature: sig, payload: body, nowS: now })).toBe(false)
    }
  })

  it("accepts the boundary, exactly the window either side", () => {
    expect(SIGNATURE_WINDOW_S).toBe(300)
    for (const t of [now - 300, now + 300]) {
      const sig = signVoucherRequest(secret, String(t), body)
      expect(verifyVoucherRequest({ secret, timestamp: String(t), signature: sig, payload: body, nowS: now })).toBe(true)
    }
  })

  it("rejects a wrong-length hex signature without throwing", () => {
    const sig = signVoucherRequest(secret, ts, body)
    expect(verifyVoucherRequest({ secret, timestamp: ts, signature: sig.slice(0, 62), payload: body, nowS: now })).toBe(false)
    expect(verifyVoucherRequest({ secret, timestamp: ts, signature: sig + "00", payload: body, nowS: now })).toBe(false)
  })

  it("rejects a non-hex signature of the right length", () => {
    const bad = "z".repeat(64)
    expect(verifyVoucherRequest({ secret, timestamp: ts, signature: bad, payload: body, nowS: now })).toBe(false)
  })

  it("rejects an uppercase hex signature (lowercase only)", () => {
    const sig = signVoucherRequest(secret, ts, body).toUpperCase()
    expect(verifyVoucherRequest({ secret, timestamp: ts, signature: sig, payload: body, nowS: now })).toBe(false)
  })

  it("rejects missing headers and a non-decimal timestamp", () => {
    const sig = signVoucherRequest(secret, ts, body)
    expect(verifyVoucherRequest({ secret, timestamp: undefined, signature: sig, payload: body, nowS: now })).toBe(false)
    expect(verifyVoucherRequest({ secret, timestamp: ts, signature: undefined, payload: body, nowS: now })).toBe(false)
    expect(verifyVoucherRequest({ secret, timestamp: "", signature: "", payload: body, nowS: now })).toBe(false)
    const sigX = signVoucherRequest(secret, "19e8", body)
    expect(verifyVoucherRequest({ secret, timestamp: "19e8", signature: sigX, payload: body, nowS: now })).toBe(false)
  })

  it("rejects with an empty secret", () => {
    const sig = signVoucherRequest("", ts, body)
    expect(verifyVoucherRequest({ secret: "", timestamp: ts, signature: sig, payload: body, nowS: now })).toBe(false)
  })
})
