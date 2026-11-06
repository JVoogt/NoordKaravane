import { describe, expect, it } from 'vitest';
import { ADDONS, AXLE_OPTIONS, fmtR } from './pricing';
import { SERVICE_SLUGS } from './routes';
import { SERVICES, SERVICE_LIST, serviceMeta } from './services';

const EM_DASH = String.fromCharCode(0x2014);

// Verbatim from the plan's SERVICES table (old page copy; nothing invented).
const EXPECTED = {
  'caravan-service': {
    name: 'Caravan service',
    blurb:
      "Full caravan and trailer servicing. Mechanical, structural and cosmetic repairs, executed by technicians who work on caravans every day, not as a side line. Pre-trip checks: brakes, tyres, lights, signals, gas seals. We sign it off or we don't.",
    tag: 'From R949',
  },
  repairs: {
    name: 'Repairs',
    blurb:
      'Wheel bearings, brakes, suspension, leaf springs, coupling and jockey wheel work. Pumps, tanks, geysers, pipe repairs and full plumbing overhauls. Floors, walls and frames restored to solid condition.',
    tag: 'Quote before work',
  },
  'solar-electrical': {
    name: 'Electrical and solar',
    blurb: 'Panels, charge controllers, LiFePO₄ banks, inverters and proper 12 V / 220 V rewiring.',
    tag: 'Quote on brief',
  },
  recoveries: {
    name: 'Recoveries',
    blurb:
      'Breakdowns, accidents, roadside. Local nationwide and cross-border to Botswana, Mozambique, Zimbabwe, Namibia and Eswatini. One number, one operator.',
    tag: 'Cross-border ready',
  },
  'lift-kits': {
    name: '50 mm lift kits',
    blurb: 'Fitted at the workshop. Easier towing, better clearance, protects stabilisers.',
    tag: 'R1 980 fitted',
  },
} as const;

describe('SERVICES keyed by the one slug list', () => {
  it('has exactly the SERVICE_SLUGS keys', () => {
    expect(Object.keys(SERVICES).sort()).toEqual([...SERVICE_SLUGS].sort());
  });

  it('lists services in SERVICE_SLUGS order', () => {
    expect(SERVICE_LIST.map((s) => s.slug)).toEqual([...SERVICE_SLUGS]);
  });

  it('each entry slug equals its key and has non-empty copy', () => {
    for (const s of SERVICE_SLUGS) {
      expect(SERVICES[s].slug).toBe(s);
      expect(SERVICES[s].name.length).toBeGreaterThan(0);
      expect(SERVICES[s].blurb.length).toBeGreaterThan(0);
      expect(SERVICES[s].tag.length).toBeGreaterThan(0);
      expect(serviceMeta(s)).toBe(SERVICES[s]);
    }
  });

  it('matches the plan table verbatim', () => {
    for (const s of SERVICE_SLUGS) {
      expect({ name: SERVICES[s].name, blurb: SERVICES[s].blurb, tag: SERVICES[s].tag }).toEqual(EXPECTED[s]);
    }
  });

  it('has no em dash, 17:00 or unspaced price in any field', () => {
    for (const s of SERVICE_LIST) {
      for (const text of [s.name, s.blurb, s.tag]) {
        expect(text).not.toContain(EM_DASH);
        expect(text).not.toContain('17:00');
        expect(text).not.toMatch(/R1980|R1499|R2299/);
      }
    }
  });

  it('price tags are pinned to pricing.ts so they cannot drift', () => {
    const lowestAxle = Math.min(...AXLE_OPTIONS.map((a) => a.price));
    const liftKit = ADDONS.find((a) => a.id === 'lift-kit')!.price;
    expect(SERVICES['caravan-service'].tag).toBe('From ' + fmtR(lowestAxle));
    expect(SERVICES['lift-kits'].tag).toBe(fmtR(liftKit) + ' fitted');
    for (const s of SERVICE_LIST) {
      if (s.slug === 'caravan-service' || s.slug === 'lift-kits') continue;
      expect(s.tag).not.toMatch(/R\d/);
    }
  });

  it('SERVICE_LIST is read-only at type level and frozen at runtime', () => {
    expect(Object.isFrozen(SERVICE_LIST)).toBe(true);
    expect(() => {
      // @ts-expect-error SERVICE_LIST is a readonly array
      SERVICE_LIST[0] = SERVICE_LIST[1];
    }).toThrow();
  });
});
