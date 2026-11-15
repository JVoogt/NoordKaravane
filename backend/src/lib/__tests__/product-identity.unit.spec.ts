import { HOUSE_BRAND, makerBrand, makerMpn, variantFeedTitle } from "../product-identity"

describe("makerBrand", () => {
  it("names the maker from the first word of the title", () => {
    expect(makerBrand("Victron SmartSolar MPPT 75/10 to 150/45 charge controller")).toBe("Victron Energy")
    expect(makerBrand("Renogy Rover Li 30A MPPT Solar Charge Controller")).toBe("Renogy")
    expect(makerBrand("  lumeno 12V Slimline Lithium Battery")).toBe("Lumeno")
  })
  it("keeps the house brand for anything unknown or empty", () => {
    expect(makerBrand("Window rubber seal")).toBe(HOUSE_BRAND)
    expect(makerBrand("“Braai Rules” T-shirt")).toBe(HOUSE_BRAND)
    expect(makerBrand(null)).toBe(HOUSE_BRAND)
  })
})

describe("makerMpn", () => {
  it("unwraps Victron and Renogy part numbers from the supplier SKU", () => {
    expect(makerMpn("Victron SmartSolar MPPT", "VIC-SCC110030210")).toBe("SCC110030210")
    expect(makerMpn("Renogy DC to DC battery charger with MPPT", "LEI-RBC50D1S")).toBe("RBC50D1S")
  })
  it("gives no MPN for a generated or foreign SKU", () => {
    expect(makerMpn("Victron SmartSolar MPPT", "VIC-SMARTSOLAR-MPPT-SMALL")).toBeNull()
    expect(makerMpn("Lumeno Battery", "LEI-123")).toBeNull()
    expect(makerMpn("Kampi Sticker Pack", "NK-151")).toBeNull()
    expect(makerMpn("Victron thing", null)).toBeNull()
  })
})

describe("variantFeedTitle", () => {
  it("adds the option values so sibling variants differ", () => {
    expect(variantFeedTitle("Victron SmartSolar MPPT", ["100/30"])).toBe("Victron SmartSolar MPPT (100/30)")
    expect(variantFeedTitle("Soft Shell Jacket", ["Khaki", "XL"])).toBe("Soft Shell Jacket (Khaki, XL)")
  })
  it("leaves a single-variant product's title alone and caps the length", () => {
    expect(variantFeedTitle("Bos Braai", ["Default"])).toBe("Bos Braai")
    expect(variantFeedTitle("Bos Braai", [])).toBe("Bos Braai")
    expect(variantFeedTitle("x".repeat(200), ["a"]).length).toBe(150)
  })
})
