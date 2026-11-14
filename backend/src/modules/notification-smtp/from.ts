import type { Brand } from "../../lib/business"

export const DEFAULT_FROM = "Noord Karavane <orders@noordkaravane.co.za>"

/**
 * The From header for an email sent under this brand. base is SMTP_FROM (the provider's `from` option). NK gets
 * base (or the default) unchanged. Another brand keeps the address, which must stay the authenticated sender, and
 * shows its own display name: `"<fromName>" <address>`, with quotes, backslashes, angle brackets and line breaks
 * removed from the name. Pure.
 */
export function fromHeader(base: string | undefined, brand: Brand): string {
  const value = base || DEFAULT_FROM
  if (brand.key === "nk") return value
  const angle = value.match(/<([^<>]+)>/)
  const address = (angle ? angle[1] : value).trim()
  const name = brand.fromName.replace(/["\\<>\r\n]/g, "").trim()
  return `"${name}" <${address}>`
}
