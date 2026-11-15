import { HOUSE_BRAND, isOrderedIn, makerBrand, makerMpn, orderedInShipDate, variantFeedTitle } from "../product-identity"

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

describe("ordered-in items", () => {
  it("reads the ordered-in note from any of the product texts", () => {
    expect(isOrderedIn("Plain description", "<h3>Stock and delivery</h3><p>Ordered in from the supplier for you.</p>")).toBe(true)
    expect(isOrderedIn("In stock at the workshop", null, undefined)).toBe(false)
  })
  it("dates the shipment seven days out, in SAST", () => {
    expect(orderedInShipDate(new Date("2026-11-15T10:00:00Z"))).toBe("2026-11-22T00:00+0200")
    expect(orderedInShipDate(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-23T00:00+0200")
  })
})
