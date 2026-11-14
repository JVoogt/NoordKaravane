import { z } from 'astro/zod';
import { ADDONS, AXLE_OPTIONS } from '../data/pricing';
import { SERVICE_SLUGS } from '../data/routes';
import { expandTokens } from './faq';

// Every price id pricing.ts knows: priceFrom names one, so the JSON-LD Offer amount is never typed twice.
const PRICE_IDS = [...AXLE_OPTIONS.map((o) => o.id), ...ADDONS.map((o) => o.id)] as [string, ...string[]];

// Every string field passes through expandTokens, so {hours} and {price:<id>} are resolved at build time
// and an unknown token fails the build.
export const text = z.string().trim().min(1).transform(expandTokens);

// strict: a frontmatter key the schema does not know (a dead field) fails the build instead of being dropped silently.
export const serviceSchema = z
  .object({
    title: text,
    description: text,
    h1: text,
    // The hero paragraph under the H1: answers the page's question in one or two sentences, in plain text.
    lede: text,
    order: z.number(),
    whatsappText: text,
    ctaLabel: text,
    schemaName: text,
    facts: z.array(z.object({ k: text, v: text })).optional(),
    // Page-specific FAQ heading, so no two pages share "the questions that come up most".
    faqTitle: text,
    faq: z
      .array(
        z.object({
          q: text,
          a: text,
          list: z.array(text).optional(),
          note: text.optional(),
        }),
      )
      .min(1),
    // z.enum over the one slug list: a typo fails the build. Related cards render from serviceMeta, never getEntry.
    related: z
      .array(z.enum(SERVICE_SLUGS))
      .max(3)
      .refine((a) => new Set(a).size === a.length, 'related lists a slug twice'),
    // A pricing.ts id (axle or add-on); Service.astro resolves the amount, so the Offer follows pricing.ts.
    priceFrom: z.object({ id: z.enum(PRICE_IDS), from: z.boolean() }).strict().optional(),
    // The closing contact band's heading and line, when the page has something specific to ask for.
    closing: z.object({ heading: text, text: text }).strict().optional(),
    // Emergency pages: a one-line safety instruction under the hero buttons (no response times).
    safety: text.optional(),
    // Emergency pages: what to have ready, shown at the top of the hero panel (before the facts) as #what-to-send.
    checklist: z.object({ heading: text, items: z.array(text).min(2) }).strict().optional(),
  })
  .strict();

/** The amount for a priceFrom id, from pricing.ts. */
export function priceAmount(id: string): number {
  const hit = AXLE_OPTIONS.find((o) => o.id === id) ?? ADDONS.find((o) => o.id === id);
  if (!hit) throw new Error(`Unknown price id: ${id}`);
  return hit.price;
}

/** The schema cannot see which page an entry belongs to, so the page layout calls this: a page never lists itself. */
export function assertRelatedOk(slug: string, related: readonly string[]): void {
  if (related.includes(slug)) throw new Error(`services/${slug}.md lists itself in related`);
}

/** safety and checklist are drawn by the emergency hero only (Service.astro). The schema cannot see which layout a
    page gets, so the layout calls this: a page that sets them and would not show them fails the build. */
export function assertEmergencyFields(slug: string, data: { safety?: unknown; checklist?: unknown }, emergency: boolean): void {
  if (emergency) return;
  const set = (['safety', 'checklist'] as const).filter((k) => data[k] !== undefined);
  if (set.length > 0) throw new Error(`services/${slug}.md sets ${set.join(' and ')}, which only an emergency page shows`);
}
