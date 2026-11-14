import { describe, expect, it } from 'vitest';
import { listWithAnd } from './prose';

describe('listWithAnd', () => {
  it('joins three or more with commas and a final "and"', () => {
    expect(listWithAnd(['Botswana', 'Mozambique', 'Zimbabwe', 'Namibia', 'Eswatini'])).toBe('Botswana, Mozambique, Zimbabwe, Namibia and Eswatini');
  });

  it('joins two with "and" and no comma', () => {
    expect(listWithAnd(['Botswana', 'Namibia'])).toBe('Botswana and Namibia');
  });

  it('returns a single name as it is (no stray "and")', () => {
    expect(listWithAnd(['Botswana'])).toBe('Botswana');
  });

  it('throws on an empty list: a sentence cannot end in nothing', () => {
    expect(() => listWithAnd([])).toThrow(/empty list/);
  });
});
