import { describe, expect, it } from 'vitest';
import { BUSINESS } from '../data/business';
import { AXLE_OPTIONS, fmtR } from '../data/pricing';
import { servicePath } from '../data/routes';
import { SERVICE_LIST } from '../data/services';
import { faqPlainText, type FaqItem } from './faq';
import { hoursToSchema } from './hours';
import {
  ORG_ID,
  breadcrumbNode,
  buildGraph,
  faqNode,
  jsonLd,
  orgNode,
  orgRef,
  orgStubNode,
  priceRange,
  serviceNode,
} from './schema';

type Obj = Record<string, any>;

describe('orgNode', () => {
  const org = orgNode() as Obj;

  it('is the AutoRepair entity with the shared id', () => {
    expect(org['@id']).toBe(ORG_ID);
    expect(ORG_ID).toBe('https://noordkaravane.co.za/#org');
    expect(org['@type']).toBe('AutoRepair');
  });

  it('takes opening hours from the hours module', () => {
    expect(org.openingHoursSpecification).toEqual(hoursToSchema(BUSINESS.hours));
  });

  it('carries no aggregateRating and no 17:00', () => {
    const s = JSON.stringify(org);
    expect(s).not.toContain('aggregateRating');
    expect(s).not.toContain('17:00');
  });

  it('lists exactly the five services with names and urls from the service table', () => {
    const items = org.hasOfferCatalog.itemListElement as Obj[];
    expect(items).toHaveLength(5);
    expect(items.map((o) => o.itemOffered.name)).toEqual(SERVICE_LIST.map((s) => s.name));
    expect(items.map((o) => o.itemOffered.url)).toEqual(
      SERVICE_LIST.map((s) => 'https://noordkaravane.co.za' + servicePath(s.slug)),
    );
  });

  it('has the spaced price range', () => {
    expect(org.priceRange).toBe(priceRange());
    expect(JSON.stringify(org)).toContain('"priceRange":"R949 - R2 299"');
  });
});

describe('priceRange', () => {
  it('is exactly R949 - R2 299 and derived from AXLE_OPTIONS', () => {
    const prices = AXLE_OPTIONS.map((a) => a.price);
    expect(priceRange()).toBe('R949 - R2 299');
    expect(priceRange()).toBe(fmtR(Math.min(...prices)) + ' - ' + fmtR(Math.max(...prices)));
    for (const bad of ['R2299', 'R1499', 'R1980']) expect(priceRange()).not.toContain(bad);
  });
});

describe('orgStubNode', () => {
  it('defines the @id that Service.provider points at, as a minimal typed node', () => {
    const stub = orgStubNode() as Obj;
    expect(stub).toEqual({
      '@id': ORG_ID,
      '@type': ['Organization', 'AutoRepair'],
      name: BUSINESS.name,
      url: BUSINESS.url + '/',
    });
  });

  it('resolves the provider reference inside a service-page graph', () => {
    const g = buildGraph([orgStubNode(), serviceNode({ name: 'R', description: 'd', path: '/services/recoveries/' })]);
    const ids = g['@graph'].map((n: Obj) => n['@id']);
    const provider = (g['@graph'].find((n: Obj) => n['@type'] === 'Service') as Obj).provider['@id'];
    expect(ids).toContain(provider);
  });
});

describe('orgRef', () => {
  it('is exactly an @id reference', () => {
    expect(orgRef()).toEqual({ '@id': ORG_ID });
  });
});

describe('breadcrumbNode', () => {
  it('numbers positions from 1 and uses absolute urls', () => {
    const b = breadcrumbNode([
      { name: 'Home', path: '/' },
      { name: 'Recoveries', path: '/services/recoveries/' },
    ]) as Obj;
    expect(b['@type']).toBe('BreadcrumbList');
    expect(b.itemListElement.map((i: Obj) => i.position)).toEqual([1, 2]);
    expect(b.itemListElement.map((i: Obj) => i.item)).toEqual([
      'https://noordkaravane.co.za/',
      'https://noordkaravane.co.za/services/recoveries/',
    ]);
    expect(b.itemListElement.map((i: Obj) => i.name)).toEqual(['Home', 'Recoveries']);
  });
});

describe('faqNode', () => {
  const items: FaqItem[] = [
    { q: 'First?', a: 'One.', list: ['x', 'y'], note: 'n' },
    { q: 'Cost?', a: 'From {price:braked-1}.' },
  ];

  it('keeps question order and uses faqPlainText for answers', () => {
    const f = faqNode(items) as Obj;
    expect(f['@type']).toBe('FAQPage');
    expect(f.mainEntity.map((m: Obj) => m.name)).toEqual(['First?', 'Cost?']);
    expect(f.mainEntity.map((m: Obj) => m.acceptedAnswer.text)).toEqual(items.map(faqPlainText));
    expect(f.mainEntity[1].acceptedAnswer.text).toBe('From R1 499.');
  });
});

describe('serviceNode', () => {
  it('points provider at the org reference', () => {
    const s = serviceNode({ name: 'Recoveries', description: 'd', path: '/services/recoveries/' }) as Obj;
    expect(s['@type']).toBe('Service');
    expect(s.provider).toEqual(orgRef());
    expect(s.url).toBe('https://noordkaravane.co.za/services/recoveries/');
    expect(s.offers).toBeUndefined();
  });

  it('adds an offer only when a price is given', () => {
    const s = serviceNode({
      name: 'Lift kits',
      description: 'd',
      path: '/services/lift-kits/',
      price: { amount: 1980, from: false },
    }) as Obj;
    expect(s.offers.price).toBe(1980);
    expect(s.offers.priceCurrency).toBe('ZAR');
  });
});

describe('buildGraph and jsonLd', () => {
  it('sets @context once on the wrapper', () => {
    const g = buildGraph([orgNode(), breadcrumbNode([{ name: 'Home', path: '/' }])]);
    expect(g['@context']).toBe('https://schema.org');
    expect(g['@graph']).toHaveLength(2);
    for (const n of g['@graph']) expect(n['@context']).toBeUndefined();
  });

  it('escapes < and round-trips through JSON.parse', () => {
    const g = buildGraph([{ '@type': 'Thing', name: '</script><b>' }]);
    const out = jsonLd(g);
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual(g);
  });
});
