import fs from 'node:fs';
import path from 'node:path';
import Medusa from '@medusajs/js-sdk';
import { env, medusaServerUrl, publishableKey } from './env';
import { decodeEntities } from './format';
import { u } from './url';

export interface Variant { id: string; sku: string; price: number | null; weightG: number | null; options: Record<string, string> }
export interface Option { name: string; values: string[] }
export interface Category { handle: string; name: string; parent: string | null }
export interface Product {
  id: string; handle: string; title: string; description: string; descriptionHtml: string;
  images: { src: string; alt: string }[];
  options: Option[]; variants: Variant[];
  price: number | null; priceMax: number | null;
  categories: string[]; tags: string[]; shipTier: string; sourceUrl: string; updatedAt: string; source: 'medusa' | 'dev';
}
export interface Catalogue { products: Product[]; categories: Category[]; error?: string; source: 'medusa' | 'dev' | 'none' }

export const hasBackend = () => !!medusaServerUrl();

let sdk: Medusa | null = null;
export const getSdk = () => (sdk ??= new Medusa({ baseUrl: medusaServerUrl(), publishableKey: publishableKey() || undefined }));

let regionId: string | null = null;
async function getRegionId(): Promise<string | undefined> {
  if (regionId) return regionId;
  const { regions } = await getSdk().store.region.list();
  const r = regions.find((x: { currency_code: string }) => x.currency_code === 'zar') || regions[0];
  regionId = r?.id ?? null;
  return regionId ?? undefined;
}

const FIELDS = '*variants.calculated_price,*variants.options,+variants.weight,+variants.sku,*options,*options.values,*images,*categories,*tags';

/** Simple products are stored with a single "Default" option in Medusa; hide it everywhere in the UI. */
const hideDefault = (o: Option[]) => o.filter((x) => !(x.name === 'Default' && x.values.length === 1 && x.values[0] === 'Default'));

function finish(p: Omit<Product, 'price' | 'priceMax'>): Product {
  const prices = p.variants.map((v) => v.price).filter((x): x is number => typeof x === 'number');
  return { ...p, price: prices.length ? Math.min(...prices) : null, priceMax: prices.length ? Math.max(...prices) : null };
}

function fromMedusa(p: any): Product {
  const optTitle = new Map<string, string>();
  for (const o of p.options ?? []) optTitle.set(o.id, o.title);
  const options: Option[] = (p.options ?? []).map((o: any) => ({ name: o.title, values: (o.values ?? []).map((v: any) => v.value) }));
  const variants: Variant[] = (p.variants ?? []).map((v: any) => {
    const opts: Record<string, string> = {};
    for (const ov of v.options ?? []) opts[optTitle.get(ov.option_id) || ov.option?.title || ''] = ov.value;
    return { id: v.id, sku: v.sku || '', price: v.calculated_price?.calculated_amount ?? null, weightG: v.weight ?? null, options: opts };
  });
  return finish({
    id: p.id, handle: p.handle, title: decodeEntities(p.title), description: p.description || '',
    descriptionHtml: p.metadata?.description_html || '',
    images: (p.images?.length ? p.images : p.thumbnail ? [{ url: p.thumbnail }] : []).map((i: any) => ({ src: i.url, alt: decodeEntities(p.title) })),
    options: hideDefault(options), variants,
    categories: (p.categories ?? []).map((c: any) => c.handle), tags: (p.tags ?? []).map((t: any) => t.value),
    shipTier: p.metadata?.ship_tier || '', sourceUrl: p.metadata?.source_url || '', updatedAt: p.updated_at || '', source: 'medusa',
  });
}

let catNameToHandle: Record<string, string> | null = null;
function fromCatalogue(c: any, handleOf: (n: string) => string): Product {
  const variants: Variant[] = c.variants?.length
    ? c.variants.map((v: any) => ({ id: `dev_${v.sku}`, sku: v.sku, price: v.price_zar ?? null, weightG: v.weight_g ?? null, options: v.options ?? {} }))
    : [{ id: `dev_${c.sku}`, sku: c.sku, price: c.price_zar ?? null, weightG: c.weight_g ?? null, options: {} }];
  return finish({
    id: `dev_${c.handle}`, handle: c.handle, title: c.title, description: c.description || '', descriptionHtml: c.description_html || '',
    images: (c.images ?? []).map((i: any) => ({ src: u(i.src), alt: i.alt || c.title })),
    options: hideDefault((c.options ?? []).map((o: any) => ({ name: o.name, values: o.values }))), variants,
    categories: (c.categories ?? []).map(handleOf), tags: c.tags ?? [], shipTier: c.ship_tier || '', sourceUrl: c.source_url || '', updatedAt: '', source: 'dev',
  });
}

let devCache: { products: Product[]; categories: Category[] } | null = null;
function loadDev() {
  if (devCache) return devCache;
  const dir = [env('CATALOGUE_PATH') && path.dirname(env('CATALOGUE_PATH')), path.resolve(process.cwd(), '../catalogue'), '/catalogue'].filter(Boolean) as string[];
  for (const d of dir) {
    try {
      const pf = path.join(d, 'products.json'), cf = path.join(d, 'categories.json');
      if (!fs.existsSync(pf)) continue;
      const cats: Category[] = fs.existsSync(cf) ? (JSON.parse(fs.readFileSync(cf, 'utf8')) as any[]).map((c) => ({ handle: c.handle, name: c.name, parent: c.parent_handle })) : [];
      catNameToHandle = Object.fromEntries(cats.map((c) => [c.name, c.handle]));
      const products = (JSON.parse(fs.readFileSync(pf, 'utf8')) as any[]).map((c) => fromCatalogue(c, (n) => catNameToHandle![n] || n));
      return (devCache = { products, categories: cats });
    } catch (e) { console.warn('[catalogue] failed to read', d, e); }
  }
  return (devCache = { products: [], categories: [] });
}

let memo: { at: number; data: Catalogue } | null = null;
export async function getCatalogue(): Promise<Catalogue> {
  if (!hasBackend()) {
    const d = loadDev();
    return { ...d, source: d.products.length ? 'dev' : 'none' };
  }
  if (memo && Date.now() - memo.at < 20_000) return memo.data;
  try {
    const region_id = await getRegionId();
    const out: any[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const { products, count } = await getSdk().store.product.list({ limit: 100, offset, region_id, fields: FIELDS } as any);
      out.push(...products);
      if (out.length >= count) break;
    }
    const { product_categories } = await getSdk().store.category.list({ limit: 200, fields: 'id,name,handle,parent_category_id' } as any);
    const byId = new Map((product_categories as any[]).map((c) => [c.id, c]));
    const categories: Category[] = (product_categories as any[]).map((c) => ({ handle: c.handle, name: decodeEntities(c.name), parent: byId.get(c.parent_category_id)?.handle ?? null }));
    const data: Catalogue = { products: out.map(fromMedusa), categories, source: 'medusa' };
    memo = { at: Date.now(), data };
    return data;
  } catch (e) {
    console.error('[catalogue] medusa fetch failed', e);
    if (memo) return memo.data;
    return { products: [], categories: [], error: 'Our catalogue is taking a breather. Try again in a minute.', source: 'none' };
  }
}

/** A category plus all its descendants (products are often tagged with only the child). */
export function categoryFamily(categories: Category[], handle: string): string[] {
  const out = [handle];
  for (const c of categories) if (c.parent && out.includes(c.parent) && !out.includes(c.handle)) out.push(c.handle);
  return out;
}
export const inCategory = (p: Product, family: string[]) => p.categories.some((c) => family.includes(c));
export const topCategories = (cats: Category[]) => cats.filter((c) => !c.parent);

export async function getProduct(handle: string): Promise<{ product: Product | null; related: Product[]; categories: Category[]; error?: string }> {
  const { products, categories, error } = await getCatalogue();
  const product = products.find((p) => p.handle === handle) ?? null;
  const related = product
    ? [...products.filter((p) => p.id !== product.id && p.categories.some((c) => product.categories.includes(c))), ...products.filter((p) => p.id !== product.id)]
        .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).slice(0, 4)
    : [];
  return { product, related, categories, error };
}
