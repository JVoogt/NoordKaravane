import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

/**
 * Order lifecycle rules for discount codes (DD13). Registered as workflow hooks in src/workflows/hooks/vouchers.ts.
 * - A cancelled order gives back every code that carries an adjustment on it (AD-CANCEL).
 * - A cart holds at most one non-automatic code (AD-ONECODE), refused when it would grow past one, and at completion.
 */
export const ONE_CODE_MESSAGE = "Only one discount code can be used per order."

type Action = "add" | "replace" | "remove"

/**
 * Pure rule. `remove` never violates. The resulting set is current ∪ incoming for `add`, incoming for `replace`.
 * With n(x) = distinct non-automatic codes in x: violation iff n(result) > 1 and n(result) > n(current). So a refresh
 * (replace with the cart's own codes) never violates, even on a legacy two-code cart.
 */
export function oneCodeViolation(args: { action: Action; current: string[]; incoming: string[]; automatic: Set<string> }): boolean {
  if (args.action === "remove") return false
  const count = (codes: string[]) => new Set(codes.filter((c) => c && !args.automatic.has(c))).size
  const result = args.action === "add" ? [...args.current, ...args.incoming] : args.incoming
  const n = count(result)
  return n > 1 && n > count(args.current)
}

function oneCodeError() {
  return new MedusaError(MedusaError.Types.INVALID_DATA, ONE_CODE_MESSAGE)
}

/** updateCartPromotionsWorkflow validate hook. Codes that do not exist are not counted (Medusa rejects them itself). */
export async function assertOneCodePerCart(container: MedusaContainer, args: { action: Action; current: string[]; incoming: string[] }): Promise<void> {
  if (args.action === "remove") return
  const resulting = new Set(args.action === "add" ? [...args.current, ...args.incoming] : args.incoming)
  resulting.delete("")
  if (resulting.size <= 1) return
  const lookup = new Set([...resulting, ...args.current].filter(Boolean))
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const found = (await promotionModule.listPromotions({ code: [...lookup] }, { select: ["code", "is_automatic"] })) as any[]
  const known = new Set(found.map((p) => String(p.code)))
  const automatic = new Set(found.filter((p) => p.is_automatic).map((p) => String(p.code)))
  const onlyKnown = (codes: string[]) => codes.filter((c) => known.has(c))
  if (oneCodeViolation({ action: args.action, current: onlyKnown(args.current), incoming: onlyKnown(args.incoming), automatic })) throw oneCodeError()
}

/** completeCartWorkflow validate hook: the backstop for any path the validate hook above does not see. */
export async function assertOneCodeAtCompletion(
  container: MedusaContainer,
  cart: { promotions?: ({ id: string; code?: string | null } | null)[] | null }
): Promise<void> {
  const ids = [...new Set((cart.promotions ?? []).filter((p): p is { id: string } => Boolean(p?.id)).map((p) => p.id))]
  if (ids.length <= 1) return
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const found = (await promotionModule.listPromotions({ id: ids }, { select: ["id", "is_automatic"] })) as any[]
  if (found.filter((p) => !p.is_automatic).length > 1) throw oneCodeError()
}

type Adjusted = { adjustments?: ({ code?: string | null; amount?: unknown } | null)[] | null } | null

/**
 * Revert promotion usage for a cancelled order. The list mirrors what complete-cart gave registerUsage: the codes of
 * the order's line-item and shipping-method adjustments, deduplicated, amounts summed. Never built from the
 * order_promotion links, which can hold a code that registered no usage.
 */
export async function revertOrderVoucherUsage(container: MedusaContainer, orderId: string): Promise<{ reverted: string[] }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "customer_id",
      "items.adjustments.code",
      "items.adjustments.amount",
      "shipping_methods.adjustments.code",
      "shipping_methods.adjustments.amount",
    ],
    filters: { id: orderId },
  })
  const order = (data as any[])[0]
  if (!order) return { reverted: [] }
  const amounts = new Map<string, number>()
  for (const holder of [...((order.items ?? []) as Adjusted[]), ...((order.shipping_methods ?? []) as Adjusted[])])
    for (const a of holder?.adjustments ?? []) {
      if (!a?.code) continue
      amounts.set(a.code, (amounts.get(a.code) ?? 0) + Number(a.amount ?? 0))
    }
  if (!amounts.size) return { reverted: [] }
  const actions = [...amounts].map(([code, amount]) => ({ code, amount }))
  const promotionModule = container.resolve(Modules.PROMOTION) as any
  await promotionModule.revertUsage(actions, { customer_id: order.customer_id ?? null, customer_email: order.email ?? null })
  const codes = actions.map((a) => a.code)
  container.resolve(ContainerRegistrationKeys.LOGGER).info("vouchers.revert " + JSON.stringify({ order_id: orderId, codes }))
  return { reverted: codes }
}

/** cancelOrderWorkflow orderCanceled hook body. Never rethrows: a voucher failure must not fail or roll back a cancel. */
export async function onOrderCanceled(container: MedusaContainer, orderId: string): Promise<void> {
  try {
    await revertOrderVoucherUsage(container, orderId)
  } catch (e: any) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error("vouchers.revert failed " + JSON.stringify({ order_id: orderId, message: String(e?.message ?? e) }))
  }
}
