import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const createCampaignsRun = jest.fn()
const createPromotionsRun = jest.fn()
jest.mock("@medusajs/medusa/core-flows", () => ({
  createCampaignsWorkflow: jest.fn(() => ({ run: (...a: any[]) => createCampaignsRun(...a) })),
  createPromotionsWorkflow: jest.fn(() => ({ run: (...a: any[]) => createPromotionsRun(...a) })),
}))

import {
  CapReachedError,
  ExpiryUnknownError,
  MIN_SPEND_ATTRIBUTE,
  ProgramEndedError,
  VoucherRevokedError,
  findOrCreateCampaign,
  issueVoucher,
  voucherReport,
} from "../service"
import { codeFor } from "../code"
import type { VoucherProgram } from "../config"

const program: VoucherProgram = {
  name: "test-prog",
  value_zar: 50,
  min_spend_zar: 250,
  validity_days: 45,
  code_prefix: "TST",
  monthly_cap: 3,
  enabled: true,
}
const secret = "test-secret"
const now = new Date("2026-11-12T08:00:00Z")
const CODE = codeFor(program, "abc", secret)
const COHORT_END = new Date("2027-01-14T21:59:59.999Z")

type Promo = {
  id: string
  code: string
  status?: string
  used?: number
  limit?: number
  deleted_at?: Date | null
  campaign_id?: string
  campaign?: { id: string; ends_at: Date | null } | null
  metadata?: Record<string, unknown> | null
  application_method?: { value: number } | null
}
type Camp = { id: string; campaign_identifier: string; ends_at: Date | null }

function fake(init: { promotions?: Promo[]; campaigns?: Camp[]; links?: any[]; orders?: any[] } = {}) {
  const promotions: Promo[] = init.promotions ?? []
  const campaigns: Camp[] = init.campaigns ?? []
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const match = (v: unknown, f: unknown) => (f === undefined ? true : Array.isArray(f) ? f.includes(v) : v === f)
  const promotion = {
    listPromotions: jest.fn(async (filters: any = {}, config: any = {}) =>
      promotions
        .filter((p) => config.withDeleted || !p.deleted_at)
        .filter((p) => match(p.code, filters.code) && match(p.campaign_id, filters.campaign_id))
        .map((p) => ({ ...p, campaign: p.campaign ?? campaigns.find((c) => c.id === p.campaign_id) ?? null }))
    ),
    listCampaigns: jest.fn(async (filters: any = {}) =>
      campaigns.filter((c) => {
        const f = filters.campaign_identifier
        if (f && typeof f === "object" && "$like" in f) return c.campaign_identifier.startsWith(String(f.$like).replace(/%$/, ""))
        return match(c.campaign_identifier, f)
      })
    ),
  }
  const graphCalls: any[] = []
  const query = {
    graph: jest.fn(async (args: any) => {
      graphCalls.push(args)
      if (args.entity === "order_promotion")
        return { data: (init.links ?? []).filter((l) => match(l.promotion_id, args.filters?.promotion_id)) }
      if (args.entity === "order") return { data: (init.orders ?? []).filter((o) => match(o.id, args.filters?.id)) }
      return { data: [] }
    }),
  }
  const container: any = {
    resolve: (key: string) => {
      if (key === Modules.PROMOTION) return promotion
      if (key === ContainerRegistrationKeys.QUERY) return query
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      throw new Error(`unexpected resolve ${key}`)
    },
  }
  return { container, promotions, campaigns, logger, promotion, query, graphCalls }
}

beforeEach(() => {
  createCampaignsRun.mockReset()
  createPromotionsRun.mockReset()
})

/** Default workflow mocks: append to the fake store, like the real workflows. */
function wireCreates(f: ReturnType<typeof fake>) {
  createCampaignsRun.mockImplementation(async ({ input }: any) => {
    const result = input.campaignsData.map((c: any, i: number) => {
      const row = { id: `camp_new_${i}`, campaign_identifier: c.campaign_identifier, ends_at: c.ends_at }
      f.campaigns.push(row)
      return row
    })
    return { result }
  })
  createPromotionsRun.mockImplementation(async ({ input }: any) => {
    const result = input.promotionsData.map((p: any, i: number) => {
      const row = { id: `promo_new_${i}`, code: p.code, status: p.status, used: 0, limit: p.limit, campaign_id: p.campaign_id, metadata: p.metadata }
      f.promotions.push(row)
      return row
    })
    return { result }
  })
}

describe("MIN_SPEND_ATTRIBUTE", () => {
  it("is the attribute measured in Task 1.2", () => {
    expect(MIN_SPEND_ATTRIBUTE).toBe("original_item_total")
  })
})

describe("issueVoucher", () => {
  const args = { program, ref: "abc", email: " Jan@Example.com ", secret, now }

  it("returns the existing promotion without creating anything", async () => {
    const f = fake({
      campaigns: [{ id: "camp_1", campaign_identifier: "test-prog-2026-11", ends_at: COHORT_END }],
      promotions: [
        { id: "promo_1", code: CODE, status: "active", used: 0, limit: 1, campaign_id: "camp_1", metadata: { value_zar: 50, min_spend_zar: 250 } },
      ],
    })
    wireCreates(f)
    const r = await issueVoucher(f.container, args)
    expect(r).toEqual({
      status: "existing",
      voucher: { code: CODE, expires_at: "2027-01-14T21:59:59.999Z", value: 50, min_spend: 250, currency: "zar", used: false },
    })
    expect(createCampaignsRun).not.toHaveBeenCalled()
    expect(createPromotionsRun).not.toHaveBeenCalled()
  })

  it("reports used = true when used reached the limit", async () => {
    const f = fake({
      campaigns: [{ id: "camp_1", campaign_identifier: "test-prog-2026-11", ends_at: COHORT_END }],
      promotions: [{ id: "promo_1", code: CODE, status: "active", used: 1, limit: 1, campaign_id: "camp_1", metadata: { value_zar: 50, min_spend_zar: 250 } }],
    })
    expect((await issueVoucher(f.container, args)).voucher.used).toBe(true)
  })

  it("creates the cohort campaign and a DD7 promotion", async () => {
    const f = fake()
    wireCreates(f)
    const r = await issueVoucher(f.container, args)
    expect(createCampaignsRun).toHaveBeenCalledTimes(1)
    expect(createCampaignsRun.mock.calls[0][0]).toEqual({
      input: { campaignsData: [{ name: "test-prog-2026-11", campaign_identifier: "test-prog-2026-11", starts_at: null, ends_at: COHORT_END }] },
    })
    expect(createPromotionsRun.mock.calls[0][0]).toEqual({
      input: {
        promotionsData: [
          {
            code: "TST-ABC-NJ52W0D",
            type: "standard",
            status: "active",
            is_automatic: false,
            is_tax_inclusive: true,
            limit: 1,
            campaign_id: "camp_new_0",
            application_method: { type: "fixed", target_type: "order", allocation: "across", value: 50, currency_code: "zar" },
            rules: [{ attribute: "original_item_total", operator: "gte", values: ["250"] }],
            metadata: {
              program: "test-prog",
              ref: "abc",
              email_hash: "b82dbe5433cfaeb5238ada81eadf911798ab04ba8ed69e004ec907826efa758e",
              value_zar: 50,
              min_spend_zar: 250,
              source: "hook",
            },
          },
        ],
      },
    })
    expect(r).toEqual({
      status: "created",
      voucher: { code: "TST-ABC-NJ52W0D", expires_at: "2027-01-14T21:59:59.999Z", value: 50, min_spend: 250, currency: "zar", used: false },
    })
  })

  it("never puts an @ in the metadata or in a logger call", async () => {
    const f = fake()
    wireCreates(f)
    await issueVoucher(f.container, args)
    expect(JSON.stringify(createPromotionsRun.mock.calls[0][0].input.promotionsData[0].metadata)).not.toContain("@")
    for (const fn of [f.logger.info, f.logger.warn, f.logger.error]) expect(JSON.stringify(fn.mock.calls)).not.toContain("@")
  })

  it("uses an existing campaign under the cap", async () => {
    const f = fake({
      campaigns: [{ id: "camp_1", campaign_identifier: "test-prog-2026-11", ends_at: COHORT_END }],
      promotions: [{ id: "p_a", code: "TST-X-1", campaign_id: "camp_1" }],
    })
    wireCreates(f)
    await issueVoucher(f.container, args)
    expect(createCampaignsRun).not.toHaveBeenCalled()
    expect(createPromotionsRun.mock.calls[0][0].input.promotionsData[0].campaign_id).toBe("camp_1")
  })

  it("throws CapReachedError at the cap and creates nothing", async () => {
    const f = fake({
      campaigns: [{ id: "camp_1", campaign_identifier: "test-prog-2026-11", ends_at: COHORT_END }],
      promotions: ["a", "b", "c"].map((x) => ({ id: `p_${x}`, code: `TST-${x}-1`, campaign_id: "camp_1" })),
    })
    wireCreates(f)
    await expect(issueVoucher(f.container, args)).rejects.toBeInstanceOf(CapReachedError)
    expect(createPromotionsRun).not.toHaveBeenCalled()
  })

  it("re-reads the campaign when its creation loses a race", async () => {
    const f = fake()
    wireCreates(f)
    createCampaignsRun.mockImplementation(async () => {
      f.campaigns.push({ id: "camp_winner", campaign_identifier: "test-prog-2026-11", ends_at: COHORT_END })
      throw new Error("duplicate key value violates unique constraint")
    })
    await issueVoucher(f.container, args)
    expect(f.campaigns.filter((c) => c.campaign_identifier === "test-prog-2026-11")).toHaveLength(1)
    expect(createPromotionsRun.mock.calls[0][0].input.promotionsData[0].campaign_id).toBe("camp_winner")
  })

  it("rethrows when the campaign creation fails and no campaign exists", async () => {
    const f = fake()
    wireCreates(f)
    createCampaignsRun.mockRejectedValue(new Error("db down"))
    await expect(issueVoucher(f.container, args)).rejects.toThrow("db down")
  })

  it("returns existing when the promotion creation loses a race", async () => {
    const f = fake()
    wireCreates(f)
    createPromotionsRun.mockImplementation(async ({ input }: any) => {
      const p = input.promotionsData[0]
      f.promotions.push({ id: "promo_winner", code: p.code, status: "active", used: 0, limit: 1, campaign_id: p.campaign_id, metadata: p.metadata })
      throw new Error("duplicate key value violates unique constraint")
    })
    const r = await issueVoucher(f.container, args)
    expect(r.status).toBe("existing")
    expect(r.voucher.code).toBe(CODE)
    expect(f.promotions.filter((p) => p.code === CODE)).toHaveLength(1)
  })

  it("rethrows a promotion creation failure without a winner", async () => {
    const f = fake()
    wireCreates(f)
    createPromotionsRun.mockRejectedValue(new Error("boom"))
    await expect(issueVoucher(f.container, args)).rejects.toThrow("boom")
  })

  it.each([
    ["soft-deleted", { deleted_at: new Date("2026-11-01T00:00:00Z"), status: "active" }],
    ["inactive", { status: "inactive" }],
    ["draft", { status: "draft" }],
  ])("throws VoucherRevokedError for a %s promotion and creates nothing", async (_label, extra) => {
    const f = fake({ promotions: [{ id: "promo_1", code: CODE, campaign_id: "camp_1", ...extra }] })
    wireCreates(f)
    await expect(issueVoucher(f.container, args)).rejects.toBeInstanceOf(VoucherRevokedError)
    expect(createPromotionsRun).not.toHaveBeenCalled()
    expect(createCampaignsRun).not.toHaveBeenCalled()
  })

  it("looks the code up including soft-deleted rows", async () => {
    const f = fake()
    wireCreates(f)
    await issueVoucher(f.container, args)
    expect(f.promotion.listPromotions.mock.calls[0][0]).toEqual({ code: CODE })
    expect(f.promotion.listPromotions.mock.calls[0][1]).toEqual(expect.objectContaining({ withDeleted: true }))
  })

  it("throws ProgramEndedError for a fixed end not later than now", async () => {
    const ended = { ...program, validity_days: undefined, ends_at: "2026-11-12T10:00:00+02:00" }
    const f = fake()
    wireCreates(f)
    await expect(issueVoucher(f.container, { ...args, program: ended })).rejects.toBeInstanceOf(ProgramEndedError)
    expect(createCampaignsRun).not.toHaveBeenCalled()
    expect(createPromotionsRun).not.toHaveBeenCalled()
  })

  it("throws ProgramEndedError when the existing cohort campaign already ended (M3), creating nothing", async () => {
    const f = fake({ campaigns: [{ id: "camp_1", campaign_identifier: "test-prog-2026-11", ends_at: new Date("2026-11-12T07:59:59Z") }] })
    wireCreates(f)
    await expect(issueVoucher(f.container, args)).rejects.toBeInstanceOf(ProgramEndedError)
    const g = fake({ campaigns: [{ id: "camp_1", campaign_identifier: "test-prog-2026-11", ends_at: now }] })
    await expect(issueVoucher(g.container, args)).rejects.toBeInstanceOf(ProgramEndedError)
    expect(createPromotionsRun).not.toHaveBeenCalled()
    expect(createCampaignsRun).not.toHaveBeenCalled()
  })

  it("throws ExpiryUnknownError for an existing cohort campaign without an end, creating nothing", async () => {
    const f = fake({ campaigns: [{ id: "camp_1", campaign_identifier: "test-prog-2026-11", ends_at: null }] })
    wireCreates(f)
    await expect(issueVoucher(f.container, args)).rejects.toBeInstanceOf(ExpiryUnknownError)
    expect(createPromotionsRun).not.toHaveBeenCalled()
  })

  it("throws ExpiryUnknownError (never an empty expires_at) for an existing code whose campaign is missing (M6)", async () => {
    const f = fake({ promotions: [{ id: "promo_1", code: CODE, status: "active", used: 0, limit: 1, metadata: { value_zar: 50, min_spend_zar: 250 } }] })
    wireCreates(f)
    await expect(issueVoucher(f.container, args)).rejects.toBeInstanceOf(ExpiryUnknownError)
    expect(createPromotionsRun).not.toHaveBeenCalled()
  })

  it("uses the fixed program end for the campaign", async () => {
    const fixed = { ...program, validity_days: undefined, ends_at: "2031-07-15T23:59:59+02:00" }
    const f = fake()
    wireCreates(f)
    const r = await issueVoucher(f.container, { ...args, program: fixed })
    expect(createCampaignsRun.mock.calls[0][0].input.campaignsData[0].ends_at.toISOString()).toBe("2031-07-15T21:59:59.000Z")
    expect(r.voucher.expires_at).toBe("2031-07-15T21:59:59.000Z")
  })
})

describe("findOrCreateCampaign", () => {
  it("returns ends_at null (never the epoch) for an existing open-ended campaign (L1)", async () => {
    const f = fake({ campaigns: [{ id: "camp_open", campaign_identifier: "import-woo-2031-07-15", ends_at: null }] })
    const r = await findOrCreateCampaign(f.container, { campaign_identifier: "import-woo-2031-07-15", ends_at: new Date("2031-07-15T21:30:00Z") })
    expect(r).toEqual({ id: "camp_open", ends_at: null })
    expect(createCampaignsRun).not.toHaveBeenCalled()
  })
})

describe("voucherReport", () => {
  const camps: Camp[] = [
    { id: "c_nov", campaign_identifier: "test-prog-2026-11", ends_at: COHORT_END },
    { id: "c_other", campaign_identifier: "other-prog-2026-11", ends_at: COHORT_END },
    { id: "c_dec", campaign_identifier: "test-prog-2026-12", ends_at: COHORT_END },
  ]
  const adj = (code: string) => ({ items: [{ adjustments: [{ code, amount: 50 }] }], shipping_methods: [] })

  it("sums the promotions of every campaign matching the prefix, with the application_method fallback", async () => {
    const f = fake({
      campaigns: [
        { id: "c_a", campaign_identifier: "import-woo-2031-07-15", ends_at: COHORT_END },
        { id: "c_b", campaign_identifier: "import-woo-2031-07-16", ends_at: COHORT_END },
        { id: "c_c", campaign_identifier: "import-woo-2031-08-01", ends_at: COHORT_END },
      ],
      promotions: [
        { id: "p1", code: "W1", campaign_id: "c_a", metadata: { value_zar: 50 }, application_method: { value: 50 } },
        { id: "p2", code: "W2", campaign_id: "c_b", metadata: {}, application_method: { value: 40 } },
        { id: "p3", code: "W3", campaign_id: "c_b", metadata: { value_zar: 50 } },
        { id: "p4", code: "W4", campaign_id: "c_c", metadata: { value_zar: 50 } },
      ],
      links: [
        { order_id: "o1", promotion_id: "p1" },
        { order_id: "o2", promotion_id: "p2" },
        { order_id: "o4", promotion_id: "p4" },
      ],
      orders: [
        { id: "o1", status: "pending", ...adj("W1") },
        { id: "o2", status: "completed", items: [], shipping_methods: [{ adjustments: [{ code: "W2", amount: 40 }] }] },
        { id: "o4", status: "pending", ...adj("W4") },
      ],
    })
    const r = await voucherReport(f.container, { program: "import-woo", month: "2031-07" })
    expect(r).toEqual({ issued: 3, redeemed: 2, discount_value_zar: 90 })
  })

  it("excludes a link to a canceled order", async () => {
    const f = fake({
      campaigns: camps,
      promotions: [{ id: "p1", code: "A", campaign_id: "c_nov", metadata: { value_zar: 50 } }],
      links: [{ order_id: "o1", promotion_id: "p1" }],
      orders: [{ id: "o1", status: "canceled", ...adj("A") }],
    })
    expect(await voucherReport(f.container, { program: "test-prog", month: "2026-11" })).toEqual({ issued: 1, redeemed: 0, discount_value_zar: 0 })
  })

  it("excludes a link to an order with no adjustment carrying the code", async () => {
    const f = fake({
      campaigns: camps,
      promotions: [{ id: "p1", code: "A", campaign_id: "c_nov", metadata: { value_zar: 50 } }],
      links: [{ order_id: "o1", promotion_id: "p1" }],
      orders: [{ id: "o1", status: "pending", ...adj("OTHER") }],
    })
    expect((await voucherReport(f.container, { program: "test-prog", month: "2026-11" })).redeemed).toBe(0)
  })

  it("counts redeemed, cancelled, redeemed again as exactly 1", async () => {
    const f = fake({
      campaigns: camps,
      promotions: [{ id: "p1", code: "A", campaign_id: "c_nov", metadata: { value_zar: 50 } }],
      links: [
        { order_id: "o1", promotion_id: "p1" },
        { order_id: "o2", promotion_id: "p1" },
      ],
      orders: [
        { id: "o1", status: "canceled", ...adj("A") },
        { id: "o2", status: "pending", ...adj("A") },
      ],
    })
    expect(await voucherReport(f.container, { program: "test-prog", month: "2026-11" })).toEqual({ issued: 1, redeemed: 1, discount_value_zar: 50 })
  })

  it("never reads promotion.used", async () => {
    const f = fake({
      campaigns: camps,
      promotions: [{ id: "p1", code: "A", campaign_id: "c_nov", used: 1, limit: 1, metadata: { value_zar: 50 } }],
    })
    expect(await voucherReport(f.container, { program: "test-prog", month: "2026-11" })).toEqual({ issued: 1, redeemed: 0, discount_value_zar: 0 })
  })

  it("selects campaigns by prefix only (other program and other month excluded) and matches codes case-insensitively", async () => {
    const f = fake({
      campaigns: camps,
      promotions: [
        { id: "p1", code: "A", campaign_id: "c_nov", metadata: { value_zar: 50 } },
        { id: "p2", code: "B", campaign_id: "c_other", metadata: { value_zar: 50 } },
        { id: "p3", code: "C", campaign_id: "c_dec", metadata: { value_zar: 50 } },
      ],
      links: [{ order_id: "o1", promotion_id: "p1" }],
      orders: [{ id: "o1", status: "pending", ...adj("a") }],
    })
    expect(await voucherReport(f.container, { program: "test-prog", month: "2026-11" })).toEqual({ issued: 1, redeemed: 1, discount_value_zar: 50 })
  })

  it("skips draft orders (H2): status draft or is_draft_order, and asks for is_draft_order", async () => {
    const f = fake({
      campaigns: camps,
      promotions: [{ id: "p1", code: "A", campaign_id: "c_nov", metadata: { value_zar: 50 } }],
      links: [
        { order_id: "o_draft", promotion_id: "p1" },
        { order_id: "o_flag", promotion_id: "p1" },
        { order_id: "o_real", promotion_id: "p1" },
      ],
      orders: [
        { id: "o_draft", status: "draft", is_draft_order: true, ...adj("A") },
        { id: "o_flag", status: "pending", is_draft_order: true, ...adj("A") },
        { id: "o_real", status: "pending", is_draft_order: false, ...adj("A") },
      ],
    })
    expect(await voucherReport(f.container, { program: "test-prog", month: "2026-11" })).toEqual({ issued: 1, redeemed: 1, discount_value_zar: 50 })
    const orderCall = f.graphCalls.find((c) => c.entity === "order")
    expect(orderCall.fields).toEqual(expect.arrayContaining(["id", "status", "is_draft_order"]))
  })

  it("counts redemptions of a soft-deleted code but not the code in issued (R-M1)", async () => {
    const f = fake({
      campaigns: camps,
      promotions: [
        { id: "p1", code: "A", campaign_id: "c_nov", metadata: { value_zar: 50 } },
        { id: "p2", code: "B", campaign_id: "c_nov", deleted_at: new Date("2026-11-10T00:00:00Z"), metadata: { value_zar: 50 } },
      ],
      links: [{ order_id: "o1", promotion_id: "p2" }],
      orders: [{ id: "o1", status: "pending", ...adj("B") }],
    })
    expect(await voucherReport(f.container, { program: "test-prog", month: "2026-11" })).toEqual({ issued: 1, redeemed: 1, discount_value_zar: 50 })
    const reportCall = f.promotion.listPromotions.mock.calls.find((c: any[]) => c[0]?.campaign_id) as any[]
    expect(reportCall[1]).toEqual(expect.objectContaining({ withDeleted: true }))
    expect(reportCall[1].select).toEqual(expect.arrayContaining(["deleted_at"]))
  })

  it("returns zeros without querying links when no campaign matches", async () => {
    const f = fake({ campaigns: camps })
    expect(await voucherReport(f.container, { program: "nothing", month: "2026-11" })).toEqual({ issued: 0, redeemed: 0, discount_value_zar: 0 })
    expect(f.query.graph).not.toHaveBeenCalled()
  })
})
