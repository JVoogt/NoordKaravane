import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolveBrandKey } from './src/lib/brands.ts';

// One codebase, two stores (plan DD6). BRAND is fixed at build time: nk (default) or kampi; anything else fails here.
//   nk:    the Noord Karavane shop under /shop on noordkaravane.co.za (everything else on the apex is the landing page)
//   kampi: Kampi Store at / on store.kampi.co.za, sold and fulfilled by NK
// SSR everywhere. Cache-Control is set per route in src/middleware.ts.
const BRAND = resolveBrandKey(process.env.BRAND);
const KAMPI = BRAND === 'kampi';
const brandFile = (f) => fileURLToPath(new URL(`./src/brands/${BRAND}/${f}`, import.meta.url));

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || (KAMPI ? 'https://store.kampi.co.za' : 'https://noordkaravane.co.za'),
  base: KAMPI ? '/' : '/shop',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  trailingSlash: 'ignore',
  // Behind Traefik/Cloudflare the app sees http://; trust X-Forwarded-* only for our own hosts
  // so the CSRF origin check compares against the real https origin.
  security: {
    checkOrigin: true,
    allowedDomains: KAMPI
      ? [{ hostname: 'store.kampi.co.za', protocol: 'https' }]
      : [
          { hostname: 'noordkaravane.co.za', protocol: 'https' },
          { hostname: 'staging.noordkaravane.co.za', protocol: 'https' },
        ],
  },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    build: { chunkSizeWarningLimit: 800 },
    // Build-time only: no code reads process.env.BRAND at runtime (the runtime image has no BRAND). A bare constant, not
    // import.meta.env.BRAND: Astro rewrites non-PUBLIC import.meta.env reads in server code to process.env (runtime),
    // which would silently resolve to nk in the Kampi container.
    define: { __BRAND__: JSON.stringify(BRAND) },
    resolve: { alias: { '@brand-copy': brandFile('copy.ts'), '@brand': brandFile('index.ts') } },
  },
});
