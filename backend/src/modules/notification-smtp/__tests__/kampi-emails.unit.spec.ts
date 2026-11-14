import fs from "fs"
import os from "os"
import path from "path"
import example from "../../../../../config/business.example.json"
import { GOLDEN_DATA } from "./__fixtures__/golden-data"

type Mods = {
  templates: typeof import("../templates")
  orders: typeof import("../../../lib/orders")
  business: typeof import("../../../lib/business")
  from: typeof import("../from")
}

const { brands: _b, ...exampleTop } = example as any

/** Made-up config: a valid Kampi block listing sc_A and sc_B, and made-up NK legal values. */
const config = (over: Record<string, unknown> = {}) => ({
  ...exampleTop,
  legal_name: "Example Legal (Pty) Ltd",
  registration_number: "2020/000000/07",
  vat_number: "4000000000",
  physical_address: "1 Example Street, Exampletown, 0000",
  email_general: "hello@example.com",
  ...over,
  brands: {
    kampi: {
      sales_channel_ids: ["sc_A", "sc_B"],
      name: "Example Store",
      shop_url: "https://store.example.test/",
      logo_url: "https://store.example.test/kampi/logo-email.png",
      palette: { ink: "#2c2c2c", paper: "#fcf6e3", accent: "#5f6f3a", muted: "#5a5034" },
      from_name: "Example Store",
      tagline: "Example camping gear",
    },
  },
})

let tmp: string
const prevPath = process.env.BUSINESS_CONFIG_PATH
const prevSite = process.env.SITE_URL

/** getBusinessConfig caches per module instance, so each config gets a fresh module graph. */
function loadWith(cfg: object): Mods {
  const p = path.join(tmp, `business-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(p, JSON.stringify(cfg))
  process.env.BUSINESS_CONFIG_PATH = p
  let m: Mods | undefined
  jest.isolateModules(() => {
    m = {
      templates: require("../templates"),
      orders: require("../../../lib/orders"),
      business: require("../../../lib/business"),
      from: require("../from"),
    }
  })
  return m!
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nk-kampi-emails-"))
  delete process.env.SITE_URL
})
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevPath === undefined) delete process.env.BUSINESS_CONFIG_PATH
  else process.env.BUSINESS_CONFIG_PATH = prevPath
  if (prevSite !== undefined) process.env.SITE_URL = prevSite
})

const order = (salesChannelId: string | null) => ({
  id: "order_01ABC",
  display_id: 3,
  email: "jan@example.com",
  sales_channel_id: salesChannelId,
  total: 1630,
  shipping_total: 130,
  metadata: {},
  items: [{ product_title: "Gas regulator", variant_title: "Standard", quantity: 2, total: 1500, variant_sku: "NK-GAS-1" }],
  shipping_address: { first_name: "Jan", last_name: "Botha", address_1: "1 Example Street", city: "Exampletown", postal_code: "0000", phone: "0820000000" },
  shipping_methods: [{ name: "The Courier Guy" }],
  payment_collections: [{ id: "paycol_1", payments: [{ id: "pay_1", provider_id: "pp_eft_eft", captured_at: null }] }],
})

const BRANDED = ["order-placed-eft", "eft-reminder", "payment-received", "order-shipped", "order-canceled"] as const
const SELLER = "Example Store, sold and fulfilled by Example Legal (Pty) Ltd"
const LEGAL_HTML = "Reg. no. 2020/000000/07 &middot; VAT no. 4000000000 &middot; 1 Example Street, Exampletown, 0000"
const LEGAL_TEXT = "Reg. no. 2020/000000/07 · VAT no. 4000000000 · 1 Example Street, Exampletown, 0000"

/** Strip the places NK's name may appear in a Kampi email: the seller line, the legal line and legal_name. */
const withoutNkIdentity = (s: string) => s.split(SELLER).join("").split("Example Legal (Pty) Ltd").join("")

describe("Kampi order emails", () => {
  it("orderEmailData: a Kampi order gets brand kampi and an order_url on the Kampi host; an NK order stays NK", () => {
    const { orders } = loadWith(config())
    const k = orders.orderEmailData(order("sc_A"))
    expect(k.brand).toBe("kampi")
    expect(k.order_url).toBe("https://store.example.test/order/confirmed/order_01ABC")
    const n = orders.orderEmailData(order("sc_WEBSHOP"))
    expect(n.brand).toBe("nk")
    expect(n.order_url).toBe("https://noordkaravane.co.za/shop/order/confirmed/order_01ABC")
    expect(orders.ORDER_FIELDS).toContain("sales_channel_id")
  })

  it.each(BRANDED)("%s: Kampi wordmark, seller line, NK legal line, Kampi links, no /shop/", (t) => {
    const { templates, orders } = loadWith(config())
    const d = { ...GOLDEN_DATA[t], ...orders.orderEmailData(order("sc_A")) }
    const r = templates.renderEmail(t, d)
    for (const body of [r.html, r.text]) {
      expect(body).toContain("Example Store")
      expect(body).toContain(SELLER)
      expect(body).toContain("Reg. no. 2020/000000/07")
      expect(body).toContain("VAT no. 4000000000")
      expect(body).toContain("1 Example Street, Exampletown, 0000")
      expect(body).not.toContain("/shop/")
      expect(withoutNkIdentity(body)).not.toContain("Noord Karavane")
    }
    expect(r.html).toContain(LEGAL_HTML)
    expect(r.text).toContain(LEGAL_TEXT)
    expect(r.html).toContain('href="https://store.example.test"')
    expect(r.html).toContain('src="https://store.example.test/kampi/logo-email.png"')
    expect(r.html).toContain("Example camping gear")
    expect(r.html).toContain("#fcf6e3")
    expect(r.html).not.toContain("#ebe6dd")
    expect(r.text.trimEnd().split("\n")).toContain("Example Store")
    expect(withoutNkIdentity(r.subject)).not.toContain("Noord Karavane")
  })

  it("every store link in a Kampi email starts with the Kampi shop URL (P3)", () => {
    const { templates, orders } = loadWith(config())
    for (const t of BRANDED) {
      const r = templates.renderEmail(t, { ...GOLDEN_DATA[t], ...orders.orderEmailData(order("sc_A")) })
      const links = [...r.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith("mailto:") && !u.includes("track.example.test"))
      for (const u of links) expect(u.startsWith("https://store.example.test")).toBe(true)
    }
  })

  it("order-canceled links back to the Kampi store root", () => {
    const { templates, orders } = loadWith(config())
    const r = templates.renderEmail("order-canceled", { ...GOLDEN_DATA["order-canceled"], ...orders.orderEmailData(order("sc_A")) })
    expect(r.html).toContain('href="https://store.example.test/"')
    expect(r.text).toContain("https://store.example.test/\n")
  })

  it("EFT emails keep NK's bank block and the NK<display_id> reference", () => {
    const { templates, orders } = loadWith(config({ bank: { account_name: "Example Legal (Pty) Ltd", bank_name: "Example Bank", account_number: "000111222", branch_code: "250655", account_type: "Cheque" } }))
    for (const t of ["order-placed-eft", "eft-reminder"] as const) {
      const r = templates.renderEmail(t, { ...GOLDEN_DATA[t], ...orders.orderEmailData(order("sc_A")) })
      expect(r.html).toContain("000111222")
      expect(r.text).toContain("Account number: 000111222\nBranch code: 250655")
      expect(r.text).toContain("Payment reference: NK3")
      expect(r.subject).toContain("NK3")
    }
  })

  it("password-reset and dropship-supplier with brand kampi still render NK (same as brand nk)", () => {
    const { templates } = loadWith(config())
    for (const t of ["password-reset", "dropship-supplier"] as const) {
      expect(templates.renderEmail(t, { ...GOLDEN_DATA[t], brand: "kampi" })).toEqual(templates.renderEmail(t, { ...GOLDEN_DATA[t], brand: "nk" }))
    }
  })

  it("an NK order with the Kampi block configured renders exactly as with no brand", () => {
    const { templates, orders } = loadWith(config())
    for (const t of BRANDED) {
      const d = { ...GOLDEN_DATA[t], ...orders.orderEmailData(order("sc_WEBSHOP")) }
      const { brand: _x, ...noBrand } = d
      expect(templates.renderEmail(t, d)).toEqual(templates.renderEmail(t, noBrand))
    }
  })
})

describe("Kampi email footer placeholders (P17)", () => {
  const legal = (over: Record<string, unknown>) => {
    const { templates, orders } = loadWith(config(over))
    return templates.renderEmail("payment-received", { ...GOLDEN_DATA["payment-received"], ...orders.orderEmailData(order("sc_A")) })
  }

  it("a placeholder registration number drops that segment and its separator", () => {
    const r = legal({ registration_number: "{{REGISTRATION_NUMBER}}" })
    expect(r.html).toContain("VAT no. 4000000000 &middot; 1 Example Street, Exampletown, 0000")
    expect(r.text).toContain("VAT no. 4000000000 · 1 Example Street, Exampletown, 0000")
    expect(r.html + r.text).not.toContain("Reg. no.")
    expect(r.html + r.text).not.toContain("{{")
  })

  it("all three placeholders: no legal line and no stray separator", () => {
    const r = legal({ registration_number: "{{REGISTRATION_NUMBER}}", vat_number: "REPLACE_ME", physical_address: "  " })
    expect(r.html + r.text).not.toMatch(/Reg\. no\.|VAT no\./)
    expect(r.text).not.toContain(" · ")
    expect(r.html).not.toMatch(/<br>\s*(&middot;|·)/)
    expect(r.html).toContain(SELLER)
  })

  it("all three real: the full line", () => {
    const r = legal({})
    expect(r.html).toContain(LEGAL_HTML)
    expect(r.text).toContain(LEGAL_TEXT)
  })
})

describe("staff alerts stay NK for a Kampi order (P16)", () => {
  it("staffOrderEmailData drops brand and labels the channel", () => {
    const { orders } = loadWith(config())
    const k = orders.staffOrderEmailData(order("sc_A"), {}, "sc_WEBSHOP")
    expect("brand" in k).toBe(false)
    expect(k.channel_label).toBe("Kampi")
    expect(k.order_url).toBe("https://store.example.test/order/confirmed/order_01ABC")
    const n = orders.staffOrderEmailData(order("sc_WEBSHOP"), {}, "sc_WEBSHOP")
    expect("brand" in n).toBe(false)
    expect(n.channel_label).toBe("NK")
  })

  it.each(["staff-new-order", "staff-order-paid"] as const)("%s: NK shell, [Kampi] subject, Channel: Kampi", (t) => {
    const { templates, orders, business, from } = loadWith(config())
    const k = orders.staffOrderEmailData(order("sc_A"), {}, "sc_WEBSHOP")
    const r = templates.renderEmail(t, k)
    const nk = templates.renderEmail(t, { ...k, channel_label: "NK" })
    expect(r.subject.startsWith("[Kampi] ")).toBe(true)
    expect(r.subject.slice("[Kampi] ".length)).toBe(nk.subject)
    expect(r.html).toContain("Channel: Kampi")
    expect(r.text).toContain("Channel: Kampi")
    expect(r.html.replace("Channel: Kampi", "")).toBe(nk.html.replace("Channel: NK", ""))
    expect(r.text.replace("Channel: Kampi", "")).toBe(nk.text.replace("Channel: NK", ""))
    expect(r.html).toContain("#ebe6dd")
    expect(r.html).not.toContain("Example Store")
    expect(from.fromHeader("NK <a@b.co>", business.brandByKey(k.brand))).toBe("NK <a@b.co>")
    expect(from.fromHeader(undefined, business.brandByKey(k.brand))).toBe(from.DEFAULT_FROM)
  })
})

describe("staff channel label comes from the real channel (P1 review)", () => {
  let warn: jest.SpyInstance
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it("a channel that is neither the default nor Kampi: Unknown channel (<id>), and a warn with the order and channel ids", () => {
    const { orders } = loadWith(config())
    expect(orders.staffOrderEmailData(order("sc_ZZZ"), {}, "sc_WEBSHOP").channel_label).toBe("Unknown channel (sc_ZZZ)")
    expect(warn.mock.calls.map((x) => String(x[0]))).toContain("[staff-alert] order order_01ABC is on unknown sales channel sc_ZZZ (store default sc_WEBSHOP)")
    expect(orders.staffOrderEmailData(order(null), {}, "sc_WEBSHOP").channel_label).toBe("Unknown channel (none)")
  })

  it("with no known default channel, an NK-looking order is Unknown, never NK", () => {
    const { orders } = loadWith(config())
    expect(orders.staffOrderEmailData(order("sc_WEBSHOP"), {}, null).channel_label).toBe("Unknown channel (sc_WEBSHOP)")
    expect(orders.staffOrderEmailData(order("sc_A"), {}, null).channel_label).toBe("Kampi")
  })

  it("a Kampi block with a broken palette still labels a Kampi order Kampi", () => {
    const cfg: any = config()
    cfg.brands.kampi.palette = { ink: "red" }
    const { orders } = loadWith(cfg)
    expect(orders.staffOrderEmailData(order("sc_A"), {}, "sc_WEBSHOP").channel_label).toBe("Kampi")
  })

  it("an Unknown label renders escaped in the NK staff alert with no [Kampi] tag", () => {
    const { templates, orders } = loadWith(config())
    const r = templates.renderEmail("staff-new-order", orders.staffOrderEmailData(order("sc_ZZZ"), {}, "sc_WEBSHOP"))
    expect(r.subject.startsWith("[Kampi]")).toBe(false)
    expect(r.html).toContain("Channel: Unknown channel (sc_ZZZ)")
    expect(r.text).toContain("Channel: Unknown channel (sc_ZZZ)")
  })
})

describe("bank block colour", () => {
  it("a Kampi EFT bank panel is set off from the paper shell by a 1px border in the brand muted colour, not NK's #e8e0cc", () => {
    const { templates, orders } = loadWith(config())
    const r = templates.renderEmail("order-placed-eft", orders.orderEmailData(order("sc_A")))
    expect(r.html).not.toContain("#e8e0cc")
    expect(r.html).toContain("background:#fcf6e3;border:1px solid #5a5034;width:100%;")
  })
})
