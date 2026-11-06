import type { APIRoute } from 'astro';
import { siteUrl } from '~/lib/env';
export const prerender = false;
export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', 'Disallow: /shop/cart', 'Disallow: /shop/checkout', 'Disallow: /shop/order/', 'Disallow: /shop/api/', 'Disallow: /shop/*?*sort=', 'Disallow: /shop/*?*cat=', 'Disallow: /shop/*?*q=', '', `Sitemap: ${siteUrl()}/shop/sitemap.xml`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' } },
  );
