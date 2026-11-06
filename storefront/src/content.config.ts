import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const schema = z.object({
  title: z.string(),
  description: z.string(),
  updated: z.coerce.date(),
  order: z.number().optional(),
});

// Written by other workstreams (legal: E, pages: F). Both may be empty at build time.
const legal = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/legal' }), schema });
const pages = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }), schema });

export const collections = { legal, pages };
