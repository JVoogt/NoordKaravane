import { useEffect, useRef, useState } from 'preact/hooks';
import { applyPromo, removePromo, type Cart } from '../scripts/cart-client';
import { PROMO_COPY, appliedCodes, droppedCodes, normalisePromoCode, promoErrorCopy, promoOutcome, promoPrecheck } from '../lib/promo';

/**
 * One discount code per order (CONTRACTS "Vouchers"). Everything shown is derived from the `cart` prop; local state is
 * only the input, the busy flag and the one inline message. Rendered once in Cart and once in Checkout.
 * `disabled` locks Apply, Remove and the input while the parent changes the cart (placing an order, choosing delivery,
 * a quantity change); `onBusy` tells the parent while a code request is in flight, so it locks its own cart changes and
 * two responses can never land out of order.
 */
export default function PromoCode({ cart, onCart, idPrefix, announceDrops = true, disabled = false, onBusy }: {
  cart: Cart; onCart: (c: Cart) => void; idPrefix: string; announceDrops?: boolean; disabled?: boolean; onBusy?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 'apply' or the code being removed
  const [msg, setMsg] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const focusToggle = useRef(false);
  const shown = useRef<string[] | null>(null);
  // Bumped after a Remove: focus goes back to the field (or the "Have a code?" button) once the chip has gone.
  const [refocus, setRefocus] = useState(0);

  const codes = appliedCodes(cart);
  const code = normalisePromoCode(raw);
  const inputId = `${idPrefix}-promo-code`;
  const msgId = `${idPrefix}-promo-msg`;

  // A code shown as applied that a later cart no longer holds (for example after a quantity change or a delivery
  // change) says so once. Our own apply and remove update `shown` before handing the cart up, so they never trigger it.
  // Checkout turns this off only for the cart its place() stop shows: that stop already says the code dropped, and a
  // failure gets one message, not two.
  useEffect(() => {
    const before = shown.current;
    if (announceDrops && before && droppedCodes({ promotions: before.map((c) => ({ code: c })) }, cart).length) setMsg(PROMO_COPY.not_applied);
    shown.current = appliedCodes(cart);
  }, [cart]);

  useEffect(() => {
    if (open) input.current?.focus();
    else if (focusToggle.current) { focusToggle.current = false; toggle.current?.focus(); }
  }, [open]);

  useEffect(() => {
    if (refocus) (open ? input.current : toggle.current)?.focus();
  }, [refocus]);

  useEffect(() => { onBusy?.(!!busy); }, [busy]);

  function handOver(fresh: Cart) {
    shown.current = appliedCodes(fresh);
    onCart(fresh);
  }

  async function apply() {
    if (!code || busy || disabled) return;
    setMsg('');
    const pre = promoPrecheck(cart, code);
    if (pre === 'one_code') { setMsg(PROMO_COPY.one_code); return; }
    if (pre === 'already_applied') { setMsg(PROMO_COPY.already_applied); return; }
    setBusy('apply');
    try {
      const fresh = await applyPromo(cart.id, code);
      const outcome = promoOutcome(fresh, code);
      handOver(fresh);
      if (outcome === 'applied') { setRaw(''); focusToggle.current = true; setOpen(false); }
      else setMsg(outcome === 'inactive' ? PROMO_COPY.inactive : PROMO_COPY.not_applied);
    } catch (e) {
      console.error('[promo] apply failed', e);
      setMsg(promoErrorCopy(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: string) {
    if (busy || disabled) return;
    setMsg(''); setBusy(c);
    try {
      handOver(await removePromo(cart.id, c));
      setRefocus((n) => n + 1);
    } catch (e) {
      console.error('[promo] remove failed', e);
      setMsg(promoErrorCopy(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-promo-code class="mt-5 border-t border-ink/40 pt-4">
      {codes.length > 0 && (
        <ul class="mb-2 grid gap-1" aria-label="Discount code applied">
          {codes.map((c) => (
            <li class="flex flex-wrap items-center justify-between gap-x-3">
              <span class="badge badge--wine typed max-w-full break-all">{c}</span>
              <button type="button" class="link min-h-11 px-1 text-[0.95rem]" aria-label={`Remove code ${c}`} disabled={!!busy || disabled} onClick={() => remove(c)}>
                {busy === c ? 'Removing' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        // Not a disclosure: the button is replaced by the field and focus moves into it, so no aria-expanded/controls.
        <button ref={toggle} type="button" class="link min-h-11 px-1 text-[0.95rem]" onClick={() => setOpen(true)}>
          Have a code?
        </button>
      ) : (
        <div class="field">
          <label for={inputId}>Discount code</label>
          <div class="flex flex-col gap-2 xs:flex-row">
            <input
              ref={input} id={inputId} class="input typed min-w-0 flex-1 uppercase" type="text" name="promo_code" value={raw}
              autoCapitalize="characters" autoComplete="off" spellcheck={false} readOnly={busy === 'apply'} disabled={disabled}
              aria-invalid={msg ? 'true' : undefined} aria-describedby={msg ? msgId : undefined}
              onInput={(e) => { setRaw((e.target as HTMLInputElement).value); if (msg) setMsg(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
            />
            <button type="button" class="btn shrink-0 xs:px-5" disabled={!code || !!busy || disabled} onClick={apply}>{busy === 'apply' ? 'Applying' : 'Apply'}</button>
          </div>
        </div>
      )}
      <p id={msgId} class={'err' + (msg ? ' mt-2' : '')} aria-live="polite">{msg}</p>
    </div>
  );
}
