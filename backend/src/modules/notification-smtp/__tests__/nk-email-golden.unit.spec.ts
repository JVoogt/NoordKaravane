import fs from "fs"
import path from "path"
import { GOLDEN_DATA, GOLDEN_TEMPLATES, STAFF_TEMPLATES, type GoldenTemplate } from "./__fixtures__/golden-data"

/**
 * P1, NK email invariance: every template rendered for NK (no brand, or brand "nk") equals the fixture rendered on
 * the code before the Kampi brand work, byte for byte. The two staff order alerts gain exactly one "Channel: NK"
 * line, which is removed before comparing. Rendered with the example config and SITE_URL unset, as the fixtures were.
 */
process.env.BUSINESS_CONFIG_PATH = path.resolve(__dirname, "../../../../../config/business.example.json")
delete process.env.SITE_URL

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderEmail } = require("../templates") as typeof import("../templates")

const dir = path.join(__dirname, "__fixtures__", "nk-golden")
const fixture = (t: GoldenTemplate) => ({
  subject: fs.readFileSync(path.join(dir, `${t}.subject.txt`), "utf8"),
  html: fs.readFileSync(path.join(dir, `${t}.html`), "utf8"),
  text: fs.readFileSync(path.join(dir, `${t}.txt`), "utf8"),
})

const CHANNEL_HTML = '<p style="margin:0 0 16px 0;">Channel: NK</p>'
const CHANNEL_TEXT = "Channel: NK\n"
const ORDER_ALERTS: GoldenTemplate[] = ["staff-new-order", "staff-order-paid"]

const count = (s: string, needle: string) => s.split(needle).length - 1

describe("NK golden emails", () => {
  const customer = GOLDEN_TEMPLATES.filter((t) => !STAFF_TEMPLATES.includes(t))

  it.each(customer)("%s: identical to the fixture with no brand and with brand nk", (t) => {
    const want = fixture(t)
    expect(renderEmail(t, GOLDEN_DATA[t])).toEqual(want)
    expect(renderEmail(t, { ...GOLDEN_DATA[t], brand: "nk" })).toEqual(want)
  })

  it.each(ORDER_ALERTS)("%s: identical to the fixture once its one Channel: NK line is removed", (t) => {
    const want = fixture(t)
    for (const d of [GOLDEN_DATA[t], { ...GOLDEN_DATA[t], channel_label: "NK" as const }, { ...GOLDEN_DATA[t], brand: "nk" as const }]) {
      const r = renderEmail(t, d)
      expect(count(r.html, CHANNEL_HTML)).toBe(1)
      expect(count(r.text, CHANNEL_TEXT)).toBe(1)
      expect(r.subject).toBe(want.subject)
      expect(r.html.replace(CHANNEL_HTML, "")).toBe(want.html)
      expect(r.text.replace(CHANNEL_TEXT, "")).toBe(want.text)
    }
  })

  it("staff-payment-no-order (no order, so no channel): identical to the fixture", () => {
    expect(renderEmail("staff-payment-no-order", GOLDEN_DATA["staff-payment-no-order"])).toEqual(fixture("staff-payment-no-order"))
  })

  it("the fixtures hold example values only: placeholders present, no em dash", () => {
    const all = GOLDEN_TEMPLATES.map((t) => Object.values(fixture(t)).join("\n")).join("\n")
    expect(all).toContain("REPLACE_ME")
    expect(all).not.toContain("\u2014")
    expect(all).not.toContain("&" + "mdash;")
  })
})
