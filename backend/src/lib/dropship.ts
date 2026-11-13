import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { getOrder } from "./orders"
import { getBusinessConfig } from "./business"

type Supplier = { name: string; email: string }

/** Blank, {{...}} or REPLACE_ME: not configured yet. */
const isPlaceholder = (v: unknown) => {
  const s = String(v ?? "").trim()
  return !s || s.includes("{{") || s.includes("REPLACE_ME")
}

/** "ok", "placeholder" (not configured yet) or "invalid" (set but no @: a typo). */
function supplierEmailKind(email: unknown): "ok" | "placeholder" | "invalid" {
  if (isPlaceholder(email)) return "placeholder"
  return String(email).includes("@") ? "ok" : "invalid"
}

/**
 * The config entry for a prefix, made safe for staff copy and logs. A non-object entry (null, a bare string) is
 * "invalid" with a blank email; a missing, blank or placeholder name becomes `"<prefix>" supplier`.
 */
const fallbackName = (prefix: string) => `"${prefix}" supplier`

function supplierEntry(prefix: string, raw: unknown): { supplier: Supplier; kind: ReturnType<typeof supplierEmailKind> } {
  const fallback = fallbackName(prefix)
  if (!raw || typeof raw !== "object") return { supplier: { name: fallback, email: "" }, kind: "invalid" }
  const s = raw as Partial<Supplier>
  const name = typeof s.name === "string" && !isPlaceholder(s.name) ? s.name.trim() : fallback
  return { supplier: { name, email: String(s.email ?? "") }, kind: supplierEmailKind(s.email) }
}

function groupBySupplier(items: any[], suppliers: Record<string, Supplier>) {
  const out = new Map<string, { prefix: string; supplier: Supplier; lines: any[]; kind: ReturnType<typeof supplierEmailKind> }>()
  for (const i of items ?? []) {
    const sku = String(i.variant_sku ?? "")
    const prefix = Object.keys(suppliers).find((p) => sku.startsWith(p))
    if (!prefix) continue
    const g = out.get(prefix) ?? { prefix, lines: [], ...supplierEntry(prefix, suppliers[prefix]) }
    g.lines.push(i)
    out.set(prefix, g)
  }
  return [...out.values()]
}

/**
 * Group order lines by dropship supplier using SKU prefixes from config/business.json (dropship_suppliers).
 * Only suppliers with a usable email: the rest are in unusableDropshipLines.
 */
export function dropshipLines(items: any[], suppliers: Record<string, Supplier>) {
  return groupBySupplier(items, suppliers)
    .filter((g) => g.kind === "ok")
    // named: false when supplier.name is the prefix fallback, so the supplier's own email does not greet them by it.
    .map(({ prefix, supplier, lines }) => ({ supplier, lines, named: supplier.name !== fallbackName(prefix) }))
}

/**
 * Lines that match a dropship supplier prefix whose email is unusable, so the supplier cannot be emailed.
 * kind "placeholder" = not configured yet, "invalid" = set but has no @. Pure.
 */
export function unusableDropshipLines(items: any[], suppliers: Record<string, Supplier>) {
  return groupBySupplier(items, suppliers).filter(
    (g): g is typeof g & { kind: "placeholder" | "invalid" } => g.kind !== "ok"
  )
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
  const suppliers = getBusinessConfig().dropship_suppliers ?? {}
  for (const u of unusableDropshipLines(order.items ?? [], suppliers)) {
    const skus = u.lines.map((i: any) => i.variant_sku).join(", ")
    const msg = `[dropship] ${u.supplier.name} (prefix ${u.prefix}) NOT notified for ${order.id}, SKUs ${skus}`
    if (u.kind === "placeholder") logger.warn(`${msg}: supplier email is not configured in business.json`)
    else if (!u.supplier.email) logger.error(`${msg}: supplier entry in business.json is not an object with name and email`)
    else logger.error(`${msg}: supplier email "${u.supplier.email}" in business.json has no @`)
  }
  const groups = dropshipLines(order.items ?? [], suppliers)
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
          supplier: g.named ? g.supplier.name : undefined,
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
