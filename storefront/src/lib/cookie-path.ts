/**
 * The cart cookie's Path for a store base (plan DD7, P21). NK keeps exactly `/shop`, so existing NK carts survive;
 * Kampi at base `/` gets `/`, so the cart follows the shopper across every page.
 */
export function cookiePath(base: string): string {
  return base.replace(/\/$/, '') || '/';
}
