import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { adminUrl, brandFor, formatZar, getBusinessConfig, orderChannel, staffAlertRecipientsWithDropped } from "./business"
import { storeDefaultChannelId } from "./store-channel"
import { dropshipLines, unusableDropshipLines } from "./dropship"
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
  "sales_channel_id",
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
  "shipping_address.company",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.city",
  "shipping_address.province",
  "shipping_address.postal_code",
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

/** Customer email payload. brand and order_url follow the order's sales channel (brandFor): a Kampi order links to the Kampi store. */
export function orderEmailData(order: any, extra: Partial<EmailData> = {}): EmailData {
  const money = (n: unknown) => formatZar(Number(n ?? 0))
  const ship = order.shipping_methods?.[0]
  const brand = brandFor(order.sales_channel_id)
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
    order_url: `${brand.shopUrl}/order/confirmed/${order.id}`,
    brand: brand.key,
    ...extra,
  }
}

export function isEftOrder(order: any): boolean {
  return (order.payment_collections ?? []).some((pc: any) =>
    (pc.payments ?? []).some((p: any) => p.provider_id === "pp_eft_eft")
  )
}

const supplierLines = (g: { supplier: { name: string }; lines: any[] }) =>
  g.lines.map((i: any) => ({
    supplier: g.supplier.name,
    title: i.product_title || i.title,
    variant: i.variant_title || undefined,
    sku: i.variant_sku || undefined,
    quantity: i.quantity,
  }))

/**
 * Staff alert payload: the customer email data plus SKUs, full ship-to, contact details, payment state,
 * dropship lines (and lines whose supplier has no usable email, so was not notified) and the admin link. Pure, so suppliers are passed in (config dropship_suppliers).
 * Staff alerts are NK-branded for every order: brand is dropped (so the From header and shell are NK's) and
 * channel_label names the channel the order came in on, from the real channel: the store default (defaultChannelId)
 * is "NK", a configured Kampi id is "Kampi", anything else is "Unknown channel (<id>)" and warned.
 */
export function staffOrderEmailData(
  order: any,
  suppliers: Record<string, { name: string; email: string }> = {},
  defaultChannelId: string | null = null
): EmailData {
  const { brand: _brand, ...base } = orderEmailData(order)
  const a = order.shipping_address ?? {}
  const payments = (order.payment_collections ?? []).flatMap((pc: any) => pc.payments ?? [])
  const payfast = payments.some((p: any) => String(p.provider_id ?? "").startsWith("pp_payfast"))
  const md = (order.metadata ?? {}) as Record<string, any>
  return {
    ...base,
    items: (order.items ?? []).map((i: any, n: number) => ({ ...base.items![n], sku: i.variant_sku || undefined })),
    customer_email: order.email || undefined,
    customer_phone: a.phone || undefined,
    reply_to: order.email || undefined,
    ship_to_lines: [`${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(), a.company, a.address_1, a.address_2, a.city, a.province, a.postal_code]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean),
    payment_method: isEftOrder(order) ? "EFT" : payfast ? "PayFast" : payments[0]?.provider_id || "Unknown",
    payment_captured: payments.some((p: any) => !!p.captured_at),
    collect_from_workshop: md.collect_from_workshop === true || md.collect_from_workshop === "true",
    channel_label: staffChannelLabel(order, defaultChannelId),
    admin_order_url: `${adminUrl()}/app/orders/${order.id}`,
    dropship_items: dropshipLines(order.items ?? [], suppliers).flatMap(supplierLines),
    dropship_unnotified: unusableDropshipLines(order.items ?? [], suppliers).flatMap(supplierLines),
  }
}

function staffChannelLabel(order: any, defaultChannelId: string | null): string {
  const channel = orderChannel(order.sales_channel_id, defaultChannelId)
  if (channel === "nk") return "NK"
  if (channel === "kampi") return "Kampi"
  const id = order.sales_channel_id || "none"
  console.warn(`[staff-alert] order ${order.id} is on unknown sales channel ${id} (store default ${defaultChannelId ?? "unknown"})`)
  return `Unknown channel (${id})`
}

/**
 * Sends one email and never throws. idempotencyKey is for staff alerts only (customer emails pass none): the
 * Medusa 2.22 notification module skips a key whose earlier row did not fail, without sending or throwing, and
 * returns nothing for it, which is logged here at info.
 *
 * Known Medusa 2.22 quirk: when the key's earlier row FAILED, Medusa sends again but never inserts a row for the
 * retry, so its finally-update throws NOT_FOUND ("Notification with id ... not found"). That error replaces the
 * send result, so we log "failed to send" even when the retry went out, and the old row stays FAILURE. The
 * message cannot tell a delivered retry from a failed one, so it stays an error: check the mail log to confirm.
 */
export async function sendEmail(
  container: MedusaContainer,
  to: string | null | undefined,
  template: string,
  data: EmailData,
  idempotencyKey?: string
) {
  if (!to) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const notification = container.resolve(Modules.NOTIFICATION)
    const res = await notification.createNotifications({
      to,
      channel: "email",
      template,
      data: data as any,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    })
    if (idempotencyKey && !res) logger.info(`[email] skipped duplicate "${template}" to ${to} (idempotency key ${idempotencyKey})`)
  } catch (e: any) {
    logger.error(`[email] failed to send "${template}" to ${to}: ${e?.message ?? e}`)
  }
}

/**
 * Sends a staff alert to every recipient from config staff_order_alerts (fallback email_orders), each with the
 * idempotency key `${template}:${keyOf(data)}:${recipient}` (keyOf defaults to the id). Logs an error when no
 * recipient is usable and a warning per configured value dropped as invalid. Never throws, so it cannot block the
 * customer email, Meta CAPI or dropship notify.
 */
async function sendStaffAlert(
  container: MedusaContainer,
  template: string,
  id: string,
  buildData: (cfg: ReturnType<typeof getBusinessConfig>) => EmailData,
  keyOf: (data: EmailData) => string = () => id
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const cfg = getBusinessConfig()
    const { recipients, dropped } = staffAlertRecipientsWithDropped(cfg)
    for (const v of dropped) logger.warn(`[staff-alert] dropped invalid staff alert recipient "${v}" (check business.json)`)
    if (!recipients.length) {
      logger.error(
        `[staff-alert] no valid staff alert recipients (check staff_order_alerts / email_orders in business.json); "${template}" not sent for ${id}`
      )
      return
    }
    const data = buildData(cfg)
    const key = keyOf(data)
    for (const r of recipients) await sendEmail(container, r, template, data, `${template}:${key}:${r}`)
  } catch (e: any) {
    logger.error(`[staff-alert] "${template}" failed for ${id}: ${e?.message ?? e}`)
  }
}

/**
 * Staff order alert (staff-new-order / staff-order-paid), see sendStaffAlert. The paid alert key also carries
 * paid/partial, so an alert for a capture that left the order not fully paid does not suppress the later paid one.
 */
export async function notifyStaff(container: MedusaContainer, order: any, template: "staff-new-order" | "staff-order-paid") {
  const defaultChannelId = await storeDefaultChannelId(container)
  await sendStaffAlert(
    container,
    template,
    order?.id,
    (cfg) => staffOrderEmailData(order, cfg.dropship_suppliers ?? {}, defaultChannelId),
    (d) => (template === "staff-order-paid" ? `${order?.id}:${d.payment_captured ? "paid" : "partial"}` : order?.id)
  )
}

/**
 * payment.captured for a payment no order can be found for (e.g. PayFast captured but cart completion failed):
 * tell staff so a paying customer is not left without an order. Never throws.
 */
export async function notifyStaffPaymentNoOrder(
  container: MedusaContainer,
  payment: { id: string; amount?: unknown; currency_code?: string | null; provider_id?: string | null }
) {
  await sendStaffAlert(container, "staff-payment-no-order", payment.id, () => {
    const currency = String(payment.currency_code ?? "zar").toLowerCase()
    const amount =
      payment.amount == null ? undefined : currency === "zar" ? formatZar(Number(payment.amount)) : `${Number(payment.amount)} ${currency.toUpperCase()}`
    return { payment_id: payment.id, payment_amount: amount, payment_provider: payment.provider_id || undefined, admin_url: adminUrl() }
  })
}
