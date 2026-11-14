import example from "../../../../config/business.example.json"

/** The invalid-block log fires once per process, so each case loads a fresh copy of the module. */
function load(): typeof import("../business") {
  let mod: typeof import("../business") | undefined
  jest.isolateModules(() => {
    mod = require("../business")
  })
  return mod!
}

const kampiBlock = (over: Record<string, unknown> = {}) => ({
  sales_channel_ids: ["sc_A", "sc_B"],
  name: "Example Store",
  shop_url: "https://store.example.test",
  logo_url: "https://store.example.test/kampi/logo-email.png",
  palette: { ink: "#111111", paper: "#fafafa", accent: "#336699", muted: "#666666" },
  from_name: "Example Store",
  ...over,
})

const { brands: _exampleBrands, ...exampleTop } = example as any

const cfgWith = (block: unknown, top: Record<string, unknown> = {}): any => ({
  ...exampleTop,
  legal_name: "Example Legal (Pty) Ltd",
  ...top,
  ...(block === undefined ? {} : { brands: { kampi: block } }),
})

const NK_URL = "https://noordkaravane.co.za/shop"

describe("brand context", () => {
  const prevSite = process.env.SITE_URL
  let error: jest.SpyInstance

  beforeEach(() => {
    delete process.env.SITE_URL
    error = jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    jest.restoreAllMocks()
    if (prevSite === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = prevSite
  })

  it("shopUrl() with no channel is exactly today's NK shop URL", () => {
    const { shopUrl } = load()
    expect(shopUrl()).toBe(NK_URL)
    expect(shopUrl(undefined)).toBe(NK_URL)
    expect(shopUrl(null)).toBe(NK_URL)
    process.env.SITE_URL = "https://staging.example.test/"
    expect(shopUrl()).toBe("https://staging.example.test/shop")
  })

  it("no brands block: NK, and the missing block is logged once", () => {
    const { brandFor } = load()
    brandFor("sc_B", cfgWith(undefined))
    const b = brandFor("sc_A", cfgWith(undefined))
    expect(b).toEqual({
      key: "nk",
      name: "Noord Karavane",
      shopUrl: NK_URL,
      logoUrl: null,
      palette: { ink: "#0e0f11", paper: "#ebe6dd", accent: "#e95e1d", muted: "#5f594d" },
      fromName: "Noord Karavane",
      sellerLine: null,
    })
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toBe("[business] brands.kampi invalid: missing; Kampi orders use NK branding")
  })

  const invalid: [string, unknown][] = [
    ["the example (placeholder) block", (example as any).brands?.kampi],
    ["a block missing palette", kampiBlock({ palette: undefined })],
    ["a shop_url that is not https", kampiBlock({ shop_url: "http://store.example.test" })],
    ["an empty sales_channel_ids", kampiBlock({ sales_channel_ids: [] })],
    ["a placeholder name", kampiBlock({ name: "{{STORE_NAME}}" })],
    ["a bad palette colour", kampiBlock({ palette: { ink: "#111", paper: "#fafafa", accent: "#336699", muted: "#666666" } })],
    ["a channel id that is not sc_", kampiBlock({ sales_channel_ids: ["sc_A", "pk_123"] })],
    ["an empty from_name", kampiBlock({ from_name: "   " })],
  ]
  it.each(invalid)("%s: NK, logged once across two calls", (_label, block) => {
    const { brandFor, kampiBrandConfig } = load()
    const cfg = cfgWith(block)
    expect(kampiBrandConfig(cfg)).toBeNull()
    expect(brandFor("sc_A", cfg).key).toBe("nk")
    expect(brandFor("sc_B", cfg).key).toBe("nk")
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toMatch(/^\[business\] brands\.kampi invalid: .+; Kampi orders use NK branding$/)
  })

  const blankOptional: [string, Record<string, unknown>, string][] = [
    ["a blank tagline", { tagline: "" }, "tagline"],
    ["a placeholder instagram", { instagram: "{{X}}" }, "instagram"],
    ["a blank logo_url", { logo_url: "" }, "logo_url"],
    ["a placeholder logo_url", { logo_url: "{{LOGO}}" }, "logo_url"],
  ]
  it.each(blankOptional)("%s is dropped with one warn and the block stays valid", (_label, over, key) => {
    const { brandFor, kampiBrandConfig } = load()
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const cfg = cfgWith(kampiBlock({ tagline: "Example gear", ...over }))
    const k = kampiBrandConfig(cfg)
    kampiBrandConfig(cfg)
    expect(k).not.toBeNull()
    expect(brandFor("sc_A", cfg).key).toBe("kampi")
    expect(key in k!).toBe(key === "logo_url")
    if (key === "logo_url") {
      expect(k!.logo_url).toBeNull()
      expect(brandFor("sc_A", cfg).logoUrl).toBeNull()
    }
    if (key === "tagline") expect(k!.tagline).toBeUndefined()
    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toBe(`[business] brands.kampi.${key} ignored: blank or placeholder`)
  })

  it("a non-blank logo_url that is not https stays fatal", () => {
    const { kampiBrandConfig } = load()
    expect(kampiBrandConfig(cfgWith(kampiBlock({ logo_url: "http://store.example.test/logo.png" })))).toBeNull()
    expect(String(error.mock.calls[0][0])).toMatch(/^\[business\] brands\.kampi invalid: logo_url/)
  })

  it("kampiChannelIds reads only sales_channel_ids: a broken palette still yields the ids", () => {
    const { kampiChannelIds } = load()
    expect(kampiChannelIds(cfgWith(kampiBlock({ palette: { ink: "red" } })))).toEqual(["sc_A", "sc_B"])
    expect(kampiChannelIds(cfgWith(kampiBlock({ name: "" })))).toEqual(["sc_A", "sc_B"])
  })

  it("kampiChannelIds is empty for a missing block, placeholder ids or a non-list", () => {
    const { kampiChannelIds } = load()
    expect(kampiChannelIds(cfgWith(undefined))).toEqual([])
    expect(kampiChannelIds(example as any)).toEqual([])
    expect(kampiChannelIds(cfgWith(kampiBlock({ sales_channel_ids: "sc_A" })))).toEqual([])
    expect(kampiChannelIds(cfgWith(kampiBlock({ sales_channel_ids: ["sc_A", "{{ID}}"] })))).toEqual([])
  })

  it("orderChannel: the store default is nk, a configured Kampi id is kampi, anything else unknown", () => {
    const { orderChannel } = load()
    const cfg = cfgWith(kampiBlock({ palette: undefined }))
    expect(orderChannel("sc_D", "sc_D", cfg)).toBe("nk")
    expect(orderChannel("sc_A", "sc_D", cfg)).toBe("kampi")
    expect(orderChannel("sc_Z", "sc_D", cfg)).toBe("unknown")
    expect(orderChannel(null, "sc_D", cfg)).toBe("unknown")
    expect(orderChannel("sc_D", null, cfg)).toBe("unknown")
    expect(orderChannel("sc_A", "sc_D", cfgWith(undefined))).toBe("unknown")
  })

  it("the committed example config holds a placeholder brands.kampi block, which is invalid by design", () => {
    expect((example as any).brands?.kampi?.sales_channel_ids).toEqual(["sc_REPLACE_ME"])
    expect(load().kampiBrandConfig(example as any)).toBeNull()
  })

  it("a valid block: its ids resolve to Kampi, anything else to NK", () => {
    const { brandFor } = load()
    const cfg = cfgWith(kampiBlock())
    expect(brandFor("sc_A", cfg).key).toBe("kampi")
    expect(brandFor("sc_B", cfg).key).toBe("kampi")
    expect(brandFor("sc_C", cfg).key).toBe("nk")
    expect(brandFor(null, cfg).key).toBe("nk")
    expect(brandFor(undefined, cfg).key).toBe("nk")
    expect(error).not.toHaveBeenCalled()
  })

  it("the Kampi brand carries the block's values and the seller line", () => {
    const { brandFor } = load()
    expect(brandFor("sc_A", cfgWith(kampiBlock()))).toEqual({
      key: "kampi",
      name: "Example Store",
      shopUrl: "https://store.example.test",
      logoUrl: "https://store.example.test/kampi/logo-email.png",
      palette: { ink: "#111111", paper: "#fafafa", accent: "#336699", muted: "#666666" },
      fromName: "Example Store",
      sellerLine: "Example Store, sold and fulfilled by Example Legal (Pty) Ltd",
    })
  })

  it("Kampi shopUrl strips a trailing slash; logo_url null or absent is null", () => {
    const { brandFor } = load()
    expect(brandFor("sc_A", cfgWith(kampiBlock({ shop_url: "https://store.example.test/" }))).shopUrl).toBe("https://store.example.test")
    expect(brandFor("sc_A", cfgWith(kampiBlock({ logo_url: null }))).logoUrl).toBeNull()
    expect(brandFor("sc_A", cfgWith(kampiBlock({ logo_url: undefined }))).logoUrl).toBeNull()
  })

  it("a placeholder legal_name: the seller line uses the top-level brand", () => {
    const { brandFor } = load()
    const b = brandFor("sc_A", cfgWith(kampiBlock(), { legal_name: "REPLACE_ME", brand: "Example Workshop" }))
    expect(b.sellerLine).toBe("Example Store, sold and fulfilled by Example Workshop")
  })

  it("brandByKey: kampi needs a valid block; anything else is NK", () => {
    const { brandByKey } = load()
    expect(brandByKey("kampi", cfgWith(kampiBlock())).key).toBe("kampi")
    expect(brandByKey("kampi", cfgWith(undefined)).key).toBe("nk")
    expect(brandByKey("nk", cfgWith(kampiBlock())).key).toBe("nk")
    expect(brandByKey(undefined, cfgWith(kampiBlock())).key).toBe("nk")
    expect(brandByKey(null).key).toBe("nk")
  })

  it("shopUrl(channel) follows the channel's brand, read from the loaded config", () => {
    const { shopUrl } = load()
    // The bundled example config has only a placeholder block, so every channel is NK.
    expect(shopUrl("sc_A")).toBe(NK_URL)
  })

  it("brandFor and brandByKey never throw, even when reading the config throws: NK", () => {
    const { brandFor, brandByKey } = load()
    const exploding: any = {
      get brands() {
        throw new Error("config exploded")
      },
    }
    expect(brandFor("sc_A", exploding).key).toBe("nk")
    expect(brandByKey("kampi", exploding).key).toBe("nk")
  })

  it("usableValue: trimmed string, or null for blanks, placeholders and non-strings", () => {
    const { usableValue } = load()
    expect(usableValue(" x ")).toBe("x")
    for (const v of ["", "  ", "{{VAT_NUMBER}}", "REPLACE_ME", "sc_REPLACE_ME", null, undefined, 42, {}]) expect(usableValue(v)).toBeNull()
  })
})
