import { SIGNATURE_WINDOW_S, authorized, signVoucherRequest, voucherRequestFailure, verifyVoucherRequest } from "../signature"

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

describe("voucherRequestFailure (reason codes, M2)", () => {
  const sig = () => signVoucherRequest(secret, ts, body)
  it.each([
    ["a valid request", () => ({ timestamp: ts, signature: sig() }), null],
    ["missing timestamp", () => ({ timestamp: undefined, signature: sig() }), "missing_headers"],
    ["missing signature", () => ({ timestamp: ts, signature: undefined }), "missing_headers"],
    ["a non-decimal timestamp", () => ({ timestamp: "19e8", signature: sig() }), "malformed"],
    ["a non-hex signature", () => ({ timestamp: ts, signature: "z".repeat(64) }), "malformed"],
    ["an uppercase signature", () => ({ timestamp: ts, signature: sig().toUpperCase() }), "malformed"],
    ["a stale timestamp", () => ({ timestamp: String(now - 301), signature: signVoucherRequest(secret, String(now - 301), body) }), "stale_timestamp"],
    ["a wrong key", () => ({ timestamp: ts, signature: signVoucherRequest("other", ts, body) }), "bad_signature"],
  ] as const)("%s -> %p", (_label, make, expected) => {
    expect(voucherRequestFailure({ secret, payload: body, nowS: now, ...make() })).toBe(expected)
  })
})

describe("authorized (shared by both voucher routes, L2)", () => {
  const logger = () => ({ warn: jest.fn() })
  const nowTs = () => String(Math.floor(Date.now() / 1000))
  const req = (headers: Record<string, string>) => ({ headers })

  it("returns true for a valid request and logs nothing", () => {
    const t = nowTs()
    const l = logger()
    expect(authorized(req({ "x-nk-timestamp": t, "x-nk-signature": signVoucherRequest(secret, t, body) }), secret, body, l)).toBe(true)
    expect(l.warn).not.toHaveBeenCalled()
  })

  it.each([
    ["stale_timestamp", () => {
      const t = String(Math.floor(Date.now() / 1000) - 400)
      return { "x-nk-timestamp": t, "x-nk-signature": signVoucherRequest(secret, t, body) }
    }],
    ["bad_signature", () => {
      const t = String(Math.floor(Date.now() / 1000))
      return { "x-nk-timestamp": t, "x-nk-signature": signVoucherRequest("other", t, body) }
    }],
    ["malformed", () => ({ "x-nk-timestamp": "abc", "x-nk-signature": "nothex" })],
    ["missing_headers", () => ({})],
  ])("logs the reason code %s and never the signature or the secret", (reason, headers) => {
    const h = headers() as Record<string, string>
    const l = logger()
    expect(authorized(req(h), secret, body, l)).toBe(false)
    expect(l.warn).toHaveBeenCalledWith(`vouchers.auth rejected: ${reason}`)
    const logged = JSON.stringify(l.warn.mock.calls)
    expect(logged).not.toContain(secret)
    if (h["x-nk-signature"]) expect(logged).not.toContain(h["x-nk-signature"])
  })
})
