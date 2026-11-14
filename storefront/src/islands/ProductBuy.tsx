import { useEffect, useMemo, useState } from 'preact/hooks';
import { u } from '../lib/url';
import { quoteHref } from '../lib/quote';
import { clientCopy } from '@brand-copy';

const { buyDeliveryLine: bdl, quoteLine: ql } = clientCopy;

interface V { id: string; sku: string; price: number | null; options: Record<string, string> }
interface Opt { name: string; values: string[] }
interface Props { handle: string; title: string; options: Opt[]; variants: V[]; freeShipping: number; live: boolean; quote?: boolean }

const zar = (n: number | null) => (n == null ? '' : 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).replace(/ /g, ' '));
const isColour = (n: string) => /colou?r/i.test(n);
const SWATCH: Record<string, string> = { black: '#111', white: '#f4f4f2', 'pure white': '#f4f4f2', grey: '#8a8d93', gray: '#8a8d93', red: '#c0392b', blue: '#2f6db5', green: '#3d8b4f', orange: '#e95e1d', yellow: '#e6c229' };

export default function ProductBuy(p: Props) {
  // pre-select an option when it has only one value; otherwise the customer must choose
  const [sel, setSel] = useState<Record<string, string>>(() => Object.fromEntries(p.options.filter((o) => o.values.length === 1).map((o) => [o.name, o.values[0]])));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const complete = p.options.every((o) => sel[o.name]);
  const variant = useMemo(() => (complete ? p.variants.find((v) => p.options.every((o) => v.options[o.name] === sel[o.name])) : undefined), [sel]);
  // an option value is available when some variant has it and matches the OTHER current selections
  const available = (name: string, value: string) => p.variants.some((v) => v.options[name] === value && Object.entries(sel).every(([k, val]) => k === name || !val || v.options[k] === val));
  const partial = p.variants.filter((v) => Object.entries(sel).every(([k, val]) => !val || v.options[k] === val));
  const prices = (partial.length ? partial : p.variants).map((v) => v.price).filter((x): x is number => typeof x === 'number');
  const lo = prices.length ? Math.min(...prices) : null;
  const hi = prices.length ? Math.max(...prices) : null;
  const shown = variant?.price ?? lo;
  const ranged = !variant && lo !== hi;

  useEffect(() => {
    const first = p.variants[0];
    window.nkTrack?.('view_item', { currency: 'ZAR', value: first?.price ?? 0, items: [{ item_id: p.handle, item_name: p.title, price: first?.price ?? 0, quantity: 1 }] });
  }, []);

  function choose(name: string, value: string) {
    setTried(false);
    setSel((s) => {
      const next = { ...s, [name]: value };
      // drop other selections that the new choice makes impossible
      for (const k of Object.keys(next)) if (k !== name && next[k] && !p.variants.some((v) => v.options[name] === value && v.options[k] === next[k])) next[k] = '';
      return next;
    });
  }

  async function submit(e: Event) {
    e.preventDefault();
    setMsg(null);
    if (!variant) { setTried(true); (document.querySelector('[data-opt-group] input') as HTMLElement | null)?.focus(); return; }
    setBusy(true);
    try {
      const { addToCart, ga4Items } = await import('../scripts/cart-client');
      const cart = await addToCart(variant.id, 1);
      const label = Object.values(variant.options).join(' / ');
      window.nkTrack?.('add_to_cart', { currency: 'ZAR', value: variant.price ?? 0, items: [{ item_id: p.handle, item_name: p.title, item_variant: label, price: variant.price ?? 0, quantity: 1 }], cart_items: ga4Items(cart).length });
      setMsg({ kind: 'ok', text: `Added: ${p.title}${label ? ', ' + label : ''}.` });
    } catch (err) {
      setMsg({ kind: 'err', text: /fetch|network/i.test((err as Error)?.message || '') ? 'We could not reach the shop. Check your connection and try again.' : 'We could not add that to your cart. Please try again.' });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} class="grid gap-6" noValidate>
      <p class="typed text-[2rem] font-bold leading-none" aria-live="polite">
        {ranged ? <span class="mr-2 text-[0.9rem] font-normal text-muted">from</span> : null}{zar(shown)}
      </p>

      {p.options.map((o) => (
        <fieldset data-opt-group aria-describedby={tried && !sel[o.name] ? `err-${o.name}` : undefined}>
          <legend class="mb-2 text-[0.95rem] font-bold">{o.name}{sel[o.name] ? <>: <span class="font-normal">{sel[o.name]}</span></> : null}</legend>
          <div class="flex flex-wrap gap-2">
            {o.values.map((val) => {
              const ok = available(o.name, val);
              return (
                <label class={'opt' + (/size/i.test(o.name) ? ' opt--size' : '') + (ok ? '' : ' is-off')}>
                  <input type="radio" name={o.name} value={val} checked={sel[o.name] === val} disabled={!ok} onChange={() => choose(o.name, val)} />
                  <span class="opt__box">{isColour(o.name) && SWATCH[val.toLowerCase()] ? <i class="opt__dot" style={{ background: SWATCH[val.toLowerCase()] }} aria-hidden="true" /> : null}{val}</span>
                </label>
              );
            })}
          </div>
          {tried && !sel[o.name] && <p id={`err-${o.name}`} class="err mt-2" role="alert">Please choose {/^[aeiou]/i.test(o.name) ? 'an' : 'a'} {o.name.toLowerCase()} first.</p>}
        </fieldset>
      ))}

      {variant?.sku ? <p class="text-[0.82rem] text-muted">SKU {variant.sku}</p> : null}

      {p.quote ? (
        <div class="grid gap-3">
          <a class="btn btn--lg w-full" href={quoteHref(u('/contact'), [p.title + (variant ? ' (' + Object.values(variant.options).join(' / ') + ')' : '')])}>Request a quote</a>
          <p class="flex items-start gap-2 text-[0.95rem] text-muted">
            <span>{ql.before}<strong class="text-ink">{ql.strong}</strong>{ql.after}</span>
          </p>
        </div>
      ) : (
      <div>
        <button class="btn btn--lg w-full" type="submit" disabled={busy || !p.live} aria-disabled={busy || !p.live}>
          {busy ? 'Adding...' : p.live ? 'Add to cart' : 'Preview mode: shop offline'}
        </button>
        <p class="mt-3 flex items-start gap-2 text-[0.95rem] text-muted">
          <svg class="mt-0.5 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></svg>
          <span>{bdl.beforePrice}{zar(p.freeShipping)}{bdl.afterPrice}<strong class="text-ink">{bdl.strong}</strong>{bdl.after}</span>
        </p>
      </div>
      )}

      <div role="status" aria-live="polite" class="min-h-6">
        {msg?.kind === 'ok' && (
          <div class="border border-wine bg-paper-2 p-4">
            <p class="font-bold">{msg.text}</p>
            <div class="mt-3 flex flex-wrap gap-3">
              <a class="btn" href={u('/checkout')}>Checkout</a>
              <a class="btn btn--ghost" href={u('/cart')}>View cart</a>
            </div>
          </div>
        )}
        {msg?.kind === 'err' && <p class="err">{msg.text}</p>}
      </div>
    </form>
  );
}
