import type { APIRoute } from 'astro';
import { siteUrl } from '~/lib/env';
import { u } from '~/lib/url';
export const prerender = false;
export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', `Disallow: ${u('/cart')}`, `Disallow: ${u('/checkout')}`, `Disallow: ${u('/order/')}`, `Disallow: ${u('/api/')}`, `Disallow: ${u('/*?*sort=')}`, `Disallow: ${u('/*?*cat=')}`, `Disallow: ${u('/*?*q=')}`, '', `Sitemap: ${siteUrl()}${u('/sitemap.xml')}`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' } },
  );
