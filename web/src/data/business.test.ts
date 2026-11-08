import { describe, expect, it } from 'vitest';
import { BUSINESS, DAY_ORDER } from './business';
import { ROUTES, SERVICE_SLUGS, servicePath } from './routes';

describe('BUSINESS facts', () => {
  it('holds the verbatim name, type and url', () => {
    expect(BUSINESS.name).toBe('Noord Karavane');
    expect(BUSINESS.schemaType).toBe('AutoRepair');
    expect(BUSINESS.url).toBe('https://noordkaravane.co.za');
  });

  it('holds phone and whatsapp number', () => {
    expect(BUSINESS.phone).toEqual({ e164: '+27833349357', display: '083 334 9357' });
    expect(BUSINESS.whatsappNumber).toBe('27833349357');
  });

  it('holds the address and geo', () => {
    expect(BUSINESS.address).toEqual({
      street: '252 General Beyers Street',
      locality: 'Pretoria North',
      city: 'Pretoria',
      region: 'Gauteng',
      postalCode: '0182',
      country: 'ZA',
    });
    expect(BUSINESS.geo).toEqual({ lat: -25.676593, lng: 28.1774316 });
  });

  it('holds links and the google rating with its as-of date', () => {
    expect(BUSINESS.links.facebook).toBe('https://www.facebook.com/NoordKaravane');
    expect(BUSINESS.links.googleProfile).toBe('https://share.google/T9FFV2QHsZb1VuVMD');
    expect(BUSINESS.links.googleMaps).toBe('https://www.google.com/maps?cid=1109550773885984048');
    expect(BUSINESS.links.kampi).toBe('https://kampi.co.za');
    expect(BUSINESS.links.mapsQuery).toContain('252+General+Beyers+Street');
    expect(BUSINESS.google).toEqual({ rating: 5.0, reviewCount: 24, asOf: '2026-11-07' });
  });

  it('holds the five cross-border countries and the recoveries note', () => {
    expect(BUSINESS.crossBorder.map((c) => c.code)).toEqual(['BW', 'MZ', 'ZW', 'NA', 'SZ']);
    expect(BUSINESS.crossBorder.map((c) => c.name)).toEqual([
      'Botswana',
      'Mozambique',
      'Zimbabwe',
      'Namibia',
      'Eswatini',
    ]);
    expect(BUSINESS.recoveriesNote).toBe('Recoveries 24/7');
  });

  it('holds the google profile hours per day', () => {
    expect(DAY_ORDER).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    for (const d of ['mon', 'tue', 'wed', 'thu'] as const) {
      expect(BUSINESS.hours[d]).toEqual({ opens: '08:00', closes: '16:00' });
    }
    expect(BUSINESS.hours.fri).toEqual({ opens: '08:00', closes: '14:00' });
    expect(BUSINESS.hours.sat).toBeNull();
    expect(BUSINESS.hours.sun).toBeNull();
  });

  it('lists areas served', () => {
    expect(BUSINESS.areaServed.length).toBeGreaterThan(0);
    expect(BUSINESS.areaServed).toContain('Pretoria North');
  });
});

describe('routes', () => {
  it('has exactly the five service slugs in display order', () => {
    expect([...SERVICE_SLUGS]).toEqual([
      'caravan-service',
      'repairs',
      'solar-electrical',
      'recoveries',
      'lift-kits',
    ]);
  });

  it('builds service paths with a trailing slash', () => {
    expect(servicePath('recoveries')).toBe('/services/recoveries/');
    expect(servicePath('caravan-service')).toBe('/services/caravan-service/');
  });

  it('lists all seven page paths', () => {
    expect(ROUTES.length).toBe(7);
    expect(ROUTES).toContain('/');
    expect(ROUTES).toContain('/find-us/');
    for (const s of SERVICE_SLUGS) expect(ROUTES).toContain(servicePath(s));
  });
});
