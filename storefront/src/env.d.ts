/// <reference types="astro/client" />
interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_MEDUSA_URL?: string;
  readonly PUBLIC_MEDUSA_PUBLISHABLE_KEY?: string;
  readonly PUBLIC_GA4_ID?: string;
  readonly PUBLIC_META_PIXEL_ID?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}
interface Window {
  dataLayer: unknown[];
  gtag: (...a: unknown[]) => void;
  fbq: (...a: unknown[]) => void;
  nkConsent: { analytics: boolean; marketing: boolean };
  nkTrack: (event: string, data?: Record<string, unknown>) => void;
  srOpenCookieSettings: () => void;
  turnstile?: { render: (el: Element, o: Record<string, unknown>) => void };
}
