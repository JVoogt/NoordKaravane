import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { BRAND, brand } from './brand';
import { mergeBrandDisplay } from './brands';
import { fillWith } from './fill';
import { FALLBACK, isPlaceholder, type Business } from './business-display';

// The shape, the fallback and the placeholder rule live in the pure business-display.ts (testable under node --test).
export type { Business };
export { isPlaceholder };

let cached: Business | null = null;

/** Order: BUSINESS_CONFIG_PATH, /config/business.json (Docker), ../config/business.json (repo), ./config/business.json. */
export function loadBusiness(): Business {
  if (cached) return cached;
  const candidates = [
    env('BUSINESS_CONFIG_PATH'),
    '/config/business.json',
    path.resolve(process.cwd(), '../config/business.json'),
    path.resolve(process.cwd(), 'config/business.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        cached = { ...FALLBACK, ...JSON.parse(fs.readFileSync(p, 'utf8')) } as Business;
        return cached;
      }
    } catch (e) {
      console.warn('[business] failed to read', p, e);
    }
  }
  console.warn('[business] business.json not found, using built-in placeholders');
  cached = FALLBACK;
  return cached;
}

export const business = new Proxy({} as Business, {
  get: (_t, k) => (loadBusiness() as unknown as Record<string, unknown>)[k as string],
});

/** Replace {{key}} / {{a.b}} with business.json values, and {{zar:a.b}} with a formatted price (fill.ts). */
export function fill(text: string): string {
  return fillWith(text, loadBusiness());
}

let brandCached: Business | null = null;
/**
 * The business values this store shows (plan DD7). NK: exactly loadBusiness(). Kampi: NK's contact display values
 * (WhatsApp, socials, tagline) are never shown on the Kampi store; only `brands.kampi.*` may fill them, so with no
 * Kampi value the WhatsApp chip and links render nothing (DESIGN.md 13: WhatsApp omitted at launch). Legal identity
 * values are always NK's (the seller), whatever the block says.
 */
export function brandBusiness(): Business {
  if (BRAND === 'nk') return loadBusiness();
  if (brandCached) return brandCached;
  const own = { ...loadBusiness(), whatsapp: '', instagram: '', facebook: '', tagline: brand.tagline ?? '' };
  brandCached = mergeBrandDisplay(own, BRAND);
  return brandCached;
}

/** Digits only, or null while the WhatsApp number is still a placeholder (or, on Kampi, not configured). */
export const whatsappNumber = (): string | null => {
  const raw = brandBusiness().whatsapp;
  const w = String(raw || '').replace(/\D/g, '');
  return w.length >= 9 && !isPlaceholder(raw) ? w : null;
};

/** The seller's name for Kampi seller lines: NK's legal name, or its brand name while the legal name is a placeholder. */
export const sellerName = (): string => {
  const b = loadBusiness();
  const v = typeof b.legal_name === 'string' ? b.legal_name.trim() : '';
  return v && !v.includes('{{') && !v.includes('REPLACE_ME') ? v : b.brand;
};
