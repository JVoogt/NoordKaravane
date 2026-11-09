import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteLines, quoteHref, quoteMessage } from './quote.ts';

const items = [
  { id: 'a', product_handle: 'agv-180-degree-awning', product_title: 'AGV 180 degree awning' },
  { id: 'b', product_handle: 'renogy-100w-rigid-solar-panel', product_title: 'Renogy 100W' },
  { id: 'c', product_handle: null, product_title: 'Custom' },
  { id: 'd', product_title: 'No handle' },
];

test('quoteLines returns only cart lines whose product is quote-only', () => {
  assert.deepEqual(quoteLines(items, ['agv-180-degree-awning']).map((i) => i.id), ['a']);
});
test('quoteLines accepts a Set and finds nothing when no handle matches', () => {
  assert.equal(quoteLines(items, new Set(['nope'])).length, 0);
  assert.equal(quoteLines(items, new Set(['renogy-100w-rigid-solar-panel'])).length, 1);
});
test('lines without a product handle are never treated as quote-only', () => {
  assert.equal(quoteLines(items, ['']).length, 0);
});
test('quoteHref builds an encoded contact link with the quote topic', () => {
  const href = quoteHref('/shop/contact', ['AGV 180 degree awning', 'Side walls & more']);
  const url = new URL(href, 'https://x.test');
  assert.equal(url.pathname, '/shop/contact');
  assert.equal(url.searchParams.get('topic'), 'quote');
  assert.equal(url.searchParams.get('product'), 'AGV 180 degree awning | Side walls & more');
});
test('quoteHref caps very long product lists', () => {
  const href = quoteHref('/shop/contact', ['x'.repeat(500)]);
  assert.ok((new URL(href, 'https://x.test').searchParams.get('product') || '').length <= 200);
});
test('quoteMessage names the product and asks for delivery', () => {
  assert.match(quoteMessage('AGV 180 degree awning'), /quote.*delivery.*AGV 180 degree awning/i);
});
