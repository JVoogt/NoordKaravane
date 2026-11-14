import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { BRAND, brand } from './brand';
import { mergeBrandDisplay } from './brands';

export interface Business {
  brand: string; domain: string; tagline: string;
  legal_name: string; legal_status: string; registration_number: string; vat_number: string;
  physical_address: string; postal_address: string; phone: string; whatsapp: string;
  /** The workshop as a structured address: the shipping address of a collect-from-workshop order. */
  workshop: { address_1: string; city: string; province: string; postal_code: string };
  email_general: string; email_orders: string; email_privacy: string; information_officer: string;
  instagram: string; facebook: string; currency: string;
  production_lead_time_days: string; eft_payment_window_hours: number; eft_reminder_after_hours: number;
  bank: { account_name: string; bank_name: string; account_number: string; branch_code: string; account_type: string };
  shipping: { tier_weights_g: Record<string, number>; pudo_max_weight_g: number; pudo_locker_price_zar: number; tcg_bands: { max_weight_g: number | null; price_zar: number }[]; free_shipping_threshold_zar: number; free_shipping_max_weight_g: number; collect_from_workshop: boolean };
  [k: string]: unknown;
}

const FALLBACK: Business = {
  brand: 'Noord Karavane', domain: 'noordkaravane.co.za', tagline: 'Caravan specialists in Pretoria North.',
  legal_name: '{{LEGAL_NAME}}', legal_status: '{{LEGAL_STATUS}}', registration_number: '{{REGISTRATION_NUMBER}}',
  vat_number: '{{VAT_NUMBER}}', physical_address: '252 General Beyers Street, Pretoria North, Pretoria, 0182', postal_address: '252 General Beyers Street, Pretoria North, Pretoria, 0182',
  workshop: { address_1: '252 General Beyers Street', city: 'Pretoria North', province: 'Gauteng', postal_code: '0182' },
  phone: '083 334 9357', whatsapp: '27833349357', email_general: '{{EMAIL_GENERAL}}',
  email_orders: '{{EMAIL_ORDERS}}', email_privacy: '{{EMAIL_PRIVACY}}',
  information_officer: '{{INFORMATION_OFFICER}}', instagram: '', facebook: 'https://facebook.com/NoordKaravane',
  currency: 'ZAR', production_lead_time_days: '2-5 working days', eft_payment_window_hours: 48, eft_reminder_after_hours: 24,
  bank: { account_name: '{{BANK_ACCOUNT_NAME}}', bank_name: '{{BANK_NAME}}', account_number: '{{BANK_ACCOUNT_NUMBER}}', branch_code: '{{BRANCH_CODE}}', account_type: '{{ACCOUNT_TYPE}}' },
  shipping: { tier_weights_g: { small: 500, medium: 3000, bulky: 15000 }, pudo_max_weight_g: 1000, pudo_locker_price_zar: 99, tcg_bands: [{ max_weight_g: 1000, price_zar: 85 }, { max_weight_g: 5000, price_zar: 130 }, { max_weight_g: null, price_zar: 350 }], free_shipping_threshold_zar: 2500, free_shipping_max_weight_g: 5000, collect_from_workshop: true },
};

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

const lookup = (obj: unknown, dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

/** Replace {{key}} / {{a.b}} with business.json values. Unknown keys and placeholder-valued keys are left visible. */
export function fill(text: string): string {
  const b = loadBusiness();
  return text.replace(/\{\{\s*([a-z_][a-z0-9_.]*)\s*\}\}/gi, (m, key: string) => {
    const v = lookup(b, key);
    return typeof v === 'string' || typeof v === 'number' ? String(v) : m;
  });
}

export const isPlaceholder = (v: unknown) => typeof v === 'string' && /\{\{.*\}\}/.test(v);

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
