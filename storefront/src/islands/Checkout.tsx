import { u } from '../lib/url';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { backendAvailable, client, errMsg, ga4Items, getCart, publishCount, setCartId, type Cart } from '../scripts/cart-client';
import { zar } from './format';
import { quoteHref, quoteLines } from '../lib/quote';

interface Props {
  quoteHandles: string[];
  eftWindowHours: number; leadTime: string; freeShipping: number; pudoMaxWeightG: number; collectEnabled: boolean;
  workshop: { address_1: string; city: string; province: string; postal_code: string };
  bank: { account_name: string; bank_name: string };
}
interface Opt { id: string; name: string; amount: number; price_type?: string; data?: Record<string, any> | null; provider_id?: string }
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
  const [providers, setProviders] = useState<string[]>([EFT]);
  const [f, setF] = useState<F>(EMPTY);
  const [shipId, setShipId] = useState('');
  const [shipBusy, setShipBusy] = useState(false);
  const [pay, setPay] = useState(EFT);
  const [marketing, setMarketing] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState('');
  const [placing, setPlacing] = useState(false);
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
        const sm = c.shipping_methods?.[0];
        // CONTRACT: a Pudo method chosen earlier must not survive a cart that has since become too heavy. Make the customer re-pick.
        if (sm && !(/pudo/i.test(sm.name || '') && cartWeightG(c) > props.pudoMaxWeightG)) setShipId(sm.shipping_option_id);
        const [so, pp] = await Promise.allSettled([
          client().store.fulfillment.listCartOptions({ cart_id: c.id }),
          client().store.payment.listPaymentProviders({ region_id: c.region_id }),
        ]);
        if (so.status === 'fulfilled') {
          // Calculated options (ours all are) carry no price in the listing: ask Medusa to calculate each for this cart.
          const listed = (((so.value as any).shipping_options ?? []) as Opt[]).filter((x) => props.collectEnabled || !isCollect(x));
          const priced = await Promise.all(listed.map(async (o) => {
            if (o.price_type !== 'calculated') return o;
            try {
              const r = (await client().store.fulfillment.calculate(o.id, { cart_id: c.id })) as any;
              return { ...o, amount: r.shipping_option?.amount ?? null };
            } catch { return o; }
          }));
          setOpts(priced);
        }
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
      } catch (e) { setLoadErr(errMsg(e)); } finally { setLoading(false); }
    })();
  }, []);

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
  const set = (k: string) => (e: Event) => { const v = (e.target as HTMLInputElement).value; setF((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((p) => { const n = { ...p }; delete n[k]; return n; }); };

  async function chooseShipping(o: Opt) {
    if (!cart) return;
    setShipId(o.id); setShipBusy(true); setSubmitErr('');
    try {
      const { cart: c } = await client().store.cart.addShippingMethod(cart.id, { option_id: o.id, data: {} });
      setCart({ ...cart, ...(c as unknown as Cart), items: cart.items.length ? (c as any).items ?? cart.items : cart.items });
      setErrors((p) => { const n = { ...p }; delete n.shipping; return n; });
    } catch (e) { setSubmitErr(errMsg(e, 'We could not set that delivery method.')); } finally { setShipBusy(false); }
  }

  const totals = useMemo(() => {
    if (!cart) return null;
    // Only trust the cart's own shipping total when its method is the one currently selected. A stale method (for example a
    // Pudo choice dropped because the cart became too heavy) must not leak its fee into the summary.
    const matches = !!shipId && cart.shipping_methods?.[0]?.shipping_option_id === shipId;
    if (matches) return { ship: cart.shipping_total, total: cart.total };
    const base = cart.total - (cart.shipping_methods?.length ? cart.shipping_total : 0);
    return { ship: selected ? selected.amount : null, total: base + (selected?.amount ?? 0) };
  }, [cart, selected, shipId]);

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
    if (!cart || placing) return;
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
    setPlacing(true);
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
      if (!cart.shipping_methods?.some((m) => m.shipping_option_id === shipId)) await sdk.store.cart.addShippingMethod(cart.id, { option_id: shipId, data: {} });

      const fresh = (await sdk.store.cart.retrieve(cart.id, { fields: '*items,*shipping_methods,*payment_collection,*payment_collection.payment_sessions' })).cart as unknown as Cart;
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
      setSubmitErr(errMsg(err, 'We could not place your order. Please try again.'));
      setPlacing(false);
    }
  }

  if (loading) return <div class="min-h-[28rem]" aria-busy="true"><p class="typed text-muted">Loading checkout...</p></div>;
  if (!backendAvailable()) return <div class="max-w-xl border-2 border-dashed border-ink/40 p-8"><p class="soft text-3xl">Preview mode.</p><p class="mt-2 text-muted">The shop backend is not connected, so checkout is switched off.</p></div>;
  if (loadErr) return <p class="err" role="alert">{loadErr} <a href={u('/cart')}>Back to cart</a></p>;
  if (!cart || !cart.items.length) return <div class="max-w-xl"><p class="soft text-[clamp(2rem,5vw,3rem)]">Nothing to check out yet.</p><a class="btn btn--lg mt-6" href={u('/')}>Browse the shop</a></div>;

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
            <div class="relative aspect-square overflow-hidden bg-paper-3 outline outline-1 outline-ink/50">
              {it.thumbnail ? <img src={it.thumbnail} alt="" width="120" height="120" class="h-full w-full object-contain" /> : null}
              <span class="typed absolute -right-0 -top-0 grid min-w-5 place-items-center bg-ink px-1 text-[0.72rem] leading-5 text-paper">{it.quantity}</span>
            </div>
            <div class="min-w-0"><p class="font-display text-[0.95rem] font-extrabold uppercase leading-tight">{it.product_title || it.title}</p><p class="text-[0.85rem] text-muted">{it.variant_title}</p></div>
            <p class="typed text-[0.95rem]">{zar(it.total)}</p>
          </li>
        ))}
      </ul>
      <dl class="mt-5 grid gap-2 border-t-2 border-ink pt-4">
        <div class="flex justify-between"><dt>Subtotal</dt><dd class="typed">{zar(cart.item_total ?? cart.subtotal)}</dd></div>
        {cart.discount_total > 0 && <div class="flex justify-between"><dt>Discount</dt><dd class="typed">&minus;{zar(cart.discount_total)}</dd></div>}
        <div class="flex justify-between"><dt>Delivery</dt><dd class="typed">{totals?.ship == null ? 'choose below' : totals.ship === 0 ? 'Free' : zar(totals.ship)}</dd></div>
        <div class="flex items-baseline justify-between border-t border-ink/40 pt-3 text-[1.2rem] font-bold"><dt>Total <span class="hint font-normal">incl. VAT where applicable</span></dt><dd class="typed text-[1.5rem]" aria-live="polite">{zar(totals?.total)}</dd></div>
      </dl>
    </div>
  );

  return (
    <form onSubmit={place} noValidate class="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16" aria-describedby={submitErr ? 'submit-err' : undefined}>
      <div class="grid gap-10">
        {/* Mobile: collapsed order summary on top */}
        <details ref={summary} class="border-2 border-ink bg-paper-2 lg:hidden">
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
          {opts.length === 0 && <p class="hint">Loading delivery options...</p>}
          {heavy && opts.some(isPudo) && <p class="hint">This order is too big for a Pudo locker, so locker delivery is not offered.</p>}
          {visibleOpts.map((o) => {
            const free = (totals && cart.shipping_methods?.some((m) => m.shipping_option_id === o.id) ? cart.shipping_total : o.amount) === 0;
            return (
              <label class={'choice' + (shipId === o.id ? ' is-on' : '')}>
                <input type="radio" name="shipping" value={o.id} checked={shipId === o.id} onChange={() => chooseShipping(o)} disabled={shipBusy || placing} />
                <span class="choice__body">
                  <span class="flex items-baseline justify-between gap-3"><strong class="font-display text-[1.05rem] uppercase">{o.name}</strong><span class="typed font-bold">{free ? 'Free' : zar(o.amount)}</span></span>
                  <span class="text-[0.92rem] text-muted">{isPudo(o) ? 'Small parcels only. Collect from a Pudo locker near you, any time of day.' : isCollect(o) ? 'Free. Collect from 252 General Beyers Street, Pretoria North, Mon to Thu 08:00 to 16:00, Fri 08:00 to 14:00. We contact you when it is ready.' : 'Delivered to your door by The Courier Guy. Price depends on parcel size.'}{isCollect(o) ? '' : <> Free over {zar(props.freeShipping)} for parcels up to 5 kg.</>}</span>
                </span>
              </label>
            );
          })}
          {err('shipping') && <p id="e-ship" class="err">{err('shipping')}</p>}

          {pudo && (
            <div class="mt-2 border-2 border-ink bg-paper-2 p-4" data-field="locker">
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
          <label class="flex items-start gap-3"><input type="checkbox" class="mt-1 size-5 shrink-0 accent-[var(--color-wine)]" checked={marketing} onChange={(e) => setMarketing((e.target as HTMLInputElement).checked)} /><span>Send me emails about new drops and offers. <span class="hint">Optional. Unsubscribe any time.</span></span></label>
          <div data-field="terms">
            <label class="flex items-start gap-3"><input type="checkbox" class="mt-1 size-5 shrink-0 accent-[var(--color-wine)]" checked={terms} onChange={(e) => { setTerms((e.target as HTMLInputElement).checked); setErrors((p) => { const n = { ...p }; delete n.terms; return n; }); }} aria-invalid={err('terms') ? 'true' : undefined} aria-describedby={err('terms') ? 'e-terms' : undefined} />
              <span>I accept the <a href={u('/legal/terms')} target="_blank" rel="noopener">terms and conditions</a>, <a href={u('/legal/returns')} target="_blank" rel="noopener">returns policy</a> and <a href={u('/legal/privacy')} target="_blank" rel="noopener">privacy policy</a>. I understand my order is prepared after payment and ships within {props.leadTime}.</span>
            </label>
            {err('terms') && <p id="e-terms" class="err mt-1">{err('terms')}</p>}
          </div>
        </fieldset>

        <div>
          {submitErr && <p id="submit-err" class="err mb-3 border-2 border-wine p-3 font-medium" role="alert">{submitErr}</p>}
          <button class="btn btn--lg w-full sm:w-auto" type="submit" disabled={placing || shipBusy}>{placing ? 'Placing your order...' : pay === PAYFAST ? 'Continue to Payfast' : `Place order${totals ? ' · ' + zar(totals.total) : ''}`}</button>
          <p class="hint mt-3">{pay === EFT ? `You will not be charged yet. Next you get our banking details to pay by EFT within ${props.eftWindowHours} hours.` : 'You will pay on the next screen.'}</p>
        </div>
      </div>

      <aside class="hidden h-fit border-2 border-ink bg-paper-2 p-6 lg:sticky lg:top-28 lg:block" aria-labelledby="co-sum">
        <h2 id="co-sum" class="display mb-5 text-[1.5rem]">Your order</h2>
        <Summary />
        <p class="mt-5 text-[0.9rem] text-muted">Noord Karavane, Pretoria North. <a href={u('/cart')}>Edit cart</a></p>
      </aside>
    </form>
  );
}
