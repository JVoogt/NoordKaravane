/**
 * Discount codes in the storefront (CONTRACTS "Vouchers"). Pure: no network, no DOM, no SDK.
 * The promo state is always derived from the cart Medusa returns (`cart.promotions` and the adjustments), never kept as
 * truth in local state. Automatic promotions (`is_automatic: true`) are never the shopper's code.
 */
export type PromoOutcome = 'applied' | 'inactive' | 'not_applied';
export type PromoCart = { promotions?: { code?: string | null; is_automatic?: boolean | null }[] | null };
export type PromoAdjustment = { code?: string | null; amount?: number | null };
export type PromoOutcomeCart = PromoCart & {
  items?: { adjustments?: PromoAdjustment[] | null }[] | null;
  shipping_methods?: { adjustments?: PromoAdjustment[] | null }[] | null;
};
export type PromoPrecheck = 'ok' | 'already_applied' | 'one_code';

export const PROMO_COPY = {
  invalid: 'That code is not valid or has expired.',
  network: 'We could not reach the shop. Try again.',
  not_applied: 'This code does not apply to your cart. It may need a bigger order, or it has expired or been used.',
  inactive: 'This code needs a bigger order. Add more to your cart to use it.',
  generic: 'Something went wrong. Please try again.',
  one_code: 'Only one code can be used per order. Remove the current code to use a different one.',
  dropped: 'Your discount code no longer applies to this order. Check the total and place your order again.',
  total_changed: 'Your total changed. Check the new total and place your order again.',
  already_placed: 'This order was already placed. Refresh the page.',
  already_applied: 'That code is already applied to this order.',
};

/** What the shopper typed, as Medusa stores codes: no whitespace anywhere, uppercase. */
export function normalisePromoCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

const same = (a: string | null | undefined, b: string) => !!a && a.toUpperCase() === b.toUpperCase();

/**
 * Judged per code from the adjustments, never from the cart-wide `discount_total` (an automatic promotion's discount
 * must not make an inactive shopper code look applied).
 */
export function promoOutcome(cart: PromoOutcomeCart, code: string): PromoOutcome {
  if (!(cart.promotions ?? []).some((p) => same(p?.code, code))) return 'not_applied';
  let sum = 0;
  for (const holder of [...(cart.items ?? []), ...(cart.shipping_methods ?? [])])
    for (const a of holder?.adjustments ?? []) if (same(a?.code, code)) sum += Number(a?.amount ?? 0);
  return sum > 0 ? 'applied' : 'inactive';
}

/** What fetch throws when the request never reached the shop (Chrome, Firefox, Safari). */
const NETWORK = /failed to fetch|networkerror|network error|load failed/i;

/**
 * Maps an SDK error from applying or removing a code to one line of copy. A 400 is matched on Medusa's own message;
 * a 400 we do not recognise is generic, never "invalid". Only a fetch failure is "network": any other TypeError is a bug.
 */
export function promoErrorCopy(e: unknown): string {
  const err = e as { status?: number; message?: string } | null | undefined;
  const m = String(err?.message ?? '');
  if (err?.status === 400) {
    if (/already completed/i.test(m)) return PROMO_COPY.already_placed;
    if (/one discount code/i.test(m)) return PROMO_COPY.one_code;
    if (/is invalid/i.test(m)) return PROMO_COPY.invalid;
    return PROMO_COPY.generic;
  }
  if (isNetworkError(e)) return PROMO_COPY.network;
  return PROMO_COPY.generic;
}

/** True only when fetch never reached the shop. Any other TypeError is a bug, not the network. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError && NETWORK.test(String(e.message ?? ''));
}

/**
 * One line of copy for a failed shop request: the connection line when fetch never reached the shop, otherwise the
 * shop's own short message. The backend's Pudo refusal names an internal field, so it maps to the checkout's locker copy.
 */
export function errMsg(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isNetworkError(e)) return 'We could not reach the shop. Check your connection and try again.';
  const err = e as { message?: string; statusText?: string } | null | undefined;
  const m = err?.message;
  // The SDK falls back to the HTTP status text when the body has no shop message (a proxy page): not shopper copy.
  if (!m || m === err?.statusText) return fallback;
  if (/pudo_locker/.test(m)) return 'Tell us which Pudo locker you want it delivered to.';
  return m.length < 200 ? m : fallback;
}

/** The shopper's codes on the cart (automatic promotions skipped). */
export function appliedCodes(cart: PromoCart): string[] {
  return (cart.promotions ?? []).filter((p) => p?.code && !p.is_automatic).map((p) => p!.code!);
}

/** One code per order, checked before any request. */
export function promoPrecheck(cart: PromoCart, code: string): PromoPrecheck {
  const held = appliedCodes(cart);
  if (held.some((c) => same(c, code))) return 'already_applied';
  return held.length ? 'one_code' : 'ok';
}

/** Shopper codes present on `before` and gone from `after`. */
export function droppedCodes(before: PromoCart, after: PromoCart): string[] {
  const now = appliedCodes(after);
  return appliedCodes(before).filter((c) => !now.some((n) => same(n, c)));
}
