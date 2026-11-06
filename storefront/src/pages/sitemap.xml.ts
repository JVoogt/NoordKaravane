import type { APIRoute } from 'astro';
import { abs } from '~/lib/seo';
import { env, medusaServerUrl } from '~/lib/env';
import { getCatalogue } from '~/lib/products';
import { escapeHtml } from '~/lib/format';
import { u } from '~/lib/url';

export const prerender = false;

interface Entry { loc: string; lastmod?: string; images?: string[]; priority?: string }

const STATIC = ['/', '/about', '/how-to-order', '/shipping', '/faq', '/contact',
  '/legal/privacy', '/legal/data-retention', '/legal/returns', '/legal/shipping-policy', '/legal/terms', '/legal/cookies', '/legal/business-info'].map((p) => u(p));

async function productEntries(): Promise<Entry[]> {
  // Preferred: backend /store/sitemap-products -> [{handle, updated_at, images}]
  if (medusaServerUrl()) {
    try {
      const res = await fetch(`${medusaServerUrl()}/store/sitemap-products`, {
        headers: env('PUBLIC_MEDUSA_PUBLISHABLE_KEY') ? { 'x-publishable-api-key': env('PUBLIC_MEDUSA_PUBLISHABLE_KEY') } : {},
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const j = (await res.json()) as unknown;
        const rows = Array.isArray(j) ? j : ((j as { products?: unknown[] }).products ?? []);
        return (rows as { handle: string; updated_at?: string; images?: (string | { url?: string })[] }[]).map((r) => ({
          loc: abs(u(`/${r.handle}/`)), lastmod: r.updated_at, priority: '0.8',
          images: (r.images ?? []).map((i) => (typeof i === 'string' ? i : i.url || '')).filter(Boolean).map(abs),
        }));
      }
    } catch (e) { console.warn('[sitemap] backend sitemap-products failed, falling back to catalogue', e); }
  }
  const { products } = await getCatalogue();
  return products.map((p) => ({ loc: abs(u(`/${p.handle}/`)), lastmod: p.updatedAt || undefined, priority: '0.8', images: p.images.map((i) => abs(i.src)) }));
}

export const GET: APIRoute = async () => {
  const cats = (await getCatalogue()).categories.map((c) => ({ loc: abs(u(`/category/${c.handle}/`)), priority: '0.7' }));
  const entries: Entry[] = [...STATIC.map((p) => ({ loc: abs(p), priority: p === u('/') ? '1.0' : '0.6' })), ...cats, ...(await productEntries())];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map((e) => `  <url><loc>${escapeHtml(e.loc)}</loc>${e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ''}${e.priority ? `<priority>${e.priority}</priority>` : ''}${(e.images ?? []).map((i) => `<image:image><image:loc>${escapeHtml(i)}</image:loc></image:image>`).join('')}</url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' } });
};
