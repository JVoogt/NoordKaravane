import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { autoLinkChannelIds, linkProductToChannels, readStoreDefault } from "../lib/channels"

/**
 * product.created: link the new product to the store's default channel and every configured Kampi channel, so NK
 * manages one catalogue that shows on both stores. Idempotent (only missing links are made). The default link is made
 * as soon as the default is read, and the Kampi lookup and links run in their own try, so a failure in one never costs
 * the other. Never throws: each failure is logged at warn naming its repair (the default: add the product to the
 * default sales channel in admin; Kampi: rerun setup-kampi-channel) and must never fail product creation.
 */
export default async function productChannelLink({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  let logger: { info: (m: string) => void; warn: (m: string) => void } = console
  try {
    logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  } catch {
    /* console stays the logger */
  }
  let linked = 0
  try {
    const def = await readStoreDefault(container)
    if (def) linked += (await linkProductToChannels(container, data.id, [def])).length
  } catch (e: any) {
    logger.warn(`[channel-link] ${data?.id}: default sales channel link failed: ${e?.message ?? e}; add the product to the default sales channel in admin`)
  }
  try {
    const kampi = await autoLinkChannelIds(container)
    if (kampi.length) linked += (await linkProductToChannels(container, data.id, kampi)).length
  } catch (e: any) {
    logger.warn(`[channel-link] ${data?.id}: Kampi channel link failed: ${e?.message ?? e}; rerun setup-kampi-channel`)
  }
  if (linked) logger.info(`[channel-link] linked ${data.id} to ${linked} channel(s)`)
}

export const config: SubscriberConfig = { event: "product.created" }
