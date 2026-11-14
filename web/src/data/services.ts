// Pure: imports only the ServiceSlug type. Copy plan: docs/plans/2026-11-07-workshop-pages-content-refactor.md.
// Consumers: the price board (ServiceBoard: Home, related services, 404), Footer links, orgNode hasOfferCatalog, breadcrumbs.
import { SERVICE_SLUGS, type ServiceSlug } from './routes';

export interface ServiceMeta {
  slug: ServiceSlug;
  /** Card title, footer link text, breadcrumb, hasOfferCatalog item name. */
  name: string;
  /** The visitor's problem in their own words, so nobody needs the part name to pick a card. */
  need: string;
  /** One sentence: what the work covers. Facts already on the service page only. */
  blurb: string;
  /** Card foot label; carries the price where the page states one. */
  tag: string;
}

export const SERVICES: Readonly<Record<ServiceSlug, ServiceMeta>> = Object.freeze({
  'caravan-service': {
    slug: 'caravan-service',
    name: 'Caravan service',
    need: 'Due for a service, or heading off on a trip',
    blurb: 'Bearings repacked, brakes stripped and set, coupler, lights and 12 V electrics tested, and a written report at the end.',
    tag: 'From R949',
  },
  repairs: {
    slug: 'repairs',
    name: 'Caravan repairs',
    need: 'A noisy wheel, brakes that pull, a leak or a soft floor',
    blurb: 'Bearings, brakes, suspension and couplings. Pumps, tanks and geysers. Woodrot in floors, walls and frames.',
    tag: 'Quote before work',
  },
  'solar-electrical': {
    slug: 'solar-electrical',
    name: 'Electrical and solar',
    need: "A battery that's flat by the second night, or plans to camp off-grid",
    blurb: 'Solar panels, charge controllers, lithium or AGM batteries, inverters, and 12 V and 220 V wiring.',
    tag: 'Free solar quote',
  },
  recoveries: {
    slug: 'recoveries',
    name: 'Caravan recoveries',
    need: 'Broken down or in an accident, far from home',
    blurb: 'Caravans and trailers recovered nationwide, and across the border to Botswana, Mozambique, Zimbabwe, Namibia and Eswatini.',
    tag: 'Cross-border ready',
  },
  'lift-kits': {
    slug: 'lift-kits',
    name: '50 mm lift kits',
    need: "Scraping on gravel roads, or a tow that isn't level",
    blurb: 'Fitted at the workshop: more ground clearance, a more level tow and less strain on the stabilisers.',
    tag: 'R1 980 fitted',
  },
});

/** Display order = SERVICE_SLUGS order. */
export const SERVICE_LIST: readonly ServiceMeta[] = Object.freeze(SERVICE_SLUGS.map((s) => SERVICES[s]));

export function serviceMeta(slug: ServiceSlug): ServiceMeta {
  return SERVICES[slug];
}
