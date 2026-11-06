import { clientEnv } from './env';

// ---- cart badge (instant from localStorage, authoritative once an island refreshes it)
try {
  const n = Number(localStorage.getItem('nk_cart_count') || 0);
  if (n > 0) document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => { el.textContent = String(n); el.hidden = false; });
} catch { /* ignore */ }

// ---- dialogs: any [data-open-dialog="id"] opens <dialog id>, and [data-close] closes its parent
document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const opener = t.closest<HTMLElement>('[data-open-dialog]');
  if (opener) {
    const d = document.getElementById(opener.dataset.openDialog!) as HTMLDialogElement | null;
    if (d && !d.open) { d.showModal(); }
  }
  const closer = t.closest('[data-close]');
  if (closer) (closer.closest('dialog') as HTMLDialogElement | null)?.close();
  const dlg = t as HTMLDialogElement;
  if (dlg.tagName === 'DIALOG' && dlg.open) {
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  }
});

// ---- Turnstile: loaded only when a form that needs it is touched
let tsLoading: Promise<void> | null = null;
function loadTurnstile() {
  if (!clientEnv().turnstile) return Promise.resolve();
  return (tsLoading ??= new Promise<void>((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = () => resolve(); s.onerror = () => resolve();
    document.head.appendChild(s);
  }));
}
async function mountTurnstile(form: HTMLFormElement) {
  const slot = form.querySelector<HTMLElement>('.cf-turnstile-slot');
  if (!slot || slot.dataset.mounted) return;
  slot.dataset.mounted = '1';
  await loadTurnstile();
  window.turnstile?.render(slot, { sitekey: slot.dataset.sitekey, theme: slot.dataset.theme || 'auto' });
}
document.querySelectorAll<HTMLFormElement>('form[data-enhance]').forEach((f) => {
  f.addEventListener('focusin', () => mountTurnstile(f), { once: true });
  f.addEventListener('pointerdown', () => mountTurnstile(f), { once: true });
});

// ---- Progressive enhancement for newsletter + contact forms
document.querySelectorAll<HTMLFormElement>('form[data-enhance]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector<HTMLElement>('[data-msg]');
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (btn) btn.disabled = true;
    if (msg) { msg.textContent = 'Sending...'; msg.classList.remove('err'); }
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      const j = await res.json().catch(() => ({ ok: false, message: 'Unexpected response.' }));
      if (msg) { msg.textContent = j.message || (j.ok ? 'Done.' : 'Something went wrong.'); msg.classList.toggle('err', !j.ok); }
      if (j.ok) form.reset();
      else (window as any).turnstile?.reset?.();
    } catch {
      if (msg) { msg.textContent = 'We could not send that. Please try again.'; msg.classList.add('err'); }
    } finally { if (btn) btn.disabled = false; }
  });
});
