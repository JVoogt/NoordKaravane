/**
 * Store brands for the one storefront codebase (plan DD6, DD7). Pure: no astro:*, no import.meta.env, no ~/ imports.
 * SERVER ONLY: imported by .astro files and server modules, never by islands or client scripts (STORE_BRANDS holds both
 * brands' strings, so a client import would ship NK copy in the Kampi bundle). Client code uses `@brand-copy`.
 */
export type BrandKey = 'nk' | 'kampi';

export interface StoreBrand {
  key: BrandKey;
  siteName: string;
  titleSuffix: string;
  themeColor: string;
  logo: { header: string; footer: string; alt: string };
  icon192: string;
  appleTouchIcon: string;
  ogDefault: string;
  landing: { href: string; label: string } | null;
  newsletter: boolean;
  whatsappGreeting: string;
  showSellerLine: boolean;
  /** Default meta description when the config has no brand tagline (null: business.tagline, as NK today). */
  tagline: string | null;
  /** Handle of the product shown as the home hero tag (DESIGN.md A3), or null for none. */
  heroFeature: string | null;
}

/** BRAND is fixed at build time. Unset or empty means nk; anything else but kampi stops the build. */
export function resolveBrandKey(raw: string | undefined): BrandKey {
  if (raw === undefined || raw === '' || raw === 'nk') return 'nk';
  if (raw === 'kampi') return 'kampi';
  throw new Error(`Unknown BRAND "${raw}" (expected nk or kampi)`);
}

export const STORE_BRANDS: Record<BrandKey, StoreBrand> = {
  nk: {
    key: 'nk', siteName: 'Noord Karavane', titleSuffix: 'Noord Karavane', themeColor: '#0e0f11',
    logo: { header: '/logo-transparent.png', footer: '/logo-white.png', alt: 'Noord Karavane' },
    icon192: '/icon-192.png', appleTouchIcon: '/apple-touch-icon.png', ogDefault: '/og-default.png',
    landing: { href: '/', label: 'Workshop & servicing' }, newsletter: true, whatsappGreeting: 'Hi Noord Karavane! ', showSellerLine: false,
    tagline: null, heroFeature: null,
  },
  // Task 2.2 fills the Kampi values (brand-copy.md section 1).
  kampi: {
    key: 'kampi', siteName: 'Noord Karavane', titleSuffix: 'Noord Karavane', themeColor: '#0e0f11',
    logo: { header: '/logo-transparent.png', footer: '/logo-white.png', alt: 'Noord Karavane' },
    icon192: '/icon-192.png', appleTouchIcon: '/apple-touch-icon.png', ogDefault: '/og-default.png',
    landing: { href: '/', label: 'Workshop & servicing' }, newsletter: true, whatsappGreeting: 'Hi Noord Karavane! ', showSellerLine: false,
    tagline: null, heroFeature: null,
  },
};

/** The seller's legal identity. A brand display override can never change these (P4). */
export const LEGAL_IDENTITY_KEYS = ['legal_name', 'legal_status', 'registration_number', 'vat_number', 'physical_address', 'postal_address', 'information_officer', 'email_privacy'] as const;

/** The display keys a `brands.kampi` block may override on the Kampi build. */
const DISPLAY_KEYS = ['tagline', 'whatsapp', 'instagram', 'facebook'] as const;

const usable = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && !t.includes('{{') && !t.includes('REPLACE_ME') ? t : null;
};

/** Kampi build: apply `brands.kampi.tagline|whatsapp|instagram|facebook` when usable. NK: `b` unchanged. */
export function mergeBrandDisplay<T extends Record<string, unknown>>(b: T, key: BrandKey): T {
  if (key !== 'kampi') return b;
  const block = (b.brands as { kampi?: Record<string, unknown> } | undefined)?.kampi;
  if (!block || typeof block !== 'object') return b;
  const out: Record<string, unknown> = { ...b };
  for (const k of DISPLAY_KEYS) {
    const v = usable(block[k]);
    if (v !== null) out[k] = v;
  }
  return out as T;
}
