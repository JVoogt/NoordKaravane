import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const issueVoucher = jest.fn()
const voucherReport = jest.fn()
jest.mock("../service", () => {
  const actual = jest.requireActual("../service")
  return { ...actual, issueVoucher: (...a: any[]) => issueVoucher(...a), voucherReport: (...a: any[]) => voucherReport(...a) }
})
const getVoucherProgram = jest.fn()
jest.mock("../config", () => ({ ...jest.requireActual("../config"), getVoucherProgram: (n: string) => getVoucherProgram(n) }))

import { POST } from "../../../api/hooks/vouchers/route"
import { GET } from "../../../api/hooks/vouchers/report/route"
import { CampaignEndedError, CapReachedError, ExpiryUnknownError, ProgramEndedError, VoucherRevokedError } from "../service"
import { signVoucherRequest } from "../signature"
import type { VoucherProgram } from "../config"

const SECRET = "route-secret"
const program: VoucherProgram = { name: "test-prog", value_zar: 50, min_spend_zar: 250, validity_days: 45, code_prefix: "TST", monthly_cap: 3, enabled: true }
const voucher = { code: "TST-ABC-XXXXXXX", expires_at: "2027-01-14T21:59:59.999Z", value: 50, min_spend: 250, currency: "zar", used: false }

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined as any }
  res.status = jest.fn((c: number) => {
    res.statusCode = c
    return res
  })
  res.json = jest.fn((b: any) => {
    res.body = b
    return res
  })
  res.sendStatus = jest.fn((c: number) => {
    res.statusCode = c
    return res
  })
  return res
}

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
const scope = { resolve: (k: string) => (k === ContainerRegistrationKeys.LOGGER ? logger : {}) }

function postReq(body: string | undefined, opts: { ts?: string; sig?: string; signWith?: string; noHeaders?: boolean } = {}) {
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000))
  const sig = opts.sig ?? signVoucherRequest(opts.signWith ?? SECRET, ts, body ?? "")
  return {
    scope,
    headers: opts.noHeaders ? {} : { "x-nk-timestamp": ts, "x-nk-signature": sig },
    rawBody: body === undefined ? undefined : Buffer.from(body, "utf8"),
    body: {},
  } as any
}
const good = JSON.stringify({ program: "test-prog", ref: "abc", email: "jan@example.com" })

beforeEach(() => {
  process.env.VOUCHER_HOOK_SECRET = SECRET
  issueVoucher.mockReset()
  voucherReport.mockReset()
  getVoucherProgram.mockReset()
  getVoucherProgram.mockImplementation((n: string) => (n === "test-prog" ? program : null))
  for (const f of [logger.info, logger.warn, logger.error]) f.mockReset()
})
afterAll(() => {
  delete process.env.VOUCHER_HOOK_SECRET
})

describe("POST /hooks/vouchers", () => {
  it.each([[undefined], [""]])("404 when VOUCHER_HOOK_SECRET is %p", async (v) => {
    if (v === undefined) delete process.env.VOUCHER_HOOK_SECRET
    else process.env.VOUCHER_HOOK_SECRET = v
    const res = fakeRes()
    await POST(postReq(good), res)
    expect(res.statusCode).toBe(404)
    expect(issueVoucher).not.toHaveBeenCalled()
  })

  it("401 for a bad signature", async () => {
    const res = fakeRes()
    await POST(postReq(good, { signWith: "wrong" }), res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: "unauthorized" })
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/^vouchers\.auth rejected: /))
    expect(issueVoucher).not.toHaveBeenCalled()
  })

  it("401 for a stale signature", async () => {
    const res = fakeRes()
    await POST(postReq(good, { ts: String(Math.floor(Date.now() / 1000) - 301) }), res)
    expect(res.statusCode).toBe(401)
    expect(issueVoucher).not.toHaveBeenCalled()
  })

  it("401 for missing headers", async () => {
    const res = fakeRes()
    await POST(postReq(good, { noHeaders: true }), res)
    expect(res.statusCode).toBe(401)
    expect(issueVoucher).not.toHaveBeenCalled()
  })

  it("415 unsupported_content_type when the raw body is missing (a content type the parser did not keep)", async () => {
    const res = fakeRes()
    await POST(postReq(undefined), res)
    expect(res.statusCode).toBe(415)
    expect(res.body).toEqual({ error: "unsupported_content_type" })
    expect(logger.warn).toHaveBeenCalledWith("vouchers.issue rejected: unsupported_content_type")
    expect(issueVoucher).not.toHaveBeenCalled()
  })

  it("logs the auth reason code: stale_timestamp vs bad_signature", async () => {
    await POST(postReq(good, { ts: String(Math.floor(Date.now() / 1000) - 301) }), fakeRes())
    expect(logger.warn).toHaveBeenCalledWith("vouchers.auth rejected: stale_timestamp")
    await POST(postReq(good, { signWith: "wrong" }), fakeRes())
    expect(logger.warn).toHaveBeenCalledWith("vouchers.auth rejected: bad_signature")
  })

  it("logs vouchers.issue invalid_body with the schema-valid program and ref only, never the email", async () => {
    let res = fakeRes()
    await POST(postReq(JSON.stringify({ program: "test-prog", ref: "abc", email: "not-an-email" })), res)
    expect(res.body).toEqual({ error: "invalid_body" })
    expect(logger.info).toHaveBeenCalledWith("vouchers.issue " + JSON.stringify({ program: "test-prog", ref: "abc", result: "invalid_body" }))

    logger.info.mockReset()
    res = fakeRes()
    await POST(postReq(JSON.stringify({ program: "Bad Prog", ref: "jan@example.com", email: "jan@example.com" })), res)
    expect(res.body).toEqual({ error: "invalid_body" })
    expect(logger.info).toHaveBeenCalledWith("vouchers.issue " + JSON.stringify({ program: null, ref: null, result: "invalid_body" }))

    logger.info.mockReset()
    res = fakeRes()
    await POST(postReq("not json{"), res)
    expect(logger.info).toHaveBeenCalledWith("vouchers.issue " + JSON.stringify({ program: null, ref: null, result: "invalid_body" }))
    const all = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls])
    expect(all).not.toContain("@")
  })

  it("logs vouchers.issue unknown_program", async () => {
    const res = fakeRes()
    await POST(postReq(JSON.stringify({ program: "nope", ref: "abc", email: "jan@example.com" })), res)
    expect(res.body).toEqual({ error: "unknown_program" })
    expect(logger.info).toHaveBeenCalledWith("vouchers.issue " + JSON.stringify({ program: "nope", ref: "abc", result: "unknown_program" }))
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("@")
  })

  it.each([
    ["a raw body that is not JSON", "not json{"],
    ["an extra key", JSON.stringify({ program: "test-prog", ref: "abc", email: "jan@example.com", value: 500 })],
    ["a bad email", JSON.stringify({ program: "test-prog", ref: "abc", email: "not-an-email" })],
    ["a ref with an underscore", JSON.stringify({ program: "test-prog", ref: "a_b", email: "jan@example.com" })],
    ["a ref with a space", JSON.stringify({ program: "test-prog", ref: "a b", email: "jan@example.com" })],
    ["a ref over 40 chars", JSON.stringify({ program: "test-prog", ref: "x".repeat(41), email: "jan@example.com" })],
    ["a missing key", JSON.stringify({ program: "test-prog", ref: "abc" })],
    ["a JSON array", "[]"],
  ])("400 invalid_body for %s", async (_label, body) => {
    const res = fakeRes()
    await POST(postReq(body), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "invalid_body" })
    expect(issueVoucher).not.toHaveBeenCalled()
  })

  it("400 unknown_program for an unknown or disabled program", async () => {
    const res = fakeRes()
    await POST(postReq(JSON.stringify({ program: "nope", ref: "abc", email: "jan@example.com" })), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "unknown_program" })
    expect(issueVoucher).not.toHaveBeenCalled()
  })

  it.each([
    [new ProgramEndedError("x"), 400, "program_ended", "ended"],
    [new VoucherRevokedError("x"), 409, "revoked", "revoked"],
    [new CapReachedError("x"), 429, "cap_reached", "cap"],
    [new ExpiryUnknownError("x"), 500, "expiry_unknown", "expiry_unknown"],
    [new Error("db down"), 500, "internal", "error"],
  ])("maps %p to %p %p", async (err, status, key, result) => {
    issueVoucher.mockRejectedValue(err)
    const res = fakeRes()
    await POST(postReq(good), res)
    expect(res.statusCode).toBe(status)
    expect(res.body).toEqual({ error: key })
    expect(logger.info).toHaveBeenCalledWith("vouchers.issue " + JSON.stringify({ program: "test-prog", ref: "abc", result }))
  })

  it("400 campaign_ended, logged at warn with the campaign identifier, when this month's cohort campaign ended while the program is live", async () => {
    issueVoucher.mockRejectedValue(new CampaignEndedError("test-prog-2031-04"))
    const res = fakeRes()
    await POST(postReq(good), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "campaign_ended" })
    expect(logger.warn).toHaveBeenCalledWith(
      "vouchers.issue " + JSON.stringify({ program: "test-prog", ref: "abc", result: "campaign_ended", campaign: "test-prog-2031-04" })
    )
  })

  it("logs a 500 with program and ref and never the email", async () => {
    issueVoucher.mockRejectedValue(new Error("db down"))
    const res = fakeRes()
    await POST(postReq(good), res)
    const all = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls])
    expect(all).toContain("test-prog")
    expect(all).toContain("abc")
    expect(all).not.toContain("@")
  })

  it("201 for created and 200 for existing, with the voucher body", async () => {
    issueVoucher.mockResolvedValueOnce({ status: "created", voucher })
    let res = fakeRes()
    await POST(postReq(good), res)
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual(voucher)
    expect(issueVoucher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ program, ref: "abc", email: "jan@example.com", secret: SECRET }))
    expect(logger.info).toHaveBeenCalledWith("vouchers.issue " + JSON.stringify({ program: "test-prog", ref: "abc", result: "created" }))

    issueVoucher.mockResolvedValueOnce({ status: "existing", voucher })
    res = fakeRes()
    await POST(postReq(good), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(voucher)
    expect(logger.info).toHaveBeenCalledWith("vouchers.issue " + JSON.stringify({ program: "test-prog", ref: "abc", result: "existing" }))
  })
})

describe("GET /hooks/vouchers/report", () => {
  const url = "/hooks/vouchers/report?program=test-prog&month=2026-11"
  function getReq(originalUrl: string, query: Record<string, unknown>, opts: { signUrl?: string; signWith?: string } = {}) {
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = signVoucherRequest(opts.signWith ?? SECRET, ts, opts.signUrl ?? originalUrl)
    return { scope, headers: { "x-nk-timestamp": ts, "x-nk-signature": sig }, originalUrl, query } as any
  }

  it("404 when the secret is unset", async () => {
    delete process.env.VOUCHER_HOOK_SECRET
    const res = fakeRes()
    await GET(getReq(url, { program: "test-prog", month: "2026-11" }), res)
    expect(res.statusCode).toBe(404)
    expect(voucherReport).not.toHaveBeenCalled()
  })

  it("200 with the report, signed over originalUrl", async () => {
    voucherReport.mockResolvedValue({ issued: 2, redeemed: 1, discount_value_zar: 50, unreadable_orders: 1 })
    const res = fakeRes()
    await GET(getReq(url, { program: "test-prog", month: "2026-11" }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ issued: 2, redeemed: 1, discount_value_zar: 50, unreadable_orders: 1 })
    expect(voucherReport).toHaveBeenCalledWith(expect.anything(), { program: "test-prog", month: "2026-11" })
  })

  it("does not require the program to be in config", async () => {
    voucherReport.mockResolvedValue({ issued: 0, redeemed: 0, discount_value_zar: 0, unreadable_orders: 0 })
    const u = "/hooks/vouchers/report?program=import-woo&month=2031-07"
    const res = fakeRes()
    await GET(getReq(u, { program: "import-woo", month: "2031-07" }), res)
    expect(res.statusCode).toBe(200)
  })

  it("401 when the query changed after signing", async () => {
    const res = fakeRes()
    await GET(getReq("/hooks/vouchers/report?program=test-prog&month=2026-12", { program: "test-prog", month: "2026-12" }, { signUrl: url }), res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: "unauthorized" })
    expect(voucherReport).not.toHaveBeenCalled()
  })

  it.each([
    [{ program: "test-prog", month: "2026-13" }],
    [{ program: "Test_Prog", month: "2026-11" }],
    [{ program: "test-prog" }],
    [{ program: "test-prog", month: "2026-11", extra: "1" }],
  ])("400 invalid_query for %p", async (q) => {
    const u = "/hooks/vouchers/report?" + new URLSearchParams(q as any).toString()
    const res = fakeRes()
    await GET(getReq(u, q), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "invalid_query" })
    expect(voucherReport).not.toHaveBeenCalled()
  })

  it("500 internal when the report fails", async () => {
    voucherReport.mockRejectedValue(new Error("db down"))
    const res = fakeRes()
    await GET(getReq(url, { program: "test-prog", month: "2026-11" }), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: "internal" })
  })
})
