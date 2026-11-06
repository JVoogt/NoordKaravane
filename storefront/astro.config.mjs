import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

// The storefront lives under /shop on noordkaravane.co.za (everything else on the apex is the static landing page).
// SSR everywhere. Cache-Control is set per route in src/middleware.ts.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://noordkaravane.co.za',
  base: '/shop',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  trailingSlash: 'ignore',
  // Behind Traefik/Cloudflare the app sees http://; trust X-Forwarded-* only for our own hosts
  // so the CSRF origin check compares against the real https origin.
  security: {
    checkOrigin: true,
    allowedDomains: [
      { hostname: 'noordkaravane.co.za', protocol: 'https' },
      { hostname: 'staging.noordkaravane.co.za', protocol: 'https' },
    ],
  },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    build: { chunkSizeWarningLimit: 800 },
  },
});
