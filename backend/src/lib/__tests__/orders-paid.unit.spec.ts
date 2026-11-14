import { hasCapturedPayment } from "../orders"

describe("hasCapturedPayment", () => {
  const eft = (captured_at: string | null) => ({
    payment_collections: [{ payments: [{ provider_id: "pp_eft_eft", captured_at }] }],
  })

  it("is true for a captured EFT payment even when payment_status is missing", () => {
    // The shape query.graph returned for NK3 on 2026-11-12: no payment_status, captured_at set.
    expect(hasCapturedPayment(eft("2026-11-11T15:13:17.728Z"))).toBe(true)
  })

  it("is false while the EFT payment is not captured", () => {
    expect(hasCapturedPayment(eft(null))).toBe(false)
  })

  it("is false for an order with no payment rows", () => {
    expect(hasCapturedPayment({})).toBe(false)
    expect(hasCapturedPayment({ payment_collections: [{ payments: [] }] })).toBe(false)
    expect(hasCapturedPayment(undefined)).toBe(false)
  })

  it("is true when any one of several payments is captured", () => {
    expect(
      hasCapturedPayment({
        payment_collections: [
          { payments: [{ captured_at: null }] },
          { payments: [{ captured_at: "2026-11-11T15:13:17.728Z" }] },
        ],
      })
    ).toBe(true)
  })
})
