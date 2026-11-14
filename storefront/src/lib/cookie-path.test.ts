import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookiePath } from './cookie-path.ts';

test('NK base keeps the cart cookie on /shop, with or without a trailing slash', () => {
  assert.equal(cookiePath('/shop'), '/shop');
  assert.equal(cookiePath('/shop/'), '/shop');
});
test('Kampi base / (or an empty base) puts the cart cookie on /', () => {
  assert.equal(cookiePath('/'), '/');
  assert.equal(cookiePath(''), '/');
});
