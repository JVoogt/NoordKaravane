import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { linkProductsToSalesChannelWorkflow } from "@medusajs/medusa/core-flows"
import { kampiBrandConfig } from "./business"

/** The Kampi sales channel (description "store.kampi.co.za") and its publishable key, found or created by setup-kampi-channel. */
export const KAMPI_CHANNEL_NAME = "Kampi"
export const KAMPI_KEY_TITLE = "Kampi"

type ProductChannels = { id: string; sales_channels?: { id: string }[] | null }

/** For each product, the channels in channelIds it is not linked to yet (products missing none are left out). Pure. */
export function missingChannelLinks(products: ProductChannels[], channelIds: string[]): Record<string, string[]> {
  const wanted = [...new Set(channelIds)]
  const out: Record<string, string[]> = {}
  for (const p of products) {
    const have = new Set((p.sales_channels ?? []).map((c) => c.id))
    const missing = wanted.filter((id) => !have.has(id))
    if (missing.length) out[p.id] = missing
  }
  return out
}

/**
 * The channels a new product belongs in: the store's default channel plus every configured Kampi channel id
 * (brands.kampi.sales_channel_ids) that exists in this database. Staging and production share one config, so ids
 * from the other database are dropped here.
 */
export async function autoLinkChannelIds(container: MedusaContainer): Promise<string[]> {
  const [store] = await container.resolve(Modules.STORE).listStores()
  const ids: string[] = store?.default_sales_channel_id ? [store.default_sales_channel_id] : []
  const configured = kampiBrandConfig()?.sales_channel_ids ?? []
  if (configured.length) {
    const existing = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ id: configured })
    const found = new Set(existing.map((c: { id: string }) => c.id))
    for (const id of configured) if (found.has(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** Links the product to each of channelIds it is not in yet, one workflow run per channel. Returns the channels linked. */
export async function linkProductToChannels(container: MedusaContainer, productId: string, channelIds: string[]): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "sales_channels.id"], filters: { id: productId } })
  const missing = missingChannelLinks(data as ProductChannels[], channelIds)[productId] ?? []
  for (const channelId of missing) {
    await linkProductsToSalesChannelWorkflow(container).run({ input: { id: channelId, add: [productId] } })
  }
  return missing
}
