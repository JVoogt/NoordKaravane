/**
 * The cart an order was completed from, and what complete-cart registered usage for (RD6).
 *
 * Medusa 2.22.2 `completeCartWorkflow` registers promotion usage from the CART's line-item and shipping-method
 * adjustments, with the cart's customer and email, and links the order to that cart (`order_cart`) in the same step.
 * A completed cart is frozen (`validateCartStep` refuses every cart workflow once `completed_at` is set), so its
 * adjustments stay what usage was registered for, whatever later happens to the ORDER's adjustments (an order edit,
 * claim or exchange with `carry_over_promotions`). An order without the link (a draft order, converted or not)
 * registered no usage and has no entry here.
 */
export type OriginCart = {
  cart_id: string
  email: string | null
  customer_id: string | null
  /** Adjustment code (as stored) to the summed adjustment amount, line items and shipping methods together. */
  amounts: Map<string, number>
}

type Adjusted = { adjustments?: ({ code?: string | null; amount?: unknown } | null)[] | null } | null

/**
 * Per order id, its originating cart. Orders without an `order_cart` link are absent; so is an order whose linked
 * cart cannot be read (reported in `missing` as `{order_id, cart_id}`). Query failures propagate.
 */
export async function originatingCarts(
  query: { graph: (args: any) => Promise<{ data: unknown }> },
  orderIds: string[]
): Promise<{ carts: Map<string, OriginCart>; missing: { order_id: string; cart_id: string }[] }> {
  const carts = new Map<string, OriginCart>()
  const missing: { order_id: string; cart_id: string }[] = []
  if (!orderIds.length) return { carts, missing }
  const { data: links } = await query.graph({ entity: "order_cart", fields: ["order_id", "cart_id"], filters: { order_id: orderIds } })
  const cartByOrder = new Map((links as any[]).map((l) => [String(l.order_id), String(l.cart_id)]))
  if (!cartByOrder.size) return { carts, missing }
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "email",
      "customer_id",
      "items.adjustments.code",
      "items.adjustments.amount",
      "shipping_methods.adjustments.code",
      "shipping_methods.adjustments.amount",
    ],
    filters: { id: [...new Set(cartByOrder.values())] },
  })
  const byId = new Map((data as any[]).map((c) => [String(c.id), c]))
  for (const [orderId, cartId] of cartByOrder) {
    const cart = byId.get(cartId)
    if (!cart) {
      missing.push({ order_id: orderId, cart_id: cartId })
      continue
    }
    const amounts = new Map<string, number>()
    for (const holder of [...((cart.items ?? []) as Adjusted[]), ...((cart.shipping_methods ?? []) as Adjusted[])])
      for (const a of holder?.adjustments ?? []) {
        if (!a?.code) continue
        amounts.set(a.code, (amounts.get(a.code) ?? 0) + Number(a.amount ?? 0))
      }
    carts.set(orderId, { cart_id: cartId, email: cart.email ?? null, customer_id: cart.customer_id ?? null, amounts })
  }
  return { carts, missing }
}
