import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { autoLinkChannelIds, linkProductToChannels } from "../lib/channels"

/**
 * product.created: link the new product to the store's default channel and every configured Kampi channel, so NK
 * manages one catalogue that shows on both stores. Idempotent (only missing links are made). Never throws: a link
 * failure is logged at warn (with the target channels and the failed link; setup-kampi-channel repairs it) and must
 * never fail product creation.
 */
export default async function productChannelLink({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  let logger: { info: (m: string) => void; warn: (m: string) => void } = console
  let targets: string[] | null = null
  try {
    logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    targets = await autoLinkChannelIds(container)
    const linked = await linkProductToChannels(container, data.id, targets)
    if (linked.length) logger.info(`[channel-link] linked ${data.id} to ${linked.length} channel(s)`)
  } catch (e: any) {
    const to = targets ? targets.join(", ") : "unknown"
    logger.warn(`[channel-link] ${data?.id}: targets ${to}: ${e?.message ?? e}; rerun setup-kampi-channel`)
  }
}

export const config: SubscriberConfig = { event: "product.created" }
