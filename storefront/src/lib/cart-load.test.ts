import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCart } from './cart-load.ts';

type C = { id: string; completed_at?: string | null };
const tracker = () => { const t = { cleared: 0, forget: () => { t.cleared += 1; } }; return t; };
const fetchError = (status: number, message: string) => Object.assign(new Error(message), { status, statusText: '' });

test('loadCart returns an open cart and keeps the cookie', async () => {
  const t = tracker();
  assert.deepEqual(await loadCart<C>('cart_1', async () => ({ id: 'cart_1', completed_at: null }), t.forget), { id: 'cart_1', completed_at: null });
  assert.equal(t.cleared, 0);
});
test('loadCart forgets a completed cart and returns null', async () => {
  const t = tracker();
  assert.equal(await loadCart<C>('cart_1', async () => ({ id: 'cart_1', completed_at: '2031-07-01T10:00:00Z' }), t.forget), null);
  assert.equal(t.cleared, 1);
});
test('loadCart forgets a cart the shop no longer has (404) and returns null', async () => {
  const t = tracker();
  assert.equal(await loadCart<C>('cart_1', async () => { throw fetchError(404, "Cart with id 'cart_1' not found"); }, t.forget), null);
  assert.equal(t.cleared, 1);
});
test('loadCart keeps the cookie and rethrows when the shop cannot be reached (TypeError)', async () => {
  const t = tracker();
  const outage = new TypeError('Failed to fetch');
  await assert.rejects(loadCart<C>('cart_1', async () => { throw outage; }, t.forget), (e) => e === outage);
  assert.equal(t.cleared, 0);
});
test('loadCart keeps the cookie and rethrows on a server error (500)', async () => {
  const t = tracker();
  await assert.rejects(loadCart<C>('cart_1', async () => { throw fetchError(500, 'An unknown error occurred.'); }, t.forget), /unknown error/);
  assert.equal(t.cleared, 0);
});
test('loadCart keeps the cookie and rethrows on a proxy 404 with an empty message (Traefik over HTTP/2)', async () => {
  const t = tracker();
  await assert.rejects(loadCart<C>('cart_1', async () => { throw fetchError(404, ''); }, t.forget), (e) => (e as { status?: number }).status === 404);
  assert.equal(t.cleared, 0);
});
test('loadCart keeps the cookie and rethrows on a proxy 404 that says Not Found', async () => {
  const t = tracker();
  await assert.rejects(loadCart<C>('cart_1', async () => { throw fetchError(404, 'Not Found'); }, t.forget), /Not Found/);
  assert.equal(t.cleared, 0);
});
test('loadCart keeps the cookie on a 404 about a different cart', async () => {
  const t = tracker();
  await assert.rejects(loadCart<C>('cart_1', async () => { throw fetchError(404, "Cart with id 'cart_2' not found"); }, t.forget), /cart_2/);
  assert.equal(t.cleared, 0);
});
