import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revealDelta } from './reveal.ts';

test('revealDelta: a box already in the clear does not scroll', () => {
  assert.equal(revealDelta({ top: 200, bottom: 330 }, 0, 844), 0);
});

test('revealDelta: a box under a bottom banner scrolls up above it', () => {
  // The phone case: Checkout box at 612-743, cookie banner from 562.
  assert.equal(revealDelta({ top: 612, bottom: 743 }, 0, 562), 743 - (562 - 16));
});

test('revealDelta: a box below the screen scrolls into view', () => {
  assert.equal(revealDelta({ top: 900, bottom: 1030 }, 0, 844), 1030 - 828);
});

test('revealDelta: a box under the sticky header scrolls down to clear it', () => {
  assert.equal(revealDelta({ top: 40, bottom: 170 }, 100, 844), 40 - 116);
});

test('revealDelta: a box taller than the clear area keeps its top in view', () => {
  assert.equal(revealDelta({ top: 600, bottom: 1100 }, 100, 562), 600 - 116);
});
