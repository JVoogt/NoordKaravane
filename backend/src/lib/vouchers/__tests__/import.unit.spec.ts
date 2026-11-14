import { ImportRejectedError, campaignEndsAtUpdate, planImport } from "../import"

const now = new Date("2031-07-01T00:00:00Z")
const none = new Set<string>()

/** A live Woo row as the preparer copies it from the export (made-up terms). */
const row = (over: Record<string, unknown> = {}) => ({
  code: "testwoo1",
  program: "import-woo",
  discount_type: "fixed_cart",
  value_zar: "50.00",
  min_spend_zar: "250.00",
  usage_limit: 1,
  usage_limit_per_user: null,
  usage_count: 0,
  ends_at: "2031-07-15T21:30:00Z",
  product_ids: [],
  excluded_product_ids: [],
  product_categories: [],
  excluded_product_categories: [],
  email_restrictions: [],
  free_shipping: false,
  exclude_sale_items: false,
  maximum_amount: "0.00",
  limit_usage_to_x_items: null,
  ...over,
})

function rejections(fn: () => unknown): { index: number; code: string | null; reason: string }[] {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ImportRejectedError)
    return (e as ImportRejectedError).rejections
  }
  throw new Error("expected ImportRejectedError")
}

describe("planImport", () => {
  it("uppercases codes and normalises the Woo money strings", () => {
    const plan = planImport([row()], none, now)
    expect(plan.campaigns).toHaveLength(1)
    const r = plan.campaigns[0].rows[0]
    expect(r.code).toBe("TESTWOO1")
    expect(r.value_zar).toBe(50)
    expect(r.min_spend_zar).toBe(250)
    expect(r.maximum_amount).toBeNull()
  })

  it("normalises JSON integers to the same row as the decimal strings", () => {
    const a = planImport([row()], none, now).campaigns[0].rows[0]
    const b = planImport([row({ value_zar: 50, min_spend_zar: 250, maximum_amount: 0 })], none, now).campaigns[0].rows[0]
    expect(b).toEqual(a)
  })

  it("accepts the minimal key set (no optional restriction keys)", () => {
    const minimal = { code: "t2", program: "import-woo", discount_type: "fixed_cart", value_zar: 50, min_spend_zar: 250, usage_limit: 1, usage_count: 0, ends_at: "2031-07-15T21:30:00Z" }
    expect(planImport([minimal], none, now).campaigns[0].rows[0].code).toBe("T2")
  })

  it("rejects two live rows with the same code after uppercasing", () => {
    const r = rejections(() => planImport([row({ code: "dup1" }), row({ code: "DUP1" })], none, now))
    expect(r).toEqual([{ index: 1, code: "DUP1", reason: expect.stringMatching(/duplicate/) }])
  })

  it("rejects an invalid row naming its index", () => {
    const r = rejections(() => planImport([row(), row({ code: "bad code!" })], none, now))
    expect(r.map((x) => x.index)).toEqual([1])
  })

  it("rejects a file that is not an array", () => {
    expect(rejections(() => planImport({ code: "x" }, none, now))).toHaveLength(1)
  })

  it.each([
    ["discount_type percent", { discount_type: "percent" }],
    ["discount_type fixed_product", { discount_type: "fixed_product" }],
    ["usage_limit null", { usage_limit: null }],
    ["usage_limit 0", { usage_limit: 0 }],
    ["usage_limit 2", { usage_limit: 2 }],
    ["usage_limit_per_user 2", { usage_limit_per_user: 2 }],
    ["usage_count 1", { usage_count: 1 }],
    ["min_spend_zar 0", { min_spend_zar: 0 }],
    ["min_spend_zar missing", { min_spend_zar: undefined }],
    ["non-empty product_ids", { product_ids: [12] }],
    ["non-empty excluded_product_ids", { excluded_product_ids: [12] }],
    ["non-empty product_categories", { product_categories: [3] }],
    ["non-empty excluded_product_categories", { excluded_product_categories: [3] }],
    ["non-empty email_restrictions", { email_restrictions: ["x@example.com"] }],
    ["free_shipping true", { free_shipping: true }],
    ["exclude_sale_items true", { exclude_sale_items: true }],
    ["limit_usage_to_x_items 2", { limit_usage_to_x_items: 2 }],
    ["an unknown key", { individual_use: true }],
    ["value_zar 50.50", { value_zar: "50.50" }],
    ["value_zar 1.5 number", { value_zar: 1.5 }],
    ["value_zar -5", { value_zar: -5 }],
    ["value_zar abc", { value_zar: "abc" }],
    ["value_zar 0", { value_zar: "0.00" }],
    ["min_spend_zar 250.5", { min_spend_zar: "250.5" }],
    ["maximum_amount 100.00", { maximum_amount: "100.00" }],
    ["a bad program", { program: "Import_Woo" }],
  ])("rejects a live row with %s and never coerces it", (_label, over) => {
    const r = rejections(() => planImport([row(over)], none, now))
    expect(r).toHaveLength(1)
    expect(r[0].index).toBe(0)
    expect(r[0].code).toBe("TESTWOO1")
    expect(r[0].reason.length).toBeGreaterThan(0)
  })

  it("lists both bad rows of a file with one good row, and returns no plan", () => {
    const r = rejections(() => planImport([row({ code: "a1", discount_type: "percent" }), row({ code: "ok1" }), row({ code: "b1", usage_limit: 2 })], none, now))
    expect(r.map((x) => [x.index, x.code])).toEqual([
      [0, "A1"],
      [2, "B1"],
    ])
    expect(r[0].reason).toMatch(/discount_type/)
    expect(r[1].reason).toMatch(/usage_limit/)
  })

  it("skips expired rows", () => {
    const plan = planImport([row({ code: "old1", ends_at: "2031-06-30T23:59:59Z" }), row({ code: "edge1", ends_at: "2031-07-01T00:00:00Z" }), row()], none, now)
    expect(plan.skipped_expired).toEqual(["OLD1", "EDGE1"])
    expect(plan.campaigns.flatMap((c) => c.rows.map((r) => r.code))).toEqual(["TESTWOO1"])
  })

  it("skips an expired percent row with usage_count 0 instead of rejecting it", () => {
    const plan = planImport([row({ code: "oldpct", discount_type: "percent", ends_at: "2031-06-01T00:00:00Z" }), row()], none, now)
    expect(plan.skipped_expired).toEqual(["OLDPCT"])
  })

  it("rejects a live used row", () => {
    expect(rejections(() => planImport([row({ usage_count: 1 })], none, now))[0].reason).toMatch(/used/)
  })

  it("rejects an expired used row (the used check runs before the expiry skip)", () => {
    const r = rejections(() => planImport([row({ usage_count: 1, ends_at: "2031-06-01T00:00:00Z" })], none, now))
    expect(r[0].reason).toMatch(/used/)
  })

  it.each([
    ["missing usage_count", { usage_count: undefined }],
    ["non-integer usage_count", { usage_count: "0" }],
  ])("rejects a row with %s", (_l, over) => {
    expect(rejections(() => planImport([row(over)], none, now))).toHaveLength(1)
  })

  it.each([
    ["null", null],
    ["not a date", "not a date"],
    ["no offset", "2031-07-15T21:30:00"],
  ])("rejects ends_at %s", (_l, ends_at) => {
    expect(rejections(() => planImport([row({ ends_at })], none, now))).toHaveLength(1)
  })

  it("rejects a row without a code", () => {
    const r = rejections(() => planImport([row({ code: "" })], none, now))
    expect(r[0]).toEqual({ index: 0, code: null, reason: expect.any(String) })
  })

  it("lists exactly the two used rows of a mixed file, with no plan", () => {
    const r = rejections(() =>
      planImport(
        [
          row({ code: "exppct", discount_type: "percent", ends_at: "2031-06-01T00:00:00Z" }),
          row({ code: "expused", usage_count: 1, ends_at: "2031-06-01T00:00:00Z" }),
          row({ code: "liveused", usage_count: 1 }),
          row({ code: "good1" }),
        ],
        none,
        now
      )
    )
    expect(r.map((x) => [x.index, x.code])).toEqual([
      [1, "EXPUSED"],
      [2, "LIVEUSED"],
    ])
  })

  it("groups by the SAST date of ends_at", () => {
    const plan = planImport([row({ code: "d15", ends_at: "2031-07-15T21:30:00Z" }), row({ code: "d16", ends_at: "2031-07-15T22:30:00Z" })], none, now)
    expect(plan.campaigns.map((c) => c.campaign_identifier)).toEqual(["import-woo-2031-07-15", "import-woo-2031-07-16"])
  })

  it.each([
    [["2031-07-15T08:00:00Z", "2031-07-15T21:30:00Z"]],
    [["2031-07-15T21:30:00Z", "2031-07-15T08:00:00Z"]],
  ])("ends a date group at its latest row (order %p)", (ends) => {
    const plan = planImport(
      ends.map((e, i) => row({ code: `g${i}`, ends_at: e })),
      none,
      now
    )
    expect(plan.campaigns).toHaveLength(1)
    expect(plan.campaigns[0].campaign_identifier).toBe("import-woo-2031-07-15")
    expect(plan.campaigns[0].rows).toHaveLength(2)
    expect(plan.campaigns[0].ends_at.toISOString()).toBe("2031-07-15T21:30:00.000Z")
  })

  it("skips codes that already exist (uppercased)", () => {
    const plan = planImport([row({ code: "testwoo1" }), row({ code: "new1" })], new Set(["TESTWOO1"]), now)
    expect(plan.skipped_existing).toEqual(["TESTWOO1"])
    expect(plan.campaigns.flatMap((c) => c.rows.map((r) => r.code))).toEqual(["NEW1"])
  })

  it("drops a campaign whose rows all exist", () => {
    const plan = planImport([row()], new Set(["TESTWOO1"]), now)
    expect(plan.campaigns).toEqual([])
  })
})

describe("campaignEndsAtUpdate", () => {
  it("extends to a later planned end", () => {
    expect(campaignEndsAtUpdate(new Date("2031-07-15T08:00:00Z"), new Date("2031-07-15T21:30:00Z"))?.toISOString()).toBe("2031-07-15T21:30:00.000Z")
  })
  it("never shortens", () => {
    expect(campaignEndsAtUpdate(new Date("2031-07-15T21:30:00Z"), new Date("2031-07-15T08:00:00Z"))).toBeNull()
  })
  it("returns null when equal", () => {
    expect(campaignEndsAtUpdate(new Date("2031-07-15T21:30:00Z"), new Date("2031-07-15T21:30:00Z"))).toBeNull()
  })
})
