// Pure estimator: no DOM, no astro:*. Every amount comes from data/pricing; this module holds no price number.
import { ADDONS, AXLE_OPTIONS, fmtR, type AddonId, type AxleId } from '../data/pricing';
import { waUrl } from './whatsapp';

export const DEFAULT_AXLE: AxleId = 'braked-1';

export interface Estimate {
  total: number;
  totalLabel: string;
  lines: Array<{ label: string; price: number }>;
  message: string;
  url: string;
}

const NOT_SURE_CAVEAT = ' (not sure on axle config, please confirm)';

/**
 * Price an axle package plus add-ons and build the pre-filled WhatsApp message.
 * An unknown axle id falls back to DEFAULT_AXLE; unknown add-on ids are ignored; a repeated id counts once.
 * Add-ons are listed in catalogue order whatever order they arrive in.
 */
export function estimate(axle: AxleId, addons: AddonId[]): Estimate {
  const axleOption = AXLE_OPTIONS.find((o) => o.id === axle) ?? AXLE_OPTIONS.find((o) => o.id === DEFAULT_AXLE)!;
  const picked = new Set<string>(addons);
  const chosen = ADDONS.filter((a) => picked.has(a.id));

  const lines = [axleOption, ...chosen].map(({ label, price }) => ({ label, price }));
  const total = lines.reduce((sum, l) => sum + l.price, 0);
  const totalLabel = fmtR(total);

  const caveat = axleOption.id === 'other' ? NOT_SURE_CAVEAT : '';
  const message = [
    'Hi Noord Karavane, estimate from your site:',
    `• ${axleOption.label}: ${fmtR(axleOption.price)}${caveat}`,
    ...chosen.map((a) => `• ${a.label}: ${a.price ? '+ ' + fmtR(a.price) : 'POA'}`),
    `Total est.: ${totalLabel} (excl. parts)`,
    'Can you confirm availability?',
  ].join('\n');

  return { total, totalLabel, lines, message, url: waUrl(message) };
}
