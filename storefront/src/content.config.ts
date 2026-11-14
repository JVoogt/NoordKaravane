import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { resolveBrandKey } from './lib/brands';

const schema = z.object({
  title: z.string(),
  description: z.string(),
  updated: z.coerce.date(),
  order: z.number().optional(),
});

// Written by other workstreams (legal: E, pages: F). Both may be empty at build time.
// Content roots per brand (plan DD6): nk ./src/content/{legal,pages}, kampi ./src/content/kampi/{legal,pages}.
// BRAND is inlined by Vite's define, so the choice is made at build time and never read at runtime.
const root = resolveBrandKey(import.meta.env.BRAND) === 'kampi' ? './src/content/kampi' : './src/content';
const legal = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: `${root}/legal` }), schema });
const pages = defineCollection({ loader: glob({ pattern: '**/*.{md,mdx}', base: `${root}/pages` }), schema });

export const collections = { legal, pages };
