import { describe, expect, it } from 'vitest';
import { pickReviews } from './reviews';

const r = (name: string, approved = true, lead = false) => ({ name, approved, lead });

describe('pickReviews', () => {
  it('shows at most three approved reviews, the first one large when none is flagged', () => {
    const got = pickReviews([r('a'), r('b', false), r('c'), r('d'), r('e')]);
    expect(got.lead?.name).toBe('a');
    expect(got.rest.map((x) => x.name)).toEqual(['c', 'd']);
  });

  it('keeps the flagged lead even when it is the fourth approved review', () => {
    const got = pickReviews([r('a'), r('b'), r('c'), r('d', true, true)]);
    expect(got.lead?.name).toBe('d');
    expect(got.rest.map((x) => x.name)).toEqual(['a', 'b']);
  });

  it('never shows an unapproved review, flagged or not', () => {
    const got = pickReviews([r('a', false, true), r('b')]);
    expect(got.lead?.name).toBe('b');
    expect(got.rest).toEqual([]);
  });

  it('throws when more than one review is flagged lead, naming how many', () => {
    expect(() => pickReviews([r('a', true, true), r('b'), r('c', true, true)])).toThrow(/2 reviews are flagged lead/);
  });

  it('counts an unapproved flagged review too: two lead flags in the data is a mistake either way', () => {
    expect(() => pickReviews([r('a', false, true), r('b', true, true)])).toThrow(/flagged lead/);
  });

  it('returns no lead and no rest when nothing is approved', () => {
    expect(pickReviews([r('a', false)])).toEqual({ lead: undefined, rest: [] });
  });
});
