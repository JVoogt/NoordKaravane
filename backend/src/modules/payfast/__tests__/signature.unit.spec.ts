import crypto from "crypto"
import { buildParamString, generateSignature, verifySignature, pfEncode, isPayfastIp, amountsMatch } from "../signature"

describe("payfast signature", () => {
  it("encodes like PayFast (spaces as +, uppercase hex)", () => {
    expect(pfEncode("Noord Karavane tee")).toBe("Noord+Karavane+tee")
    expect(pfEncode("a@b.co.za")).toBe("a%40b.co.za")
  })

  it("builds the param string in given order, skipping blanks and signature", () => {
    const s = buildParamString({ merchant_id: "10000100", empty: "", amount: "449.00", signature: "x" })
    expect(s).toBe("merchant_id=10000100&amount=449.00")
  })

  it("appends passphrase", () => {
    expect(buildParamString({ a: "1" }, "my pass")).toBe("a=1&passphrase=my+pass")
  })

  it("md5 matches the manual hash of the param string", () => {
    const data = { merchant_id: "10000100", merchant_key: "46f0cd694581a", amount: "449.00", item_name: "Order SR1042" }
    const expected = crypto
      .createHash("md5")
      .update("merchant_id=10000100&merchant_key=46f0cd694581a&amount=449.00&item_name=Order+SR1042&passphrase=secret")
      .digest("hex")
    expect(generateSignature(data, "secret")).toBe(expected)
  })

  it("verifies good and rejects tampered signatures", () => {
    const data: Record<string, string> = { m_payment_id: "ps_1", amount_gross: "449.00", payment_status: "COMPLETE" }
    data.signature = generateSignature(data, "pp")
    expect(verifySignature(data, "pp")).toBe(true)
    expect(verifySignature({ ...data, amount_gross: "1.00" }, "pp")).toBe(false)
    expect(verifySignature({ ...data, signature: "" }, "pp")).toBe(false)
  })

  it("checks source IPs", () => {
    expect(isPayfastIp("197.97.145.150")).toBe(true)
    expect(isPayfastIp("::ffff:41.74.179.200")).toBe(true)
    expect(isPayfastIp("144.126.193.139")).toBe(true)
    expect(isPayfastIp("8.8.8.8")).toBe(false)
    expect(isPayfastIp(undefined)).toBe(false)
  })

  it("compares amounts", () => {
    expect(amountsMatch(449, "449.00")).toBe(true)
    expect(amountsMatch(449, "448.00")).toBe(false)
  })
})
