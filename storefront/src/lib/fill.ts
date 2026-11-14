import { zar } from './format.ts';

const lookup = (obj: unknown, dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

/**
 * Replace business placeholders in content (pure; plan DD12, G33).
 *   {{zar:a.b}}  a config number rendered as a price with zar() (R2 500); a non-number is left as written
 *   {{a.b}}      the raw value (as before); unknown and non-scalar keys are left as written
 * The zar token runs first. NK content has no zar token, so NK output is unchanged.
 * An unresolved token, or a value that is itself a {{PLACEHOLDER}}, is printed as today and logged once per token per
 * process (console.warn), so a missing config key shows in the server log without breaking the page.
 */
export function fillWith(text: string, b: Record<string, unknown>): string {
  return text
    .replace(/\{\{\s*zar:([a-z_][a-z0-9_.]*)\s*\}\}/gi, (m, key: string) => {
      const v = lookup(b, key);
      if (typeof v === 'number' && Number.isFinite(v)) return zar(v);
      warnOnce(m, 'is not a number in business.json; printed as written');
      return m;
    })
    .replace(/\{\{\s*([a-z_][a-z0-9_.]*)\s*\}\}/gi, (m, key: string) => {
      const v = lookup(b, key);
      if (typeof v !== 'string' && typeof v !== 'number') {
        warnOnce(m, 'has no value in business.json; printed as written');
        return m;
      }
      if (typeof v === 'string' && /\{\{.*\}\}/.test(v)) warnOnce(m, `is still a placeholder (${v})`);
      return String(v);
    });
}

const warned = new Set<string>();
function warnOnce(token: string, why: string) {
  if (warned.has(token)) return;
  warned.add(token);
  console.warn(`[fill] ${token} ${why}`);
}
