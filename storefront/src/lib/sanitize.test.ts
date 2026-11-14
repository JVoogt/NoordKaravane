import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rebaseShopLinks, sanitizeHtml } from './sanitize.ts';

const desc = '<p>Pair it with the <a href="/shop/lumeno-battery-communication-cable/">cable</a> or the <a href="https://example.test/x">maker</a>.</p>';

test('NK: today\'s sanitiser output is unchanged (relative links lose their href)', () => {
  assert.equal(sanitizeHtml(desc), '<p>Pair it with the <a>cable</a> or the <a href="https://example.test/x" rel="noopener nofollow" target="_blank">maker</a>.</p>');
});

test('Kampi: a leading /shop/ in a description link is rewritten to the store base and kept as a local link', () => {
  assert.equal(
    sanitizeHtml(rebaseShopLinks(desc, '/'), { localLinks: true }),
    '<p>Pair it with the <a href="/lumeno-battery-communication-cable/">cable</a> or the <a href="https://example.test/x" rel="noopener nofollow" target="_blank">maker</a>.</p>',
  );
});

test('rebaseShopLinks: only a leading /shop/ in an href moves; other text and absolute URLs stay', () => {
  assert.equal(rebaseShopLinks('<a href="/shop/a/">x</a> /shop/ <a href="https://noordkaravane.co.za/shop/b/">y</a>', '/'),
    '<a href="/a/">x</a> /shop/ <a href="https://noordkaravane.co.za/shop/b/">y</a>');
  assert.equal(rebaseShopLinks("<a href='/shop/a/'>x</a>", '/'), "<a href='/a/'>x</a>");
});

test('rebaseShopLinks on the NK base /shop is a no-op', () => {
  assert.equal(rebaseShopLinks(desc, '/shop'), desc);
  assert.equal(rebaseShopLinks(desc, '/shop/'), desc);
});

test('localLinks never lets a protocol-relative or script URL through', () => {
  assert.equal(sanitizeHtml('<a href="//evil.test/x">a</a><a href="javascript:alert(1)">b</a>', { localLinks: true }), '<a>a</a><a>b</a>');
});
