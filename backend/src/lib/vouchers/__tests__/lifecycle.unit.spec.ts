import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  ONE_CODE_MESSAGE,
  assertOneCodeAtCompletion,
  assertOneCodePerCart,
  oneCodeViolation,
  onOrderCanceled,
  revertOrderVoucherUsage,
} from "../lifecycle"

type P = { id: string; code: string; is_automatic?: boolean }

function fake(opts: { promotions?: P[]; order?: any; revertError?: Error } = {}) {
  const promotions = opts.promotions ?? []
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const promotion = {
    listPromotions: jest.fn(async (filters: any) =>
      promotions.filter((p) => (filters.code ? filters.code.includes(p.code) : true) && (filters.id ? filters.id.includes(p.id) : true))
    ),
    revertUsage: jest.fn(async () => {
      if (opts.revertError) throw opts.revertError
    }),
  }
  const query = { graph: jest.fn(async () => ({ data: opts.order ? [opts.order] : [] })) }
  const container: any = {
    resolve: (k: string) => {
      if (k === Modules.PROMOTION) return promotion
      if (k === ContainerRegistrationKeys.QUERY) return query
      if (k === ContainerRegistrationKeys.LOGGER) return logger
      throw new Error(`unexpected resolve ${k}`)
    },
  }
  return { container, promotion, query, logger }
}

describe("ONE_CODE_MESSAGE", () => {
  it("is the exact contract string", () => {
    expect(ONE_CODE_MESSAGE).toBe("Only one discount code can be used per order.")
  })
})

describe("oneCodeViolation", () => {
  const none = new Set<string>()
  it.each([
    ["add [A] to []", "add", [], ["A"], none, false],
    ["add [A] to [A]", "add", ["A"], ["A"], none, false],
    ["add [B] to [A]", "add", ["A"], ["B"], none, true],
    ["add [A, B] to []", "add", [], ["A", "B"], none, true],
    ["replace with [A, B] on []", "replace", [], ["A", "B"], none, true],
    ["replace with [A] on [A] (refresh)", "replace", ["A"], ["A"], none, false],
    ["replace with [] on [A]", "replace", ["A"], [], none, false],
    ["replace with [A, B] on [A, B] (legacy cart)", "replace", ["A", "B"], ["A", "B"], none, false],
    ["remove [A] from [A, B]", "remove", ["A", "B"], ["A"], none, false],
    ["remove [C] from [A, B]", "remove", ["A", "B"], ["C"], none, false],
    ["add [B] to [A] where A is automatic", "add", ["A"], ["B"], new Set(["A"]), false],
  ] as const)("%s → %s", (_label, action, current, incoming, automatic, expected) => {
    expect(oneCodeViolation({ action, current: [...current], incoming: [...incoming], automatic })).toBe(expected)
  })
})

describe("assertOneCodePerCart", () => {
  it("throws INVALID_DATA with ONE_CODE_MESSAGE on a violation", async () => {
    const f = fake({ promotions: [{ id: "p1", code: "A" }, { id: "p2", code: "B" }] })
    const err = await assertOneCodePerCart(f.container, { action: "add", current: ["A"], incoming: ["B"] }).catch((e) => e)
    expect(err).toBeInstanceOf(MedusaError)
    expect(err.type).toBe(MedusaError.Types.INVALID_DATA)
    expect(err.message).toBe(ONE_CODE_MESSAGE)
  })

  it("does not count codes that listPromotions does not return (Medusa's own invalid-code error still fires)", async () => {
    const f = fake({ promotions: [{ id: "p1", code: "A" }] })
    await expect(assertOneCodePerCart(f.container, { action: "add", current: ["A"], incoming: ["NOPE"] })).resolves.toBeUndefined()
  })

  it("does not count automatic promotions", async () => {
    const f = fake({ promotions: [{ id: "p1", code: "AUTO", is_automatic: true }, { id: "p2", code: "B" }] })
    await expect(assertOneCodePerCart(f.container, { action: "add", current: ["AUTO"], incoming: ["B"] })).resolves.toBeUndefined()
  })

  it("never refuses a refresh with the cart's own codes, and skips the lookup when at most one code results", async () => {
    const f = fake({ promotions: [{ id: "p1", code: "A" }, { id: "p2", code: "B" }] })
    await expect(assertOneCodePerCart(f.container, { action: "replace", current: ["A", "B"], incoming: ["A", "B"] })).resolves.toBeUndefined()
    const g = fake({ promotions: [{ id: "p1", code: "A" }] })
    await assertOneCodePerCart(g.container, { action: "replace", current: ["A"], incoming: ["A"] })
    await assertOneCodePerCart(g.container, { action: "remove", current: ["A"], incoming: ["A"] })
    expect(g.promotion.listPromotions).not.toHaveBeenCalled()
  })
})

describe("assertOneCodeAtCompletion", () => {
  const promos = [
    { id: "p1", code: "A" },
    { id: "p2", code: "B" },
    { id: "pa", code: "AUTO", is_automatic: true },
  ]
  it("throws ONE_CODE_MESSAGE for two non-automatic promotions", async () => {
    const f = fake({ promotions: promos })
    const err = await assertOneCodeAtCompletion(f.container, { promotions: [{ id: "p1", code: "A" }, { id: "p2", code: "B" }] }).catch((e) => e)
    expect(err).toBeInstanceOf(MedusaError)
    expect(err.type).toBe(MedusaError.Types.INVALID_DATA)
    expect(err.message).toBe(ONE_CODE_MESSAGE)
  })
  it.each([
    ["one", [{ id: "p1", code: "A" }]],
    ["one plus one automatic", [{ id: "p1", code: "A" }, { id: "pa", code: "AUTO" }]],
    ["none", []],
    ["null list", null],
  ])("passes for %s", async (_l, list) => {
    const f = fake({ promotions: promos })
    await expect(assertOneCodeAtCompletion(f.container, { promotions: list as any })).resolves.toBeUndefined()
  })
})

describe("revertOrderVoucherUsage", () => {
  const order = (over: any = {}) => ({ id: "order_1", email: "jan@example.com", customer_id: "cus_1", items: [], shipping_methods: [], ...over })

  it("reverts one code with the summed amount and the order's customer context", async () => {
    const f = fake({
      order: order({ items: [{ adjustments: [{ code: "A", amount: 30 }] }, { adjustments: [{ code: "A", amount: 20 }] }] }),
    })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: ["A"] })
    expect(f.promotion.revertUsage).toHaveBeenCalledTimes(1)
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 50 }], { customer_id: "cus_1", customer_email: "jan@example.com" })
  })

  it("gives one action for a code on a line item and a shipping method", async () => {
    const f = fake({
      order: order({ items: [{ adjustments: [{ code: "A", amount: 40 }] }], shipping_methods: [{ adjustments: [{ code: "A", amount: 10 }] }] }),
    })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 50 }], expect.anything())
  })

  it("passes null customer context when the order has none", async () => {
    const f = fake({ order: order({ email: null, customer_id: null, items: [{ adjustments: [{ code: "A", amount: 5 }] }] }) })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.promotion.revertUsage).toHaveBeenCalledWith(expect.anything(), { customer_id: null, customer_email: null })
  })

  it("never reverts a code linked to the order without an adjustment", async () => {
    const f = fake({
      order: order({ promotions: [{ code: "X" }, { code: "A" }], items: [{ adjustments: [{ code: "A", amount: 50 }] }] }),
    })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 50 }], expect.anything())
  })

  it("does not call revertUsage nor log when the only linked code has no adjustment", async () => {
    const f = fake({ order: order({ promotions: [{ code: "X" }] }) })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: [] })
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.logger.info).not.toHaveBeenCalled()
  })

  it("does not request promotions.code from the order", async () => {
    const f = fake({ order: order() })
    await revertOrderVoucherUsage(f.container, "order_1")
    const call = (f.query.graph.mock.calls[0] as any[])[0]
    expect(call.entity).toBe("order")
    expect(call.filters).toEqual({ id: "order_1" })
    expect(call.fields).toEqual(
      expect.arrayContaining([
        "id",
        "email",
        "customer_id",
        "items.adjustments.code",
        "items.adjustments.amount",
        "shipping_methods.adjustments.code",
        "shipping_methods.adjustments.amount",
      ])
    )
    expect(call.fields.some((f: string) => f.startsWith("promotions"))).toBe(false)
  })

  it("is a no-op without adjustment codes (no call, no log)", async () => {
    const f = fake({ order: order({ items: [{ adjustments: [] }, { adjustments: null }], shipping_methods: [{}] }) })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.logger.info).not.toHaveBeenCalled()
  })

  it("logs the order id and the codes, never an email", async () => {
    const f = fake({ order: order({ items: [{ adjustments: [{ code: "A", amount: 50 }] }] }) })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.logger.info).toHaveBeenCalledWith("vouchers.revert " + JSON.stringify({ order_id: "order_1", codes: ["A"] }))
    expect(JSON.stringify(f.logger.info.mock.calls)).not.toContain("@")
  })
})

describe("onOrderCanceled", () => {
  it("logs vouchers.revert failed at error level and resolves when revertUsage rejects", async () => {
    const f = fake({
      order: { id: "order_1", email: "jan@example.com", customer_id: null, items: [{ adjustments: [{ code: "A", amount: 50 }] }], shipping_methods: [] },
      revertError: new Error("db down"),
    })
    await expect(onOrderCanceled(f.container, "order_1")).resolves.toBeUndefined()
    expect(f.logger.error).toHaveBeenCalledWith("vouchers.revert failed " + JSON.stringify({ order_id: "order_1", message: "db down" }))
  })

  it("runs the revert on success", async () => {
    const f = fake({
      order: { id: "order_1", email: null, customer_id: null, items: [{ adjustments: [{ code: "A", amount: 50 }] }], shipping_methods: [] },
    })
    await onOrderCanceled(f.container, "order_1")
    expect(f.promotion.revertUsage).toHaveBeenCalledTimes(1)
    expect(f.logger.error).not.toHaveBeenCalled()
  })
})
