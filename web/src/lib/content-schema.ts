import { z } from 'astro/zod';
import { SERVICE_SLUGS } from '../data/routes';
import { expandTokens } from './faq';

// Every string field passes through expandTokens, so {hours} and {price:<id>} are resolved at build time
// and an unknown token fails the build.
export const text = z.string().trim().min(1).transform(expandTokens);

// strict: a frontmatter key the schema does not know (a dead field) fails the build instead of being dropped silently.
export const serviceSchema = z
  .object({
    title: text,
    description: text,
    h1: text,
    eyebrow: text,
    order: z.number(),
    whatsappText: text,
    ctaLabel: text,
    schemaName: text,
    facts: z.array(z.object({ k: text, v: text })).optional(),
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
    priceFrom: z.object({ amount: z.number(), from: z.boolean() }).optional(),
  })
  .strict();

/** The schema cannot see which page an entry belongs to, so the page layout calls this: a page never lists itself. */
export function assertRelatedOk(slug: string, related: readonly string[]): void {
  if (related.includes(slug)) throw new Error(`services/${slug}.md lists itself in related`);
}
