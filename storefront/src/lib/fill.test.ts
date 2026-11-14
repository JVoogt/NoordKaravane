import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillWith } from './fill.ts';

const NBSP = ' '; // zar() groups thousands with a no-break space, so a price never wraps
const cfg = {
  legal_name: 'Example Trading (Pty) Ltd',
  shipping: { free_shipping_threshold_zar: 2500, pudo_locker_price_zar: 99, tcg_bands: [{ max_weight_g: 1000, price_zar: 85 }] },
};

test('{{zar:key}} renders a config number as a formatted price', () => {
  assert.equal(fillWith('Free over {{zar:shipping.free_shipping_threshold_zar}}.', cfg), `Free over R2${NBSP}500.`);
  assert.equal(fillWith('{{zar:shipping.pudo_locker_price_zar}}', cfg), 'R99');
  assert.equal(fillWith('{{ zar:shipping.tcg_bands.0.price_zar }}', cfg), 'R85');
});

test('{{zar:key}} on a non-number or unknown key is left as written', () => {
  assert.equal(fillWith('{{zar:legal_name}}', cfg), '{{zar:legal_name}}');
  assert.equal(fillWith('{{zar:nope.nothing}}', cfg), '{{zar:nope.nothing}}');
});

test('plain {{key}} tokens behave exactly as before (raw values, unknown keys left as written)', () => {
  assert.equal(fillWith('{{shipping.free_shipping_threshold_zar}}', cfg), '2500');
  assert.equal(fillWith('Sold by {{legal_name}}.', cfg), 'Sold by Example Trading (Pty) Ltd.');
  assert.equal(fillWith('{{missing_key}}', cfg), '{{missing_key}}');
  assert.equal(fillWith('R{{shipping.tcg_bands.0.price_zar}}', cfg), 'R85');
});
