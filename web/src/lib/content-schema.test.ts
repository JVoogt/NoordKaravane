import { describe, expect, it } from 'vitest';
import { ADDONS, AXLE_OPTIONS } from '../data/pricing';
import { text, serviceSchema, assertRelatedOk, priceAmount } from './content-schema';

describe('content text field', () => {
  it('rejects the empty string (blank whatsapp chat, empty <title>)', () => {
    expect(text.safeParse('').success).toBe(false);
  });

  it.each(['   ', '\t\n', '\u00a0'])('rejects whitespace-only %j', (v) => {
    expect(text.safeParse(v).success).toBe(false);
  });

  it('expands tokens in a non-empty string', () => {
    const r = text.safeParse('Open {hours}');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toContain('{hours}');
  });
});

describe('service frontmatter schema', () => {
  const base = {
    title: 't', description: 'd', h1: 'h', lede: 'l', order: 1,
    whatsappText: 'Hi there', ctaLabel: 'c', schemaName: 's',
    faqTitle: 'f', faq: [{ q: 'q', a: 'a' }], related: [],
  };

  it('accepts a complete entry', () => {
    expect(serviceSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an emergency safety line and a what-to-send checklist, and rejects a thin or loose checklist', () => {
    const checklist = { heading: 'What to send us', items: ['Your live location', 'What happened'] };
    expect(serviceSchema.safeParse({ ...base, safety: 'Call emergency services first.', checklist }).success).toBe(true);
    expect(serviceSchema.safeParse({ ...base, checklist: { heading: 'h', items: ['only one'] } }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, checklist: { ...checklist, extra: 1 } }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, safety: '  ' }).success).toBe(false);
  });

  it('rejects a whitespace-only title', () => {
    expect(serviceSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
  });

  it('rejects a duplicate related slug and an unknown one', () => {
    expect(serviceSchema.safeParse({ ...base, related: ['repairs', 'repairs'] }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, related: ['repairs', 'recoveries'] }).success).toBe(true);
    expect(serviceSchema.safeParse({ ...base, related: ['nope'] }).success).toBe(false);
  });

  it('rejects a key the schema does not know, so a dead field (heroImage) cannot hide in frontmatter', () => {
    expect(serviceSchema.safeParse({ ...base, heroImage: { src: '/a.jpg', alt: 'A caravan on a lift' } }).success).toBe(false);
  });

  it('rejects the retired eyebrow key and requires lede and faqTitle', () => {
    expect(serviceSchema.safeParse({ ...base, eyebrow: 'e' }).success).toBe(false);
    const { lede: _l, ...noLede } = base;
    const { faqTitle: _f, ...noFaqTitle } = base;
    expect(serviceSchema.safeParse(noLede).success).toBe(false);
    expect(serviceSchema.safeParse(noFaqTitle).success).toBe(false);
  });

  it('priceFrom names a pricing.ts id, never a typed amount', () => {
    expect(serviceSchema.safeParse({ ...base, priceFrom: { id: 'unbraked-1', from: true } }).success).toBe(true);
    expect(serviceSchema.safeParse({ ...base, priceFrom: { id: 'lift-kit', from: false } }).success).toBe(true);
    expect(serviceSchema.safeParse({ ...base, priceFrom: { id: 'nope', from: true } }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, priceFrom: { amount: 949, from: true } }).success).toBe(false);
  });

  it('priceAmount resolves the id from pricing.ts and throws on an unknown one', () => {
    expect(priceAmount('unbraked-1')).toBe(AXLE_OPTIONS.find((o) => o.id === 'unbraked-1')!.price);
    expect(priceAmount('lift-kit')).toBe(ADDONS.find((o) => o.id === 'lift-kit')!.price);
    expect(() => priceAmount('nope')).toThrow(/nope/);
  });

  it.each(['whatsappText', 'title', 'lede', 'faqTitle'])('rejects an empty %s', (k) => {
    expect(serviceSchema.safeParse({ ...base, [k]: '' }).success).toBe(false);
  });
});

describe('assertRelatedOk: a page never lists itself', () => {
  it('throws when related contains the page own slug', () => {
    expect(() => assertRelatedOk('repairs', ['caravan-service', 'repairs'])).toThrow(/repairs/);
  });

  it('passes for other slugs', () => {
    expect(() => assertRelatedOk('repairs', ['caravan-service', 'recoveries'])).not.toThrow();
  });
});
