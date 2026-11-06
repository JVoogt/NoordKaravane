import { shippingPrice, PUDO_OPTION, TCG_OPTION, COLLECT_OPTION } from "../../modules/sa-courier/service"
import { dropshipLines } from "../dropship"

describe("shippingPrice", () => {
  it("collection is always free", () => expect(shippingPrice(COLLECT_OPTION, 20000, 0)).toBe(0))
  it("small parcel by Pudo and TCG", () => {
    expect(shippingPrice(PUDO_OPTION, 500, 300)).toBe(60)
    expect(shippingPrice(TCG_OPTION, 500, 300)).toBe(85)
  })
  it("weight bands for TCG", () => {
    expect(shippingPrice(TCG_OPTION, 3000, 600)).toBe(130)
    expect(shippingPrice(TCG_OPTION, 15000, 600)).toBe(350)
  })
  it("pudo falls back to TCG pricing when too heavy (never throws)", () =>
    expect(shippingPrice(PUDO_OPTION, 3000, 600)).toBe(130))
  it("free over the threshold, but not for bulky freight", () => {
    expect(shippingPrice(TCG_OPTION, 3000, 2500)).toBe(0)
    expect(shippingPrice(TCG_OPTION, 15000, 9750)).toBe(350)
  })
})

describe("dropshipLines", () => {
  const sup = { "TFR-": { name: "The First Responders", email: "tfr@example.com" } }
  it("groups TFR lines and ignores others", () => {
    const g = dropshipLines([{ variant_sku: "TFR-VEH-KIT" }, { variant_sku: "LUMENO-882" }], sup)
    expect(g).toHaveLength(1)
    expect(g[0].lines).toHaveLength(1)
  })
  it("skips suppliers whose email is still a placeholder", () =>
    expect(dropshipLines([{ variant_sku: "TFR-X" }], { "TFR-": { name: "x", email: "{{TFR_SUPPLIER_EMAIL}}" } })).toHaveLength(0))
})
