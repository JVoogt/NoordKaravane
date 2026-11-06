import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { formatZar, shopUrl } from "./business"
import type { EmailData } from "../modules/notification-smtp/templates"

export const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "status",
  "currency_code",
  "total",
  "shipping_total",
  "metadata",
  "created_at",
  "payment_status",
  "items.id",
  "items.title",
  "items.product_title",
  "items.variant_title",
  "items.quantity",
  "items.total",
  "items.variant_sku",
  "items.product_handle",
  "items.product_id",
  "items.variant_id",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.phone",
  "shipping_address.city",
  "shipping_methods.name",
  "shipping_methods.shipping_option_id",
  "payment_collections.id",
  "payment_collections.status",
  "payment_collections.payments.id",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.captured_at",
]

export async function getOrder(container: MedusaContainer, id: string): Promise<any | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id } })
  return data[0] ?? null
}

export function orderEmailData(order: any, extra: Partial<EmailData> = {}): EmailData {
  const money = (n: unknown) => formatZar(Number(n ?? 0))
  const ship = order.shipping_methods?.[0]
  return {
    display_id: order.display_id,
    reference: `NK${order.display_id}`,
    first_name: order.shipping_address?.first_name || undefined,
    items: (order.items ?? []).map((i: any) => ({
      title: i.product_title || i.title,
      variant: i.variant_title || undefined,
      quantity: i.quantity,
      total: money(i.total),
    })),
    total: money(order.total),
    shipping_total: order.shipping_total != null ? money(order.shipping_total) : undefined,
    shipping_method: ship?.name,
    pudo_locker: order.metadata?.pudo_locker ? String(order.metadata.pudo_locker) : undefined,
    order_url: `${shopUrl()}/order/confirmed/${order.id}`,
    ...extra,
  }
}

export function isEftOrder(order: any): boolean {
  return (order.payment_collections ?? []).some((pc: any) =>
    (pc.payments ?? []).some((p: any) => p.provider_id === "pp_eft_eft")
  )
}

export async function sendEmail(
  container: MedusaContainer,
  to: string | null | undefined,
  template: string,
  data: EmailData
) {
  if (!to) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications({ to, channel: "email", template, data: data as any })
  } catch (e: any) {
    logger.error(`[email] failed to send "${template}" to ${to}: ${e?.message ?? e}`)
  }
}
