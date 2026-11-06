import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { productUrls, purgeUrls } from "../lib/cloudflare"

/** Purge Cloudflare edge cache for product pages when the catalogue changes. No-op without CF env. */
export default async function productCachePurge({
  event: { data, name },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!process.env.CF_ZONE_ID || !process.env.CF_API_TOKEN) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  let handle: string | undefined
  if (name !== "product.deleted") {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query.graph({ entity: "product", fields: ["handle"], filters: { id: data.id } })
    handle = products[0]?.handle
  }
  try {
    await purgeUrls(productUrls(handle), logger as any)
  } catch (e: any) {
    logger.warn(`[cf-purge] ${e?.message ?? e}`)
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
}
