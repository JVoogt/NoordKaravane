import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static site served by nginx at the apex. The shop owns /shop (Traefik), so this build never claims a /shop path.
export default defineConfig({
  site: 'https://noordkaravane.co.za',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  integrations: [
    sitemap({ customSitemaps: ['https://noordkaravane.co.za/shop/sitemap.xml'] }),
  ],
});
