import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMO_COPY, appliedCodes, droppedCodes, normalisePromoCode, promoErrorCopy, promoOutcome, promoPrecheck } from './promo.ts';
import type { PromoOutcomeCart } from './promo.ts';

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
test('promoErrorCopy: any other 400 maps to invalid', () => {
  assert.equal(promoErrorCopy({ status: 400, message: 'The promotion code NOPE-1 is invalid' }), PROMO_COPY.invalid);
});
test('promoErrorCopy: a failed fetch maps to network', () => {
  assert.equal(promoErrorCopy(new TypeError('Failed to fetch')), PROMO_COPY.network);
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
