import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WOO_CATEGORY_MAP, WOO_CATEGORY_URLS, WOO_PAGE_MAP, WOO_PRODUCT_SLUGS, wooRedirect, type RedirectMaps } from './woo-redirects.ts';
import { PRODUCT_REDIRECTS } from './redirects.ts';
import { CATEGORY_REDIRECTS } from './category-config.ts';

const REAL: RedirectMaps = { products: PRODUCT_REDIRECTS, categories: CATEGORY_REDIRECTS };
const r = (path: string, search = '', maps: RedirectMaps = REAL) => wooRedirect(path, search, maps);

test('the frozen lists hold 53 products and 19 categories', () => {
  assert.equal(WOO_PRODUCT_SLUGS.length, 53);
  assert.equal(new Set(WOO_PRODUCT_SLUGS).size, 53);
  assert.equal(WOO_CATEGORY_URLS.length, 19);
  assert.equal(Object.keys(WOO_CATEGORY_MAP).length, 19);
});

test('product URLs go to the same handle at the root, with any sub-path or query dropped', () => {
  assert.equal(r('/product/campsite-first-aid-kit/'), '/campsite-first-aid-kit/');
  assert.equal(r('/product/campsite-first-aid-kit'), '/campsite-first-aid-kit/');
  assert.equal(r('/product/campsite-first-aid-kit/', 'utm_source=x'), '/campsite-first-aid-kit/');
  for (const sub of ['feed/', 'embed/', 'attachment/photo-1/', 'comment-page-2/', '2/']) {
    assert.equal(r(`/product/campsite-first-aid-kit/${sub}`), '/campsite-first-aid-kit/', sub);
  }
});

test('a product slug that a made-up products map merges goes straight to the new handle', () => {
  const maps: RedirectMaps = { products: { 'old-fan': 'new-fan' }, categories: {} };
  assert.equal(r('/product/old-fan/', '', maps), '/new-fan/');
});

test('category URLs resolve the leaf through the Woo map, nested or not, with paging and feeds', () => {
  assert.equal(r('/product-category/camping-gear/batteries-power/'), '/category/batteries-power/');
  assert.equal(r('/product-category/batteries-power/'), '/category/batteries-power/');
  assert.equal(r('/product-category/camping-gear/'), '/category/camping-gear/');
  assert.equal(r('/product-category/kampi-merchandise/page/2/'), '/category/merchandise/');
  assert.equal(r('/product-category/camping-gear/feed/'), '/category/camping-gear/');
  assert.equal(r('/product-category/camping-gear/batteries-power/page/3'), '/category/batteries-power/');
});

test('a Woo category NK moved is followed through CATEGORY_REDIRECTS in the same hop', () => {
  const maps: RedirectMaps = { products: {}, categories: { 'camping-gear': 'camp-kit' } };
  assert.equal(r('/product-category/camping-gear/', '', maps), '/category/camp-kit/');
});

test('categories with no NK home, and unknown or empty ones, go to the store front', () => {
  assert.equal(r('/product-category/security-tracking/'), '/');
  assert.equal(r('/product-category/uncategorized/'), '/');
  assert.equal(r('/product-category/nope/'), '/');
  assert.equal(r('/product-category/'), '/');
});

test('tags, shop pages, paging, home and my-account go to the store front', () => {
  for (const p of ['/product-tag/fan/', '/product-tag/a/b/', '/shop', '/shop/', '/shop/page/2/', '/page/3/', '/home', '/home/', '/my-account', '/my-account/orders/', '/my-account/view-order/12/']) {
    assert.equal(r(p), '/', p);
  }
});

test('checkout sub-pages (order received, order pay) go to the store front; checkout itself stays', () => {
  assert.equal(r('/checkout/order-received/123/', 'key=wc_order_x'), '/');
  assert.equal(r('/checkout/order-pay/123/'), '/');
  assert.equal(r('/checkout'), null);
  assert.equal(r('/checkout/'), null);
});

test('Woo legal pages go to the Kampi legal pages', () => {
  assert.equal(r('/terms-conditions/'), '/legal/terms');
  assert.equal(r('/privacy-policy'), '/legal/privacy');
  assert.equal(r('/refund_returns/'), '/legal/returns');
  assert.deepEqual(WOO_PAGE_MAP, { 'terms-conditions': '/legal/terms', 'privacy-policy': '/legal/privacy', refund_returns: '/legal/returns' });
});

test('feeds go to the store front', () => {
  for (const p of ['/feed', '/feed/', '/comments/feed/', '/about/feed/', '/some-page/feed']) assert.equal(r(p), '/', p);
});

test('Woo and WordPress sitemaps go to the store sitemap', () => {
  for (const p of ['/sitemap_index.xml', '/product-sitemap.xml', '/page-sitemap.xml', '/product_cat-sitemap2.xml', '/wp-sitemap.xml', '/wp-sitemap-posts-product-1.xml']) {
    assert.equal(r(p), '/sitemap.xml', p);
  }
});

test('add-to-cart links on any path go to the store front', () => {
  assert.equal(r('/', 'add-to-cart=813'), '/');
  assert.equal(r('/product/x/', 'add-to-cart=1'), '/');
  assert.equal(r('/shop/', 'add-to-cart=1&quantity=2'), '/');
});

test('a Woo search becomes a store search, other parameters dropped', () => {
  assert.equal(r('/', 's=fan&post_type=product'), '/?q=fan');
  assert.equal(r('/', 's=camp%20chair'), '/?q=camp%20chair');
  assert.equal(r('/', 's=a%26b'), '/?q=a%26b');
});

test('store routes, NK handles and uppercase Woo paths are left alone', () => {
  for (const p of ['/', '/sitemap.xml', '/robots.txt', '/cart', '/cart/', '/checkout', '/about/', '/about', '/contact', '/contact/', '/campsite-first-aid-kit/', '/category/camping-gear/', '/legal/terms', '/healthz', '/Product/x/', '/PRODUCT-CATEGORY/camping-gear/', '/Shop/']) {
    assert.equal(r(p), null, p);
  }
  assert.equal(r('/', 'q=fan'), null);
});

// P5: every frozen Woo URL and every example above lands in one hop on a page that does not redirect again,
// and never on a legacy NK redirect source (with the real maps).
const EXAMPLES: [string, string][] = [
  ['/product/campsite-first-aid-kit/', ''], ['/product-category/camping-gear/batteries-power/', ''], ['/product-category/kampi-merchandise/page/2/', ''],
  ['/product-category/security-tracking/', ''], ['/product-category/nope/', ''], ['/', 'add-to-cart=813'], ['/', 's=fan&post_type=product'],
  ['/sitemap_index.xml', ''], ['/product-sitemap.xml', ''], ['/terms-conditions/', ''], ['/privacy-policy/', ''], ['/refund_returns/', ''],
  ['/shop/', ''], ['/my-account/', ''], ['/checkout/order-received/1/', ''], ['/feed/', ''], ['/product-tag/x/', ''], ['/home/', ''],
];

test('P5: one hop, to a target that is not itself redirected', () => {
  const sources: [string, string][] = [
    ...WOO_PRODUCT_SLUGS.map((s): [string, string] => [`/product/${s}/`, '']),
    ...WOO_CATEGORY_URLS.map((u): [string, string] => [u, '']),
    ...EXAMPLES,
  ];
  assert.ok(sources.length >= 53 + 19 + 18);
  for (const [path, search] of sources) {
    const t = r(path, search);
    assert.ok(t, `${path}?${search} has a target`);
    const [tp] = t!.split('?');
    assert.equal(r(tp, ''), null, `${path} -> ${t} redirects again`);
    for (const k of Object.keys(PRODUCT_REDIRECTS)) assert.notEqual(tp, `/${k}/`, `${path} -> legacy product ${k}`);
    for (const k of Object.keys(CATEGORY_REDIRECTS)) assert.notEqual(tp, `/category/${k}/`, `${path} -> legacy category ${k}`);
  }
});

test('every Woo category the map sends to NK exists as a category target, and products keep their handle', () => {
  for (const [woo, nk] of Object.entries(WOO_CATEGORY_MAP)) if (nk !== null) assert.match(nk, /^[a-z0-9-]+$/, woo);
  for (const s of WOO_PRODUCT_SLUGS) assert.equal(r(`/product/${s}/`), `/${PRODUCT_REDIRECTS[s] ?? s}/`);
});
