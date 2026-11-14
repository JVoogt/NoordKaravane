/**
 * Minimal allow-list HTML sanitiser for product descriptions that come from the old WooCommerce store.
 * Unknown tags are dropped (their text is kept), every attribute is dropped except a[href] with a safe scheme.
 * Script/style/iframe/object bodies are removed entirely.
 */
const ALLOWED = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'h4', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'blockquote']);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LOCAL_ORIGIN = 'https://local.invalid';
/**
 * A root-relative href as the same-host path a browser would open, or null when it could leave the host. Browsers
 * read `\` as `/` and strip tabs and newlines, so `/\evil.test` and `/<TAB>/evil.test` are protocol-relative: any
 * backslash or character at or below U+0020 is refused. The rest is resolved against a placeholder origin and kept
 * only if it stays there and its normalised path does not itself start with `//` (`/.//evil.test`).
 */
function localPath(url: string): string | null {
  if (/[\\\u0000- ]/.test(url)) return null;
  let r: URL;
  try { r = new URL(url, LOCAL_ORIGIN); } catch { return null; }
  if (r.origin !== LOCAL_ORIGIN) return null;
  const path = r.pathname + r.search + r.hash;
  return path.startsWith('/') && !path.startsWith('//') ? path : null;
}

/** `localLinks`: also keep root-relative hrefs (`/x/`, never `//host`) as same-site links (Kampi; NK passes nothing). */
export function sanitizeHtml(input: string, opts: { localLinks?: boolean } = {}): string {
  if (!input) return '';
  let s = input.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|form)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (m, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED.has(tag)) return '';
    if (m.startsWith('</')) return `</${tag}>`;
    if (tag === 'a') {
      const href = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i);
      const url = (href?.[2] ?? href?.[3] ?? '').trim();
      if (opts.localLinks && url.startsWith('/')) {
        const path = localPath(url);
        if (path) return `<a href="${esc(path)}">`;
      }
      if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) return '<a>';
      return `<a href="${esc(url)}" rel="noopener nofollow" target="_blank">`;
    }
    return `<${tag}>`;
  });
  return s.replace(/<p>\s*(&nbsp;|\s)*<\/p>/gi, '').trim();
}

/**
 * Catalogue descriptions link to other products as `/shop/<handle>/` (the NK base). On a store with another base
 * (Kampi at /), rewrite a leading /shop/ in an href to that base at render time (DESIGN.md 13, decision 13).
 * NK's base /shop leaves the HTML untouched.
 */
export function rebaseShopLinks(html: string, base: string): string {
  const b = base.replace(/\/$/, '');
  if (b === '/shop') return html;
  return html.replace(/(\bhref\s*=\s*["'])\/shop\//gi, `$1${b}/`);
}
