import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { getOrder } from "./orders"
import { getBusinessConfig } from "./business"

/** Group order lines by dropship supplier using SKU prefixes from config/business.json (dropship_suppliers). */
export function dropshipLines(items: any[], suppliers: Record<string, { name: string; email: string }>) {
  const out = new Map<string, { supplier: { name: string; email: string }; lines: any[] }>()
  for (const i of items ?? []) {
    const sku = String(i.variant_sku ?? "")
    const prefix = Object.keys(suppliers).find((p) => sku.startsWith(p))
    if (!prefix || !suppliers[prefix].email || suppliers[prefix].email.includes("{{")) continue
    const g = out.get(prefix) ?? { supplier: suppliers[prefix], lines: [] }
    g.lines.push(i)
    out.set(prefix, g)
  }
  return [...out.values()]
}

/**
 * Emails dropship suppliers (e.g. The First Responders, SKU TFR-*) to fulfil their lines.
 * Mirrors the Woo plugin kampi-shop-dropship-notify. Called from the payment.captured subscriber, not
 * order.placed: EFT orders are unpaid at placement and suppliers must not ship unpaid orders.
 */
export async function notifyDropshipSuppliers(container: any, orderId: string) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const order = await getOrder(container, orderId)
  if (!order) return
  const groups = dropshipLines(order.items ?? [], getBusinessConfig().dropship_suppliers ?? {})
  if (!groups.length) return
  const notification = container.resolve(Modules.NOTIFICATION)
  const ship = order.shipping_address
  for (const g of groups) {
    try {
      await notification.createNotifications({
        to: g.supplier.email,
        channel: "email",
        template: "dropship-supplier",
        data: {
          reference: `NK${order.display_id}`,
          supplier: g.supplier.name,
          supplier_items: g.lines.map((i: any) => ({ title: i.product_title || i.title, variant: i.variant_title, sku: i.variant_sku, quantity: i.quantity })),
          ship_to: ship ? [`${ship.first_name ?? ""} ${ship.last_name ?? ""}`.trim(), ship.address_1, ship.address_2, ship.city, ship.postal_code, ship.phone].filter(Boolean).join(", ") : "",
          shipping_method: order.shipping_methods?.[0]?.name,
        },
      })
      logger.info(`[dropship] notified ${g.supplier.name} for ${order.id}`)
    } catch (e: any) {
      logger.error(`[dropship] failed for ${g.supplier.name} on ${order.id}: ${e?.message ?? e}`)
    }
  }
}
