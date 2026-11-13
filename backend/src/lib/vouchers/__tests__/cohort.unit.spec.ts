import { cohortFor, sastMonth } from "../cohort"
import type { VoucherProgram } from "../config"

const rolling: VoucherProgram = {
  name: "test-prog",
  value_zar: 50,
  min_spend_zar: 250,
  validity_days: 45,
  code_prefix: "TST",
  monthly_cap: 5,
  enabled: true,
}
const fixed: VoucherProgram = { ...rolling, name: "fixed-prog", validity_days: undefined, ends_at: "2031-07-15T23:59:59+02:00" }

describe("sastMonth", () => {
  it("uses Africa/Johannesburg (UTC+2)", () => {
    expect(sastMonth(new Date("2026-11-30T21:59:59.999Z"))).toBe("2026-11")
    expect(sastMonth(new Date("2026-11-30T22:00:00Z"))).toBe("2026-12")
  })
})

describe("cohortFor (rolling validity_days)", () => {
  const vectors: [string, string, string][] = [
    ["2026-11-12T08:00:00Z", "2026-11", "2027-01-14T21:59:59.999Z"],
    ["2026-11-30T21:30:00Z", "2026-11", "2027-01-14T21:59:59.999Z"],
    ["2026-11-30T22:30:00Z", "2026-12", "2027-02-14T21:59:59.999Z"],
    ["2027-12-31T21:59:59.999Z", "2027-12", "2028-02-14T21:59:59.999Z"],
    ["2027-12-31T22:00:00Z", "2028-01", "2028-03-16T21:59:59.999Z"],
  ]
  it.each(vectors)("now %s → %s ending %s", (now, month, endsAt) => {
    const c = cohortFor(rolling, new Date(now))
    expect(c.campaign_identifier).toBe(`test-prog-${month}`)
    expect(c.ends_at.toISOString()).toBe(endsAt)
  })

  it("lives at least validity_days from the last millisecond of a month", () => {
    const now = new Date("2026-11-30T21:59:59.999Z")
    const c = cohortFor(rolling, now)
    expect(c.ends_at.getTime() - now.getTime()).toBeGreaterThanOrEqual(45 * 86_400_000)
  })
})

describe("cohortFor (fixed ends_at)", () => {
  it("uses the fixed end for any now before it", () => {
    for (const now of ["2026-11-12T08:00:00Z", "2031-07-15T21:00:00Z"]) {
      const c = cohortFor(fixed, new Date(now))
      expect(c.ends_at.toISOString()).toBe("2031-07-15T21:59:59.000Z")
    }
    expect(cohortFor(fixed, new Date("2026-11-30T22:30:00Z")).campaign_identifier).toBe("fixed-prog-2026-12")
  })
})
