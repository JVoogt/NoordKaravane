import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { SERVICE_SLUGS } from './data/routes';
import { expandTokens } from './lib/faq';

// Every string field passes through expandTokens, so {hours} and {price:<id>} are resolved at build time
// and an unknown token fails the build.
const text = z.string().transform(expandTokens);

const services = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/services' }),
  schema: z.object({
    title: text,
    description: text,
    h1: text,
    eyebrow: text,
    order: z.number(),
    whatsappText: text,
    ctaLabel: text,
    schemaName: text,
    facts: z.array(z.object({ k: text, v: text })).optional(),
    heroImage: z.object({ src: z.string(), alt: z.string().min(5) }).optional(),
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
    related: z.array(z.enum(SERVICE_SLUGS)).max(3),
    priceFrom: z.object({ amount: z.number(), from: z.boolean() }).optional(),
  }),
});

export const collections = { services };
