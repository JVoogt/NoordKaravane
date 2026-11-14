// Client enhancement for MessageBuilder.astro. The message wording lives in lib/compose; this only reads the chosen
// need and the make and year, shows the message in the preview bubble and writes it into the Send link's href.
// Without this script the link keeps the default message baked in at build time. The choices and the preview only
// show once init() has bound them (data-compose-ready, read by home.css), so they are never shown dead.
import { composeMessage } from '../lib/compose';
import { waUrl } from '../lib/whatsapp';

/** How long the visitor must stop typing before a screen reader is told the new message. */
const ANNOUNCE_AFTER_MS = 500;

function init(form: HTMLFormElement): void {
  const preview = form.querySelector<HTMLElement>('[data-compose-preview]');
  const status = form.querySelector<HTMLElement>('[data-compose-status]');
  const send = form.querySelector<HTMLAnchorElement>('[data-compose-send]');
  const van = form.querySelector<HTMLInputElement>('input[name="van"]');
  const chosen = (): HTMLInputElement | null => form.querySelector<HTMLInputElement>('input[name="need"]:checked');
  // Bind only a form that has everything this script writes to, and a need already chosen. Anything missing: leave
  // the form as it was built (choices hidden, the Send link on its default message) instead of showing half of it.
  if (!preview || !status || !send || !van || !chosen()) return;

  // The preview and the link are written from one message and one URL, so they can never disagree.
  const show = (): string | null => {
    const need = chosen();
    if (!need) return null;
    const message = composeMessage(need.value, van.value);
    const url = waUrl(message);
    preview.textContent = message;
    send.href = url;
    return message;
  };

  // The link and the visible preview follow every key. The spoken announcement (a polite live region, apart from
  // the preview) waits until the typing stops, so a screen reader reads the message once, not once per letter.
  let pending: number | undefined;
  form.addEventListener('input', () => {
    const message = show();
    window.clearTimeout(pending);
    if (message !== null) pending = window.setTimeout(() => (status.textContent = message), ANNOUNCE_AFTER_MS);
  });
  // Enter in the make-and-year field sends, the same as pressing the button.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    show();
    send.click();
  });
  show();
  form.setAttribute('data-compose-ready', '');
}

document.querySelectorAll<HTMLFormElement>('form[data-compose]').forEach(init);
