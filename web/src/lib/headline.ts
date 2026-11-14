// Pure: the two display lines of a page headline (the paper line and the highlighted line of a page hero).

/**
 * Splits a headline after its first comma, or before its last " in " when it has no comma.
 * The words are never changed: the two lines joined by one space are the headline. A headline that has neither,
 * or that would leave one line empty, stays on one line (the second value is null).
 */
export function splitHeadline(h1: string): [string, string | null] {
  const comma = h1.indexOf(', ');
  const at = comma !== -1 ? comma + 1 : h1.lastIndexOf(' in ');
  if (at <= 0) return [h1, null];
  const first = h1.slice(0, at);
  const second = h1.slice(at + 1);
  // A first line that is only the comma is not a line.
  return first.replace(/,$/, '').trim() && second.trim() ? [first, second] : [h1, null];
}
