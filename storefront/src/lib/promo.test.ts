import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMO_COPY, appliedCodes, droppedCodes, errMsg, isNetworkError, normalisePromoCode, optionsLoader, placeCheck, promoErrorCopy, promoOutcome, promoPrecheck, summaryTotals } from './promo.ts';
import type { OptionsState, PlaceCart, PromoOutcomeCart, SummaryCart, SummaryTotals } from './promo.ts';

// Made-up codes and amounts only: this repo is public.
const withCode = (code: string, extra: PromoOutcomeCart = {}): PromoOutcomeCart => ({ promotions: [{ code }], ...extra });

test('normalisePromoCode trims, removes inner whitespace and uppercases', () => {
  assert.equal(normalisePromoCode(' kr-12 abc '), 'KR-12ABC');
  assert.equal(normalisePromoCode('  ab\tc\n d '), 'ABCD');
});
test('normalisePromoCode gives an empty string for empty or whitespace input', () => {
  assert.equal(normalisePromoCode(''), '');
  assert.equal(normalisePromoCode('   \t '), '');
});

test('promoOutcome: applied from a line-item adjustment alone', () => {
  assert.equal(promoOutcome(withCode('TEST-1', { items: [{ adjustments: [{ code: 'TEST-1', amount: 40 }] }] }), 'TEST-1'), 'applied');
});
test('promoOutcome: applied from a shipping-method adjustment alone', () => {
  assert.equal(promoOutcome(withCode('TEST-1', { shipping_methods: [{ adjustments: [{ code: 'TEST-1', amount: 12 }] }] }), 'TEST-1'), 'applied');
});
test('promoOutcome: applied from both kinds of adjustment', () => {
  const cart = withCode('TEST-1', { items: [{ adjustments: [{ code: 'TEST-1', amount: 30 }] }], shipping_methods: [{ adjustments: [{ code: 'TEST-1', amount: 5 }] }] });
  assert.equal(promoOutcome(cart, 'TEST-1'), 'applied');
});
test('promoOutcome: inactive when the code is present but no adjustment carries it', () => {
  assert.equal(promoOutcome(withCode('TEST-1', { items: [{ adjustments: [] }] }), 'TEST-1'), 'inactive');
});
test('promoOutcome: inactive when its only adjustments sum to 0', () => {
  assert.equal(promoOutcome(withCode('TEST-1', { items: [{ adjustments: [{ code: 'TEST-1', amount: 0 }] }] }), 'TEST-1'), 'inactive');
});
test('promoOutcome: not_applied when the code is absent from promotions, even with a stray adjustment', () => {
  assert.equal(promoOutcome({ promotions: [], items: [{ adjustments: [{ code: 'TEST-1', amount: 40 }] }] }, 'TEST-1'), 'not_applied');
  assert.equal(promoOutcome({}, 'TEST-1'), 'not_applied');
});
test('promoOutcome: an automatic promotion discount never masks an inactive code (judged per code)', () => {
  const cart: PromoOutcomeCart = {
    promotions: [{ code: 'A' }, { code: 'AUTO', is_automatic: true }],
    items: [{ adjustments: [{ code: 'AUTO', amount: 50 }] }],
  };
  assert.equal(promoOutcome(cart, 'A'), 'inactive');
});
test('promoOutcome: matches the stored code case-insensitively in promotions and adjustments', () => {
  assert.equal(promoOutcome({ promotions: [{ code: 'test-1' }], items: [{ adjustments: [{ code: 'Test-1', amount: 40 }] }] }, 'TEST-1'), 'applied');
});
test('promoOutcome: missing arrays and null amounts count as 0 and never throw', () => {
  assert.equal(promoOutcome({ promotions: [{ code: 'TEST-1' }], items: null, shipping_methods: null }, 'TEST-1'), 'inactive');
  assert.equal(promoOutcome({ promotions: [{ code: 'TEST-1' }], items: [{}, { adjustments: null }], shipping_methods: [{ adjustments: [{ code: 'TEST-1', amount: null }] }] }, 'TEST-1'), 'inactive');
  assert.equal(promoOutcome({ promotions: null }, 'TEST-1'), 'not_applied');
});

test('promoErrorCopy: the backend one-code refusal maps to one_code', () => {
  assert.equal(promoErrorCopy({ status: 400, message: 'Only one discount code can be used per order.' }), PROMO_COPY.one_code);
});
test('promoErrorCopy: the unknown-code 400 maps to invalid', () => {
  assert.equal(promoErrorCopy({ status: 400, message: 'The promotion code NOPE-1 is invalid' }), 'That code is not valid or has expired.');
});
test('promoErrorCopy: a 400 for a cart that was already completed maps to the already-placed copy', () => {
  assert.equal(promoErrorCopy({ status: 400, message: 'Cart cart_01TEST is already completed.' }), 'This order was already placed. Refresh the page.');
});
test('promoErrorCopy: any other 400 maps to generic, never invalid', () => {
  assert.equal(promoErrorCopy({ status: 400, message: 'Invalid request: Field promo_codes is required' }), 'Something went wrong. Please try again.');
  assert.equal(promoErrorCopy({ status: 400 }), 'Something went wrong. Please try again.');
});
test('promoErrorCopy: a failed fetch maps to network (Chrome, Firefox and Safari wording)', () => {
  assert.equal(promoErrorCopy(new TypeError('Failed to fetch')), PROMO_COPY.network);
  assert.equal(promoErrorCopy(new TypeError('NetworkError when attempting to fetch resource.')), PROMO_COPY.network);
  assert.equal(promoErrorCopy(new TypeError('Load failed')), PROMO_COPY.network);
});
test('promoErrorCopy: a TypeError that is a code bug, not the network, maps to generic', () => {
  assert.equal(promoErrorCopy(new TypeError("Cannot read properties of undefined (reading 'promotions')")), 'Something went wrong. Please try again.');
});
test('promoErrorCopy: a 500 or anything unknown maps to generic', () => {
  assert.equal(promoErrorCopy({ status: 500, message: 'boom' }), PROMO_COPY.generic);
  assert.equal(promoErrorCopy(undefined), PROMO_COPY.generic);
});

test('PROMO_COPY holds the exact approved strings', () => {
  assert.deepEqual(PROMO_COPY, {
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
  });
});

test('appliedCodes lists cart codes and skips automatic promotions and empty codes', () => {
  assert.deepEqual(appliedCodes({ promotions: [{ code: 'A' }, { code: 'AUTO', is_automatic: true }, { code: null }, { code: 'B', is_automatic: false }] }), ['A', 'B']);
  assert.deepEqual(appliedCodes({}), []);
  assert.deepEqual(appliedCodes({ promotions: null }), []);
});

test('promoPrecheck: empty cart is ok', () => {
  assert.equal(promoPrecheck({ promotions: [] }, 'B'), 'ok');
});
test('promoPrecheck: the same code in any case is already_applied', () => {
  assert.equal(promoPrecheck({ promotions: [{ code: 'A' }] }, 'A'), 'already_applied');
  assert.equal(promoPrecheck({ promotions: [{ code: 'A' }] }, 'a'), 'already_applied');
});
test('promoPrecheck: a different code while one is held is one_code', () => {
  assert.equal(promoPrecheck({ promotions: [{ code: 'A' }] }, 'B'), 'one_code');
});
test('promoPrecheck: an automatic promotion does not count as the shopper code', () => {
  assert.equal(promoPrecheck({ promotions: [{ code: 'AUTO', is_automatic: true }] }, 'B'), 'ok');
});

test('droppedCodes reports only shopper codes that disappeared', () => {
  assert.deepEqual(droppedCodes({ promotions: [{ code: 'A' }] }, { promotions: [{ code: 'A' }] }), []);
  assert.deepEqual(droppedCodes({ promotions: [{ code: 'A' }] }, { promotions: [] }), ['A']);
  assert.deepEqual(droppedCodes({ promotions: [] }, { promotions: [{ code: 'A' }] }), []);
  assert.deepEqual(droppedCodes({ promotions: [{ code: 'AUTO', is_automatic: true }] }, { promotions: [] }), []);
});
test('droppedCodes compares case-insensitively', () => {
  assert.deepEqual(droppedCodes({ promotions: [{ code: 'A' }] }, { promotions: [{ code: 'a' }] }), []);
});

const CONNECTION = 'We could not reach the shop. Check your connection and try again.';
test('isNetworkError: true only for a fetch TypeError (Chrome, Firefox, Safari)', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.')), true);
  assert.equal(isNetworkError(new TypeError('Load failed')), true);
  assert.equal(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'items')")), false);
  assert.equal(isNetworkError({ status: 500, message: 'Failed to fetch' }), false);
  assert.equal(isNetworkError(undefined), false);
});
test('errMsg: Safari "Load failed" gets the connection copy, like Chrome and Firefox', () => {
  assert.equal(errMsg(new TypeError('Load failed')), CONNECTION);
  assert.equal(errMsg(new TypeError('Failed to fetch')), CONNECTION);
  assert.equal(errMsg(new TypeError('NetworkError when attempting to fetch resource.')), CONNECTION);
});
test('errMsg: a short shop message passes through; a long or missing one gives the fallback', () => {
  assert.equal(errMsg({ status: 400, message: 'Pudo lockers only take small parcels.' }), 'Pudo lockers only take small parcels.');
  assert.equal(errMsg({ status: 500, message: 'x'.repeat(250) }, 'Fallback.'), 'Fallback.');
  assert.equal(errMsg(undefined), 'Something went wrong. Please try again.');
});
test('errMsg: never shows the internal pudo_locker field name', () => {
  const out = errMsg({ status: 400, message: 'Please choose your Pudo locker (pudo_locker) before selecting this shipping option.' });
  assert.equal(out, 'Tell us which Pudo locker you want it delivered to.');
});
test('errMsg: a proxy error with only an HTTP status text (no shop message) gives the fallback, never "Not Found"', () => {
  assert.equal(errMsg({ status: 404, message: 'Not Found', statusText: 'Not Found' }, 'Fallback.'), 'Fallback.');
  assert.equal(errMsg({ status: 502, message: 'Bad Gateway', statusText: 'Bad Gateway' }, 'Fallback.'), 'Fallback.');
});

// Checkout summary (P8): Subtotal - Discount + Delivery = Total in every state. Made-up option ids and amounts.
const COURIER = 'so_courier';
const LOCKER = 'so_locker';
const p8 = (t: SummaryTotals) => assert.equal(t.subtotal - t.discount + (t.ship ?? 0), t.total, `P8 broken: ${JSON.stringify(t)}`);
const cartWith = (c: Omit<SummaryCart, 'shipping_methods'>, method: string | null = COURIER): SummaryCart => ({ ...c, shipping_methods: method ? [{ shipping_option_id: method }] : [] });
// Courier R85 on the cart, a R40 shipping code: shipping_total is the post-discount R45, and the R40 is in discount_total.
const shipCodeCart = cartWith({ original_item_total: 800, item_total: 800, discount_total: 40, shipping_total: 45, original_shipping_total: 85, total: 845 });
// Courier R85 on the cart, a R120 item code.
const itemCodeCart = cartWith({ original_item_total: 800, item_total: 680, discount_total: 120, shipping_total: 85, original_shipping_total: 85, total: 765 });

test('summaryTotals: chosen option is the cart method, shipping code: the cart totals as Medusa gives them', () => {
  const t = summaryTotals(cartWith({ original_item_total: 549, item_total: 549, discount_total: 40, shipping_total: 45, original_shipping_total: 85, total: 594 }), COURIER, 85);
  assert.deepEqual(t, { subtotal: 549, discount: 40, ship: 85, total: 594 });
  p8(t);
});
test('summaryTotals: Pudo picked over a courier cart with a shipping code: the shipping discount is left out', () => {
  const t = summaryTotals(shipCodeCart, LOCKER, 99);
  assert.deepEqual(t, { subtotal: 800, discount: 0, ship: 99, total: 899 });
  p8(t);
});
test('summaryTotals: Pudo picked over a courier cart with an item code: the item discount stays', () => {
  const t = summaryTotals(itemCodeCart, LOCKER, 99);
  assert.deepEqual(t, { subtotal: 800, discount: 120, ship: 99, total: 779 });
  p8(t);
});
test('summaryTotals: Pudo picked over a courier cart with no code', () => {
  const t = summaryTotals(cartWith({ original_item_total: 800, item_total: 800, discount_total: 0, shipping_total: 85, original_shipping_total: 85, total: 885 }), LOCKER, 99);
  assert.deepEqual(t, { subtotal: 800, discount: 0, ship: 99, total: 899 });
  p8(t);
});
test('summaryTotals: no delivery chosen yet while the cart holds a discounted method: no delivery, no shipping discount', () => {
  const t = summaryTotals(shipCodeCart, '', null);
  assert.deepEqual(t, { subtotal: 800, discount: 0, ship: null, total: 800 });
  p8(t);
});
test('summaryTotals: cart without a method, item code, Pudo picked', () => {
  const t = summaryTotals(cartWith({ original_item_total: 800, item_total: 680, discount_total: 120, shipping_total: 0, original_shipping_total: 0, total: 680 }, null), LOCKER, 99);
  assert.deepEqual(t, { subtotal: 800, discount: 120, ship: 99, total: 779 });
  p8(t);
});
test('summaryTotals: chosen option has no price: delivery unknown, total is items only', () => {
  const t = summaryTotals(itemCodeCart, LOCKER, null);
  assert.deepEqual(t, { subtotal: 800, discount: 120, ship: null, total: 680 });
  p8(t);
});

test('isNetworkError: older iOS Safari wordings count as the network', () => {
  assert.equal(isNetworkError(new TypeError('The network connection was lost.')), true);
  assert.equal(isNetworkError(new TypeError('The Internet connection appears to be offline.')), true);
  assert.equal(isNetworkError(new TypeError('cancelled')), true);
  assert.equal(errMsg(new TypeError('The network connection was lost.')), CONNECTION);
  // Only the whole word "cancelled" is Safari's abort; a bug message that mentions it is not the network.
  assert.equal(isNetworkError(new TypeError('order.cancelled is not a function')), false);
});
test('errMsg: a JSON SyntaxError or a code-bug TypeError gets the fallback, never its raw message', () => {
  assert.equal(errMsg(new SyntaxError('Unexpected token < in JSON at position 0'), 'Fallback.'), 'Fallback.');
  assert.equal(errMsg(new TypeError("Cannot read properties of undefined (reading 'items')"), 'Fallback.'), 'Fallback.');
  assert.equal(errMsg({ message: 'no status, not an Error' }, 'Fallback.'), 'Fallback.');
});
test('errMsg: an Error the checkout throws itself passes through', () => {
  assert.equal(errMsg(new Error('Card payment is not available right now. Please choose EFT.'), 'Fallback.'), 'Card payment is not available right now. Please choose EFT.');
});

// place() method check (failure-hunter HIGH 1): at free delivery every method costs R0, so equal totals prove nothing.
const placed = (method: string | null, total: number, codes: string[] = []): PlaceCart => ({ total, promotions: codes.map((code) => ({ code })), shipping_methods: method ? [{ shipping_option_id: method }] : [] });
test('placeCheck: the cart holds a different method than the one on screen at an equal total: add it again', () => {
  assert.equal(placeCheck(placed(COURIER, 2700), placed(COURIER, 2700), LOCKER, 2700, false), 'readd');
});
test('placeCheck: still a different method after adding it again: stop with total_changed', () => {
  assert.equal(placeCheck(placed(COURIER, 2700), placed(COURIER, 2700), LOCKER, 2700, true), 'total_changed');
});
test('placeCheck: the cart has no method at all: add it again, then stop', () => {
  assert.equal(placeCheck(placed(null, 2700), placed(null, 2700), LOCKER, 2700, false), 'readd');
  assert.equal(placeCheck(placed(null, 2700), placed(null, 2700), LOCKER, 2700, true), 'total_changed');
});
test('placeCheck: same method and total: ok; a dropped code or a moved total still stops', () => {
  assert.equal(placeCheck(placed(LOCKER, 2700), placed(LOCKER, 2700), LOCKER, 2700, false), 'ok');
  assert.equal(placeCheck(placed(LOCKER, 2550, ['KR-T1']), placed(LOCKER, 2700), LOCKER, 2550, false), 'dropped');
  assert.equal(placeCheck(placed(LOCKER, 2700), placed(LOCKER, 2785), LOCKER, 2700, true), 'total_changed');
});

// Delivery options loader (HIGH 2: Try again and a code request racing). Made-up option ids.
type O = { id: string; amount: number | null };
const deferred = <T,>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((r) => setTimeout(r, 0));
function harness() {
  const seen = { options: [] as O[], state: 'loading' as OptionsState, lists: [] as ReturnType<typeof deferred<O[]>>[], prices: [] as ReturnType<typeof deferred<O>>[] };
  const loader = optionsLoader<O>({
    list: () => { const x = deferred<O[]>(); seen.lists.push(x); return x.promise; },
    price: () => { const x = deferred<O>(); seen.prices.push(x); return x.promise; },
    setOptions: (o) => { seen.options = o; },
    setState: (st) => { seen.state = st; },
  });
  return { loader, seen };
}
test('optionsLoader: a code applied while Try again is pricing never leaves "ready" with no options', async () => {
  const { loader, seen } = harness();
  void loader.load('cart_1');                // Try again
  await flush();
  seen.lists[0].resolve([{ id: 'so_a', amount: null }]);
  await flush();                             // its price run is now waiting on the shop
  const refreshed = loader.refresh('cart_1'); // the code request lands
  await flush();
  for (const l of seen.lists.slice(1)) l.resolve([{ id: 'so_a', amount: null }]);
  await flush();
  for (const p of seen.prices) p.resolve({ id: 'so_a', amount: 85 });
  await refreshed; await flush();
  assert.equal(seen.state, 'ready');
  assert.deepEqual(seen.options, [{ id: 'so_a', amount: 85 }]);
});
test('optionsLoader: price() reports whether its run won', async () => {
  const { loader, seen } = harness();
  const first = loader.price('cart_1', [{ id: 'so_a', amount: null }]);
  const second = loader.price('cart_1', [{ id: 'so_b', amount: null }]);
  seen.prices[1].resolve({ id: 'so_b', amount: 85 });
  seen.prices[0].resolve({ id: 'so_a', amount: 99 });
  assert.equal(await second, true);
  assert.equal(await first, false);
  assert.deepEqual(seen.options, [{ id: 'so_b', amount: 85 }]);
});
test('optionsLoader: an older load that fails late does not undo a newer ready', async () => {
  const { loader, seen } = harness();
  void loader.load('cart_1');
  const second = loader.load('cart_1');
  await flush();
  seen.lists[1].resolve([{ id: 'so_a', amount: null }]);
  await flush();
  seen.prices[0].resolve({ id: 'so_a', amount: 85 });
  await second;
  seen.lists[0].reject(new TypeError('Failed to fetch'));
  await flush();
  assert.equal(seen.state, 'ready');
});
test('optionsLoader: refresh once ready prices the current options without listing again', async () => {
  const { loader, seen } = harness();
  const l = loader.load('cart_1');
  await flush();
  seen.lists[0].resolve([{ id: 'so_a', amount: null }]);
  await flush();
  seen.prices[0].resolve({ id: 'so_a', amount: 85 });
  await l;
  const r = loader.refresh('cart_1');
  await flush();
  assert.equal(seen.lists.length, 1);
  seen.prices[1].resolve({ id: 'so_a', amount: 0 });
  await r;
  assert.equal(seen.state, 'ready');
  assert.deepEqual(seen.options, [{ id: 'so_a', amount: 0 }]);
});
