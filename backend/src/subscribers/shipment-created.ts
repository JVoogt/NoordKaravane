import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrder, orderEmailData, sendEmail } from "../lib/orders"

const TCG_TRACK = "https://portal.thecourierguy.co.za/track?ref="

/** shipment.created: tracking email. The owner enters the waybill as the tracking number in Admin. */
export default async function shipmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  if (data.no_notification) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "data", "labels.tracking_number", "labels.tracking_url", "shipping_option.name", "shipping_option.service_zone_id"],
    filters: { id: data.id },
  })
  const f: any = fulfillments[0]
  if (!f) return
  const { data: links } = await query.graph({
    entity: "order_fulfillment",
    fields: ["order_id"],
    filters: { fulfillment_id: data.id },
  })
  const orderId = links[0]?.order_id
  if (!orderId) return
  const order = await getOrder(container, orderId)
  if (!order) return

  const label = (f.labels ?? [])[0]
  const tracking: string | undefined = label?.tracking_number || undefined
  const isPudo = /pudo/i.test(order.shipping_methods?.[0]?.name ?? f.shipping_option?.name ?? "")
  // TODO(phase 2): use the Ship Logic tracking URL once the API integration returns it.
  const url = label?.tracking_url || (tracking ? TCG_TRACK + encodeURIComponent(tracking) : undefined)
  await sendEmail(
    container,
    order.email,
    "order-shipped",
    orderEmailData(order, {
      tracking_number: tracking,
      tracking_url: url,
      carrier: isPudo ? "Pudo" : "The Courier Guy",
    })
  )
}

export const config: SubscriberConfig = { event: "shipment.created" }
