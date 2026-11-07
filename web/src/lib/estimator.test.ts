import { describe, expect, it } from 'vitest';
import type { AddonId, AxleId } from '../data/pricing';
import { DEFAULT_AXLE, estimate } from './estimator';
import { waUrl } from './whatsapp';

// Worked totals are literals on purpose: the expected values never come from the code under test.
describe('estimate: default package', () => {
  it('prices Single, braked with no add-ons and builds the exact WhatsApp message', () => {
    const e = estimate('braked-1', []);
    expect(e.total).toBe(1499);
    expect(e.totalLabel).toBe('R1 499');
    expect(e.message).toBe(
      'Hi Noord Karavane, estimate from your site:\n• Single, braked: R1 499\nTotal est.: R1 499 (excl. parts)\nCan you confirm availability?',
    );
    expect(e.url).toBe(waUrl(e.message));
    expect(e.lines).toEqual([{ label: 'Single, braked', price: 1499 }]);
  });

  it('uses braked-1 as the default axle', () => {
    expect(DEFAULT_AXLE).toBe('braked-1');
  });
});

describe('estimate: totals', () => {
  it.each<[AxleId, AddonId[], number, string]>([
    ['braked-1', ['lift-kit'], 3479, 'R3 479'],
    ['braked-1', ['lift-kit', 'pre-trip'], 4329, 'R4 329'],
    ['braked-2', ['lift-kit', 'pre-trip', 'water-test', 'solar-quote'], 6329, 'R6 329'],
    ['unbraked-1', [], 949, 'R949'],
    ['braked-2', [], 2299, 'R2 299'],
  ])('%s + %j => %i', (axle, addons, total, label) => {
    const e = estimate(axle, addons);
    expect(e.total).toBe(total);
    expect(e.totalLabel).toBe(label);
  });

  it('renders priced add-ons as "+ price" and the free solar quote as POA, in the old message layout', () => {
    const e = estimate('braked-2', ['lift-kit', 'pre-trip', 'water-test', 'solar-quote']);
    expect(e.message).toBe(
      'Hi Noord Karavane, estimate from your site:\n' +
        '• Double, braked: R2 299\n' +
        '• 50 mm lift kit fitted: + R1 980\n' +
        '• Pre-trip safety inspection: + R850\n' +
        '• Water system pressure test: + R1 200\n' +
        '• Solar system quote (free): POA\n' +
        'Total est.: R6 329 (excl. parts)\n' +
        'Can you confirm availability?',
    );
    expect(e.message).toContain('• Solar system quote (free): POA');
    expect(e.lines).toEqual([
      { label: 'Double, braked', price: 2299 },
      { label: '50 mm lift kit fitted', price: 1980 },
      { label: 'Pre-trip safety inspection', price: 850 },
      { label: 'Water system pressure test', price: 1200 },
      { label: 'Solar system quote (free)', price: 0 },
    ]);
    expect(e.url).toBe(waUrl(e.message));
  });
});

describe('estimate: not sure on axle', () => {
  it('prices like Single, braked and flags the axle line for confirmation', () => {
    const e = estimate('other', []);
    expect(e.total).toBe(1499);
    expect(e.message).toContain('• Not sure: R1 499 (not sure on axle config, please confirm)\n');
  });
});

describe('estimate: robustness', () => {
  it('falls back to the default axle for an unknown axle id', () => {
    const e = estimate('bogus' as string as AxleId, []);
    expect(e.total).toBe(1499);
    expect(e.lines[0]).toEqual({ label: 'Single, braked', price: 1499 });
  });

  it('ignores unknown add-on ids', () => {
    const e = estimate('braked-1', ['nope' as string as AddonId, 'lift-kit']);
    expect(e.total).toBe(3479);
    expect(e.lines).toHaveLength(2);
  });

  it('counts a duplicated add-on id once', () => {
    const e = estimate('braked-1', ['lift-kit', 'lift-kit']);
    expect(e.total).toBe(3479);
    expect(e.lines).toHaveLength(2);
  });

  it('lists add-ons in catalogue order whatever order they were passed in', () => {
    const e = estimate('braked-1', ['water-test', 'lift-kit']);
    expect(e.lines.map((l) => l.label)).toEqual(['Single, braked', '50 mm lift kit fitted', 'Water system pressure test']);
  });
});
