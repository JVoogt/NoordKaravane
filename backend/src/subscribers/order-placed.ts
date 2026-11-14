import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrder, isEftOrder, notifyStaff, orderEmailData, sendEmail } from "../lib/orders"
import { sendPurchase } from "../lib/meta-capi"
import { orderChannel, shopUrl } from "../lib/business"
import { storeDefaultChannelId } from "../lib/store-channel"

/**
 * order.placed: EFT instructions email, then the staff new-order alert, plus Meta CAPI Purchase (marketing consent
 * only). CAPI goes out only for an order positively on NK's own channel (the store default): the pixel is NK's. A
 * Kampi order sends none; an order on an unknown channel, or when the default cannot be read, sends none and warns.
 */
export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const order = await getOrder(container, data.id)
  if (!order) {
    logger.error(`[order-placed] order ${data.id} not found; no order emails sent`)
    return
  }

  if (isEftOrder(order)) {
    await sendEmail(container, order.email, "order-placed-eft", orderEmailData(order))
  }
  await notifyStaff(container, order, "staff-new-order")

  const md = (order.metadata ?? {}) as Record<string, any>
  const consent = md.marketing_consent === true || md.marketing_consent === "true"
  if (!consent || !md.meta_event_id) return
  const defaultChannelId = await storeDefaultChannelId(container)
  const channel = orderChannel(order.sales_channel_id, defaultChannelId)
  if (channel === "unknown")
    logger.warn(
      `[meta-capi] ${order.id} is on sales channel ${order.sales_channel_id ?? "none"}, not the store default ${defaultChannelId ?? "unknown"}; no CAPI Purchase sent`
    )
  if (channel === "nk") {
    try {
      await sendPurchase(
        {
          eventId: String(md.meta_event_id),
          email: order.email,
          phone: order.shipping_address?.phone,
          firstName: order.shipping_address?.first_name,
          lastName: order.shipping_address?.last_name,
          fbp: md.fbp,
          fbc: md.fbc,
          value: Number(order.total ?? 0),
          currency: "ZAR",
          orderId: order.id,
          contentIds: (order.items ?? []).map((i: any) => i.product_handle || i.variant_sku || i.variant_id).filter(Boolean),
          numItems: (order.items ?? []).reduce((n: number, i: any) => n + Number(i.quantity ?? 0), 0),
          sourceUrl: `${shopUrl(order.sales_channel_id)}/checkout`,
        },
        logger as any
      )
    } catch (e: any) {
      logger.warn(`[meta-capi] failed for ${order.id}: ${e?.message ?? e}`)
    }
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
