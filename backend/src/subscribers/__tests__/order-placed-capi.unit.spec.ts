import fs from "fs"
import os from "os"
import path from "path"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import example from "../../../../config/business.example.json"

/**
 * P14: Meta CAPI runs only for NK-channel orders. The brand is read from a real config file (not a mocked
 * getBusinessConfig), because brandFor resolves the config inside lib/business.
 */
const sendPurchase = jest.fn(async () => undefined)
jest.mock("../../lib/meta-capi", () => ({ sendPurchase: (...a: unknown[]) => (sendPurchase as any)(...a) }))

const { brands: _b, ...exampleTop } = example as any
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nk-capi-"))
const cfgPath = path.join(tmp, "business.json")
fs.writeFileSync(
  cfgPath,
  JSON.stringify({
    ...exampleTop,
    email_orders: "orders@example.com",
    brands: {
      kampi: {
        sales_channel_ids: ["sc_A"],
        name: "Example Store",
        shop_url: "https://store.example.test",
        palette: { ink: "#2c2c2c", paper: "#fcf6e3", accent: "#5f6f3a", muted: "#5a5034" },
        from_name: "Example Store",
      },
    },
  })
)
process.env.BUSINESS_CONFIG_PATH = cfgPath

// eslint-disable-next-line @typescript-eslint/no-var-requires
const orderPlacedHandler = require("../order-placed").default

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const order = (salesChannelId: string) => ({
  id: "order_01ABC",
  display_id: 3,
  email: "jan@example.com",
  sales_channel_id: salesChannelId,
  total: 1630,
  metadata: { marketing_consent: true, meta_event_id: "evt_1" },
  items: [{ product_title: "Gas regulator", quantity: 1, total: 1500, product_handle: "gas-regulator" }],
  shipping_address: { first_name: "Jan", last_name: "Botha", phone: "0820000000" },
  shipping_methods: [{ name: "The Courier Guy" }],
  payment_collections: [{ id: "paycol_1", payments: [{ id: "pay_1", provider_id: "pp_eft_eft", captured_at: null }] }],
})

function fakeContainer(o: any, store: "ok" | "fails" = "ok") {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const listStores = async () => {
    if (store === "fails") throw new Error("store down")
    return [{ id: "store_1", default_sales_channel_id: "sc_WEBSHOP" }]
  }
  const query = { graph: jest.fn(async () => ({ data: [o] })) }
  const notification = { createNotifications: jest.fn(async (n: any) => n) }
  return {
    logger,
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.QUERY) return query
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      if (key === Modules.NOTIFICATION) return notification
      if (key === Modules.STORE) return { listStores }
      throw new Error(`unexpected resolve ${key}`)
    },
  }
}

beforeEach(() => sendPurchase.mockClear())

describe("order.placed Meta CAPI scope", () => {
  it("a Kampi order with consent and meta_event_id sends no CAPI Purchase", async () => {
    await orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container: fakeContainer(order("sc_A")) } as any)
    expect(sendPurchase).not.toHaveBeenCalled()
  })

  it("the same NK order sends one, with the NK checkout URL", async () => {
    await orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container: fakeContainer(order("sc_WEBSHOP")) } as any)
    expect(sendPurchase).toHaveBeenCalledTimes(1)
    expect((sendPurchase.mock.calls[0] as any[])[0]).toMatchObject({ eventId: "evt_1", sourceUrl: "https://noordkaravane.co.za/shop/checkout" })
  })
})

/** The order-placed module with a config that has no brands block at all (a fresh module graph, so a fresh config cache). */
function handlerWithoutKampiBlock() {
  const p = path.join(tmp, "business-no-kampi.json")
  fs.writeFileSync(p, JSON.stringify({ ...exampleTop, email_orders: "orders@example.com" }))
  const prev = process.env.BUSINESS_CONFIG_PATH
  process.env.BUSINESS_CONFIG_PATH = p
  let h: any
  jest.isolateModules(() => {
    h = require("../order-placed").default
    require("../../lib/business").getBusinessConfig() // prime this module graph's config cache while the path points here
  })
  process.env.BUSINESS_CONFIG_PATH = prev
  return h
}

describe("order.placed Meta CAPI decides from the real channel, not the brand block", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it("Kampi block missing, order on a non-default channel: no CAPI, and a warn naming the order and channel", async () => {
    const handler = handlerWithoutKampiBlock()
    const c = fakeContainer(order("sc_A"))
    await handler({ event: { data: { id: "order_01ABC" } }, container: c } as any)
    expect(sendPurchase).not.toHaveBeenCalled()
    expect(c.logger.warn.mock.calls.map((x: any[]) => String(x[0]))).toContain(
      "[meta-capi] order_01ABC is on sales channel sc_A, not the store default sc_WEBSHOP; no CAPI Purchase sent"
    )
  })

  it("Kampi block missing, NK default-channel order: one CAPI call (NK unchanged)", async () => {
    const handler = handlerWithoutKampiBlock()
    await handler({ event: { data: { id: "order_01ABC" } }, container: fakeContainer(order("sc_WEBSHOP")) } as any)
    expect(sendPurchase).toHaveBeenCalledTimes(1)
  })

  it("the store default cannot be read: no CAPI, and a warn", async () => {
    const c = fakeContainer(order("sc_WEBSHOP"), "fails")
    await orderPlacedHandler({ event: { data: { id: "order_01ABC" } }, container: c } as any)
    expect(sendPurchase).not.toHaveBeenCalled()
    expect(c.logger.warn.mock.calls.map((x: any[]) => String(x[0]))).toContain(
      "[meta-capi] order_01ABC is on sales channel sc_WEBSHOP, not the store default unknown; no CAPI Purchase sent"
    )
  })
})
