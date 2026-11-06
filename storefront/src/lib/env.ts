// Runtime-first env access: process.env (container runtime) then import.meta.env (build-time inlined).
const pe = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
const ie = import.meta.env as Record<string, string | undefined>;
export const env = (k: string): string => pe[k] || ie[k] || '';

export const siteUrl = () => (env('PUBLIC_SITE_URL') || 'https://noordkaravane.co.za').replace(/\/$/, '');
export const medusaUrl = () => env('PUBLIC_MEDUSA_URL').replace(/\/$/, '');
/** Server-side fetches may use an internal URL to skip the Cloudflare round trip. */
export const medusaServerUrl = () => (env('MEDUSA_INTERNAL_URL') || env('PUBLIC_MEDUSA_URL')).replace(/\/$/, '');
export const publishableKey = () => env('PUBLIC_MEDUSA_PUBLISHABLE_KEY');
