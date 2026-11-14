// Runtime-first env access: process.env (container runtime) then import.meta.env (build-time inlined).
const pe = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
const ie = import.meta.env as Record<string, string | undefined>;
export const env = (k: string): string => pe[k] || ie[k] || '';

// Falls back to the build's `site` (astro.config.mjs: per brand), so a Kampi build without PUBLIC_SITE_URL is on its own host.
export const siteUrl = () => (env('PUBLIC_SITE_URL') || (import.meta.env.SITE as string | undefined) || 'https://noordkaravane.co.za').replace(/\/$/, '');
export const medusaUrl = () => env('PUBLIC_MEDUSA_URL').replace(/\/$/, '');
/** Server-side fetches may use an internal URL to skip the Cloudflare round trip. */
export const medusaServerUrl = () => (env('MEDUSA_INTERNAL_URL') || env('PUBLIC_MEDUSA_URL')).replace(/\/$/, '');
export const publishableKey = () => env('PUBLIC_MEDUSA_PUBLISHABLE_KEY');
