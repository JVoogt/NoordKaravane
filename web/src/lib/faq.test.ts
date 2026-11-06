import { describe, expect, it } from 'vitest';
import { BUSINESS } from '../data/business';
import { expandTokens, faqPlainText, normalizeForParity } from './faq';
import { formatHoursProse } from './hours';

describe('expandTokens', () => {
  it('expands {hours} from the hours module', () => {
    expect(expandTokens('{hours}')).toBe(formatHoursProse(BUSINESS.hours));
  });

  it('expands {price:<id>} from pricing with spaced grouping', () => {
    expect(expandTokens('{price:braked-1}')).toBe('R1 499');
    expect(expandTokens('{price:lift-kit}')).toBe('R1 980');
    expect(expandTokens('{price:unbraked-1}')).toBe('R949');
    expect(expandTokens('From {price:braked-2} fitted')).toBe('From R2 299 fitted');
  });

  it('leaves text without tokens untouched', () => {
    expect(expandTokens('plain text, no tokens')).toBe('plain text, no tokens');
  });

  it('throws on an unknown price id', () => {
    expect(() => expandTokens('{price:nope}')).toThrow();
  });

  it('throws on an unknown token', () => {
    expect(() => expandTokens('{nope}')).toThrow();
  });
});

describe('faqPlainText', () => {
  it('joins answer, list with "; " and note with single spaces', () => {
    expect(faqPlainText({ q: 'q', a: 'a', list: ['x', 'y'], note: 'n' })).toBe('a x; y n');
  });

  it('works with the answer alone and expands tokens everywhere', () => {
    expect(faqPlainText({ q: 'q', a: 'from {price:unbraked-1}' })).toBe('from R949');
    expect(faqPlainText({ q: 'q', a: 'a', note: '{price:lift-kit}' })).toBe('a R1 980');
  });
});

describe('normalizeForParity', () => {
  it('lowercases and strips everything that is not a-z0-9', () => {
    expect(normalizeForParity('A, b-C!')).toBe('abc');
    expect(normalizeForParity("R1 499 · it's")).toBe('r1499its');
  });
});
