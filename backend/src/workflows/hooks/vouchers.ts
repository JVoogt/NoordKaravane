import { cancelOrderWorkflow, completeCartWorkflow, updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { assertOneCodeAtCompletion, assertOneCodePerCart, onOrderCanceled } from "../../lib/vouchers/lifecycle"

/*
 * Discount-code order lifecycle (CONTRACTS.md, Vouchers; logic in lib/vouchers/lifecycle.ts).
 * Each Medusa workflow hook takes exactly ONE handler: a second registration anywhere throws
 * "Cannot define multiple hook handlers" at boot. Add any further logic for these three hooks HERE.
 */

// A cancelled cart order (EFT unpaid job, admin or script) gives its code back; a draft order gives nothing back. Never fails the cancel.
cancelOrderWorkflow.hooks.orderCanceled(async ({ order }, { container }) => {
  await onOrderCanceled(container, order.id)
})

// At most one code per cart: refuse a change that would grow the count past one. Refreshes are never refused.
updateCartPromotionsWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const current = ((cart as any)?.promotions ?? []).map((p: any) => p?.code).filter(Boolean) as string[]
  await assertOneCodePerCart(container, {
    action: ((input as any).action ?? "add") as "add" | "replace" | "remove",
    current,
    incoming: ((input as any).promo_codes ?? []) as string[],
  })
})

// Backstop: a cart holding more than one code never completes, whatever path put them there.
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  await assertOneCodeAtCompletion(container, cart as any)
})
