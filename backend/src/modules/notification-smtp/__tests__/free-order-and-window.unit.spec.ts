import fs from "fs"
import os from "os"
import path from "path"
import example from "../../../../../config/business.example.json"
import { GOLDEN_DATA } from "./__fixtures__/golden-data"

type Mods = { templates: typeof import("../templates"); orders: typeof import("../../../lib/orders") }

const { brands: _b, ...exampleTop } = example as any
const config = (over: Record<string, unknown> = {}) => ({
  ...exampleTop,
  ...over,
  brands: {
    kampi: {
      sales_channel_ids: ["sc_A"],
      name: "Example Store",
      shop_url: "https://store.example.test/",
      logo_url: "https://store.example.test/kampi/logo-email.png",
      palette: { ink: "#2c2c2c", paper: "#fcf6e3", accent: "#5f6f3a", muted: "#5a5034" },
      from_name: "Example Store",
    },
  },
})

let tmp: string
const prevPath = process.env.BUSINESS_CONFIG_PATH

/** getBusinessConfig caches per module instance, so each config gets a fresh module graph. */
function loadWith(cfg: object): Mods {
  const p = path.join(tmp, `business-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(p, JSON.stringify(cfg))
  process.env.BUSINESS_CONFIG_PATH = p
  let m: Mods | undefined
  jest.isolateModules(() => {
    m = { templates: require("../templates"), orders: require("../../../lib/orders") }
  })
  return m!
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nk-free-order-"))
})
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevPath === undefined) delete process.env.BUSINESS_CONFIG_PATH
  else process.env.BUSINESS_CONFIG_PATH = prevPath
})

const order = (over: Record<string, unknown> = {}) => ({
  id: "order_01FREE",
  display_id: 5,
  email: "host@example.com",
  sales_channel_id: "sc_A",
  total: 0,
  shipping_total: 0,
  metadata: {},
  items: [{ product_title: "Host Sticker Kit", variant_title: "White / Khaki", quantity: 1, total: 0 }],
  shipping_address: { first_name: "Anna" },
  shipping_methods: [{ name: "Collect from the workshop" }],
  payment_collections: [],
  ...over,
})

const EFT = [{ id: "paycol_1", payments: [{ id: "pay_1", provider_id: "pp_eft_eft", amount: 85, captured_at: null }] }]

describe("isFreeOrder", () => {
  it("is true for a R0 order with no payment", () => {
    const { orders } = loadWith(config())
    expect(orders.isFreeOrder(order())).toBe(true)
  })
  it("is false for an order with a payment, an order with a total, and an order whose total is unknown", () => {
    const { orders } = loadWith(config())
    expect(orders.isFreeOrder(order({ total: 85, payment_collections: EFT }))).toBe(false)
    expect(orders.isFreeOrder(order({ payment_collections: EFT }))).toBe(false)
    expect(orders.isFreeOrder(order({ total: 85 }))).toBe(false)
    expect(orders.isFreeOrder(order({ total: undefined }))).toBe(false)
  })
})

describe("order-placed-free", () => {
  it("confirms a Kampi order with nothing to pay: no bank details, no deadline, the order link, collection wording", () => {
    const { templates, orders } = loadWith(config())
    const r = templates.renderEmail("order-placed-free", orders.orderEmailData(order()))
    expect(r.subject).toBe("Order NK5 is confirmed: nothing to pay")
    for (const s of [r.html, r.text]) {
      expect(s).toContain("nothing to pay")
      expect(s).toContain("ready to collect")
      expect(s).not.toMatch(/Account number|pay by EFT|within \d+/i)
      expect(s).not.toContain("—")
    }
    expect(r.html).toContain('href="https://store.example.test/order/confirmed/order_01FREE"')
  })

  it("says the order ships when it is not collected", () => {
    const { templates, orders } = loadWith(config())
    const r = templates.renderEmail("order-placed-free", orders.orderEmailData(order({ shipping_methods: [{ name: "Pudo Locker" }] })))
    expect(r.text).toContain("tracking details")
    expect(r.text).not.toContain("ready to collect")
  })
})

describe("staff alert for a free order", () => {
  it("says nothing to pay instead of a pending payment", () => {
    const { templates, orders } = loadWith(config())
    const d = orders.staffOrderEmailData(order(), {}, "sc_WEBSHOP")
    expect(d.nothing_to_pay).toBe(true)
    const r = templates.renderEmail("staff-new-order", d)
    expect(r.subject).toContain("nothing to pay")
    expect(r.text).toContain("Nothing to pay: a discount code covers the whole order.")
    expect(r.text).not.toMatch(/pending|Awaiting/)
  })

  it("the ready-to-ship alert treats a free order as ready, not as not fully paid", () => {
    const { templates, orders } = loadWith(config())
    const d = orders.staffOrderEmailData(order({ metadata: { collect_from_workshop: true } }), {}, "sc_WEBSHOP")
    const r = templates.renderEmail("staff-order-paid", d)
    expect(r.subject).toBe("[Kampi] Nothing to pay: order NK5 ready to ship (R0,00)")
    expect(r.text).toContain("A discount code covers order NK5 in full, so there is nothing to pay. Next steps:")
    expect(r.text).toContain("Prepare the order for collection at the workshop")
    expect(r.text).not.toContain("not fully paid")
  })

  it("an EFT order keeps its awaiting-payment line", () => {
    const { templates, orders } = loadWith(config())
    const d = orders.staffOrderEmailData(order({ total: 85, payment_collections: EFT }), {}, "sc_WEBSHOP")
    expect(d.nothing_to_pay).toBeUndefined()
    expect(templates.renderEmail("staff-new-order", d).text).toContain("Awaiting EFT payment")
  })
})

describe("EFT window wording", () => {
  it("a 5-day window reads as days in the order, reminder and cancel emails", () => {
    const { templates } = loadWith(config({ eft_payment_window_hours: 120, eft_reminder_after_hours: 24 }))
    const placed = templates.renderEmail("order-placed-eft", GOLDEN_DATA["order-placed-eft"])
    expect(placed.text).toContain("Please pay by EFT within 5 days")
    expect(placed.text).toContain("Unpaid orders are released after 5 days")
    expect(placed.text).not.toContain("120 hours")
    const reminder = templates.renderEmail("eft-reminder", { ...GOLDEN_DATA["eft-reminder"], hours_left: 95 })
    expect(reminder.text).toContain("roughly 4 more days")
    const canceled = templates.renderEmail("order-canceled", GOLDEN_DATA["order-canceled"])
    expect(canceled.text).toContain("within 5 days")
  })

  it("the 48-hour window still reads as hours", () => {
    const { templates } = loadWith(config({ eft_payment_window_hours: 48 }))
    expect(templates.renderEmail("order-placed-eft", GOLDEN_DATA["order-placed-eft"]).text).toContain("within 48 hours")
  })
})
