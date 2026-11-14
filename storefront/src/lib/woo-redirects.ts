/**
 * Old WooCommerce URLs of store.kampi.co.za, mapped once to their Kampi Store page (plan DD8). Kampi brand only; the
 * middleware answers 301 with Cache-Control public, max-age=86400. Pure: no imports, the NK maps are passed in.
 * Paths match case-sensitively, trailing slash optional, query ignored unless named (add-to-cart, s).
 */
export interface RedirectMaps {
  /** NK merged products: old handle -> new handle (PRODUCT_REDIRECTS). */
  products: Record<string, string>;
  /** NK moved categories: old handle -> new handle (CATEGORY_REDIRECTS). */
  categories: Record<string, string>;
}

/** Woo category slug -> NK category handle, or null for "no NK home, send to the store front" (Woo terms 2026-11-13). */
export const WOO_CATEGORY_MAP: Readonly<Record<string, string | null>> = {
  'batteries-power': 'batteries-power', boskampkos: 'boskampkos', 'braai-outdoor-cooking': 'braai-outdoor-cooking',
  'camping-breakfast': 'camping-breakfast', 'camping-gear': 'camping-gear', 'camping-clothing': 'camping-clothing',
  'cooling-ice': 'cooling-ice', drinkware: 'drinkware', 'host-accessories': 'host-accessories',
  'host-starter-packs': 'host-starter-packs', 'camping-hot-drinks': 'camping-hot-drinks', 'kampihost-essentials': 'kampihost-essentials',
  'camping-lighting': 'camping-lighting', 'camping-snacks': 'camping-snacks', 'stickers-decals': 'stickers-decals',
  'water-pumps': 'water-pumps', 'kampi-merchandise': 'merchandise', 'security-tracking': null, uncategorized: null,
};

/** Woo pages with a Kampi Store equivalent. */
export const WOO_PAGE_MAP: Readonly<Record<string, string>> = {
  'terms-conditions': '/legal/terms', 'privacy-policy': '/legal/privacy', refund_returns: '/legal/returns',
};

/** The 53 published Woo product slugs (frozen from the live Woo store, 2026-11-13; rechecked 2026-11-14). */
export const WOO_PRODUCT_SLUGS: readonly string[] = [
  '12-volt-transfer-pump', 'battery-operated-transfer-pump', 'beer-glass',
  'botswana-cross-border-sticker-kit', 'braai-reels-t-shirt', 'braai-rules-t-shirt',
  'branded-steel-mugs', 'camping-because-therapy-is-expensive-t-shirt', 'campsite-first-aid-kit',
  'eswatini-cross-border-sticker-kit', 'feeding-mosquitos-t-shirt', 'fishing-rod-camping-light',
  'hot-chocolate-stick-steel-mug-duo', 'hot-chocolate-sticks', 'kamp-goedkoper-as-terapie-t-shirt',
  'kampi-branded-coffee-mugs-beer-glasses', 'kampi-foldaway-camp-fan', 'kampi-service-booklet',
  'kampi-sticker-pack', 'kampihost-starter-pack-beginner-tier-1', 'kampihost-starter-pack-essentials-tier-2',
  'kampihost-starter-pack-pro-tier-3', 'lesotho-cross-border-sticker-kit', 'lumeno-12v-150ah-lithium-battery',
  'lumeno-12v-slimline-lithium-battery', 'lumeno-41-series-water-pump', 'lumeno-battery-communication-cable',
  'lumeno-camp-braai-light', 'lumeno-electric-jack-kit', 'lumeno-light-master-torch',
  'lumeno-outdoor-camping-chair', 'lumeno-potjie-braai', 'lumeno-rechargeable-camping-light-kit',
  'lumeno-rechargeable-led-sensor-light', 'lumeno-roadshower', 'magnetic-cob-camping-light',
  'makabrai-all-in-one-braai-stand', 'mozambique-cross-border-sticker-kit', 'muskietkos-t-shirt',
  'namibia-cross-border-sticker-kit', 'opblaas-matrassies-pre-mixed-plaatkoekie-mix', 'pro-max-headlight',
  'roomys-grondseile-pre-mixed-waffle-mix', 'slaapsakke-pre-mixed-pancake-mix', 'snowva-ice-maker',
  'soft-shell-kampi-jacket', 'tentpenne-sugar-cone-treats', 'the-bos-braai-your-adventure-braai-anywhere',
  'the-pen-pusher', 'vehicle-first-aid-kit', 'wireless-magnetic-towing-camera',
  'wireless-towing-camera-bracket-mount', 'zimbabwe-cross-border-sticker-kit',
];

/** The 19 Woo product category URLs in Woo's nested form (parents from the Woo term list, 2026-11-13). */
export const WOO_CATEGORY_URLS: readonly string[] = [
  '/product-category/camping-gear/batteries-power/',
  '/product-category/boskampkos/',
  '/product-category/camping-gear/braai-outdoor-cooking/',
  '/product-category/boskampkos/camping-breakfast/',
  '/product-category/camping-gear/',
  '/product-category/kampi-merchandise/camping-clothing/',
  '/product-category/camping-gear/cooling-ice/',
  '/product-category/kampi-merchandise/drinkware/',
  '/product-category/kampihost-essentials/host-accessories/',
  '/product-category/kampihost-essentials/host-starter-packs/',
  '/product-category/boskampkos/camping-hot-drinks/',
  '/product-category/kampi-merchandise/',
  '/product-category/kampihost-essentials/',
  '/product-category/camping-gear/camping-lighting/',
  '/product-category/security-tracking/',
  '/product-category/boskampkos/camping-snacks/',
  '/product-category/stickers-decals/',
  '/product-category/uncategorized/',
  '/product-category/camping-gear/water-pumps/',
];

const own = (o: Readonly<Record<string, unknown>>, k: string) => Object.hasOwn(o, k);
const isNum = (s: string) => /^\d+$/.test(s);
const SITEMAP = /^\/(?:sitemap_index\.xml|[a-z0-9_]+-sitemap\d*\.xml|wp-sitemap[^/]*\.xml)$/;

/** The Kampi Store target for an old Woo URL, or null when the path is not a Woo URL (no redirect). */
export function wooRedirect(pathname: string, search: string, maps: RedirectMaps): string | null {
  const q = new URLSearchParams(search);
  if (q.has('add-to-cart')) return '/';
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) {
    const s = q.get('s');
    return s !== null ? `/?q=${encodeURIComponent(s)}` : null;
  }
  const [first] = segs;
  const P = (h: string) => (own(maps.products, h) ? maps.products[h] : h);
  const C = (h: string) => (own(maps.categories, h) ? maps.categories[h] : h);

  if (first === 'product') return segs[1] ? `/${P(segs[1])}/` : '/';
  if (first === 'product-category') {
    const leaf = [...segs.slice(1)].reverse().find((s) => s !== 'page' && s !== 'feed' && !isNum(s));
    const m = leaf && own(WOO_CATEGORY_MAP, leaf) ? WOO_CATEGORY_MAP[leaf] : null;
    return m ? `/category/${C(m)}/` : '/';
  }
  if (first === 'product-tag' || first === 'my-account') return '/';
  if (first === 'shop' && (segs.length === 1 || (segs.length === 3 && segs[1] === 'page' && isNum(segs[2])))) return '/';
  if (first === 'page' && segs.length === 2 && isNum(segs[1])) return '/';
  if (first === 'home' && segs.length === 1) return '/';
  if (first === 'checkout' && segs.length > 1) return '/';
  if (segs.length === 1 && own(WOO_PAGE_MAP, first)) return WOO_PAGE_MAP[first];
  if (segs[segs.length - 1] === 'feed') return '/';
  if (segs.length === 1 && SITEMAP.test(`/${first}`)) return '/sitemap.xml';
  return null;
}
