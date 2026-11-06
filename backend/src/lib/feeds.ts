import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { shopUrl, siteUrl } from "./business"

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

async function loadProducts(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "subtitle",
      "description",
      "thumbnail",
      "status",
      "updated_at",
      "metadata",
      "categories.name",
      "images.url",
      "variants.id",
      "variants.sku",
      "variants.title",
      "variants.options.value",
      "variants.options.option.title",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    filters: { status: "published" },
  })
  return data as any[]
}

function optionValue(variant: any, title: string): string {
  const o = (variant.options ?? []).find((x: any) => x.option?.title?.toLowerCase() === title.toLowerCase())
  return o?.value ?? ""
}

function variantPrice(variant: any): number | null {
  const p = (variant.prices ?? []).find((x: any) => String(x.currency_code).toLowerCase() === "zar")
  return p ? Number(p.amount) : null
}

/** RSS 2.0 with the g: namespace, used by both Meta Commerce Manager and Google Merchant Center. */
export async function buildProductFeed(container: MedusaContainer, channel: "meta" | "google"): Promise<string> {
  const base = siteUrl()
  const products = await loadProducts(container)
  const items: string[] = []
  for (const p of products) {
    const link = `${shopUrl()}/${p.handle}/`
    const img = p.images?.[0]?.url || p.thumbnail
    const cat = (p.categories ?? [])[0]?.name ?? ""
    const desc = (p.description || p.subtitle || p.title).toString().replace(/\s+/g, " ").trim().slice(0, 4900)
    for (const v of p.variants ?? []) {
      const price = variantPrice(v)
      if (price === null) continue // no ZAR price: not sellable, keep out of the feed
      const color = optionValue(v, "Colour")
      const size = optionValue(v, "Size") || optionValue(v, "T-shirt size")
      items.push(`    <item>
      <g:id>${esc(v.sku || v.id)}</g:id>
      <g:title>${esc(p.title)}${color ? ` (${esc(color)})` : ""}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${esc(link)}</g:link>
${img ? `      <g:image_link>${esc(img)}</g:image_link>\n` : ""}      <g:availability>in_stock</g:availability>
      <g:price>${price.toFixed(2)} ZAR</g:price>
      <g:brand>Noord Karavane</g:brand>
      <g:condition>new</g:condition>
      <g:item_group_id>${esc(p.handle)}</g:item_group_id>
${color ? `      <g:color>${esc(color)}</g:color>\n` : ""}${size ? `      <g:size>${esc(size)}</g:size>\n` : ""}      <g:product_type>${esc(cat)}</g:product_type>
      <g:custom_label_0>${esc(cat)}</g:custom_label_0>
    </item>`)
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Noord Karavane (${channel})</title>
    <link>${base}/</link>
    <description>Caravan and camping gear from Noord Karavane, Pretoria North.</description>
${items.join("\n")}
  </channel>
</rss>
`
}

export async function buildSitemapProducts(container: MedusaContainer) {
  const products = await loadProducts(container)
  return products.map((p) => ({
    handle: p.handle,
    updated_at: p.updated_at,
    images: (p.images ?? []).map((i: any) => i.url),
  }))
}
