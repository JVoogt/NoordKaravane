import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { getOrder, orderEmailData, sendEmail } from "../lib/orders"

export default async function orderCanceledHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const order = await getOrder(container, data.id)
  if (!order) return
  await sendEmail(container, order.email, "order-canceled", orderEmailData(order))
}

export const config: SubscriberConfig = { event: "order.canceled" }
