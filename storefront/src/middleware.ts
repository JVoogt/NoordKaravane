import { defineMiddleware } from 'astro:middleware';
import { PRODUCT_REDIRECTS } from '~/lib/redirects';

const PRIVATE = /^\/shop\/(cart|checkout|order|api)(\/|$)/;
const NOSTORE = /^\/shop\/(healthz)$/;
const PUBLIC = 'public, s-maxage=600, stale-while-revalidate=86400';

export const onRequest = defineMiddleware(async (ctx, next) => {
  // merged products: old product URLs permanently redirect to the grouped product page
  const m = ctx.url.pathname.match(/^\/shop\/([a-z0-9-]+)\/?$/);
  const to = m && Object.hasOwn(PRODUCT_REDIRECTS, m[1]) ? PRODUCT_REDIRECTS[m[1]] : null;
  if (to) return new Response(null, { status: 301, headers: { Location: `/shop/${to}/`, 'Cache-Control': 'public, max-age=86400' } });
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
