import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import { getBusinessConfig } from "../lib/business"
import { hasCapturedPayment, isEftOrder, ORDER_FIELDS, orderEmailData, sendEmail } from "../lib/orders"

/**
 * Hourly: unpaid EFT orders older than eft_reminder_after_hours get one reminder (recorded in
 * order metadata), and older than eft_payment_window_hours are cancelled (order.canceled
 * subscriber sends the cancellation email).
 */
export default async function eftUnpaidOrders(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModule = container.resolve(Modules.ORDER)
  const b = getBusinessConfig()
  const now = Date.now()
  const reminderCutoff = new Date(now - b.eft_reminder_after_hours * 3600_000)
  const lookback = new Date(now - 14 * 24 * 3600_000)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { created_at: { $lt: reminderCutoff, $gt: lookback }, status: "pending" } as any,
  })

  for (const order of orders as any[]) {
    try {
      if (!isEftOrder(order)) continue
      // Paid orders are never reminded or cancelled. Decided from the captured payment rows.
      if (hasCapturedPayment(order)) continue
      const ageH = (now - new Date(order.created_at).getTime()) / 3600_000
      const md = (order.metadata ?? {}) as Record<string, any>

      if (ageH >= b.eft_payment_window_hours) {
        logger.info(`[eft-job] cancelling unpaid order ${order.id} (NK${order.display_id}, ${Math.round(ageH)}h)`)
        await cancelOrderWorkflow(container).run({ input: { order_id: order.id } })
        await orderModule.updateOrders(order.id, {
          metadata: { ...md, eft_auto_canceled_at: new Date().toISOString() },
        } as any)
      } else if (!md.eft_reminder_sent_at) {
        const left = Math.max(1, Math.round(b.eft_payment_window_hours - ageH))
        await sendEmail(container, order.email, "eft-reminder", orderEmailData(order, { hours_left: left }))
        await orderModule.updateOrders(order.id, {
          metadata: { ...md, eft_reminder_sent_at: new Date().toISOString() },
        } as any)
        logger.info(`[eft-job] reminder sent for ${order.id} (NK${order.display_id})`)
      }
    } catch (e: any) {
      logger.error(`[eft-job] ${order.id}: ${e?.message ?? e}`)
    }
  }
}

export const config = {
  name: "eft-unpaid-orders",
  schedule: "0 * * * *",
}
