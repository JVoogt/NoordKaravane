/**
 * The storefront is served under /shop (Astro `base`). Astro does NOT rewrite hrefs in markup, so every link to a
 * storefront page goes through u(). Links to the static landing page (outside the shop) are written raw.
 *   u('/')           -> /shop/
 *   u('/cart')       -> /shop/cart
 *   u('/some-thing/') -> /shop/some-thing/
 * Works on server and client (import.meta.env.BASE_URL is inlined by Vite).
 */
const base = ((import.meta.env.BASE_URL as string) || '/').replace(/\/$/, '');
export const u = (p: string): string => {
  if (!p || /^(https?:|mailto:|tel:|#|\/\/)/.test(p)) return p;
  if (p === '/') return base + '/';
  return base + (p.startsWith('/') ? p : '/' + p);
};
/** Landing-page URLs (outside /shop), e.g. the workshop home page. */
export const LANDING = '/';
