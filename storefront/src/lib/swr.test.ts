import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swr, allPages } from './swr.ts';

const clock = () => { const c = { t: 0, now: () => c.t }; return c; };
const tick = () => new Promise((r) => setImmediate(r));

test('swr: the first call waits for the load', async () => {
  let n = 0;
  const get = swr(async () => ++n, 1000, () => {}, clock().now);
  assert.equal(await get(), 1);
  assert.equal(n, 1);
});

test('swr: a fresh value is served without reloading', async () => {
  let n = 0;
  const c = clock();
  const get = swr(async () => ++n, 1000, () => {}, c.now);
  await get();
  c.t = 999;
  assert.equal(await get(), 1);
  assert.equal(n, 1);
});

test('swr: a stale value is served at once while one background refresh runs', async () => {
  let n = 0;
  let release!: () => void;
  const c = clock();
  const get = swr(async () => { n += 1; if (n > 1) await new Promise<void>((r) => { release = r; }); return n; }, 1000, () => {}, c.now);
  await get();
  c.t = 1000;
  assert.equal(await get(), 1);
  assert.equal(await get(), 1);
  assert.equal(n, 2, 'only one refresh in flight');
  release();
  await tick();
  assert.equal(await get(), 2);
});

test('swr: a failed refresh keeps the last good value and reports the error', async () => {
  let n = 0;
  const errors: unknown[] = [];
  const c = clock();
  const get = swr(async () => { n += 1; if (n === 2) throw new Error('down'); return n; }, 1000, (e) => errors.push(e), c.now);
  await get();
  c.t = 1000;
  assert.equal(await get(), 1);
  await tick();
  assert.equal(errors.length, 1);
  assert.equal(await get(), 1, 'still the last good value; a new refresh starts');
  await tick();
  assert.equal(await get(), 3);
});

test('swr: a failed first load rejects and the next call tries again', async () => {
  let n = 0;
  const get = swr(async () => { n += 1; if (n === 1) throw new Error('down'); return n; }, 1000, () => {}, clock().now);
  await assert.rejects(get());
  assert.equal(await get(), 2);
});

test('allPages: loads the first page, then the rest in parallel, in order', async () => {
  const data = Array.from({ length: 250 }, (_, i) => i);
  const seen: number[] = [];
  const out = await allPages(async (offset) => { seen.push(offset); return { items: data.slice(offset, offset + 100), count: data.length }; }, 100, 1000);
  assert.deepEqual(out, data);
  assert.deepEqual(seen.sort((a, b) => a - b), [0, 100, 200]);
});

test('allPages: stops at the cap', async () => {
  const seen: number[] = [];
  await allPages(async (offset) => { seen.push(offset); return { items: [offset], count: 5000 }; }, 100, 1000);
  assert.equal(Math.max(...seen), 900);
});

test('allPages: a single short page makes one call', async () => {
  let calls = 0;
  assert.deepEqual(await allPages(async () => { calls += 1; return { items: [1, 2], count: 2 }; }, 100, 1000), [1, 2]);
  assert.equal(calls, 1);
});
