import { defineMiddleware } from 'astro:middleware';
import { PRODUCT_REDIRECTS } from '~/lib/redirects';
import { CATEGORY_REDIRECTS } from '~/lib/category-config';
import { u } from '~/lib/url';

// Paths are relative to the store base (plan DD6): /shop on NK, / on Kampi. B is '' on Kampi.
const B = ((import.meta.env.BASE_URL as string) || '/').replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PRIVATE = new RegExp(`^${B}\\/(cart|checkout|order|api)(\\/|$)`);
const NOSTORE = new RegExp(`^${B}\\/(healthz)$`);
const PRODUCT = new RegExp(`^${B}\\/([a-z0-9-]+)\\/?$`);
const CATEGORY = new RegExp(`^${B}\\/category\\/([a-z0-9-]+)\\/?$`);
const PUBLIC = 'public, s-maxage=600, stale-while-revalidate=86400';

export const onRequest = defineMiddleware(async (ctx, next) => {
  // merged products: old product URLs permanently redirect to the grouped product page
  const m = ctx.url.pathname.match(PRODUCT);
  const to = m && Object.hasOwn(PRODUCT_REDIRECTS, m[1]) ? PRODUCT_REDIRECTS[m[1]] : null;
  if (to) return new Response(null, { status: 301, headers: { Location: u(`/${to}/`), 'Cache-Control': 'public, max-age=86400' } });
  const cm = ctx.url.pathname.match(CATEGORY);
  const cto = cm && Object.hasOwn(CATEGORY_REDIRECTS, cm[1]) ? CATEGORY_REDIRECTS[cm[1]] : null;
  if (cto) return new Response(null, { status: 301, headers: { Location: u(`/category/${cto}/`), 'Cache-Control': 'public, max-age=86400' } });
  const res = await next();
  const p = ctx.url.pathname;
  const h = res.headers;
  if (!h.has('Cache-Control')) {
    if (PRIVATE.test(p)) h.set('Cache-Control', 'private, no-store');
    else if (NOSTORE.test(p)) h.set('Cache-Control', 'no-store');
    else if (res.status === 200 && ctx.request.method === 'GET') h.set('Cache-Control', PUBLIC);
    else h.set('Cache-Control', 'no-store');
  }
  if (PRIVATE.test(p)) h.set('X-Robots-Tag', 'noindex, nofollow');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return res;
});
