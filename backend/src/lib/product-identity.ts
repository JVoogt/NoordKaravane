/**
 * Maker brand and manufacturer part number for the product feeds.
 * Google Merchant Center and Meta both reject or limit items whose brand is the shop's name
 * when the product is another maker's. The catalogue carries no brand field, so the maker is
 * read from the first word of the title; anything unknown stays the house brand.
 */
export const HOUSE_BRAND = "Noord Karavane"

const MAKERS: Record<string, string> = {
  victron: "Victron Energy",
  renogy: "Renogy",
  lumeno: "Lumeno",
  ring: "Ring",
  agv: "AGV",
  rambler: "Rambler",
  campaholix: "Campaholix",
  kampi: "Kampi",
}

export function makerBrand(title: unknown): string {
  const first = String(title ?? "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? ""
  return MAKERS[first] ?? HOUSE_BRAND
}

/**
 * Supplier SKUs for Victron (`VIC-<part number>`) and Renogy (`LEI-<Renogy SKU>`) wrap the maker's own
 * part number; everything else has no known MPN.
 */
export function makerMpn(title: unknown, sku: unknown): string | null {
  const s = String(sku ?? "").trim()
  const brand = makerBrand(title)
  if (brand === "Victron Energy" && /^VIC-[A-Z0-9]{6,}$/i.test(s)) return s.slice(4)
  if (brand === "Renogy" && /^LEI-.+/i.test(s)) return s.slice(4)
  return null
}

/** One feed title per variant: the product title plus the variant's option values, so siblings differ. */
export function variantFeedTitle(title: unknown, optionValues: unknown[]): string {
  const t = String(title ?? "").trim()
  const vals = optionValues.map((v) => String(v ?? "").trim()).filter((v) => v && !/^default( title| variant)?$/i.test(v))
  return (vals.length ? `${t} (${vals.join(", ")})` : t).slice(0, 150)
}

/** Items the shop does not hold: the product copy says they are ordered in from the supplier. */
export function isOrderedIn(...texts: unknown[]): boolean {
  return texts.some((t) => /ordered in from (the|our) supplier/i.test(String(t ?? "")))
}

/** Longest handling time the shop quotes for an ordered-in item, in calendar days (5 working days). */
export const ORDERED_IN_DAYS = 7

/** Google's availability_date for a backorder item: the day it is expected to ship, ISO 8601 in SAST. */
export function orderedInShipDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + ORDERED_IN_DAYS * 86_400_000 + 2 * 3_600_000)
  return `${d.toISOString().slice(0, 10)}T00:00+0200`
}
