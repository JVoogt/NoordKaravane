// Pure sentence helpers. No DOM, no astro:*.

/** "A", "A and B", "A, B and C": a list of names as it reads inside a sentence. */
export function listWithAnd(items: readonly string[]): string {
  if (items.length === 0) throw new Error('listWithAnd: empty list, nothing to name in the sentence');
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
