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

// REM-FIX 1: a root-relative href that a browser resolves off-host must never survive as a bare local link.
const local = (href: string) => sanitizeHtml(`<a href="${href}">x</a>`, { localLinks: true });
const offHost = (out: string) => /href="(?:\/\/|\/\\|[^"]*evil)/.test(out) && !/rel="noopener nofollow" target="_blank"/.test(out);

test('localLinks: a backslash, tab or other control character in a root-relative href is not kept as a local link', () => {
  for (const href of ['/\\evil.test', '/\t/evil.test', '/\n/evil.test', '/ /evil.test', '/x\\..\\evil.test']) {
    const out = local(href);
    assert.ok(!offHost(out), `${JSON.stringify(href)} -> ${out}`);
    assert.equal(out, '<a>x</a>', JSON.stringify(href));
  }
});

test('localLinks: /shop/\\evil.test through rebaseShopLinks is dropped, not kept as /\\evil.test', () => {
  assert.equal(sanitizeHtml(rebaseShopLinks('<a href="/shop/\\evil.test/x">x</a>', '/'), { localLinks: true }), '<a>x</a>');
});

test('localLinks: a path that normalises to //host (dot segments) is dropped', () => {
  assert.equal(local('/.//evil.test'), '<a>x</a>');
  assert.equal(local('/x/..//evil.test'), '<a>x</a>');
});

test('localLinks: /%5Cevil.test stays a same-host path (percent-encoded, never decoded to a backslash)', () => {
  assert.equal(local('/%5Cevil.test'), '<a href="/%5Cevil.test">x</a>');
});

test('localLinks: an entity-encoded backslash cannot smuggle through (esc() escapes the ampersand)', () => {
  assert.equal(local('/&#92;evil.test'), '<a href="/&amp;#92;evil.test">x</a>');
  assert.equal(local('/&#x5c;evil.test'), '<a href="/&amp;#x5c;evil.test">x</a>');
});

test('localLinks: a legitimate path with query and fragment survives unchanged', () => {
  assert.equal(local('/x/?a=1#b'), '<a href="/x/?a=1#b">x</a>');
  assert.equal(local('/lumeno-battery-communication-cable/'), '<a href="/lumeno-battery-communication-cable/">x</a>');
});
