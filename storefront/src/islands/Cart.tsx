import { u } from '../lib/url';
import { useEffect, useState } from 'preact/hooks';
import { backendAvailable, errMsg, getCart, publishCount, removeLine, updateQty, type Cart as CartT } from '../scripts/cart-client';
import { zar } from './format';
import { quoteHref, quoteLines } from '../lib/quote';
import PromoCode from './PromoCode';

export default function Cart({ freeShipping, quoteHandles }: { freeShipping: number; quoteHandles: string[] }) {
  const [cart, setCart] = useState<CartT | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!backendAvailable()) { setLoading(false); return; }
    getCart().then((c) => { setCart(c); publishCount(c); }).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  }, []);

  async function change(fn: () => Promise<CartT>, id: string) {
    setBusyId(id); setError('');
    try { setCart(await fn()); } catch (e) { setError(errMsg(e)); } finally { setBusyId(null); }
  }

  if (loading) return <div class="min-h-[22rem]" aria-busy="true"><p class="typed text-muted">Loading your cart...</p></div>;
  if (!backendAvailable()) return <div class="max-w-xl border-2 border-dashed border-ink/40 p-8"><p class="soft text-3xl">Preview mode.</p><p class="mt-2 text-muted">The shop backend is not connected, so the cart is switched off.</p></div>;

  const items = cart?.items ?? [];
  if (!items.length) {
    return (
      <div class="max-w-xl py-6">
        <p class="soft text-[clamp(2rem,5vw,3rem)]">Your cart is empty. Nothing to edit yet.</p>
        {error && <p class="err mt-3" role="alert">{error}</p>}
        <a class="btn btn--lg mt-6" href={u('/')}>Browse the shop</a>
      </div>
    );
  }

  const quoted = quoteLines(items, quoteHandles);
  const isQuote = (it: { product_handle?: string | null }) => quoted.some((q) => q === it);
  // item_total is post-discount once a code applies: show the pre-discount total, then subtract the discount once.
  const subtotal = cart!.original_item_total ?? cart!.item_total ?? cart!.subtotal;
  // Free delivery follows the courier's basis, item_total (post-discount).
  const shipBasis = cart!.item_total ?? cart!.subtotal;
  const toFree = Math.max(0, freeShipping - shipBasis);
  const pct = Math.min(100, Math.round((shipBasis / freeShipping) * 100));

  return (
    <div class="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-14">
      <div>
        {error && <p class="err mb-4" role="alert">{error}</p>}
        <ul class="border-t-2 border-ink">
          {items.map((it) => (
            <li class="grid grid-cols-[5.5rem_1fr] gap-4 border-b border-ink/40 py-5 sm:grid-cols-[7rem_1fr_auto]" aria-busy={busyId === it.id}>
              <a href={it.product_handle ? `/shop/${it.product_handle}/` : '#'} class="block aspect-square overflow-hidden bg-paper-3 outline outline-1 outline-ink/50">
                {it.thumbnail ? <img src={it.thumbnail} alt="" width="224" height="224" class="h-full w-full object-contain" loading="lazy" /> : null}
              </a>
              <div class="min-w-0">
                <h2 class="font-display text-[1.15rem] font-extrabold uppercase leading-tight"><a class="no-underline hover:text-wine" href={it.product_handle ? `/shop/${it.product_handle}/` : '#'}>{it.product_title || it.title}</a></h2>
                <p class="mt-1 text-[0.95rem] text-muted">{it.variant_title || it.variant?.options?.map((o) => o.value).join(' / ')}</p>
                <p class="typed mt-1 text-[0.95rem]">{zar(it.unit_price)} each</p>
                {isQuote(it) && <p class="mt-1 text-[0.9rem] font-bold text-wine-lit">Quote only: we quote delivery for this item.</p>}
                <div class="mt-3 flex flex-wrap items-center gap-4">
                  <div class="inline-flex items-center border-[1.5px] border-ink" role="group" aria-label={`Quantity for ${it.product_title || it.title}`}>
                    <button type="button" class="qty-btn" aria-label="Decrease quantity" disabled={busyId === it.id || it.quantity <= 1} onClick={() => change(() => updateQty(cart!.id, it.id, it.quantity - 1), it.id)}>&minus;</button>
                    <output class="typed grid w-10 place-items-center" aria-live="polite">{it.quantity}</output>
                    <button type="button" class="qty-btn" aria-label="Increase quantity" disabled={busyId === it.id || it.quantity >= 10} onClick={() => change(() => updateQty(cart!.id, it.id, it.quantity + 1), it.id)}>+</button>
                  </div>
                  <button type="button" class="link min-h-11 px-1 text-[0.95rem]" onClick={() => change(() => removeLine(cart!.id, it.id), it.id)}>Remove</button>
                </div>
              </div>
              <p class="typed col-start-2 text-[1.15rem] font-bold sm:col-start-3 sm:text-right">{zar(it.original_total ?? it.total)}</p>
            </li>
          ))}
        </ul>
      </div>

      <aside class="h-fit border-2 border-ink bg-paper-2 p-6 lg:sticky lg:top-28" aria-labelledby="sum-title">
        <h2 id="sum-title" class="display text-[1.6rem]">Order summary</h2>
        <dl class="mt-5 grid gap-2 text-[1rem]">
          <div class="flex justify-between"><dt>Subtotal</dt><dd class="typed">{zar(subtotal)}</dd></div>
          {cart!.discount_total > 0 && <div class="flex justify-between"><dt>Discount</dt><dd class="typed">&minus;{zar(cart!.discount_total)}</dd></div>}
          <div class="flex justify-between text-muted"><dt>Delivery</dt><dd>{quoted.length > 0 ? 'quoted for large items' : 'chosen at checkout'}</dd></div>
        </dl>
        <PromoCode idPrefix="cart" cart={cart!} onCart={(c) => { setCart(c); publishCount(c); }} />
        {quoted.length === 0 && <div class="mt-4" aria-live="polite">
          {toFree > 0 ? <p class="text-[0.92rem]">Add <strong>{zar(toFree)}</strong> more for free delivery (parcels up to 5 kg).</p> : <p class="text-[0.92rem] font-bold text-moss-deep">You have free shipping.</p>}
          <div class="mt-2 h-2 border border-ink bg-paper" role="presentation"><div class="h-full bg-wine" style={{ width: pct + '%' }} /></div>
        </div>}
        {quoted.length > 0 ? (
          <div class="mt-6 grid gap-3" role="alert">
            <p class="border-2 border-wine p-3 text-[0.95rem] font-medium">{quoted.length === 1 ? 'One item in your cart is' : `${quoted.length} items in your cart are`} quote only (large freight). Remove {quoted.length === 1 ? 'it' : 'them'} to check out the rest, or ask us for a quote.</p>
            <a class="btn btn--lg w-full" href={quoteHref(u('/contact'), quoted.map((q) => q.product_title || q.title))}>Request a quote</a>
          </div>
        ) : (
          <a class="btn btn--lg mt-6 w-full" href={u('/checkout')}>Checkout</a>
        )}
        <p class="hint mt-3">Prices include VAT where applicable. You pay by EFT after placing the order.</p>
        <p class="mt-4"><a class="link" href={u('/')}>Keep browsing</a></p>
      </aside>
    </div>
  );
}
