// Pure: imports only the ServiceSlug type. Copy is the old page's wording (see the plan's Content Map).
// Consumers: Home ServiceCard grid, Footer links, orgNode hasOfferCatalog, Service.astro related cards.
import { SERVICE_SLUGS, type ServiceSlug } from './routes';

export interface ServiceMeta {
  slug: ServiceSlug;
  /** Card title, footer link text, hasOfferCatalog item name. */
  name: string;
  /** One or two sentences, old-page wording only. */
  blurb: string;
  /** Old card foot label; carries the price where the old page stated one. */
  tag: string;
}

export const SERVICES: Readonly<Record<ServiceSlug, ServiceMeta>> = Object.freeze({
  'caravan-service': {
    slug: 'caravan-service',
    name: 'Caravan service',
    blurb:
      "Full caravan and trailer servicing. Mechanical, structural and cosmetic repairs, executed by technicians who work on caravans every day, not as a side line. Pre-trip checks: brakes, tyres, lights, signals, gas seals. We sign it off or we don't.",
    tag: 'From R949',
  },
  repairs: {
    slug: 'repairs',
    name: 'Repairs',
    blurb:
      'Wheel bearings, brakes, suspension, leaf springs, coupling and jockey wheel work. Pumps, tanks, geysers, pipe repairs and full plumbing overhauls. Floors, walls and frames restored to solid condition.',
    tag: 'Quote before work',
  },
  'solar-electrical': {
    slug: 'solar-electrical',
    name: 'Electrical and solar',
    blurb: 'Panels, charge controllers, LiFePO₄ banks, inverters and proper 12 V / 220 V rewiring.',
    tag: 'Quote on brief',
  },
  recoveries: {
    slug: 'recoveries',
    name: 'Recoveries',
    blurb:
      'Breakdowns, accidents, roadside. Local nationwide and cross-border to Botswana, Mozambique, Zimbabwe, Namibia and Eswatini. One number, one operator.',
    tag: 'Cross-border ready',
  },
  'lift-kits': {
    slug: 'lift-kits',
    name: '50 mm lift kits',
    blurb: 'Fitted at the workshop. Easier towing, better clearance, protects stabilisers.',
    tag: 'R1 980 fitted',
  },
});

/** Display order = SERVICE_SLUGS order. */
export const SERVICE_LIST: readonly ServiceMeta[] = Object.freeze(SERVICE_SLUGS.map((s) => SERVICES[s]));

export function serviceMeta(slug: ServiceSlug): ServiceMeta {
  return SERVICES[slug];
}
