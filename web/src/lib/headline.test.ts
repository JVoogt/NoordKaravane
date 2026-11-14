import { describe, expect, it } from 'vitest';
import { splitHeadline } from './headline';

// The page headlines as they are published today (hand-typed here, not read from the content collection).
const PUBLISHED: Array<[string, string, string]> = [
  ['Caravan and trailer service in Pretoria North', 'Caravan and trailer service', 'in Pretoria North'],
  ['Caravan repairs in Pretoria North', 'Caravan repairs', 'in Pretoria North'],
  ['Caravan electrical and solar in Pretoria North', 'Caravan electrical and solar', 'in Pretoria North'],
  ['Caravan and trailer recoveries, nationwide and cross-border', 'Caravan and trailer recoveries,', 'nationwide and cross-border'],
  ['50 mm caravan lift kits, fitted in Pretoria North', '50 mm caravan lift kits,', 'fitted in Pretoria North'],
  ['Find the workshop in Pretoria North', 'Find the workshop', 'in Pretoria North'],
];

describe('splitHeadline', () => {
  it.each(PUBLISHED)('splits "%s" into its two display lines', (h1, first, second) => {
    expect(splitHeadline(h1)).toEqual([first, second]);
  });

  it('never changes the words: the two lines joined by one space are the headline', () => {
    for (const [h1] of PUBLISHED) {
      const [first, second] = splitHeadline(h1);
      expect(`${first} ${second}`).toBe(h1);
    }
  });

  it('splits at the first comma, even when " in " comes later', () => {
    expect(splitHeadline('Lift kits, fitted in a day, in Pretoria')).toEqual(['Lift kits,', 'fitted in a day, in Pretoria']);
  });

  it('splits before the last " in " when there is no comma', () => {
    expect(splitHeadline('Repairs in the workshop in Pretoria North')).toEqual(['Repairs in the workshop', 'in Pretoria North']);
  });

  it('leaves a headline with no comma and no " in " on one line', () => {
    expect(splitHeadline('Caravan repairs')).toEqual(['Caravan repairs', null]);
  });

  it('does not split when nothing would be left on either line', () => {
    expect(splitHeadline('Caravan repairs,')).toEqual(['Caravan repairs,', null]);
    expect(splitHeadline(', and repairs')).toEqual([', and repairs', null]);
  });
});
