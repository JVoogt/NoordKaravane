import { shippingPrice, PUDO_OPTION, TCG_OPTION, COLLECT_OPTION } from "../../modules/sa-courier/service"
import { dropshipLines, unusableDropshipLines } from "../dropship"

describe("shippingPrice", () => {
  it("collection is always free", () => expect(shippingPrice(COLLECT_OPTION, 20000, 0)).toBe(0))
  it("small parcel by Pudo and TCG", () => {
    expect(shippingPrice(PUDO_OPTION, 500, 300)).toBe(99)
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
  it("skips suppliers whose email is REPLACE_ME or has no @ (else staff are told not to pack a line nobody ships)", () => {
    expect(dropshipLines([{ variant_sku: "TFR-X" }], { "TFR-": { name: "x", email: "REPLACE_ME" } })).toHaveLength(0)
    expect(dropshipLines([{ variant_sku: "TFR-X" }], { "TFR-": { name: "x", email: "tfr.example.com" } })).toHaveLength(0)
  })
})

describe("unusableDropshipLines", () => {
  const items = [{ variant_sku: "TFR-VEH-KIT" }, { variant_sku: "TFR-BURN" }, { variant_sku: "NK-GAS-1" }]
  it("returns matched lines whose supplier email is a placeholder, blank or invalid, with the kind", () => {
    expect(unusableDropshipLines(items, { "TFR-": { name: "TFR", email: "REPLACE_ME" } })).toEqual([
      { prefix: "TFR-", supplier: { name: "TFR", email: "REPLACE_ME" }, lines: [items[0], items[1]], kind: "placeholder" },
    ])
    expect(unusableDropshipLines(items, { "TFR-": { name: "TFR", email: "{{TFR_SUPPLIER_EMAIL}}" } })[0].kind).toBe("placeholder")
    expect(unusableDropshipLines(items, { "TFR-": { name: "TFR", email: "" } })[0].kind).toBe("placeholder")
    expect(unusableDropshipLines(items, { "TFR-": { name: "TFR", email: "tfr.example.com" } })).toEqual([
      { prefix: "TFR-", supplier: { name: "TFR", email: "tfr.example.com" }, lines: [items[0], items[1]], kind: "invalid" },
    ])
  })
  it("is empty when the supplier email is usable or no line matches", () => {
    expect(unusableDropshipLines(items, { "TFR-": { name: "TFR", email: "tfr@example.com" } })).toEqual([])
    expect(unusableDropshipLines([{ variant_sku: "NK-GAS-1" }], { "TFR-": { name: "TFR", email: "REPLACE_ME" } })).toEqual([])
  })
})

describe("malformed dropship_suppliers entries", () => {
  const items = [{ variant_sku: "TFR-VEH-KIT" }, { variant_sku: "NK-GAS-1" }]
  it("a non-object entry does not throw: its lines are invalid, named after the prefix", () => {
    for (const entry of [null, "x@y.com"]) {
      const sup = { "TFR-": entry } as any
      expect(dropshipLines(items, sup)).toEqual([])
      const u = unusableDropshipLines(items, sup)
      expect(u).toHaveLength(1)
      expect(u[0].kind).toBe("invalid")
      expect(u[0].supplier.name).toBe('"TFR-" supplier')
      expect(u[0].lines).toEqual([items[0]])
    }
  })
  it("a missing, blank or placeholder supplier name falls back to the prefix", () => {
    for (const name of [undefined, "", "  ", "REPLACE_ME", "{{TFR_NAME}}"]) {
      expect(dropshipLines(items, { "TFR-": { name, email: "tfr@example.com" } } as any)[0].supplier.name).toBe('"TFR-" supplier')
      expect(unusableDropshipLines(items, { "TFR-": { name, email: "REPLACE_ME" } } as any)[0].supplier.name).toBe('"TFR-" supplier')
    }
    expect(dropshipLines(items, { "TFR-": { name: "The First Responders", email: "tfr@example.com" } })[0].supplier.name).toBe("The First Responders")
  })
})
