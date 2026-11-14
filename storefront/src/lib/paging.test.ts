import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE, shownCount, moreLink } from './paging.ts';

test('shownCount: no or bad param shows one page', () => {
  assert.equal(PAGE_SIZE, 48);
  assert.equal(shownCount(null, 755), 48);
  assert.equal(shownCount('', 755), 48);
  assert.equal(shownCount('abc', 755), 48);
  assert.equal(shownCount('-5', 755), 48);
  assert.equal(shownCount('0', 755), 48);
});
test('shownCount: rounds up to whole pages and never past the total', () => {
  assert.equal(shownCount('96', 755), 96);
  assert.equal(shownCount('50', 755), 96);
  assert.equal(shownCount('99999', 755), 755);
  assert.equal(shownCount(null, 30), 30);
});
test('moreLink: next page keeps the filters, anchors the first new card, counts what is left', () => {
  const m = moreLink(new URL('https://s.test/?cat=braai&sort=low&q=fan'), 48, 755)!;
  const href = new URL(m.href, 'https://s.test');
  assert.equal(href.searchParams.get('show'), '96');
  assert.equal(href.searchParams.get('cat'), 'braai');
  assert.equal(href.searchParams.get('sort'), 'low');
  assert.equal(href.searchParams.get('q'), 'fan');
  assert.equal(href.hash, '#p-49');
  assert.equal(m.next, 48);
});
test('moreLink: replaces an existing show and offers only what is left', () => {
  const m = moreLink(new URL('https://s.test/category/x/?show=720'), 720, 755)!;
  assert.equal(m.href, '/category/x/?show=768#p-721');
  assert.equal(m.next, 35);
});
test('moreLink: nothing left, no link', () => {
  assert.equal(moreLink(new URL('https://s.test/'), 755, 755), null);
  assert.equal(moreLink(new URL('https://s.test/'), 30, 30), null);
});
