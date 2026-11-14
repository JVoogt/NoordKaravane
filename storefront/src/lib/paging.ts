/** Product grids show PAGE_SIZE cards, then a "Show more" link (`?show=<n>`) that adds the next page. */
export const PAGE_SIZE = 48;

/** Cards to render for a `show` param: whole pages, at least one, never more than the total. */
export function shownCount(param: string | null, total: number): number {
  const n = Number.parseInt(param ?? '', 10);
  const pages = Number.isFinite(n) && n > 0 ? Math.ceil(n / PAGE_SIZE) : 1;
  return Math.min(pages * PAGE_SIZE, total);
}

/** The "Show more" link for the next page (same path and filters, anchored at the first new card), or null at the end. */
export function moreLink(url: URL, shown: number, total: number): { href: string; next: number } | null {
  if (shown >= total) return null;
  const params = new URLSearchParams(url.search);
  params.set('show', String(shown + PAGE_SIZE));
  return { href: `${url.pathname}?${params}#p-${shown + 1}`, next: Math.min(PAGE_SIZE, total - shown) };
}
