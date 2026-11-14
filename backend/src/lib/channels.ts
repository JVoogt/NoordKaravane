import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { linkProductsToSalesChannelWorkflow } from "@medusajs/medusa/core-flows"
import { kampiBlockPresent, kampiChannelIds } from "./business"

export { readStoreDefault, storeDefaultChannelId } from "./store-channel"

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

let noneExistLogged = false
let emptyListLogged = false

/**
 * The Kampi channels a new product belongs in (the store default is read and linked separately, so a failed Kampi
 * lookup never costs the default link): every configured Kampi channel id (brands.kampi.sales_channel_ids, read by
 * kampiChannelIds, so broken styling keys do not stop the link) that exists in this database. Staging and production
 * share one config, so ids from the other database are dropped here (warned once when none exist). Warns once when a
 * brands.kampi block exists but yields no usable ids. Throws when the channel lookup fails.
 */
export async function autoLinkChannelIds(container: MedusaContainer): Promise<string[]> {
  const configured = kampiChannelIds()
  if (!configured.length) {
    if (!emptyListLogged && kampiBlockPresent()) {
      emptyListLogged = true
      console.warn("[channel-link] brands.kampi has no usable sales_channel_ids; new products link to the default channel only")
    }
    return []
  }
  const existing = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ id: configured })
  const found = new Set(existing.map((c: { id: string }) => c.id))
  if (!found.size && !noneExistLogged) {
    noneExistLogged = true
    console.warn(
      `[channel-link] brands.kampi.sales_channel_ids [${configured.join(", ")}] has no channel in this database; new products link to the default channel only`
    )
  }
  return [...new Set(configured.filter((id) => found.has(id)))]
}

/** Links the product to each of channelIds it is not in yet, one workflow run per channel. Returns the channels linked. A failed link throws naming its channel. */
export async function linkProductToChannels(container: MedusaContainer, productId: string, channelIds: string[]): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "sales_channels.id"], filters: { id: productId } })
  const missing = missingChannelLinks(data as ProductChannels[], channelIds)[productId] ?? []
  for (const channelId of missing) {
    try {
      await linkProductsToSalesChannelWorkflow(container).run({ input: { id: channelId, add: [productId] } })
    } catch (e: any) {
      throw new Error(`link to ${channelId} failed: ${e?.message ?? e}`)
    }
  }
  return missing
}
