import { describe, expect, it } from 'vitest';
import { text, serviceSchema } from './content-schema';

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

  it('rejects a whitespace-only title and an empty heroImage.src', () => {
    expect(serviceSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, heroImage: { src: '', alt: 'A caravan on a lift' } }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, heroImage: { src: '/a.jpg', alt: 'A caravan on a lift' } }).success).toBe(true);
  });

  it.each(['whatsappText', 'title'])('rejects an empty %s', (k) => {
    expect(serviceSchema.safeParse({ ...base, [k]: '' }).success).toBe(false);
  });
});
