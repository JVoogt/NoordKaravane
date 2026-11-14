import { u } from '../lib/url';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { backendAvailable, client, errMsg, ga4Items, getCart, publishCount, reloadCart, setCartId, setShippingMethod, type Cart } from '../scripts/cart-client';
import { zar } from './format';
import { quoteHref, quoteLines } from '../lib/quote';
import { errInfo, isNetworkError, optionsLoader, placeCheck, stopCopy, summaryTotals, type OptionsState } from '../lib/promo';
import { cartLoadMsg } from '../lib/cart-load';
import PromoCode from './PromoCode';
import { clientCopy } from '@brand-copy';

// Brand strings and Kampi-look classes come from @brand-copy (empty classes on NK); Vite inlines BRAND, so the
// data-seller wrapper exists only in the Kampi bundle.
const { ui } = clientCopy;
const KAMPI = __BRAND__ === 'kampi';

interface Props {
  quoteHandles: string[];
  eftWindowHours: number; leadTime: string; freeShipping: number; pudoMaxWeightG: number; collectEnabled: boolean;
  workshop: { address_1: string; city: string; province: string; postal_code: string };
  /** Passed on NK only (unread here); the Kampi page leaves it out. */
  bank?: { account_name: string; bank_name: string };
}
interface Opt {
  id: string; name: string; amount: number | null; price_type?: string; data?: Record<string, any> | null; provider_id?: string;
  /** The last price run for this option failed: the amount shown (if any) is the previous one and is not confirmed. */
  unconfirmed?: boolean;
}
interface Provider { id: string }

const PUDO_MAP = 'https://www.pudo.co.za/where-to-find-us.php';
const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'];
const EFT = 'pp_eft_eft';
const PAYFAST = 'pp_payfast_payfast';

const isPudo = (o?: Opt) => !!o && (/pudo/i.test(o.name) || o.data?.id === 'pudo-locker');
const isCollect = (o?: Opt) => !!o && (o.data?.id === 'workshop-collect' || /collect from the workshop/i.test(o.name));
/** Total parcel weight in grams, from the variant weights the cart returns. Unknown weights count as 0 (the backend re-checks). */
const cartWeightG = (c: Cart | null) => (c?.items ?? []).reduce((s, i) => s + Number(i.variant?.weight ?? 0) * i.quantity, 0);

type F = Record<string, string>;
const EMPTY: F = { email: '', first_name: '', last_name: '', phone: '', address_1: '', address_2: '', city: '', province: '', postal_code: '', locker: '' };

export default function Checkout(props: Props) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [opts, setOpts] = useState<Opt[]>([]);
  const [optsState, setOptsState] = useState<OptionsState>('loading');
  const [providers, setProviders] = useState<string[]>([EFT]);
  const [f, setF] = useState<F>(EMPTY);
  const [shipId, setShipId] = useState('');
  const [shipBusy, setShipBusy] = useState(false);
  // A delivery choice the shop refused, shown by the delivery options (not by Place order).
  const [shipErr, setShipErr] = useState('');
  const [pay, setPay] = useState(EFT);
  const [marketing, setMarketing] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState('');
  const [placing, setPlacing] = useState(false);
  // A code request in flight: delivery choice and Place order wait for it (the Total must be the one the shopper saw).
  const [promoBusy, setPromoBusy] = useState(false);
  // True only for the cart a place() stop shows: that stop's message already says the code dropped (one message).
  const [placeStop, setPlaceStop] = useState(false);
  const summary = useRef<HTMLDetailsElement>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!backendAvailable()) { setLoading(false); return; }
    (async () => {
      try {
        const c = await getCart();
        setCart(c); publishCount(c);
        if (!c || !c.items.length) return;
        if (c.email) setF((p) => ({ ...p, email: c.email! }));
        const a = c.shipping_address;
        if (a) setF((p) => ({ ...p, first_name: a.first_name || '', last_name: a.last_name || '', phone: a.phone || '', address_1: a.address_1 || '', address_2: a.address_2 || '', city: a.city || '', province: a.province || '', postal_code: a.postal_code || '' }));
        if (typeof c.metadata?.pudo_locker === 'string') setF((p) => ({ ...p, locker: String(c.metadata!.pudo_locker) }));
        const held = serverShipId(c);
        if (held) setShipId(held);
        const [, pp] = await Promise.allSettled([
          delivery.load(c.id),
          client().store.payment.listPaymentProviders({ region_id: c.region_id }),
        ]);
        if (pp.status === 'fulfilled') {
          const ids = ((pp.value as any).payment_providers as Provider[]).map((p) => p.id);
          const avail = [EFT, PAYFAST].filter((x) => ids.includes(x));
          setProviders(avail.length ? avail : [EFT]);
          setPay(avail.includes(EFT) ? EFT : avail[0] ?? EFT);
        }
        if (!tracked.current) {
          tracked.current = true;
          window.nkTrack?.('begin_checkout', { currency: 'ZAR', value: c.total, items: ga4Items(c), meta_event_id: eventId() });
        }
      } catch (e) { console.error('[checkout] load failed', errInfo(e)); setLoadErr(cartLoadMsg(e)); } finally { setLoading(false); }
    })();
  }, []);

  /**
   * Lists the delivery options for this cart and prices them; never throws, a failure shows a Try again action.
   * Calculated options (ours all are) carry no price in the listing: Medusa calculates each for this cart. After a code
   * or a place() stop changes the cart they are priced again (a discount can take the courier's basis under the
   * free-delivery threshold), so the options not selected never show a stale price. The latest run wins. A failed
   * price keeps the previous amount but is flagged as unconfirmed; place() still stops if the total moves.
   */
  const delivery = useMemo(() => optionsLoader<Opt>({
    list: async (cartId) => {
      const so = (await client().store.fulfillment.listCartOptions({ cart_id: cartId })) as any;
      const listed = ((so.shipping_options ?? []) as Opt[]).filter((x) => props.collectEnabled || !isCollect(x));
      if (!listed.length) console.error('[checkout] no delivery options', cartId);
      return listed;
    },
    price: async (cartId, o) => {
      if (o.price_type !== 'calculated') return o;
      try {
        const r = (await client().store.fulfillment.calculate(o.id, { cart_id: cartId })) as any;
        return { ...o, amount: r.shipping_option?.amount ?? null, unconfirmed: false };
      } catch (e) { console.error('[checkout] delivery price failed', o.id, errInfo(e)); return { ...o, unconfirmed: true }; }
    },
    setOptions: setOpts,
    setState: setOptsState,
    onError: (e) => console.error('[checkout] delivery options failed', errInfo(e)),
  }), []);

  /**
   * The delivery option a cart really holds, as the one to show selected. CONTRACT: a Pudo method chosen earlier must
   * not survive a cart that has since become too heavy, so the customer re-picks.
   */
  const serverShipId = (c: Cart | null) => {
    const m = c?.shipping_methods?.[0];
    return m && !(/pudo/i.test(m.name || '') && cartWeightG(c) > props.pudoMaxWeightG) ? m.shipping_option_id : '';
  };

  const eventId = () => {
    try {
      let id = sessionStorage.getItem('nk_event_id');
      if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('nk_event_id', id); }
      return id;
    } catch { return crypto.randomUUID(); }
  };

  const heavy = cartWeightG(cart) > props.pudoMaxWeightG;
  // CONTRACT: hide Pudo when the parcel is over the locker limit (the backend lists it but prices it as courier).
  const visibleOpts = opts.filter((o) => !(isPudo(o) && heavy));
  const selected = visibleOpts.find((o) => o.id === shipId);
  const pudo = isPudo(selected);
  const collect = isCollect(selected);
  // The cart's own delivery method (the summary and the option labels read the same one) and its pre-discount fee.
  const cartOptionId = cart?.shipping_methods?.[0]?.shipping_option_id;
  const cartShip = cart ? cart.original_shipping_total ?? cart.shipping_total : 0;
  const set = (k: string) => (e: Event) => { const v = (e.target as HTMLInputElement).value; setF((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((p) => { const n = { ...p }; delete n[k]; return n; }); };

  async function chooseShipping(o: Opt) {
    if (!cart || promoBusy) return;
    setShipId(o.id); setShipErr(''); setSubmitErr(''); setPlaceStop(false);
    setErrors((p) => { const n = { ...p }; delete n.shipping; return n; });
    // The shop accepts Pudo only once the locker is on the cart: place() saves the locker first, then adds the method.
    if (isPudo(o)) return;
    setShipBusy(true);
    try {
      setCart(await setShippingMethod(cart.id, o.id));
    } catch (e) {
      console.error('[checkout] delivery method failed', o.id, errInfo(e));
      // The response can be lost after the shop made the change: read the cart back and show the method it really
      // holds, never the one assumed from the cart on screen. place() checks the method again before payment.
      let back: Cart | null = null;
      try { back = await reloadCart(cart.id); } catch (err) { console.error('[checkout] reload after delivery failure failed', errInfo(err)); }
      if (back) {
        setCart(back); setShipId(serverShipId(back));
        if (back.shipping_methods?.[0]?.shipping_option_id === o.id) return;
      } else setShipId(serverShipId(cart));
      setShipErr(isNetworkError(e) ? errMsg(e) : 'We could not set that delivery method.');
    } finally { setShipBusy(false); }
  }

  // Every summary number comes from here (P8). The cart's own totals count only when its method is the one selected: a
  // stale or replaced method (a Pudo pick waiting for Place order, a Pudo dropped for weight) leaks neither its fee nor
  // its shipping discount into the summary.
  const totals = useMemo(() => (cart ? summaryTotals(cart, shipId, selected?.amount ?? null) : null), [cart, selected, shipId]);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const req = (k: string, msg: string) => { if (!f[k]?.trim()) e[k] = msg; };
    req('email', 'Enter your email so we can send your order details.');
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'That email address does not look right.';
    req('first_name', 'First name is needed for delivery.'); req('last_name', 'Last name is needed for delivery.');
    req('phone', 'A phone number helps the courier reach you.');
    if (f.phone && f.phone.replace(/\D/g, '').length < 9) e.phone = 'That phone number looks too short.';
    if (!collect) {
      req('address_1', 'Enter your street address.'); req('city', 'Enter your city or suburb.'); req('province', 'Choose your province.');
      if (!/^\d{4}$/.test(f.postal_code.trim())) e.postal_code = 'South African postal codes have 4 digits.';
    }
    if (!shipId || !selected) e.shipping = 'Choose how you want it delivered.';
    if (pudo && !f.locker.trim()) e.locker = 'Tell us which Pudo locker you want it delivered to.';
    if (!terms) e.terms = 'Please accept the terms to place your order.';
    return e;
  }

  async function place(ev: Event) {
    ev.preventDefault();
    if (!cart || placing || promoBusy) return;
    // The Total the shopper sees right now. The order must be placed at exactly this amount (CONTRACTS "Vouchers").
    const shownTotal = totals?.total;
    setSubmitErr('');
    const e = validate();
    setErrors(e);
    const keys = Object.keys(e);
    if (keys.length) {
      setSubmitErr(`Please fix ${keys.length === 1 ? 'one thing' : keys.length + ' things'} below.`);
      const first = document.querySelector<HTMLElement>(`[data-field="${keys[0]}"] input, [data-field="${keys[0]}"] select, [data-field="${keys[0]}"]`);
      first?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      (first as HTMLElement | null)?.focus?.({ preventScroll: true });
      return;
    }
    setPlacing(true); setPlaceStop(false);
    try {
      const sdk = client();
      const consent = window.nkConsent ?? { analytics: false, marketing: false };
      const ids = consent.marketing ? ((window as any).nkMetaIds?.() ?? {}) : {};
      const addr = collect
        ? { first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone.trim(), ...props.workshop, address_2: 'Collection from the workshop', country_code: 'za' }
        : { first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone.trim(), address_1: f.address_1.trim(), address_2: f.address_2.trim(), city: f.city.trim(), province: f.province, postal_code: f.postal_code.trim(), country_code: 'za' };
      const mid = eventId();
      const metadata = { ...(cart.metadata ?? {}), pudo_locker: pudo ? f.locker.trim() : '', collect_from_workshop: collect, marketing_consent: marketing, analytics_consent: consent.analytics, meta_event_id: mid, ...ids };
      await sdk.store.cart.update(cart.id, { email: f.email.trim(), shipping_address: addr, billing_address: addr, metadata });
      const read = async () => (await sdk.store.cart.retrieve(cart.id, { fields: '*items,*shipping_methods,*payment_collection,*payment_collection.payment_sessions' })).cart as unknown as Cart;

      // The update above refreshes the cart: a shown code can drop out, or shipping can be re-priced (a discount can take
      // the courier's basis under the free-delivery threshold). Only the shop's cart says which delivery method it holds
      // (a lost response can leave it on another one, and at free delivery every method costs R0, so the totals match).
      // A different method is added again once (a Pudo locker is already in the metadata saved above); if the cart
      // still differs, or the total or a code moved, stop before payment and show the new cart.
      let fresh = await read();
      let check = placeCheck(cart, fresh, shipId, shownTotal, false);
      if (check === 'readd') {
        await sdk.store.cart.addShippingMethod(cart.id, { option_id: shipId, data: {} });
        fresh = await read();
        check = placeCheck(cart, fresh, shipId, shownTotal, true);
      }
      if (check !== 'ok') {
        // `fresh` lacks the variant weights the Pudo rule reads, so show the fully-shaped cart. If that read fails, keep
        // the cart on screen rather than one without weights; the message still stops the order.
        let shown: Cart | null = null;
        try { shown = await reloadCart(cart.id); } catch (err) { console.error('[checkout] reload after stop failed', errInfo(err)); }
        if (shown) {
          setPlaceStop(true); setShipErr(''); setCart(shown); delivery.refresh(shown.id);
          // The cart would not hold the method on screen: show the one it really holds.
          if (shown.shipping_methods?.[0]?.shipping_option_id !== shipId) setShipId(serverShipId(shown));
        }
        setPlacing(false);
        setSubmitErr(stopCopy(check, !!shown));
        return;
      }
      await sdk.store.payment.initiatePaymentSession(fresh as any, { provider_id: pay });

      if (pay === PAYFAST) {
        // The backend scaffold returns a signed form; the customer posts it to Payfast.
        const after = (await sdk.store.cart.retrieve(cart.id, { fields: '*payment_collection,*payment_collection.payment_sessions' })).cart as unknown as Cart;
        const sess = after.payment_collection?.payment_sessions?.find((s) => s.provider_id === PAYFAST);
        const d = sess?.data;
        if (d?.form_action && d.form_fields) {
          sessionStorage.setItem('nk_pending_cart', cart.id);
          const form = document.createElement('form'); form.method = 'POST'; form.action = d.form_action;
          Object.entries(d.form_fields as Record<string, string>).forEach(([k, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(v); form.appendChild(i); });
          document.body.appendChild(form); form.submit();
          return;
        }
        throw new Error('Card payment is not available right now. Please choose EFT.');
      }

      const res: any = await sdk.store.cart.complete(cart.id);
      if (res.type !== 'order' || !res.order) throw new Error(res.error?.message || 'We could not place your order. Nothing was charged, please try again.');
      const o = res.order;
      try {
        sessionStorage.setItem('nk_last_order', JSON.stringify({ id: o.id, display_id: o.display_id, email: f.email.trim(), total: o.total ?? fresh.total, currency: 'ZAR', meta_event_id: mid, items: ga4Items(fresh), pudo: pudo ? f.locker.trim() : '' }));
        sessionStorage.removeItem('nk_event_id');
      } catch { /* storage may be blocked; the confirmation page still works from the server */ }
      setCartId(null); publishCount(null);
      window.location.assign(u(`/order/confirmed/${encodeURIComponent(o.id)}`));
    } catch (err) {
      console.error('[checkout] place order failed', errInfo(err));
      setSubmitErr(errMsg(err, 'We could not place your order. Please try again.'));
      setPlacing(false);
    }
  }

  if (loading) return <div class="min-h-[28rem]" aria-busy="true"><p class="typed text-muted">Loading checkout...</p></div>;
  if (!backendAvailable()) return <div class="max-w-xl border-2 border-dashed border-ink/40 p-8"><p class="soft text-3xl">Preview mode.</p><p class="mt-2 text-muted">The shop backend is not connected, so checkout is switched off.</p></div>;
  if (loadErr) return <p class="err" role="alert">{loadErr} <a href={u('/cart')}>Back to cart</a></p>;
  if (!cart || !cart.items.length) return <div class="max-w-xl"><p class="soft text-[clamp(2rem,5vw,3rem)]">Nothing to check out yet.</p><a class="btn btn--lg mt-6" href={u('/')}>{clientCopy.cartEmptyAction}</a></div>;

  const quoted = quoteLines(cart.items, props.quoteHandles);
  if (quoted.length) {
    return (
      <div class="max-w-xl" role="alert">
        <p class="soft text-[clamp(1.8rem,5vw,2.6rem)]">Some items need a quote.</p>
        <p class="mt-3 text-muted">These are large freight items, so we price delivery for you instead of using the standard checkout:</p>
        <ul class="mt-3 list-disc pl-5 font-bold">{quoted.map((q) => <li>{q.product_title || q.title}</li>)}</ul>
        <p class="mt-3 text-muted">Remove them from your cart to check out the rest, or ask for a quote.</p>
        <div class="mt-6 flex flex-wrap gap-3">
          <a class="btn btn--lg" href={quoteHref(u('/contact'), quoted.map((q) => q.product_title || q.title))}>Request a quote</a>
          <a class="btn btn--ghost btn--lg" href={u('/cart')}>Back to cart</a>
        </div>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  const Field = ({ k, label, type = 'text', auto, inputMode, placeholder, hint, className = '' }: { k: string; label: string; type?: string; auto?: string; inputMode?: any; placeholder?: string; hint?: string; className?: string }) => (
    <div class={'field ' + className} data-field={k}>
      <label for={'f-' + k}>{label}</label>
      <input id={'f-' + k} class="input" type={type} name={k} value={f[k]} onInput={set(k)} autoComplete={auto} inputMode={inputMode} placeholder={placeholder}
        aria-invalid={err(k) ? 'true' : undefined} aria-describedby={err(k) ? `e-${k}` : hint ? `h-${k}` : undefined} />
      {hint && !err(k) && <p id={'h-' + k} class="hint">{hint}</p>}
      {err(k) && <p id={'e-' + k} class="err">{err(k)}</p>}
    </div>
  );

  const Summary = () => (
    <div>
      <ul class="grid gap-4">
        {cart.items.map((it) => (
          <li class="grid grid-cols-[3.75rem_1fr_auto] items-center gap-3">
            <div class={'relative aspect-square overflow-hidden bg-paper-3 outline outline-1 outline-ink/50' + ui.well}>
              {it.thumbnail ? <img src={it.thumbnail} alt="" width="120" height="120" class="h-full w-full object-contain" /> : null}
              <span class="typed absolute -right-0 -top-0 grid min-w-5 place-items-center bg-ink px-1 text-[0.72rem] leading-5 text-paper">{it.quantity}</span>
            </div>
            <div class="min-w-0"><p class={'font-display text-[0.95rem] font-extrabold uppercase leading-tight' + ui.nocaps}>{it.product_title || it.title}</p><p class="text-[0.85rem] text-muted">{it.variant_title}</p></div>
            <p class="typed text-[0.95rem]">{zar(it.original_total ?? it.total)}</p>
          </li>
        ))}
      </ul>
      <dl class="mt-5 grid gap-2 border-t-2 border-ink pt-4">
        <div class="flex justify-between"><dt>Subtotal</dt><dd class="typed">{zar(totals?.subtotal)}</dd></div>
        {!!totals && totals.discount > 0 && <div class="flex justify-between"><dt>Discount</dt><dd class="typed">&minus;{zar(totals.discount)}</dd></div>}
        <div class="flex justify-between"><dt>Delivery</dt><dd class="typed">{totals?.ship == null ? (selected ? 'Price not available' : 'choose below') : totals.ship === 0 ? 'Free' : zar(totals.ship)}</dd></div>
        <div class="flex items-baseline justify-between border-t border-ink/40 pt-3 text-[1.2rem] font-bold"><dt>Total <span class="hint font-normal">incl. VAT where applicable</span></dt><dd class="typed text-[1.5rem]" aria-live="polite">{zar(totals?.total)}</dd></div>
      </dl>
    </div>
  );

  return (
    <form onSubmit={place} noValidate class="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16" aria-describedby={submitErr ? 'submit-err' : undefined}>
      <div class="grid gap-10">
        {/* Mobile: collapsed order summary on top */}
        <details ref={summary} class={'border-2 border-ink bg-paper-2 lg:hidden' + ui.panel}>
          <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-bold"><span>Order summary ({cart.items.reduce((n, i) => n + i.quantity, 0)})</span><span class="typed">{zar(totals?.total)}</span></summary>
          <div class="border-t border-ink/40 p-4"><Summary /></div>
        </details>

        <fieldset class="grid gap-4">
          <legend class="display mb-2 text-[1.7rem]">Contact</legend>
          {Field({k: "email", label: "Email", type: "email", auto: "email", inputMode: "email", placeholder: "you@email.co.za", hint: "Your order and banking details are sent here."})}
        </fieldset>

        <fieldset class="grid gap-4 sm:grid-cols-2">
          <legend class="display mb-2 text-[1.7rem]">{collect ? 'Your details' : 'Delivery address'}</legend>
          {Field({k: "first_name", label: "First name", auto: "given-name"})}
          {Field({k: "last_name", label: "Last name", auto: "family-name"})}
          {Field({k: "phone", label: "Phone", type: "tel", auto: "tel", inputMode: "tel", className: "sm:col-span-2", placeholder: "082 123 4567"})}
          {!collect && Field({k: "address_1", label: "Street address", auto: "address-line1", className: "sm:col-span-2"})}
          {!collect && Field({k: "address_2", label: "Apartment, complex, suburb (optional)", auto: "address-line2", className: "sm:col-span-2"})}
          {!collect && Field({k: "city", label: "City or town", auto: "address-level2"})}
          {!collect && <div class="field" data-field="province">
            <label for="f-province">Province</label>
            <select id="f-province" class="input" name="province" value={f.province} onChange={set('province')} autoComplete="address-level1" aria-invalid={err('province') ? 'true' : undefined}>
              <option value="">Choose...</option>
              {PROVINCES.map((p) => <option value={p}>{p}</option>)}
            </select>
            {err('province') && <p class="err">{err('province')}</p>}
          </div>}
          {!collect && Field({k: "postal_code", label: "Postal code", auto: "postal-code", inputMode: "numeric"})}
          {!collect && <div class="field"><span class="lbl">Country</span><p class="input flex items-center bg-paper-2">South Africa</p></div>}
          <p class="hint sm:col-span-2">{collect ? 'We will WhatsApp or call you when your order is ready to collect.' : 'We deliver within South Africa only. Billing address is the same as delivery.'}</p>
        </fieldset>

        <fieldset class="grid gap-3" data-field="shipping" aria-describedby={err('shipping') ? 'e-ship' : undefined}>
          <legend class="display mb-2 text-[1.7rem]">Delivery method</legend>
          {optsState === 'loading' && opts.length === 0 && <p class="hint">Loading delivery options...</p>}
          {optsState === 'failed' && (
            <p class="err" role="alert">We could not load delivery options. <button type="button" class="link min-h-11 px-1" onClick={() => delivery.load(cart.id)}>Try again</button></p>
          )}
          {optsState === 'ready' && visibleOpts.length === 0 && (
            <p class="err" role="alert">No delivery options are available for this order. <a href={u('/contact')}>Contact us</a> to arrange delivery.</p>
          )}
          {heavy && opts.some(isPudo) && <p class="hint">This order is too big for a Pudo locker, so locker delivery is not offered.</p>}
          {visibleOpts.map((o) => {
            // The cart's own (pre-discount) price for its method wins over the listing price, the same method the summary reads.
            const own = cartOptionId === o.id;
            const amount = own ? cartShip : o.amount;
            const free = amount === 0;
            // The cart's own price is authoritative; a listing price from a failed re-price is not confirmed.
            const unconfirmed = !own && !!o.unconfirmed;
            return (
              <label class={'choice' + (shipId === o.id ? ' is-on' : '')}>
                <input type="radio" name="shipping" value={o.id} checked={shipId === o.id} onChange={() => chooseShipping(o)} disabled={shipBusy || placing || promoBusy} />
                <span class="choice__body">
                  <span class="flex items-baseline justify-between gap-3"><strong class="font-display text-[1.05rem] uppercase">{o.name}</strong><span class="typed font-bold">{amount == null ? 'Price not available' : free ? 'Free' : zar(amount)}</span></span>
                  <span class="text-[0.92rem] text-muted">{isPudo(o) ? 'Small parcels only. Collect from a Pudo locker near you, any time of day.' : isCollect(o) ? `Free. Collect from ${props.workshop.address_1}, ${props.workshop.city}, Mon to Thu 08:00 to 16:00, Fri 08:00 to 14:00. We contact you when it is ready.` : 'Delivered to your door by The Courier Guy. Price depends on parcel size.'}{isCollect(o) ? '' : <> Free over {zar(props.freeShipping)} for parcels up to 5 kg.</>}</span>
                  {unconfirmed && amount != null && <span class="hint">We could not confirm this price. It is checked again when you place your order.</span>}
                </span>
              </label>
            );
          })}
          {err('shipping') && <p id="e-ship" class="err">{err('shipping')}</p>}
          {shipErr && <p class="err" role="alert">{shipErr}</p>}

          {pudo && (
            <div class={'mt-2 border-2 border-ink bg-paper-2 p-4' + ui.panel} data-field="locker">
              <div class="field">
                <label for="f-locker">Your Pudo locker</label>
                <input id="f-locker" class="input" name="locker" value={f.locker} onInput={set('locker')} placeholder="e.g. Pudo Sandton City Mall, Level 1" aria-invalid={err('locker') ? 'true' : undefined} aria-describedby="h-locker" required />
                <p id="h-locker" class="hint">Not sure which one? <a href={PUDO_MAP} target="_blank" rel="noopener">Open the Pudo locker map</a> in a new tab, pick the one nearest you, and type its name or code here.</p>
                {err('locker') && <p class="err">{err('locker')}</p>}
              </div>
            </div>
          )}
        </fieldset>

        <fieldset class="grid gap-3">
          <legend class="display mb-2 text-[1.7rem]">Payment</legend>
          <label class={'choice' + (pay === EFT ? ' is-on' : '')}>
            <input type="radio" name="pay" value={EFT} checked={pay === EFT} onChange={() => setPay(EFT)} />
            <span class="choice__body">
              <strong class="font-display text-[1.05rem] uppercase">EFT, bank transfer</strong>
              <span class="text-[0.92rem] text-muted">Place your order and we show you our bank details and your reference straight away (and email them). Pay from your banking app within {props.eftWindowHours} hours and we get your order ready. No card needed.</span>
            </span>
          </label>
          {providers.includes(PAYFAST) && (
            <label class={'choice' + (pay === PAYFAST ? ' is-on' : '')}>
              <input type="radio" name="pay" value={PAYFAST} checked={pay === PAYFAST} onChange={() => setPay(PAYFAST)} />
              <span class="choice__body"><strong class="font-display text-[1.05rem] uppercase">Card, Instant EFT and more (Payfast)</strong><span class="text-[0.92rem] text-muted">You will be taken to Payfast to pay securely.</span></span>
            </label>
          )}
        </fieldset>

        <fieldset class="grid gap-3">
          <legend class="display mb-2 text-[1.7rem]">Almost there</legend>
          {clientCopy.checkoutOptIn && <label class="flex items-start gap-3"><input type="checkbox" class="mt-1 size-5 shrink-0 accent-[var(--color-wine)]" checked={marketing} onChange={(e) => setMarketing((e.target as HTMLInputElement).checked)} /><span>Send me emails about new drops and offers. <span class="hint">Optional. Unsubscribe any time.</span></span></label>}
          <div data-field="terms">
            <label class="flex items-start gap-3"><input type="checkbox" class="mt-1 size-5 shrink-0 accent-[var(--color-wine)]" checked={terms} onChange={(e) => { setTerms((e.target as HTMLInputElement).checked); setErrors((p) => { const n = { ...p }; delete n.terms; return n; }); }} aria-invalid={err('terms') ? 'true' : undefined} aria-describedby={err('terms') ? 'e-terms' : undefined} />
              <span>I accept the <a href={u('/legal/terms')} target="_blank" rel="noopener">terms and conditions</a>, <a href={u('/legal/returns')} target="_blank" rel="noopener">returns policy</a> and <a href={u('/legal/privacy')} target="_blank" rel="noopener">privacy policy</a>. I understand my order is prepared after payment and ships within {props.leadTime}.</span>
            </label>
            {err('terms') && <p id="e-terms" class="err mt-1">{err('terms')}</p>}
          </div>
        </fieldset>

        <PromoCode idPrefix="co" cart={cart} announceDrops={!placeStop} disabled={placing || shipBusy} onBusy={setPromoBusy}
          onCart={(c) => { setPlaceStop(false); setShipErr(''); setCart(c); delivery.refresh(c.id); }} />

        <div>
          {submitErr && <p id="submit-err" class="err mb-3 border-2 border-wine p-3 font-medium" role="alert">{submitErr}</p>}
          <button class="btn btn--lg w-full sm:w-auto" type="submit" disabled={placing || shipBusy || promoBusy}>{placing ? 'Placing your order...' : pay === PAYFAST ? 'Continue to Payfast' : `Place order${totals ? ' · ' + zar(totals.total) : ''}`}</button>
          <p class="hint mt-3">{pay === EFT ? `You will not be charged yet. Next you get our banking details to pay by EFT within ${props.eftWindowHours} hours.` : 'You will pay on the next screen.'}</p>
        </div>
      </div>

      <aside class={'hidden h-fit border-2 border-ink bg-paper-2 p-6 lg:sticky lg:top-28 lg:block' + ui.panel} aria-labelledby="co-sum">
        <h2 id="co-sum" class="display mb-5 text-[1.5rem]">Your order</h2>
        <Summary />
        <p class="mt-5 text-[0.9rem] text-muted">{KAMPI ? <span data-seller>{clientCopy.checkoutCollectLine}</span> : clientCopy.checkoutCollectLine} <a href={u('/cart')}>Edit cart</a></p>
      </aside>
    </form>
  );
}
