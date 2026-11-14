import Medusa from '@medusajs/js-sdk';
import { clientEnv } from './env';

export interface CartItem {
  id: string; title: string; product_title?: string; variant_title?: string; product_handle?: string; thumbnail?: string | null;
  variant_id?: string; quantity: number; unit_price: number; total: number;
  /** Pre-discount line value (line `total` is post-discount). */
  subtotal?: number; original_total?: number;
  adjustments?: { code?: string | null; amount?: number | null }[] | null;
  variant?: { id: string; title?: string; weight?: number | null; options?: { value: string }[] };
}
export interface Cart {
  id: string; email?: string; currency_code: string; region_id: string;
  items: CartItem[]; subtotal: number; total: number; shipping_total: number; discount_total: number; item_total: number;
  /** Pre-discount, VAT-inclusive item total. `item_total` is post-discount once a code applies. */
  original_item_total?: number;
  promotions?: { id: string; code?: string | null; is_automatic?: boolean | null }[];
  shipping_methods?: { id: string; shipping_option_id: string; name: string; amount: number; adjustments?: { code?: string | null; amount?: number | null }[] | null }[];
  shipping_address?: Record<string, string>; metadata?: Record<string, unknown> | null;
  payment_collection?: { payment_sessions?: { id: string; provider_id: string; data?: Record<string, any> }[] };
}

export const CART_COOKIE = 'nk_cart';
const FIELDS = '*items,+items.thumbnail,+items.product_handle,+items.product_title,+items.variant_title,*items.variant,*items.variant.options,+items.variant.weight,*shipping_methods,*payment_collection,*payment_collection.payment_sessions,+promotions.code';

let sdk: Medusa | null = null;
export function client(): Medusa {
  if (!sdk) {
    const e = clientEnv();
    sdk = new Medusa({ baseUrl: e.medusaUrl, publishableKey: e.publishableKey || undefined });
  }
  return sdk;
}
export const backendAvailable = () => !!clientEnv().medusaUrl;

export function getCartId(): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + CART_COOKIE + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
export function setCartId(id: string | null) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = id
    ? `${CART_COOKIE}=${encodeURIComponent(id)}; Max-Age=${60 * 60 * 24 * 30}; Path=/shop; SameSite=Lax${secure}`
    : `${CART_COOKIE}=; Max-Age=0; Path=/shop; SameSite=Lax${secure}`;
}

export function publishCount(cart: Cart | null) {
  const n = cart?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  try { localStorage.setItem('nk_cart_count', String(n)); } catch { /* storage may be blocked */ }
  document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => { el.textContent = String(n); el.hidden = n === 0; });
  document.dispatchEvent(new CustomEvent('nk:cart', { detail: cart }));
}

let regionId: string | null = null;
async function region(): Promise<string> {
  if (regionId) return regionId;
  const { regions } = await client().store.region.list();
  const r = regions.find((x: { currency_code: string }) => x.currency_code === 'zar') ?? regions[0];
  if (!r) throw new Error('No sales region is configured.');
  return (regionId = r.id);
}

export async function getCart(): Promise<Cart | null> {
  const id = getCartId();
  if (!id) return null;
  try {
    const { cart } = await client().store.cart.retrieve(id, { fields: FIELDS });
    if ((cart as any).completed_at) { setCartId(null); return null; }
    return cart as unknown as Cart;
  } catch {
    setCartId(null);
    return null;
  }
}

export async function ensureCart(): Promise<Cart> {
  const existing = await getCart();
  if (existing) return existing;
  const { cart } = await client().store.cart.create({ region_id: await region() });
  setCartId(cart.id);
  const full = await client().store.cart.retrieve(cart.id, { fields: FIELDS });
  return full.cart as unknown as Cart;
}

async function refresh(id: string) {
  const { cart } = await client().store.cart.retrieve(id, { fields: FIELDS });
  publishCount(cart as unknown as Cart);
  return cart as unknown as Cart;
}

export async function addToCart(variantId: string, quantity = 1): Promise<Cart> {
  const cart = await ensureCart();
  await client().store.cart.createLineItem(cart.id, { variant_id: variantId, quantity });
  return refresh(cart.id);
}
export async function updateQty(cartId: string, lineId: string, quantity: number): Promise<Cart> {
  await client().store.cart.updateLineItem(cartId, lineId, { quantity });
  return refresh(cartId);
}
export async function removeLine(cartId: string, lineId: string): Promise<Cart> {
  await client().store.cart.deleteLineItem(cartId, lineId);
  return refresh(cartId);
}

export const reloadCart = refresh;

/** Adds a code (already normalised by the caller). SDK errors are re-thrown unchanged for promoErrorCopy. */
export async function applyPromo(cartId: string, code: string): Promise<Cart> {
  await client().store.cart.addPromotions(cartId, { promo_codes: [code] });
  return refresh(cartId);
}
export async function removePromo(cartId: string, code: string): Promise<Cart> {
  await client().store.cart.removePromotions(cartId, { promo_codes: [code] });
  return refresh(cartId);
}

export function errMsg(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const m = (e as { message?: string })?.message;
  if (!m) return fallback;
  if (/fetch|network|Failed to/i.test(m)) return 'We could not reach the shop. Check your connection and try again.';
  return m.length < 200 ? m : fallback;
}

export function ga4Items(cart: Cart) {
  return cart.items.map((i) => ({ item_id: i.product_handle || i.variant_id || i.id, item_name: i.product_title || i.title, item_variant: i.variant_title, price: i.unit_price, quantity: i.quantity }));
}
