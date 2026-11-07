import { describe, expect, it } from 'vitest';
import { text, serviceSchema, assertRelatedOk } from './content-schema';

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
    title: 't', description: 'd', h1: 'h', eyebrow: 'e', order: 1,
    whatsappText: 'Hi there', ctaLabel: 'c', schemaName: 's',
    faq: [{ q: 'q', a: 'a' }], related: [],
  };

  it('accepts a complete entry', () => {
    expect(serviceSchema.safeParse(base).success).toBe(true);
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

  it.each(['whatsappText', 'title'])('rejects an empty %s', (k) => {
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
