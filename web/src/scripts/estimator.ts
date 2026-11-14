// Client enhancement for Estimator.astro. All pricing and message logic lives in lib/estimator; this only reads the
// pressed buttons, asks estimate() for the result and writes the total and the CTA href back into the page.
// The live controls only show once init() has bound them (data-est-ready), so they are never shown dead.
import { ADDONS, AXLE_OPTIONS, type AddonId, type AxleId } from '../data/pricing';
import { DEFAULT_AXLE, estimate } from '../lib/estimator';

const axleIds = new Set<string>(AXLE_OPTIONS.map((o) => o.id));
const addonIds = new Set<string>(ADDONS.map((a) => a.id));
const isAxleId = (s: string | undefined): s is AxleId => s !== undefined && axleIds.has(s);
const isAddonId = (s: string | undefined): s is AddonId => s !== undefined && addonIds.has(s);

function init(root: HTMLElement): void {
  const axleButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-axle]')];
  const addonButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-addon]')];
  const total = root.querySelector<HTMLElement>('[data-est-total]');
  const cta = root.querySelector<HTMLAnchorElement>('[data-est-cta]');
  // Bind only a card that has what this script writes to and something to choose from. Anything missing: leave
  // the card as it was built (the static add-on list, the CTA on its neutral enquiry) instead of showing live
  // controls that change nothing. Same rule as scripts/compose.
  if (!total || !cta || axleButtons.length === 0) return;

  let axle: AxleId = DEFAULT_AXLE;
  const picked = new Set<AddonId>();

  const render = (): void => {
    const result = estimate(axle, [...picked]);
    // "Not sure" is a starting price: the small "From" sits before the amount.
    total.replaceChildren();
    if (result.approximate) {
      const from = document.createElement('span');
      from.className = 'est-from';
      from.textContent = 'From';
      total.append(from, ' ');
    }
    total.append(result.totalLabel);
    cta.href = result.url;
    axleButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.axle === axle)));
    addonButtons.forEach((b) => b.setAttribute('aria-pressed', String(isAddonId(b.dataset.addon) && picked.has(b.dataset.addon))));
  };

  axleButtons.forEach((b) =>
    b.addEventListener('click', () => {
      if (isAxleId(b.dataset.axle)) axle = b.dataset.axle;
      render();
    }),
  );
  addonButtons.forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.addon;
      if (!isAddonId(id)) return;
      if (picked.has(id)) picked.delete(id);
      else picked.add(id);
      render();
    }),
  );
  render();
  // Bound and rendered: only now do the live controls show (pages.css reads this attribute).
  root.setAttribute('data-est-ready', '');
}

document.querySelectorAll<HTMLElement>('[data-estimator]').forEach(init);
