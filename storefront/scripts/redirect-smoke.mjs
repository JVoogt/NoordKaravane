// Woo redirect smoke test against a running Kampi store (plan Task 2.4, P6).
// Usage: node scripts/redirect-smoke.mjs <origin> [--cookie name=value]
// For every frozen Woo product and category URL and a fixed list of page and sitemap paths: expect one 301 to the
// target wooRedirect computes with NK's real maps, then a 200 on that target. Prints one summary line:
//   redirect-smoke {"checked":n,"failed":n}
// and exits non-zero on any failure (or when it checked nothing).
import { WOO_CATEGORY_URLS, WOO_PRODUCT_SLUGS, wooRedirect } from '../src/lib/woo-redirects.ts';
import { PRODUCT_REDIRECTS } from '../src/lib/redirects.ts';
import { CATEGORY_REDIRECTS } from '../src/lib/category-config.ts';

const args = process.argv.slice(2);
const origin = (args[0] && !args[0].startsWith('--') ? args[0] : '').replace(/\/$/, '');
const ci = args.indexOf('--cookie');
const cookie = ci >= 0 ? args[ci + 1] : '';
if (!/^https?:\/\/[^/]+$/.test(origin) || (ci >= 0 && !/^[^=\s]+=[^\s]*$/.test(cookie || ''))) {
  console.error('usage: node scripts/redirect-smoke.mjs <origin> [--cookie name=value]');
  process.exit(2);
}
const maps = { products: PRODUCT_REDIRECTS, categories: CATEGORY_REDIRECTS };
const headers = cookie ? { cookie } : {};

// Pages, feeds, sitemaps, search and add-to-cart links the old store served (DD8 table).
const FIXED = [
  '/shop/', '/shop/page/2/', '/page/2/', '/home/', '/my-account/', '/my-account/orders/', '/checkout/order-received/1/',
  '/terms-conditions/', '/privacy-policy/', '/refund_returns/', '/feed/', '/comments/feed/', '/product-tag/fan/',
  '/sitemap_index.xml', '/product-sitemap.xml', '/page-sitemap.xml', '/product_cat-sitemap.xml', '/wp-sitemap.xml',
  '/?add-to-cart=813', '/?s=fan&post_type=product', '/product-category/kampi-merchandise/page/2/', '/product-category/security-tracking/',
];
const sources = [...WOO_PRODUCT_SLUGS.map((s) => `/product/${s}/`), ...WOO_CATEGORY_URLS, ...FIXED];

let checked = 0;
let failed = 0;
for (const src of sources) {
  const [path, search = ''] = src.split('?');
  const want = wooRedirect(path, search ? `?${search}` : '', maps);
  checked++;
  try {
    const r1 = await fetch(origin + src, { redirect: 'manual', headers });
    const loc = r1.headers.get('location') || '';
    const target = loc.startsWith('http') ? new URL(loc).pathname + new URL(loc).search : loc;
    if (r1.status !== 301 || target !== want) {
      failed++; console.error(`FAIL ${src}: ${r1.status} -> ${loc || '(no Location)'} (want 301 -> ${want})`); continue;
    }
    const r2 = await fetch(new URL(loc, origin + '/'), { redirect: 'manual', headers });
    if (r2.status !== 200) { failed++; console.error(`FAIL ${src} -> ${loc}: ${r2.status} (want 200)`); }
  } catch (e) {
    failed++; console.error(`FAIL ${src}: ${e?.message || e}`);
  }
}
console.log(`redirect-smoke ${JSON.stringify({ checked, failed })}`);
process.exit(failed || !checked ? 1 : 0);
