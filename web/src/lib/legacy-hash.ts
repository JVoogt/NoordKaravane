// Old single-page anchors (site/index.html) mapped to their new homes. A hash never reaches the server, so the
// Home page script calls resolveLegacyHash and redirects in the browser. scripts/verify.mjs reads the same JSON.
import map from '../data/legacy-hash-map.json';

export const LEGACY_HASH_MAP: Readonly<Record<string, string>> = map;

const withSlash = (p: string): string => (p.endsWith('/') ? p : p + '/');

/**
 * Where a legacy hash should send the browser, or null to leave it alone: unknown hash, empty hash, or a target
 * that is exactly where the browser already is (same page, same fragment: it scrolls there itself).
 * A target on the same page with a different fragment (#kampi-widget to /#rentals) is still returned.
 */
export function resolveLegacyHash(hash: string, currentPath: string): string | null {
  const key = hash.toLowerCase();
  if (!Object.hasOwn(LEGACY_HASH_MAP, key)) return null;
  const target = LEGACY_HASH_MAP[key];
  return target === withSlash(currentPath) + key ? null : target;
}
