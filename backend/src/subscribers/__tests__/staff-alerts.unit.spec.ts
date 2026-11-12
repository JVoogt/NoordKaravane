import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const fixture: any = {
  email_orders: "orders@example.com",
  email_general: "hello@example.com",
  staff_order_alerts: ["staff-a@example.com", "staff-b@example.com"],
  dropship_suppliers: { "TFR-": { name: "The First Responders", email: "tfr@example.com" } },
}
const getBusinessConfig = jest.fn(() => fixture)
jest.mock("../../lib/business", () => ({ ...jest.requireActual("../../lib/business"), getBusinessConfig: () => getBusinessConfig() }))

import orderPlacedHandler from "../order-placed"
import paymentCapturedHandler from "../payment-captured"

const order = (provider: string, captured: string | null) => ({
  id: "order_01ABC",
  display_id: 3,
  email: "jan@example.com",
  total: 1630,
  shipping_total: 130,
  metadata: {},
  items: [
    { product_title: "Gas regulator", quantity: 2, total: 500, variant_sku: "NK-GAS-1" },
    { product_title: "Trauma kit", quantity: 1, total: 1000, variant_sku: "TFR-VEH-KIT" },
  ],
  shipping_address: { first_name: "Jan", last_name: "Botha", address_1: "12 Kerk Street", city: "Pretoria", postal_code: "0182", phone: "0821234567" },
  shipping_methods: [{ name: "The Courier Guy" }],
  payment_collections: [{ id: "paycol_1", payments: [{ id: "pay_1", provider_id: provider, captured_at: captured }] }],
})

type Graph = { payment?: any[]; order_payment_collection?: any[]; order?: any[] }

/**
 * Fake Medusa container. createNotifications mimics @medusajs/notification 2.22: a repeat idempotency_key whose
 * earlier row succeeded is skipped without sending or throwing, and the single-object call returns undefined.
 */
function fakeContainer(o: any, failFor: (to: string) => boolean = () => false, graph: Graph = {}) {
  const sent: { to: string; template: string; data: any; idempotency_key?: string }[] = []
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const query = {
    graph: jest.fn(async ({ entity }: { entity: string }) => {
      if (entity === "order") return { data: graph.order ?? (o ? [o] : []) }
      if (entity === "payment")
        return {
          data: graph.payment ?? [{ id: "pay_1", payment_collection_id: "paycol_1", amount: 1630, currency_code: "zar", provider_id: "pp_payfast_payfast" }],
        }
      if (entity === "order_payment_collection") return { data: graph.order_payment_collection ?? (o ? [{ order_id: o.id }] : []) }
      return { data: [] }
    }),
  }
  const succeeded = new Set<string>()
  const notification = {
    createNotifications: jest.fn(async (n: any) => {
      if (n.idempotency_key && succeeded.has(n.idempotency_key)) return undefined
      if (failFor(n.to)) throw new Error("SMTP down")
      if (n.idempotency_key) succeeded.add(n.idempotency_key)
      sent.push({ to: n.to, template: n.template, data: n.data, ...(n.idempotency_key ? { idempotency_key: n.idempotency_key } : {}) })
      return n
    }),
  }
  const container: any = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.QUERY) return query
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      if (key === Modules.NOTIFICATION) return notification
      throw new Error(`unexpected resolve ${key}`)
    },
  }
  return { container, sent, logger, notification }
}

const logged = (fn: jest.Mock) => fn.mock.calls.map((c) => String(c[0])).join("\n")

beforeEach(() => getBusinessConfig.mockImplementation(() => fixture))

describe("order.placed staff alerts", () => {
  it("sends the customer EFT email first, then one staff email per recipient", async () => {
    const { container, sent } = fakeContainer(order("pp_eft_eft", null))
    await orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container } as any)
    expect(sent.map((s) => [s.to, s.template])).toEqual([
      ["jan@example.com", "order-placed-eft"],
      ["staff-a@example.com", "staff-new-order"],
      ["staff-b@example.com", "staff-new-order"],
    ])
    expect(sent[1].data).toMatchObject({ reference: "NK3", payment_method: "EFT", payment_captured: false, reply_to: "jan@example.com" })
  })
  it("alerts staff for PayFast orders too (no customer email at placement)", async () => {
    const { container, sent } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"))
    await orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container } as any)
    expect(sent.map((s) => s.template)).toEqual(["staff-new-order", "staff-new-order"])
    expect(sent[0].data).toMatchObject({ payment_method: "PayFast", payment_captured: true })
  })
  it("a failing staff send does not throw out of the handler and the other recipient still gets it", async () => {
    const { container, sent, logger } = fakeContainer(order("pp_eft_eft", null), (to) => to === "staff-a@example.com")
    await expect(orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container } as any)).resolves.toBeUndefined()
    expect(sent.map((s) => s.to)).toEqual(["jan@example.com", "staff-b@example.com"])
    expect(logger.error).toHaveBeenCalled()
  })
  it("an unexpected throw while building the staff alert is caught and logged", async () => {
    getBusinessConfig.mockImplementation(() => {
      throw new Error("config exploded")
    })
    const { container, sent, logger } = fakeContainer(order("pp_eft_eft", null))
    await expect(orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container } as any)).resolves.toBeUndefined()
    expect(sent.map((s) => s.template)).toEqual(["order-placed-eft"])
    expect(logger.error.mock.calls.map((c) => String(c[0])).join("\n")).toContain("config exploded")
  })
  it("logs an error and sends nothing to staff when no usable recipient is configured", async () => {
    getBusinessConfig.mockImplementation(() => ({ ...fixture, staff_order_alerts: undefined, email_orders: "REPLACE_ME" }))
    const { container, sent, logger } = fakeContainer(order("pp_eft_eft", null))
    await orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container } as any)
    expect(sent.map((s) => s.template)).toEqual(["order-placed-eft"])
    expect(logged(logger.error)).toContain("no valid staff alert recipients (check staff_order_alerts / email_orders in business.json)")
  })
  it("warns naming each configured recipient dropped as invalid, and still alerts the valid ones", async () => {
    getBusinessConfig.mockImplementation(() => ({ ...fixture, staff_order_alerts: ["staff-a@example.com", "staff-b.example.com"] }))
    const { container, sent, logger } = fakeContainer(order("pp_eft_eft", null))
    await orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container } as any)
    expect(sent.filter((s) => s.template === "staff-new-order").map((s) => s.to)).toEqual(["staff-a@example.com"])
    expect(logged(logger.warn)).toContain('"staff-b.example.com"')
  })
  it("passes a per-order, per-recipient idempotency key on staff alerts but not on the customer email", async () => {
    const { container, sent } = fakeContainer(order("pp_eft_eft", null))
    await orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container } as any)
    expect(sent.map((s) => s.idempotency_key)).toEqual([
      undefined,
      "staff-new-order:order_01ABC:staff-a@example.com",
      "staff-new-order:order_01ABC:staff-b@example.com",
    ])
  })
  it("logs an error with the id when the order is not found", async () => {
    const { container, sent, logger } = fakeContainer(null)
    await expect(orderPlacedHandler({ event: { data: { id: "order_GONE" } }, container } as any)).resolves.toBeUndefined()
    expect(sent).toEqual([])
    expect(logged(logger.error)).toContain("order_GONE")
  })
})

describe("payment.captured staff alerts", () => {
  it("sends the customer email first, then staff, then the dropship supplier", async () => {
    const { container, sent } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"))
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    expect(sent.map((s) => [s.to, s.template])).toEqual([
      ["jan@example.com", "payment-received"],
      ["staff-a@example.com", "staff-order-paid"],
      ["staff-b@example.com", "staff-order-paid"],
      ["tfr@example.com", "dropship-supplier"],
    ])
    expect(sent[1].data.dropship_items).toEqual([{ supplier: "The First Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }])
  })
  it("a dropship supplier with a placeholder email is warned about by name, SKU and order, and flagged to staff", async () => {
    getBusinessConfig.mockImplementation(() => ({ ...fixture, dropship_suppliers: { "TFR-": { name: "The First Responders", email: "REPLACE_ME" } } }))
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"))
    await expect(paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)).resolves.toBeUndefined()
    expect(sent.map((s) => s.template)).not.toContain("dropship-supplier")
    const warn = logged(logger.warn)
    for (const s of ["The First Responders", "TFR-", "TFR-VEH-KIT", "order_01ABC", "NOT notified"]) expect(warn).toContain(s)
    expect(sent[1].data.dropship_unnotified).toEqual([{ supplier: "The First Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }])
    expect(sent[1].data.dropship_items).toEqual([])
  })
  it("a dropship supplier email without @ (a typo) is logged as an error", async () => {
    getBusinessConfig.mockImplementation(() => ({ ...fixture, dropship_suppliers: { "TFR-": { name: "The First Responders", email: "tfr.example.com" } } }))
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"))
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    expect(sent.map((s) => s.template)).not.toContain("dropship-supplier")
    const err = logged(logger.error)
    for (const s of ["The First Responders", "TFR-", "TFR-VEH-KIT", "order_01ABC", "tfr.example.com"]) expect(err).toContain(s)
  })
  it("a malformed dropship_suppliers entry does not throw: staff are told, the error log names the prefix", async () => {
    getBusinessConfig.mockImplementation(() => ({ ...fixture, dropship_suppliers: { "TFR-": null } }))
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"))
    await expect(paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)).resolves.toBeUndefined()
    expect(sent.map((s) => s.template)).toEqual(["payment-received", "staff-order-paid", "staff-order-paid"])
    expect(sent[1].data.dropship_unnotified).toEqual([{ supplier: '"TFR-" supplier', title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }])
    const err = logged(logger.error)
    for (const s of ['"TFR-" supplier', "TFR-VEH-KIT", "order_01ABC", "not an object with name and email"]) expect(err).toContain(s)
  })
  it("a supplier with no name: staff copy uses the prefix, the supplier email does not greet them by the prefix", async () => {
    getBusinessConfig.mockImplementation(() => ({ ...fixture, dropship_suppliers: { "TFR-": { name: "REPLACE_ME", email: "tfr@example.com" } } }))
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"))
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    expect(sent[1].data.dropship_items).toEqual([{ supplier: '"TFR-" supplier', title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }])
    const toSupplier = sent.find((s) => s.template === "dropship-supplier")!
    expect(toSupplier.to).toBe("tfr@example.com")
    expect(toSupplier.data.supplier).toBeUndefined()
    expect(logged(logger.info)).toContain('notified "TFR-" supplier')
  })
  it("staff send failures do not block the dropship notification", async () => {
    const { container, sent } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"), (to) => to.startsWith("staff-"))
    await expect(paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)).resolves.toBeUndefined()
    expect(sent.map((s) => s.template)).toEqual(["payment-received", "dropship-supplier"])
  })
  it("a repeat payment.captured (duplicate ITN) re-sends the customer email but skips the staff alerts quietly", async () => {
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"))
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    expect(sent.filter((s) => s.template === "staff-order-paid").map((s) => s.idempotency_key)).toEqual([
      "staff-order-paid:order_01ABC:paid:staff-a@example.com",
      "staff-order-paid:order_01ABC:paid:staff-b@example.com",
    ])
    expect(logged(logger.info)).toContain("skipped duplicate")
    expect(logger.error).not.toHaveBeenCalled()
  })
  it("a not-yet-paid capture and the later paid capture use different keys, so the paid alert still goes out", async () => {
    const o = order("pp_payfast_payfast", null)
    const { container, sent } = fakeContainer(o)
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    o.payment_collections[0].payments[0].captured_at = "2026-11-12T09:00:00Z"
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    expect(sent.filter((s) => s.to === "staff-a@example.com" && s.template === "staff-order-paid").map((s) => s.idempotency_key)).toEqual([
      "staff-order-paid:order_01ABC:partial:staff-a@example.com",
      "staff-order-paid:order_01ABC:paid:staff-a@example.com",
    ])
  })
  it("payment not found: logs an error with the payment id and sends nothing", async () => {
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"), undefined, { payment: [] })
    await expect(paymentCapturedHandler({ event: { data: { id: "pay_GONE" } }, container } as any)).resolves.toBeUndefined()
    expect(sent).toEqual([])
    expect(logged(logger.error)).toContain("pay_GONE")
  })
  it("payment with no linked order: logs an error and alerts staff (customer paid, no order)", async () => {
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"), undefined, {
      order_payment_collection: [],
    })
    await expect(paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)).resolves.toBeUndefined()
    expect(logged(logger.error)).toContain("pay_1")
    expect(logged(logger.error)).toContain("paycol_1")
    expect(sent.map((s) => [s.to, s.template, s.idempotency_key])).toEqual([
      ["staff-a@example.com", "staff-payment-no-order", "staff-payment-no-order:pay_1:staff-a@example.com"],
      ["staff-b@example.com", "staff-payment-no-order", "staff-payment-no-order:pay_1:staff-b@example.com"],
    ])
    expect(sent[0].data).toMatchObject({
      payment_id: "pay_1",
      payment_amount: "R1 630,00",
      payment_provider: "pp_payfast_payfast",
      admin_url: "https://admin.noordkaravane.co.za",
    })
  })
  it("payment with no payment collection: logs an error and alerts staff", async () => {
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"), undefined, {
      payment: [{ id: "pay_1", payment_collection_id: null, amount: 100, currency_code: "zar", provider_id: "pp_payfast_payfast" }],
    })
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    expect(logged(logger.error)).toContain("pay_1")
    expect(sent.map((s) => s.template)).toEqual(["staff-payment-no-order", "staff-payment-no-order"])
  })
  it("order link points at a missing order: logs an error with both ids and alerts staff", async () => {
    const { container, sent, logger } = fakeContainer(order("pp_payfast_payfast", "2026-11-12T08:00:00Z"), undefined, {
      order_payment_collection: [{ order_id: "order_GONE" }],
      order: [],
    })
    await paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)
    expect(logged(logger.error)).toContain("order_GONE")
    expect(sent.map((s) => s.template)).toEqual(["staff-payment-no-order", "staff-payment-no-order"])
  })
  it("the no-order alert never throws out of the handler when sending fails", async () => {
    const { container, logger } = fakeContainer(order("pp_payfast_payfast", null), () => true, { order_payment_collection: [] })
    await expect(paymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any)).resolves.toBeUndefined()
    expect(logged(logger.error)).toContain("SMTP down")
  })
})
