import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  ONE_CODE_MESSAGE,
  assertOneCodeAtCompletion,
  assertOneCodePerCart,
  oneCodeViolation,
  onOrderCanceled,
  revertOrderVoucherUsage,
} from "../lifecycle"

type P = { id: string; code: string; is_automatic?: boolean; used?: number }

/**
 * Fake container. `query.graph` answers per entity, like the real one: `order` returns the order, `order_cart` the
 * link complete-cart creates (present unless `cartLink: false`), `cart` the cart the order was completed from. By
 * default that cart mirrors the order (a normal checkout order: same adjustments, email and customer); `cart` overrides
 * it, for an order whose adjustments changed after completion (an order edit). `revertUsage` decrements `used` like
 * Medusa, except for codes listed in `notReverted` (Medusa skips a promotion that is not active or whose campaign
 * ended). `listPromotionsErrorOnCall` makes that call (1-based) of `listPromotions` reject; `cartLinkError` makes the
 * order_cart query reject.
 */
function fake(
  opts: {
    promotions?: P[]
    order?: any
    cart?: any
    cartMissing?: boolean
    revertError?: Error
    cartLink?: boolean
    cartLinkError?: Error
    notReverted?: string[]
    listPromotionsErrorOnCall?: number
  } = {}
) {
  const promotions = (opts.promotions ?? []).map((p) => ({ ...p }))
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  let listCalls = 0
  const promotion = {
    listPromotions: jest.fn(async (filters: any) => {
      listCalls += 1
      if (opts.listPromotionsErrorOnCall === listCalls) throw new Error("read failed")
      return promotions
        .filter((p) => (filters.code ? filters.code.includes(p.code) : true) && (filters.id ? filters.id.includes(p.id) : true))
        .map((p) => ({ ...p }))
    }),
    revertUsage: jest.fn(async (actions: { code: string }[]) => {
      if (opts.revertError) throw opts.revertError
      for (const a of actions) {
        const p = promotions.find((x) => x.code === a.code)
        if (p && !(opts.notReverted ?? []).includes(a.code) && typeof p.used === "number") p.used = Math.max(0, p.used - 1)
      }
    }),
  }
  const query = {
    graph: jest.fn(async (args: any) => {
      if (args.entity === "order") return { data: opts.order ? [opts.order] : [] }
      if (args.entity === "order_cart") {
        if (opts.cartLinkError) throw opts.cartLinkError
        const ids = [args.filters?.order_id].flat()
        return { data: opts.order && opts.cartLink !== false && ids.includes(opts.order.id) ? [{ order_id: opts.order.id, cart_id: "cart_1" }] : [] }
      }
      if (args.entity === "cart") {
        const o = opts.order ?? {}
        const cart = { id: "cart_1", email: o.email, customer_id: o.customer_id, items: o.items, shipping_methods: o.shipping_methods, ...(opts.cart ?? {}) }
        return { data: opts.order && !opts.cartMissing && [args.filters?.id].flat().includes("cart_1") ? [cart] : [] }
      }
      throw new Error(`unexpected entity ${args.entity}`)
    }),
  }
  const container: any = {
    resolve: (k: string) => {
      if (k === Modules.PROMOTION) return promotion
      if (k === ContainerRegistrationKeys.QUERY) return query
      if (k === ContainerRegistrationKeys.LOGGER) return logger
      throw new Error(`unexpected resolve ${k}`)
    },
  }
  return { container, promotion, query, logger, promotions }
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
  const usedA = [{ id: "pA", code: "A", used: 1 }]

  it("reverts one code with the summed amount and the originating cart's customer context", async () => {
    const f = fake({
      promotions: usedA,
      order: order({ items: [{ adjustments: [{ code: "A", amount: 30 }] }, { adjustments: [{ code: "A", amount: 20 }] }] }),
    })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: ["A"], skipped: [] })
    expect(f.promotion.revertUsage).toHaveBeenCalledTimes(1)
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 50 }], { customer_id: "cus_1", customer_email: "jan@example.com" })
  })

  it("gives one action for a code on a line item and a shipping method", async () => {
    const f = fake({
      promotions: usedA,
      order: order({ items: [{ adjustments: [{ code: "A", amount: 40 }] }], shipping_methods: [{ adjustments: [{ code: "A", amount: 10 }] }] }),
    })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 50 }], expect.anything())
  })

  it("passes null customer context when the order has none", async () => {
    const f = fake({ promotions: usedA, order: order({ email: null, customer_id: null, items: [{ adjustments: [{ code: "A", amount: 5 }] }] }) })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.promotion.revertUsage).toHaveBeenCalledWith(expect.anything(), { customer_id: null, customer_email: null })
  })

  it("never reverts a code linked to the order without an adjustment", async () => {
    const f = fake({
      promotions: usedA,
      order: order({ promotions: [{ code: "X" }, { code: "A" }], items: [{ adjustments: [{ code: "A", amount: 50 }] }] }),
    })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 50 }], expect.anything())
  })

  it("does not call revertUsage nor log when the only linked code has no adjustment", async () => {
    const f = fake({ order: order({ promotions: [{ code: "X" }] }) })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: [], skipped: [] })
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.logger.info).not.toHaveBeenCalled()
  })

  it("reads the revert list and customer context from the originating cart, and never requests promotions", async () => {
    const f = fake({ promotions: usedA, order: order({ items: [{ adjustments: [{ code: "A", amount: 5 }] }] }) })
    await revertOrderVoucherUsage(f.container, "order_1")
    const calls = f.query.graph.mock.calls.map((c: any[]) => c[0])
    const orderCall = calls.find((a: any) => a.entity === "order")
    expect(orderCall.filters).toEqual({ id: "order_1" })
    const cartCall = calls.find((a: any) => a.entity === "cart")
    expect(cartCall.filters).toEqual({ id: ["cart_1"] })
    expect(cartCall.fields).toEqual(
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
    for (const c of calls) expect(c.fields.some((x: string) => x.startsWith("promotions"))).toBe(false)
  })

  it("reverts nothing and warns when the order_cart link points at a cart that cannot be read", async () => {
    const f = fake({ promotions: usedA, cartMissing: true, order: order({ items: [{ adjustments: [{ code: "A", amount: 5 }] }] }) })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: [], skipped: [] })
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.logger.warn).toHaveBeenCalledWith(
      "vouchers.revert skipped (cart not found) " + JSON.stringify({ order_id: "order_1", cart_id: "cart_1", codes: ["A"] })
    )
  })

  it("is a no-op without adjustment codes (no call, no log)", async () => {
    const f = fake({ order: order({ items: [{ adjustments: [] }, { adjustments: null }], shipping_methods: [{}] }) })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.logger.info).not.toHaveBeenCalled()
  })

  it("logs the order id with the reverted and skipped codes, never an email", async () => {
    const f = fake({ promotions: usedA, order: order({ items: [{ adjustments: [{ code: "A", amount: 50 }] }] }) })
    await revertOrderVoucherUsage(f.container, "order_1")
    expect(f.logger.info).toHaveBeenCalledWith("vouchers.revert " + JSON.stringify({ order_id: "order_1", reverted: ["A"], skipped: [] }))
    expect(JSON.stringify(f.logger.info.mock.calls)).not.toContain("@")
  })

  it("RD6: a normal cart order (cart and order carry the same adjustments) reverts exactly as before", async () => {
    const adjusted = { items: [{ adjustments: [{ code: "A", amount: 30 }] }, { adjustments: [{ code: "A", amount: 20 }] }], shipping_methods: [] }
    const f = fake({ promotions: usedA, order: order(adjusted), cart: { ...adjusted, email: "jan@example.com", customer_id: "cus_1" } })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: ["A"], skipped: [] })
    expect(f.promotion.revertUsage).toHaveBeenCalledTimes(1)
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 50 }], { customer_id: "cus_1", customer_email: "jan@example.com" })
    expect(f.promotions[0].used).toBe(0)
    expect(f.logger.info).toHaveBeenCalledWith("vouchers.revert " + JSON.stringify({ order_id: "order_1", reverted: ["A"], skipped: [] }))
  })

  it("RD6: never reverts a code that is on the order's adjustments but not on its originating cart's (order edit with carry_over_promotions)", async () => {
    const f = fake({
      promotions: [
        { id: "pA", code: "A", used: 1 },
        { id: "pX", code: "X", used: 1 },
      ],
      order: order({ items: [{ adjustments: [{ code: "A", amount: 40 }, { code: "X", amount: 7 }] }, { adjustments: [{ code: "X", amount: 3 }] }] }),
      cart: { items: [{ adjustments: [{ code: "A", amount: 40 }] }], shipping_methods: [] },
    })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: ["A"], skipped: [] })
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 40 }], { customer_id: "cus_1", customer_email: "jan@example.com" })
    expect(f.promotions.find((p) => p.code === "X")?.used).toBe(1)
  })

  it("RD6: reverts nothing when only the order (not its cart) carries an adjustment", async () => {
    const f = fake({
      promotions: [{ id: "pX", code: "X", used: 1 }],
      order: order({ items: [{ adjustments: [{ code: "X", amount: 7 }] }] }),
      cart: { items: [{ adjustments: [] }], shipping_methods: [] },
    })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: [], skipped: [] })
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.promotions[0].used).toBe(1)
    expect(f.logger.info).toHaveBeenCalledWith("vouchers.revert skipped (no cart adjustments) " + JSON.stringify({ order_id: "order_1", codes: ["X"] }))
  })

  it("RD6: reverts a cart code even when an order edit removed it from the order, with the cart's customer context", async () => {
    const f = fake({
      promotions: usedA,
      order: order({ email: "edited@example.com", customer_id: "cus_2", items: [{ adjustments: [] }] }),
      cart: { email: "jan@example.com", customer_id: "cus_1", items: [{ adjustments: [{ code: "A", amount: 25 }] }], shipping_methods: [{ adjustments: [{ code: "A", amount: 5 }] }] },
    })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: ["A"], skipped: [] })
    expect(f.promotion.revertUsage).toHaveBeenCalledWith([{ code: "A", amount: 30 }], { customer_id: "cus_1", customer_email: "jan@example.com" })
  })

  it("H1: reverts nothing for an order with coded adjustments but no order_cart link (draft or other non-cart order)", async () => {
    const f = fake({ promotions: usedA, cartLink: false, order: order({ items: [{ adjustments: [{ code: "A", amount: 50 }] }] }) })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: [], skipped: ["A"] })
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.promotions[0].used).toBe(1)
    expect(f.logger.info).toHaveBeenCalledWith("vouchers.revert skipped (not a cart order) " + JSON.stringify({ order_id: "order_1", codes: ["A"] }))
    const linkCall = f.query.graph.mock.calls.map((c: any[]) => c[0]).find((a: any) => a.entity === "order_cart")
    expect(linkCall.filters).toEqual({ order_id: ["order_1"] })
  })

  it("M4: logs a code Medusa did not revert (ended campaign, inactive) as skipped, not reverted", async () => {
    const f = fake({
      promotions: [
        { id: "pA", code: "A", used: 1 },
        { id: "pB", code: "B", used: 1 },
      ],
      notReverted: ["B"],
      order: order({ items: [{ adjustments: [{ code: "A", amount: 50 }, { code: "B", amount: 10 }] }] }),
    })
    expect(await revertOrderVoucherUsage(f.container, "order_1")).toEqual({ reverted: ["A"], skipped: ["B"] })
    expect(f.logger.info).toHaveBeenCalledWith("vouchers.revert " + JSON.stringify({ order_id: "order_1", reverted: ["A"], skipped: ["B"] }))
  })

  it("M4: logs at warn when the order is not found, and reverts nothing", async () => {
    const f = fake({ promotions: usedA })
    expect(await revertOrderVoucherUsage(f.container, "order_404")).toEqual({ reverted: [], skipped: [] })
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.logger.warn).toHaveBeenCalledWith("vouchers.revert skipped (order not found) " + JSON.stringify({ order_id: "order_404" }))
  })
})

describe("onOrderCanceled", () => {
  it("logs vouchers.revert failed at error level and resolves when revertUsage rejects", async () => {
    const f = fake({
      promotions: [{ id: "pA", code: "A", used: 1 }],
      order: { id: "order_1", email: "jan@example.com", customer_id: null, items: [{ adjustments: [{ code: "A", amount: 50 }] }], shipping_methods: [] },
      revertError: new Error("db down"),
    })
    await expect(onOrderCanceled(f.container, "order_1")).resolves.toBeUndefined()
    expect(f.logger.error).toHaveBeenCalledWith("vouchers.revert failed " + JSON.stringify({ order_id: "order_1", message: "db down" }))
  })

  it("fails safe when the order_cart query rejects: logs vouchers.revert failed, reverts nothing, resolves", async () => {
    const f = fake({
      promotions: [{ id: "pA", code: "A", used: 1 }],
      order: { id: "order_1", email: null, customer_id: null, items: [{ adjustments: [{ code: "A", amount: 50 }] }], shipping_methods: [] },
      cartLinkError: new Error("link read failed"),
    })
    await expect(onOrderCanceled(f.container, "order_1")).resolves.toBeUndefined()
    expect(f.promotion.revertUsage).not.toHaveBeenCalled()
    expect(f.promotions[0].used).toBe(1)
    expect(f.logger.error).toHaveBeenCalledWith("vouchers.revert failed " + JSON.stringify({ order_id: "order_1", message: "link read failed" }))
  })

  it("a failed read after a successful revert logs 'vouchers.revert done, verification read failed' at warn, never 'vouchers.revert failed'", async () => {
    const f = fake({
      promotions: [{ id: "pA", code: "A", used: 1 }],
      order: { id: "order_1", email: null, customer_id: null, items: [{ adjustments: [{ code: "A", amount: 50 }] }], shipping_methods: [] },
      listPromotionsErrorOnCall: 2,
    })
    await expect(onOrderCanceled(f.container, "order_1")).resolves.toBeUndefined()
    expect(f.promotion.revertUsage).toHaveBeenCalledTimes(1)
    expect(f.promotions[0].used).toBe(0)
    expect(f.logger.error).not.toHaveBeenCalled()
    expect(f.logger.warn).toHaveBeenCalledWith(
      "vouchers.revert done, verification read failed " + JSON.stringify({ order_id: "order_1", codes: ["A"], message: "read failed" })
    )
  })

  it("runs the revert on success", async () => {
    const f = fake({
      promotions: [{ id: "pA", code: "A", used: 1 }],
      order: { id: "order_1", email: null, customer_id: null, items: [{ adjustments: [{ code: "A", amount: 50 }] }], shipping_methods: [] },
    })
    await onOrderCanceled(f.container, "order_1")
    expect(f.promotion.revertUsage).toHaveBeenCalledTimes(1)
    expect(f.promotions[0].used).toBe(0)
    expect(f.logger.error).not.toHaveBeenCalled()
  })
})
