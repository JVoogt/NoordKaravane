import { zar } from './format.ts';

const lookup = (obj: unknown, dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

/**
 * Replace business placeholders in content (pure; plan DD12, G33).
 *   {{zar:a.b}}  a config number rendered as a price with zar() (R2 500); a non-number is left as written
 *   {{a.b}}      the raw value (as before); unknown and non-scalar keys are left as written
 * The zar token runs first. NK content has no zar token, so NK output is unchanged.
 */
export function fillWith(text: string, b: Record<string, unknown>): string {
  return text
    .replace(/\{\{\s*zar:([a-z_][a-z0-9_.]*)\s*\}\}/gi, (m, key: string) => {
      const v = lookup(b, key);
      return typeof v === 'number' && Number.isFinite(v) ? zar(v) : m;
    })
    .replace(/\{\{\s*([a-z_][a-z0-9_.]*)\s*\}\}/gi, (m, key: string) => {
      const v = lookup(b, key);
      return typeof v === 'string' || typeof v === 'number' ? String(v) : m;
    });
}
