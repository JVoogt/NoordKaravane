import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrder, orderEmailData, sendEmail } from "../lib/orders"
import { notifyDropshipSuppliers } from "../lib/dropship"

/** payment.captured: "paid, now being prepared" email, then notify dropship suppliers. */
export default async function paymentCapturedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection_id"],
    filters: { id: data.id },
  })
  const collectionId = payments[0]?.payment_collection_id
  if (!collectionId) return
  const { data: links } = await query.graph({
    entity: "order_payment_collection",
    fields: ["order_id"],
    filters: { payment_collection_id: collectionId },
  })
  const orderId = links[0]?.order_id
  if (!orderId) return
  const order = await getOrder(container, orderId)
  if (!order) return
  await sendEmail(container, order.email, "payment-received", orderEmailData(order))
  await notifyDropshipSuppliers(container, order.id)
}

export const config: SubscriberConfig = { event: "payment.captured" }
