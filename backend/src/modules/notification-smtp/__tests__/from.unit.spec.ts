import { DEFAULT_FROM, fromHeader } from "../from"
import { NK_PALETTE, type Brand } from "../../../lib/business"

const nk: Brand = { key: "nk", name: "Noord Karavane", shopUrl: "https://noordkaravane.co.za/shop", logoUrl: null, palette: NK_PALETTE, fromName: "Noord Karavane", sellerLine: null }
const kampi = (fromName = "Example Store"): Brand => ({
  key: "kampi",
  name: "Example Store",
  shopUrl: "https://store.example.test",
  logoUrl: null,
  palette: NK_PALETTE,
  fromName,
  sellerLine: "Example Store, sold and fulfilled by Example Legal (Pty) Ltd",
})

describe("fromHeader", () => {
  it("NK: SMTP_FROM unchanged, or the default", () => {
    expect(DEFAULT_FROM).toBe("Noord Karavane <orders@noordkaravane.co.za>")
    expect(fromHeader(undefined, nk)).toBe(DEFAULT_FROM)
    expect(fromHeader("", nk)).toBe(DEFAULT_FROM)
    expect(fromHeader("NK <a@b.co>", nk)).toBe("NK <a@b.co>")
    expect(fromHeader("a@b.co", nk)).toBe("a@b.co")
  })

  it("Kampi: the brand's display name on the authenticated address", () => {
    expect(fromHeader("NK <a@b.co>", kampi())).toBe('"Example Store" <a@b.co>')
    expect(fromHeader("a@b.co", kampi())).toBe('"Example Store" <a@b.co>')
    expect(fromHeader("  a@b.co  ", kampi())).toBe('"Example Store" <a@b.co>')
    expect(fromHeader(undefined, kampi())).toBe('"Example Store" <orders@noordkaravane.co.za>')
  })

  it("Kampi: quotes, angle brackets, backslashes and line breaks are removed from the name", () => {
    expect(fromHeader("NK <a@b.co>", kampi('Ex"am<ple>\\ St\nore\r'))).toBe('"Example Store" <a@b.co>')
  })
})
