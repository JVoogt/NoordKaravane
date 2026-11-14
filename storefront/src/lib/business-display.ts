/**
 * The business config's shape, its built-in placeholder fallback, and the display rules shared by the store chrome.
 * Pure: no astro:*, no import.meta.env, no ~/ imports, so `node --test` can load it (business.ts re-exports from here).
 */

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

export const FALLBACK: Business = {
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

export const isPlaceholder = (v: unknown) => typeof v === 'string' && /\{\{.*\}\}/.test(v);

/** A config string fit to show: non-empty, not a {{PLACEHOLDER}} and not REPLACE_ME (plan DD4, P17). */
export const usable = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && !isPlaceholder(v) && !v.includes('REPLACE_ME');

/** The seller's identity block in the Kampi footer. Each part is null (or absent from its list) when not usable. */
export interface FooterIdentity { name: string | null; ids: string[]; contact: string[]; email: string | null; officer: string | null }

export function footerIdentity(b: Business): FooterIdentity {
  const seg = (v: unknown, line: (s: string) => string) => (usable(v) ? [line(v.trim())] : []);
  return {
    name: usable(b.legal_name) ? b.legal_name.trim() : null,
    ids: [...seg(b.registration_number, (v) => `Reg. no. ${v}.`), ...seg(b.vat_number, (v) => `VAT no. ${v}.`)],
    contact: [...seg(b.physical_address, (v) => `${v}.`), ...seg(b.phone, (v) => `Tel ${v}.`)],
    email: usable(b.email_general) ? b.email_general.trim() : null,
    officer: usable(b.information_officer) ? `Information Officer: ${b.information_officer.trim()}.` : null,
  };
}

/** The shipping numbers the Kampi chrome shows; each is null unless it is a finite number in the config. */
export interface ShippingFacts { freeOverZar: number | null; freeMaxKg: number | null; courierFromZar: number | null }

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function shippingFacts(b: Business): ShippingFacts {
  const s = (b.shipping && typeof b.shipping === 'object' ? b.shipping : {}) as Partial<Business['shipping']>;
  const maxG = finite(s.free_shipping_max_weight_g);
  const first = Array.isArray(s.tcg_bands) ? s.tcg_bands[0] : undefined;
  return {
    freeOverZar: finite(s.free_shipping_threshold_zar),
    freeMaxKg: maxG == null ? null : maxG / 1000,
    courierFromZar: finite(first?.price_zar),
  };
}
