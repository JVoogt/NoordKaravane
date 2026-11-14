import { hostKitPromotion, planHostKitImport } from "../import-host-kit-codes"

const row = (over: Record<string, unknown> = {}) => ({ code: "KAMPI-QR-7F3KQ", max_kits: 2, host_id: "host-1", listing_ids: "1418 1502", ...over })

describe("planHostKitImport", () => {
  it("accepts a valid row and normalises the code and listing numbers", () => {
    const plan = planHostKitImport([row({ code: " kampi-qr-7f3kq ", listing_ids: "1418, 1502" })], new Set())
    expect(plan.rejected).toEqual([])
    expect(plan.create).toEqual([{ code: "KAMPI-QR-7F3KQ", max_kits: 2, host_id: "host-1", listing_ids: "1418 1502" }])
  })

  it("skips a code that already exists instead of creating it again", () => {
    const plan = planHostKitImport([row()], new Set(["KAMPI-QR-7F3KQ"]))
    expect(plan.create).toEqual([])
    expect(plan.skipped_existing).toEqual(["KAMPI-QR-7F3KQ"])
  })

  it.each([
    ["a file that is not an array", { code: "KAMPI-QR-7F3KQ" }],
    ["a code in another format", [row({ code: "FREE-KIT" })]],
    ["the same code twice", [row(), row()]],
    ["zero kits", [row({ max_kits: 0, listing_ids: "" })]],
    ["a fractional kit count", [row({ max_kits: 1.5 })]],
    ["more kits than the cap", [row({ max_kits: 21 })]],
    ["a missing host", [row({ host_id: "" })]],
    ["a listing number that is not a number", [row({ listing_ids: "1418 abc" })]],
    ["fewer listing numbers than kits", [row({ max_kits: 3 })]],
  ])("rejects %s", (_name, rows) => {
    // any rejection aborts the whole run in the script, so only the rejection matters here
    const plan = planHostKitImport(rows, new Set())
    expect(plan.rejected.length).toBeGreaterThan(0)
  })

  it("reports every bad row, so one run shows all the problems", () => {
    const plan = planHostKitImport([row({ code: "X" }), row(), row({ code: "KAMPI-QR-AAAAA", host_id: "" })], new Set())
    expect(plan.rejected.map((r) => r.index)).toEqual([0, 2])
  })
})

describe("hostKitPromotion", () => {
  const promo = hostKitPromotion({ code: "KAMPI-QR-7F3KQ", max_kits: 3, host_id: "host-1", listing_ids: "1 2 3" }, "prod_kit", "camp_1", 550)

  it("is worth max_kits kits in total, however the kits are split across cart lines", () => {
    // not `each` + max_quantity: Medusa applies that per line, so three colours would give three free kits each
    expect(promo.application_method).toMatchObject({ type: "fixed", value: 1650, allocation: "across", currency_code: "zar" })
    expect(promo.application_method).not.toHaveProperty("max_quantity")
  })

  it("targets items of the kit product only, never delivery or the whole order", () => {
    expect(promo.application_method.target_type).toBe("items")
    expect(promo.application_method.target_rules).toEqual([{ attribute: "items.product.id", operator: "in", values: ["prod_kit"] }])
  })

  it("is a single-use manual code inside the campaign", () => {
    expect(promo).toMatchObject({ limit: 1, is_automatic: false, status: "active", campaign_id: "camp_1" })
  })

  it("keeps the host and listings but no email", () => {
    expect(promo.metadata).toEqual({ program: "kampi-host-qr", source: "import", host_id: "host-1", listing_ids: "1 2 3", max_kits: 3, kit_price_zar: 550 })
  })
})
