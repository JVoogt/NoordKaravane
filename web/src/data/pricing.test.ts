import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADDONS, AXLE_OPTIONS, fmtR } from './pricing';

describe('fmtR', () => {
  it.each([
    [0, 'R0'],
    [949, 'R949'],
    [1499, 'R1 499'],
    [2299, 'R2 299'],
    [12345, 'R12 345'],
    [1234567, 'R1 234 567'],
  ])('formats %i as %s', (n, out) => {
    expect(fmtR(n)).toBe(out);
  });

  it('uses only digits and plain U+0020 (no no-break space look-alikes)', () => {
    for (const n of [0, 949, 1499, 2299, 12345, 1234567]) {
      const s = fmtR(n);
      expect(s).toMatch(/^R[0-9 ]+$/);
      expect(s).not.toContain(String.fromCharCode(0x00a0));
      expect(s).not.toContain(String.fromCharCode(0x202f));
    }
  });
});

describe('price constants', () => {
  it('AXLE_OPTIONS matches the old page', () => {
    expect(AXLE_OPTIONS).toEqual([
      { id: 'unbraked-1', label: 'Single, unbraked', price: 949 },
      { id: 'braked-1', label: 'Single, braked', price: 1499 },
      { id: 'braked-2', label: 'Double, braked', price: 2299 },
      { id: 'other', label: 'Not sure', price: 1499 },
    ]);
  });

  it('ADDONS matches the old page', () => {
    expect(ADDONS).toEqual([
      { id: 'lift-kit', label: '50 mm lift kit fitted', price: 1980 },
      { id: 'pre-trip', label: 'Pre-trip safety inspection', price: 850 },
      { id: 'water-test', label: 'Water system pressure test', price: 1200 },
      { id: 'solar-quote', label: 'Solar system quote (free)', price: 0 },
    ]);
  });

  it('has unique ids and non-negative integer prices', () => {
    for (const list of [AXLE_OPTIONS, ADDONS]) {
      const ids = list.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const o of list) {
        expect(Number.isInteger(o.price)).toBe(true);
        expect(o.price).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('pricing.ts source', () => {
  it('contains no R-prefixed amount (comments included) and no toLocaleString', () => {
    const src = readFileSync(new URL('./pricing.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bR\d/);
    expect(src).not.toContain('toLocaleString');
  });
});
