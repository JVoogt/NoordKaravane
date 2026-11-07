import { describe, expect, it } from 'vitest';
import { ROUTES } from '../data/routes';
import { LEGACY_HASH_MAP, resolveLegacyHash } from './legacy-hash';

// The expected map is a literal copy of the plan's eight entries, not derived from the module under test.
const EXPECTED: Record<string, string> = {
  '#pricing': '/services/caravan-service/#pricing',
  '#process': '/services/caravan-service/#process',
  '#inspection-report': '/services/caravan-service/#inspection-report',
  '#promo': '/services/lift-kits/',
  '#faq': '/services/caravan-service/#faq',
  '#reviews': '/#reviews',
  '#contact': '/find-us/',
  '#kampi-widget': '/#rentals',
};

describe('LEGACY_HASH_MAP', () => {
  it('equals exactly the eight legacy entries', () => {
    expect({ ...LEGACY_HASH_MAP }).toEqual(EXPECTED);
  });

  it('only targets real routes', () => {
    for (const target of Object.values(LEGACY_HASH_MAP)) {
      expect(ROUTES).toContain(target.split('#')[0]);
    }
  });
});

describe('resolveLegacyHash', () => {
  it.each(Object.entries(EXPECTED).filter(([h]) => h !== '#reviews'))('%s resolves from the home page', (hash, target) => {
    expect(resolveLegacyHash(hash, '/')).toBe(target);
  });

  it('returns null for #reviews on Home (same page, let the browser scroll)', () => {
    expect(resolveLegacyHash('#reviews', '/')).toBeNull();
  });

  it('returns null when the target is the page we are already on', () => {
    expect(resolveLegacyHash('#pricing', '/services/caravan-service/')).toBeNull();
  });

  it('is case-insensitive on the hash', () => {
    expect(resolveLegacyHash('#PRICING', '/')).toBe('/services/caravan-service/#pricing');
  });

  it('still redirects a same-page target when the fragment differs (#kampi-widget to /#rentals)', () => {
    expect(resolveLegacyHash('#kampi-widget', '/')).toBe('/#rentals');
  });

  it.each(['#services', '#location', '', '#', '#unknown', '#__proto__', '#constructor'])('returns null for %j', (hash) => {
    expect(resolveLegacyHash(hash, '/')).toBeNull();
  });

  it('normalises a current path without a trailing slash', () => {
    expect(resolveLegacyHash('#pricing', '/services/caravan-service')).toBeNull();
    expect(resolveLegacyHash('#contact', '/services/repairs')).toBe('/find-us/');
  });
});
