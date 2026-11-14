/**
 * Reading the shopper's cart from the cart id in the `nk_cart` cookie. Pure: the retrieve call and the cookie clear
 * are passed in, so the rule is unit tested without the SDK or the DOM.
 */
export type CartRead<C> = (id: string) => Promise<C>;

/**
 * The cookie is cleared only when the cart is really gone: Medusa answers 404, or the cart is already completed (an
 * order was placed). Any other failure (offline, a 5xx, a timeout) is re-thrown and the cookie kept, so an outage
 * never loses the shopper's cart; the caller shows its network message.
 */
export async function loadCart<C extends { completed_at?: unknown }>(id: string, retrieve: CartRead<C>, forget: () => void): Promise<C | null> {
  let cart: C;
  try {
    cart = await retrieve(id);
  } catch (e) {
    if ((e as { status?: number } | null)?.status === 404) { forget(); return null; }
    throw e;
  }
  if (cart.completed_at) { forget(); return null; }
  return cart;
}
