import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK, footerIdentity, shippingFacts, usable, type Business } from './business-display.ts';

const real: Business = {
  ...FALLBACK,
  legal_name: 'Example Trading (Pty) Ltd', registration_number: '2020/000000/07', vat_number: '4000000000',
  physical_address: '1 Example Road, Testville, 0001', phone: '012 000 0000', email_general: 'hello@example.test', information_officer: 'A. Person',
};

test('footerIdentity on the FALLBACK config prints no placeholder and no NaN', () => {
  const f = footerIdentity(FALLBACK);
  const text = JSON.stringify(f);
  assert.ok(!text.includes('{{'), text);
  assert.ok(!text.includes('NaN'), text);
  assert.equal(f.name, null);
  assert.deepEqual(f.ids, []);
  assert.equal(f.email, null);
  assert.equal(f.officer, null);
  assert.equal(f.contact.length, 2);
  assert.equal(f.contact[0], '252 General Beyers Street, Pretoria North, Pretoria, 0182.');
  assert.match(f.contact[1], /^Tel \d{3} \d{3} \d{4}\.$/);
});

test('footerIdentity shows each segment with its separator once the value is usable', () => {
  assert.deepEqual(footerIdentity(real), {
    name: 'Example Trading (Pty) Ltd', ids: ['Reg. no. 2020/000000/07.', 'VAT no. 4000000000.'],
    contact: ['1 Example Road, Testville, 0001.', 'Tel 012 000 0000.'], email: 'hello@example.test', officer: 'Information Officer: A. Person.',
  });
});

test('footerIdentity drops empty, REPLACE_ME and missing values segment by segment', () => {
  const f = footerIdentity({ ...real, vat_number: 'REPLACE_ME', phone: '  ', information_officer: undefined as unknown as string });
  assert.deepEqual(f.ids, ['Reg. no. 2020/000000/07.']);
  assert.deepEqual(f.contact, ['1 Example Road, Testville, 0001.']);
  assert.equal(f.officer, null);
});

test('usable: the DD4 rule (non-empty, no {{...}}, no REPLACE_ME, strings only)', () => {
  assert.equal(usable('x'), true);
  for (const v of ['', '  ', '{{LEGAL_NAME}}', 'REPLACE_ME', 5, null, undefined]) assert.equal(usable(v), false, String(v));
});

test('shippingFacts on the FALLBACK config gives the three numbers', () => {
  assert.deepEqual(shippingFacts(FALLBACK), { freeOverZar: 2500, freeMaxKg: 5, courierFromZar: 85 });
});

test('shippingFacts never throws and never yields NaN on a partial, empty or missing shipping block', () => {
  const none = { freeOverZar: null, freeMaxKg: null, courierFromZar: null };
  for (const shipping of [{}, null, undefined, { tcg_bands: [] }, { tcg_bands: [{}] }, { free_shipping_threshold_zar: '2500', free_shipping_max_weight_g: 'x' }]) {
    const b = { ...FALLBACK, shipping } as unknown as Business;
    assert.deepEqual(shippingFacts(b), none, JSON.stringify(shipping));
  }
  const partial = { ...FALLBACK, shipping: { free_shipping_threshold_zar: 1500 } } as unknown as Business;
  assert.deepEqual(shippingFacts(partial), { freeOverZar: 1500, freeMaxKg: null, courierFromZar: null });
});
