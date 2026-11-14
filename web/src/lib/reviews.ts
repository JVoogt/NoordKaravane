// Pure: which approved reviews the Home reviews section shows, and which one is set large. No DOM, no astro:*.
// The reviews themselves, and the owner's approved and lead flags, live in data/reviews.

/** Reviews shown at once: the large one and the ones under it. */
export const REVIEWS_SHOWN = 3;

export function pickReviews<T extends { approved: boolean; lead?: boolean }>(reviews: readonly T[]): { lead: T | undefined; rest: T[] } {
  // One review is set large. Two flags would silently drop the second one to the small list.
  const flagged = reviews.filter((r) => r.lead).length;
  if (flagged > 1) throw new Error(`${flagged} reviews are flagged lead in data/reviews.ts: flag one at most`);
  const approved = reviews.filter((r) => r.approved);
  // The lead is chosen before the cut, so a flagged review further down the list is never dropped by it.
  const lead = approved.find((r) => r.lead) ?? approved[0];
  return { lead, rest: approved.filter((r) => r !== lead).slice(0, REVIEWS_SHOWN - 1) };
}
