import { describe, expect, it } from 'vitest';
import { ADDONS, AXLE_OPTIONS, fmtR } from './pricing';
import { SERVICE_SLUGS } from './routes';
import { SERVICES, SERVICE_LIST, serviceMeta } from './services';

const EM_DASH = String.fromCharCode(0x2014);

// The approved card copy from the 2026-11-07 content refactor (facts already on the service pages; nothing invented).
// Pinned so a copy change is a deliberate, reviewed edit.
const EXPECTED = {
  'caravan-service': {
    name: 'Caravan service',
    need: 'Due for a service, or heading off on a trip',
    blurb: 'Bearings repacked, brakes stripped and set, coupler, lights and 12 V electrics tested, and a written report at the end.',
    tag: 'From R949',
  },
  repairs: {
    name: 'Caravan repairs',
    need: 'A noisy wheel, brakes that pull, a leak or a soft floor',
    blurb: 'Bearings, brakes, suspension and couplings. Pumps, tanks and geysers. Woodrot in floors, walls and frames.',
    tag: 'Quote before work',
  },
  'solar-electrical': {
    name: 'Electrical and solar',
    need: "A battery that's flat by the second night, or plans to camp off-grid",
    blurb: 'Solar panels, charge controllers, lithium or AGM batteries, inverters, and 12 V and 220 V wiring.',
    tag: 'Free solar quote',
  },
  recoveries: {
    name: 'Caravan recoveries',
    need: 'Broken down or in an accident, far from home',
    blurb: 'Caravans and trailers recovered nationwide, and across the border to Botswana, Mozambique, Zimbabwe, Namibia and Eswatini.',
    tag: 'Cross-border ready',
  },
  'lift-kits': {
    name: '50 mm lift kits',
    need: "Scraping on gravel roads, or a tow that isn't level",
    blurb: 'Fitted at the workshop: more ground clearance, a more level tow and less strain on the stabilisers.',
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
      expect(SERVICES[s].need.length).toBeGreaterThan(0);
      expect(SERVICES[s].blurb.length).toBeGreaterThan(0);
      expect(SERVICES[s].tag.length).toBeGreaterThan(0);
      expect(serviceMeta(s)).toBe(SERVICES[s]);
    }
  });

  it('matches the plan table verbatim', () => {
    for (const s of SERVICE_SLUGS) {
      expect({ name: SERVICES[s].name, need: SERVICES[s].need, blurb: SERVICES[s].blurb, tag: SERVICES[s].tag }).toEqual(EXPECTED[s]);
    }
  });

  it('has no em dash, 17:00 or unspaced price in any field', () => {
    for (const s of SERVICE_LIST) {
      for (const text of [s.name, s.need, s.blurb, s.tag]) {
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
