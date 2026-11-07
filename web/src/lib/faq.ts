import { BUSINESS } from '../data/business';
import { ADDONS, AXLE_OPTIONS, fmtR } from '../data/pricing';
import { formatHoursProse } from './hours';

export interface FaqItem {
  q: string;
  a: string;
  list?: string[];
  note?: string;
}

function priceOf(id: string): number {
  const hit = AXLE_OPTIONS.find((o) => o.id === id) ?? ADDONS.find((o) => o.id === id);
  if (!hit) throw new Error(`Unknown price id in token: ${id}`);
  return hit.price;
}

/** Expands {hours} and {price:<id>}. An unknown token or id throws, so a typo fails the build. */
export function expandTokens(s: string): string {
  return s.replace(/\{([^{}]*)\}/g, (_m, name: string) => {
    if (name === 'hours') return formatHoursProse(BUSINESS.hours);
    if (name.startsWith('price:')) return fmtR(priceOf(name.slice('price:'.length)));
    throw new Error(`Unknown token: {${name}}`);
  });
}

/** The answer as one plain string: a, list joined with '; ', note. This is what FAQPage JSON-LD carries. */
export function faqPlainText(item: FaqItem): string {
  const parts = [item.a];
  if (item.list && item.list.length) parts.push(item.list.join('; '));
  if (item.note) parts.push(item.note);
  return expandTokens(parts.join(' '));
}

/** For parity checks between visible text and JSON-LD: lowercase, keep only a-z and 0-9. */
export function normalizeForParity(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}
