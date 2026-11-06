// The one source of truth for service slugs and page paths. Nothing else spells a slug list.
export const SERVICE_SLUGS = [
  'caravan-service',
  'repairs',
  'solar-electrical',
  'recoveries',
  'lift-kits',
] as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

export function servicePath(slug: ServiceSlug): string {
  return `/services/${slug}/`;
}

/** All seven page paths (the 404 page is not a route). */
export const ROUTES: readonly string[] = ['/', ...SERVICE_SLUGS.map(servicePath), '/find-us/'];
