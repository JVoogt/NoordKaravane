import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrder, notifyStaff, notifyStaffPaymentNoOrder, orderEmailData, sendEmail } from "../lib/orders"
import { notifyDropshipSuppliers } from "../lib/dropship"

/**
 * payment.captured: "paid, now being prepared" email, then the staff paid alert, then notify dropship suppliers.
 * A captured payment with no order (e.g. PayFast autocapture while cart completion failed) is logged and alerted to staff.
 */
export default async function paymentCapturedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection_id", "amount", "currency_code", "provider_id"],
    filters: { id: data.id },
  })
  const payment = payments[0]
  if (!payment) {
    logger.error(`[payment-captured] payment ${data.id} not found; no emails sent`)
    return
  }
  // From here the payment exists, so a missing order means "customer paid, no order": tell staff.
  const collectionId = payment.payment_collection_id
  if (!collectionId) {
    logger.error(`[payment-captured] payment ${payment.id} has no payment collection; no order to email, alerting staff`)
    await notifyStaffPaymentNoOrder(container, payment)
    return
  }
  const { data: links } = await query.graph({
    entity: "order_payment_collection",
    fields: ["order_id"],
    filters: { payment_collection_id: collectionId },
  })
  const orderId = links[0]?.order_id
  if (!orderId) {
    logger.error(`[payment-captured] payment ${payment.id} (collection ${collectionId}) is not linked to an order; alerting staff`)
    await notifyStaffPaymentNoOrder(container, payment)
    return
  }
  const order = await getOrder(container, orderId)
  if (!order) {
    logger.error(`[payment-captured] order ${orderId} for payment ${payment.id} (collection ${collectionId}) not found; alerting staff`)
    await notifyStaffPaymentNoOrder(container, payment)
    return
  }
  await sendEmail(container, order.email, "payment-received", orderEmailData(order))
  await notifyStaff(container, order, "staff-order-paid")
  await notifyDropshipSuppliers(container, order.id)
}

export const config: SubscriberConfig = { event: "payment.captured" }
