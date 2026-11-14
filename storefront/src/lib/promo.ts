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

/**
 * What fetch throws when the request never reached the shop (Chrome, Firefox, Safari, and older iOS Safari, which
 * reports an aborted request as the bare word "cancelled").
 */
const NETWORK = /failed to fetch|networkerror|network error|load failed|network connection was lost|internet connection appears to be offline|^cancelled$/i;

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

/** The one line shown when the shop could not be reached (errMsg, the cart page, a stop whose new cart did not load). */
export const CONNECTION = 'We could not reach the shop. Check your connection and try again.';

export type ErrInfo = { status?: unknown; name?: string; message?: string; stack?: string };
/**
 * What a log keeps from a failed request, never the whole object. An HTTP error (numeric status) keeps status, name and
 * message. Any other error is a fetch failure or a code bug, so it also keeps its stack. `message: false` leaves the
 * message out, and the stack's header with it (Chromium repeats the message there): PromoCode uses that, because a
 * message can echo the code the shopper typed.
 */
export function errInfo(e: unknown, { message = true }: { message?: boolean } = {}): ErrInfo {
  const x = e as { status?: unknown; name?: string; message?: string; stack?: string } | null | undefined;
  const info: ErrInfo = { status: x?.status, name: x?.name };
  if (message) info.message = x?.message;
  if (typeof x?.status !== 'number' && typeof x?.stack === 'string') {
    // Chromium starts the stack with "Name: message"; Firefox and Safari list only the frames.
    const head = `${x.name}: ${x.message}`;
    info.stack = message || !x.stack.startsWith(head) ? x.stack : x.stack.slice(head.length).replace(/^\n/, '');
  }
  return info;
}

/** True only when fetch never reached the shop. Any other TypeError is a bug, not the network. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError && NETWORK.test(String(e.message ?? ''));
}

/**
 * One line of copy for a failed shop request: the connection line when fetch never reached the shop, otherwise the
 * shop's own short message. The backend's Pudo refusal names an internal field, so it maps to the checkout's locker copy.
 * A raw message is shown only from the shop (an error with a numeric HTTP status) or from a plain Error the checkout
 * throws itself; anything else (a JSON SyntaxError, a code-bug TypeError) gets the fallback.
 */
export function errMsg(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isNetworkError(e)) return CONNECTION;
  const err = e as { status?: unknown; message?: string; statusText?: string } | null | undefined;
  const own = !!err && Object.getPrototypeOf(err) === Error.prototype;
  if (!own && typeof err?.status !== 'number') return fallback;
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

export type SummaryCart = {
  total: number; item_total: number; discount_total: number; shipping_total: number;
  original_item_total?: number; original_shipping_total?: number;
  shipping_methods?: { shipping_option_id: string }[] | null;
};
export type SummaryTotals = { subtotal: number; discount: number; ship: number | null; total: number };

/**
 * Every number the checkout summary shows, so that Subtotal - Discount + Delivery = Total holds in every state (P8).
 * `shipId` is the delivery option the shopper picked, `chosenAmount` its listed price (null when not priced or none).
 */
export function summaryTotals(cart: SummaryCart, shipId: string, chosenAmount: number | null): SummaryTotals {
  const subtotal = cart.original_item_total ?? cart.item_total;
  const matches = !!shipId && cart.shipping_methods?.[0]?.shipping_option_id === shipId;
  // The cart's own totals hold when its method is the one picked. Delivery is the pre-discount fee: a code that
  // discounts shipping is already in Discount, so it is subtracted once.
  if (matches) return { subtotal, discount: cart.discount_total, ship: cart.original_shipping_total ?? cart.shipping_total, total: cart.total };
  // Picked option differs from the cart's method (Pudo waits for Place order): the cart's shipping adjustments belong
  // to a method that will be replaced, so Discount is the item discount only and Total is an estimate. place() still
  // stops before payment if the real total differs.
  const discount = subtotal - cart.item_total;
  const ship = shipId ? chosenAmount : null;
  return { subtotal, discount, ship, total: subtotal - discount + (ship ?? 0) };
}

/** Shopper codes present on `before` and gone from `after`. */
export function droppedCodes(before: PromoCart, after: PromoCart): string[] {
  const now = appliedCodes(after);
  return appliedCodes(before).filter((c) => !now.some((n) => same(n, c)));
}

export type PlaceCart = PromoCart & { total: number; shipping_methods?: { shipping_option_id: string }[] | null };
export type PlaceCheck = 'ok' | 'readd' | 'dropped' | 'total_changed';

/**
 * place()'s last check before payment, on the cart read back from the shop. `shownTotal` is the Total the shopper saw,
 * `shipId` the delivery option on screen, `readded` true once place() has already added that option again.
 */
export function placeCheck(before: PromoCart, fresh: PlaceCart, shipId: string, shownTotal: number | null | undefined, readded: boolean): PlaceCheck {
  // At free delivery every method costs R0, so an equal total does not prove the cart holds the method on screen.
  const otherMethod = fresh.shipping_methods?.[0]?.shipping_option_id !== shipId;
  if (otherMethod && !readded) return 'readd';
  // Once the re-add has been tried, a dropped code gets its own line before the method mismatch.
  if (droppedCodes(before, fresh).length > 0) return 'dropped';
  if (otherMethod) return 'total_changed';
  if (shownTotal != null && Math.round(fresh.total * 100) !== Math.round(shownTotal * 100)) return 'total_changed';
  return 'ok';
}

/**
 * The line place() shows when it stops: the stop's own line once the new cart is on screen, otherwise the connection
 * line (the old total is still showing, so "check the new total" would be wrong).
 */
export function stopCopy(check: PlaceCheck, reloaded: boolean): string {
  if (!reloaded) return CONNECTION;
  return check === 'dropped' ? PROMO_COPY.dropped : PROMO_COPY.total_changed;
}

export type OptionsState = 'loading' | 'ready' | 'failed';
export type OptionsLoaderDeps<O> = {
  /** The delivery options listed for the cart. May throw. */
  list: (cartId: string) => Promise<O[]>;
  /** One option priced for the cart. Never throws (a failed price comes back flagged). */
  price: (cartId: string, o: O) => Promise<O>;
  setOptions: (o: O[]) => void;
  setState: (s: OptionsState) => void;
  onError?: (e: unknown) => void;
};

/**
 * Lists and prices the checkout's delivery options. Pure: the shop calls and the setters are passed in. It keeps its own
 * copy of the state and options it last set, so a caller never reads them from a stale render.
 */
export function optionsLoader<O>(d: OptionsLoaderDeps<O>) {
  let seq = 0;
  let loads = 0;
  let state: OptionsState = 'loading';
  let options: O[] = [];
  const setState = (s: OptionsState) => { state = s; d.setState(s); };
  /** Prices `listed` for the cart. The latest run wins; returns whether this run won. */
  async function price(cartId: string, listed: O[]): Promise<boolean> {
    const run = ++seq;
    const priced = await Promise.all(listed.map((o) => d.price(cartId, o)));
    if (run !== seq) return false;
    options = priced; d.setOptions(priced);
    return true;
  }
  /**
   * Lists the options for the cart and prices them. Never throws: a failure sets 'failed'. Only the latest load prices
   * its list or sets a state (lists can come back out of order), and 'ready' only when its own price run won (a later
   * run's options are the ones on screen).
   */
  async function load(cartId: string): Promise<void> {
    const mine = ++loads;
    setState('loading');
    try {
      const listed = await d.list(cartId);
      if (mine !== loads) return;
      if (await price(cartId, listed) && mine === loads) setState('ready');
    } catch (e) { d.onError?.(e); if (mine === loads) setState('failed'); }
  }
  /**
   * After the cart changed (a code, a place() stop): price the options on screen again once they are ready, otherwise
   * (a load in flight or failed) list them again, so a run with no options never wins over a load.
   */
  function refresh(cartId: string): Promise<unknown> {
    return state === 'ready' ? price(cartId, options) : load(cartId);
  }
  return { load, price, refresh, state: () => state };
}
