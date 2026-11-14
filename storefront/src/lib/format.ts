export const zar = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return '';
  const whole = Math.abs(n % 1) < 0.005;
  return 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).replace(/ /g, ' ');
};
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const decodeEntities = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** First segments under /shop/ that are real routes and so can never be a product handle (see CONTRACTS.md).
 *  The second line holds the old Woo paths the Kampi store redirects (plan DD8): never an NK handle either. */
export const RESERVED_HANDLES = ['cart', 'checkout', 'order', 'category', 'search', 'sitemap.xml', 'products', 'about', 'contact', 'faq', 'how-to-order', 'shipping', 'legal', 'api', 'healthz', 'robots.txt',
  'product', 'product-category', 'product-tag', 'shop', 'my-account', 'terms-conditions', 'privacy-policy', 'refund_returns', 'home', 'feed', 'page', 'sitemap_index.xml'];
