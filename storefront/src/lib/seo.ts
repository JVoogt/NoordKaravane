import { siteUrl } from './env';
import { decodeEntities } from './format';
import { business, brandBusiness, whatsappNumber, isPlaceholder } from './business';
import { usable, shippingFacts } from './business-display';
import { u } from './url';
import { brand } from './brand';
import type { Product } from './products';

// Kampi Store (plan Decisions, "Product JSON-LD on Kampi"): the #org node is the seller, NK, with its legal name and
// its own site; the WebSite node is "Kampi Store" published by it; Offer.seller points at it; Product.brand is the
// store name. NK pages keep today's nodes exactly.
const KAMPI = brand.key === 'kampi';

export const abs = (p: string) => (/^https?:\/\//.test(p) ? p : siteUrl() + (p.startsWith('/') ? p : '/' + p));
export const trunc = (s: string, n = 155) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };

const leadDays = () => {
  const m = String(business.production_lead_time_days).match(/(\d+)\D+(\d+)/);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : { min: 2, max: 5 };
};

export function organizationLd() {
  if (KAMPI) {
    return {
      '@context': 'https://schema.org', '@type': 'Organization', '@id': siteUrl() + '/#org',
      name: business.brand, url: `https://${business.domain}`,
      ...(usable(business.legal_name) ? { legalName: business.legal_name } : {}),
      ...(usable(business.email_general) ? { email: business.email_general } : {}),
      address: { '@type': 'PostalAddress', streetAddress: business.workshop.address_1, addressLocality: business.workshop.city, addressRegion: business.workshop.province, postalCode: business.workshop.postal_code, addressCountry: 'ZA' },
    };
  }
  const sameAs = [brandBusiness().instagram, brandBusiness().facebook].filter((u) => u && !isPlaceholder(u));
  const wa = whatsappNumber();
  return {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': siteUrl() + '/#org',
    name: business.brand, url: siteUrl(), logo: abs(u('/icon-192.png')), slogan: business.tagline,
    email: business.email_general,
    ...(!isPlaceholder(business.legal_name) ? { legalName: business.legal_name } : {}),
    ...(!isPlaceholder(business.phone) ? { telephone: business.phone } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: business.email_general, areaServed: 'ZA', availableLanguage: ['en'], ...(wa ? { telephone: '+' + wa } : {}) }],
  };
}

export const websiteLd = () => ({
  '@context': 'https://schema.org', '@type': 'WebSite', '@id': siteUrl() + '/#website', url: siteUrl(), name: KAMPI ? brand.siteName : business.brand, inLanguage: 'en-ZA',
  publisher: { '@id': siteUrl() + '/#org' },
});

export const breadcrumbLd = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
});

export function productLd(p: Product) {
  const url = abs(u(`/${p.handle}/`));
  const { min, max } = leadDays();
  const courierFrom = shippingFacts(business).courierFromZar;
  const offerBase = {
    '@type': 'Offer', priceCurrency: 'ZAR', availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', url,
    seller: { '@id': siteUrl() + '/#org' },
    shippingDetails: {
      '@type': 'OfferShippingDetails', shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'ZA' },
      // Omitted (never a throw or NaN) when business.json has no first courier band; same object as before otherwise.
      ...(courierFrom != null ? { shippingRate: { '@type': 'MonetaryAmount', value: courierFrom, currency: 'ZAR' } } : {}),
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: min, maxValue: max, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 4, unitCode: 'DAY' },
      },
    },
    // ECTA s44 cooling-off: 7 days, customer pays the direct cost of returning (see the returns policy)
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'ZA',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 7,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
      merchantReturnLink: abs(u('/legal/returns')),
    },
  };
  const offers = p.price == null ? undefined
    : p.priceMax != null && p.priceMax !== p.price
      ? { ...offerBase, '@type': 'AggregateOffer', lowPrice: p.price, highPrice: p.priceMax, offerCount: p.variants.length }
      : { ...offerBase, price: p.price };
  const colours = p.options.find((o) => /colou?r/i.test(o.name))?.values ?? [];
  return {
    '@context': 'https://schema.org', '@type': 'Product', '@id': url + '#product', name: p.title,
    description: trunc(p.description || p.title, 300), sku: p.variants[0]?.sku || p.handle, url,
    image: p.images.map((i) => abs(i.src)), brand: { '@type': 'Brand', name: KAMPI ? brand.siteName : business.brand },
    ...(colours.length ? { color: colours.join(', ') } : {}),
    ...(offers ? { offers } : {}),
  };
}

export const faqLd = (qa: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: qa.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
});

/** Parse rendered FAQ HTML: each h2/h3 is a question, the HTML up to the next heading is its answer. */
export function parseFaq(html: string): { q: string; a: string; aHtml: string }[] {
  const out: { q: string; a: string; aHtml: string }[] = [];
  const parts = html.split(/<h[23][^>]*>/).slice(1);
  for (const part of parts) {
    const [q, ...rest] = part.split(/<\/h[23]>/);
    const aHtml = rest.join('').trim();
    const a = decodeEntities(aHtml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (q && a) out.push({ q: decodeEntities(q.replace(/<[^>]+>/g, '')).trim(), a, aHtml });
  }
  return out;
}
