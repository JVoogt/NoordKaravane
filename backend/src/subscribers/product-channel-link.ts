import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { autoLinkChannelIds, linkProductToChannels } from "../lib/channels"

/**
 * product.created: link the new product to the store's default channel and every configured Kampi channel, so NK
 * manages one catalogue that shows on both stores. Idempotent (only missing links are made). Never throws: a link
 * failure is logged at warn and must never fail product creation.
 */
export default async function productChannelLink({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  let logger: { info: (m: string) => void; warn: (m: string) => void } = console
  try {
    logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const linked = await linkProductToChannels(container, data.id, await autoLinkChannelIds(container))
    if (linked.length) logger.info(`[channel-link] linked ${data.id} to ${linked.length} channel(s)`)
  } catch (e: any) {
    logger.warn(`[channel-link] ${data?.id}: ${e?.message ?? e}`)
  }
}

export const config: SubscriberConfig = { event: "product.created" }
