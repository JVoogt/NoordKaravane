import { test, mock } from 'node:test';
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

// The warn-once set is per process, so each test below uses tokens no other test fills.
const warnings = (fn: () => void): string[] => {
  const m = mock.method(console, 'warn', () => {});
  try { fn(); return m.mock.calls.map((c) => c.arguments.map(String).join(' ')); } finally { m.mock.restore(); }
};

test('an unresolved {{key}} or {{zar:key}} warns once per token per process, and the output is unchanged', () => {
  const ws = warnings(() => {
    assert.equal(fillWith('{{warn_a.missing}} {{warn_a.missing}} {{zar:warn_b.missing}}', cfg), '{{warn_a.missing}} {{warn_a.missing}} {{zar:warn_b.missing}}');
    assert.equal(fillWith('again {{warn_a.missing}} {{zar:warn_b.missing}}', cfg), 'again {{warn_a.missing}} {{zar:warn_b.missing}}');
  });
  assert.equal(ws.length, 2, ws.join('\n'));
  assert.ok(ws.some((w) => w.includes('{{warn_a.missing}}')), ws.join('\n'));
  assert.ok(ws.some((w) => w.includes('{{zar:warn_b.missing}}')), ws.join('\n'));
});

test('a {{zar:key}} on a non-number warns once and is left as written', () => {
  const ws = warnings(() => assert.equal(fillWith('{{zar:shipping.warn_text}}', { shipping: { warn_text: 'abc' } }), '{{zar:shipping.warn_text}}'));
  assert.equal(ws.length, 1, ws.join('\n'));
});

test('a value that is itself a placeholder warns once and is still printed as today', () => {
  const ws = warnings(() => {
    assert.equal(fillWith('Sold by {{warn_legal}}.', { warn_legal: '{{LEGAL_NAME}}' }), 'Sold by {{LEGAL_NAME}}.');
    assert.equal(fillWith('{{warn_legal}}', { warn_legal: '{{LEGAL_NAME}}' }), '{{LEGAL_NAME}}');
  });
  assert.equal(ws.length, 1, ws.join('\n'));
  assert.match(ws[0], /warn_legal/);
});

test('resolved tokens never warn', () => {
  assert.deepEqual(warnings(() => fillWith('{{legal_name}} {{zar:shipping.pudo_locker_price_zar}}', cfg)), []);
});
