/**
 * Minimal allow-list HTML sanitiser for product descriptions that come from the old WooCommerce store.
 * Unknown tags are dropped (their text is kept), every attribute is dropped except a[href] with a safe scheme.
 * Script/style/iframe/object bodies are removed entirely.
 */
const ALLOWED = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'h4', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'blockquote']);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  let s = input.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|form)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (m, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED.has(tag)) return '';
    if (m.startsWith('</')) return `</${tag}>`;
    if (tag === 'a') {
      const href = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i);
      const url = (href?.[2] ?? href?.[3] ?? '').trim();
      if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) return '<a>';
      return `<a href="${esc(url)}" rel="noopener nofollow" target="_blank">`;
    }
    return `<${tag}>`;
  });
  return s.replace(/<p>\s*(&nbsp;|\s)*<\/p>/gi, '').trim();
}
