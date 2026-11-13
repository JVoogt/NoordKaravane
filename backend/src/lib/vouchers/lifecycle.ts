import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { originatingCarts } from "./origin"

/**
 * Order lifecycle rules for discount codes (DD13). Registered as workflow hooks in src/workflows/hooks/vouchers.ts.
 * - A cancelled cart order gives back every code that carried an adjustment on its originating cart at completion
 *   (AD-CANCEL, RD6), never a code added to the order later; a non-cart order (draft order) registered no usage and
 *   gives back nothing.
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

type Adjusted = { adjustments?: ({ code?: string | null } | null)[] | null } | null

/**
 * Revert promotion usage for a cancelled order (H1, RD6). Usage is given back only for what complete-cart registered:
 * the codes of the ORIGINATING CART's line-item and shipping-method adjustments (reached through the `order_cart`
 * link), deduplicated, amounts summed, with the cart's customer and email, exactly as complete-cart passed them to
 * registerUsage (see origin.ts). A code that appears only on the order's adjustments (added later by an order edit,
 * claim or exchange with carry_over_promotions) registered no usage and is never reverted; neither is a code linked to
 * the order without an adjustment. An order without the link (a draft order, converted or not) reverts nothing.
 * `reverted` are the codes whose `used` went down; `skipped` the rest (Medusa reverts only active promotions in a
 * running campaign with a limit, M4).
 */
export async function revertOrderVoucherUsage(container: MedusaContainer, orderId: string): Promise<{ reverted: string[]; skipped: string[] }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "items.adjustments.code", "shipping_methods.adjustments.code"],
    filters: { id: orderId },
  })
  const order = (data as any[])[0]
  if (!order) {
    logger.warn("vouchers.revert skipped (order not found) " + JSON.stringify({ order_id: orderId }))
    return { reverted: [], skipped: [] }
  }

  const { carts, missing } = await originatingCarts(query, [orderId])
  const origin = carts.get(orderId)
  if (!origin) {
    if (missing.length) {
      logger.warn("vouchers.revert skipped (cart not found) " + JSON.stringify(missing[0]))
      return { reverted: [], skipped: [] }
    }
    // Not a cart order: nothing was registered. The order's own codes are logged only to explain the skip.
    const orderCodes = new Set<string>()
    for (const holder of [...((order.items ?? []) as Adjusted[]), ...((order.shipping_methods ?? []) as Adjusted[])])
      for (const a of holder?.adjustments ?? []) if (a?.code) orderCodes.add(a.code)
    const codes = [...orderCodes]
    if (codes.length) logger.info("vouchers.revert skipped (not a cart order) " + JSON.stringify({ order_id: orderId, codes }))
    return { reverted: [], skipped: codes }
  }
  if (!origin.amounts.size) return { reverted: [], skipped: [] }
  const codes = [...origin.amounts.keys()]

  const promotionModule = container.resolve(Modules.PROMOTION) as any
  const usedByCode = async () =>
    new Map(((await promotionModule.listPromotions({ code: codes }, { select: ["code", "used"] })) as any[]).map((p) => [String(p.code), Number(p.used ?? 0)]))
  const before = await usedByCode()
  const actions = [...origin.amounts].map(([code, amount]) => ({ code, amount }))
  await promotionModule.revertUsage(actions, { customer_id: origin.customer_id, customer_email: origin.email })
  let after: Map<string, number>
  try {
    after = await usedByCode()
  } catch (e: any) {
    // The revert itself went through; only the read that tells reverted from skipped failed.
    logger.warn("vouchers.revert done, verification read failed " + JSON.stringify({ order_id: orderId, codes, message: String(e?.message ?? e) }))
    return { reverted: [], skipped: [] }
  }
  const reverted = codes.filter((c) => before.has(c) && (after.get(c) ?? 0) < (before.get(c) ?? 0))
  const skipped = codes.filter((c) => !reverted.includes(c))
  logger.info("vouchers.revert " + JSON.stringify({ order_id: orderId, reverted, skipped }))
  return { reverted, skipped }
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
