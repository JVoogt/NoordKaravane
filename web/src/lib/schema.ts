// JSON-LD builders. Pure: no astro:*, no DOM.
import { BUSINESS } from '../data/business';
import { AXLE_OPTIONS, fmtR } from '../data/pricing';
import { servicePath } from '../data/routes';
import { SERVICE_LIST } from '../data/services';
import { expandTokens, faqPlainText, type FaqItem } from './faq';
import { hoursToSchema } from './hours';

type Node = Record<string, unknown>;

export const ORG_ID = 'https://noordkaravane.co.za/#org' as const;

const abs = (path: string): string => BUSINESS.url + path;

/** 'R949 - R2 299': lowest and highest axle package, ASCII hyphen-minus, spaced thousands. */
export function priceRange(): string {
  const prices = AXLE_OPTIONS.map((a) => a.price);
  return fmtR(Math.min(...prices)) + ' - ' + fmtR(Math.max(...prices));
}

/** The full AutoRepair entity (Home and Find us). Other pages reference it with orgRef(). */
export function orgNode(): Node {
  return {
    '@type': BUSINESS.schemaType,
    '@id': ORG_ID,
    name: BUSINESS.name,
    alternateName: 'Noord Karavane Caravan Specialists',
    description:
      "Pretoria North's trusted caravan workshop. Expert caravan service, repairs, recoveries & modifications. Insurance accredited caravan and trailer recoveries including cross-border. Electrical, solar, safety checks, wheel bearings, water systems, lift kits.",
    url: abs('/'),
    telephone: BUSINESS.phone.e164,
    image: abs('/assets/images/og-image-1200.jpg'),
    logo: abs('/assets/images/logo.png'),
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS.address.street,
      addressLocality: BUSINESS.address.locality,
      addressRegion: BUSINESS.address.region,
      postalCode: BUSINESS.address.postalCode,
      addressCountry: BUSINESS.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: BUSINESS.geo.lat, longitude: BUSINESS.geo.lng },
    areaServed: BUSINESS.areaServed.map((name) => ({
      '@type': name === BUSINESS.address.region ? 'State' : 'City',
      name,
    })),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Caravan Services',
      itemListElement: SERVICE_LIST.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s.name, url: abs(servicePath(s.slug)) },
      })),
    },
    openingHoursSpecification: hoursToSchema(BUSINESS.hours),
    priceRange: priceRange(),
    paymentAccepted: 'Cash, Credit Card, EFT',
    currenciesAccepted: 'ZAR',
    sameAs: [BUSINESS.links.facebook],
  };
}

/** Minimal typed Organization node for service pages: defines the @id that Service.provider points at. */
export function orgStubNode(): Node {
  return { '@id': ORG_ID, '@type': ['Organization', BUSINESS.schemaType], name: BUSINESS.name, url: abs('/') };
}

export function orgRef(): { '@id': string } {
  return { '@id': ORG_ID };
}

export function breadcrumbNode(items: Array<{ name: string; path: string }>): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.path),
    })),
  };
}

export function faqNode(faq: FaqItem[]): Node {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: expandTokens(item.q),
      acceptedAnswer: { '@type': 'Answer', text: faqPlainText(item) },
    })),
  };
}

export function serviceNode(s: {
  name: string;
  description: string;
  path: string;
  price?: { amount: number; from: boolean };
}): Node {
  const node: Node = {
    '@type': 'Service',
    name: s.name,
    description: s.description,
    url: abs(s.path),
    provider: orgRef(),
  };
  if (s.price) {
    node.offers = s.price.from
      ? {
          '@type': 'Offer',
          priceCurrency: 'ZAR',
          priceSpecification: { '@type': 'PriceSpecification', minPrice: s.price.amount, priceCurrency: 'ZAR' },
        }
      : { '@type': 'Offer', priceCurrency: 'ZAR', price: s.price.amount };
  }
  return node;
}

export function buildGraph(nodes: Node[]): { '@context': 'https://schema.org'; '@graph': Node[] } {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/** JSON.stringify with '<' escaped so the output is safe inside a script element. */
export function jsonLd(graph: ReturnType<typeof buildGraph>): string {
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}
