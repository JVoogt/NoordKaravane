/**
 * Stale-while-revalidate memo. The first call waits for load(). After that every call gets the last good value at
 * once; when it is older than ttlMs, one background refresh starts (never more than one in flight). A failed
 * refresh goes to onError and the last good value stays. A failed first load rejects, and the next call retries.
 */
export function swr<T>(load: () => Promise<T>, ttlMs: number, onError: (e: unknown) => void, now: () => number = Date.now) {
  let memo: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;
  const refresh = (): Promise<T> =>
    (inflight ??= load()
      .then((value) => {
        memo = { at: now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      }));
  return async (): Promise<T> => {
    if (!memo) return refresh();
    if (now() - memo.at >= ttlMs) refresh().catch(onError);
    return memo.value;
  };
}

/** Every page of a paged list: the first page gives the total, the rest load in parallel. At most `max` items. */
export async function allPages<T>(page: (offset: number) => Promise<{ items: T[]; count: number }>, size: number, max: number): Promise<T[]> {
  const first = await page(0);
  const total = Math.min(first.count, max);
  const offsets: number[] = [];
  for (let o = size; o < total; o += size) offsets.push(o);
  const rest = await Promise.all(offsets.map((o) => page(o)));
  return [...first.items, ...rest.flatMap((r) => r.items)];
}
