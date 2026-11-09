import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedHostnames, verifyTurnstileToken, type TurnstileConfig } from './turnstile.ts';

const HOSTS = ['noordkaravane.co.za'];
const reply = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
const cfg = (over: Partial<TurnstileConfig> = {}): TurnstileConfig => ({
  secret: 's3cret', hostnames: HOSTS, production: true, fetchImpl: reply(200, { success: true, action: 'contact', hostname: 'noordkaravane.co.za' }), ...over,
});

test('success with matching action and hostname passes', async () => {
  assert.deepEqual(await verifyTurnstileToken('tok', '1.2.3.4', 'contact', cfg()), { ok: true });
});
test('missing, empty and oversized tokens are rejected without calling Siteverify', async () => {
  let called = 0;
  const fetchImpl = (async () => { called++; return new Response('{}'); }) as typeof fetch;
  for (const t of [null, '', 'x'.repeat(2049)]) assert.equal((await verifyTurnstileToken(t, 'ip', 'contact', cfg({ fetchImpl }))).ok, false);
  assert.equal(called, 0);
});
test('a token of exactly 2048 chars is allowed through to Siteverify', async () => {
  assert.equal((await verifyTurnstileToken('x'.repeat(2048), 'ip', 'contact', cfg())).ok, true);
});
test('success:false is rejected', async () => {
  const r = await verifyTurnstileToken('tok', 'ip', 'contact', cfg({ fetchImpl: reply(200, { success: false, 'error-codes': ['timeout-or-duplicate'] }) }));
  assert.equal(r.ok, false);
});
test('success must be exactly true (truthy strings do not count)', async () => {
  const r = await verifyTurnstileToken('tok', 'ip', 'contact', cfg({ fetchImpl: reply(200, { success: 'true', action: 'contact', hostname: 'noordkaravane.co.za' }) }));
  assert.equal(r.ok, false);
});
test('action mismatch is rejected (token minted for another form)', async () => {
  const r = await verifyTurnstileToken('tok', 'ip', 'newsletter', cfg());
  assert.equal(r.ok, false);
});
test('hostname outside the allowlist is rejected', async () => {
  const r = await verifyTurnstileToken('tok', 'ip', 'contact', cfg({ fetchImpl: reply(200, { success: true, action: 'contact', hostname: 'evil.example' }) }));
  assert.equal(r.ok, false);
});
test('non-OK Siteverify response fails closed', async () => {
  assert.equal((await verifyTurnstileToken('tok', 'ip', 'contact', cfg({ fetchImpl: reply(500, {}) }))).ok, false);
});
test('network error and timeout fail closed', async () => {
  const boom = (async () => { throw new Error('down'); }) as typeof fetch;
  assert.equal((await verifyTurnstileToken('tok', 'ip', 'contact', cfg({ fetchImpl: boom }))).ok, false);
  const hang = ((_u: string, o: RequestInit) => new Promise((_, rej) => o.signal!.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
  const keepAlive = setInterval(() => {}, 10); // AbortSignal.timeout's timer is unref'd; a real server keeps the loop alive
  try { assert.equal((await verifyTurnstileToken('tok', 'ip', 'contact', cfg({ fetchImpl: hang, timeoutMs: 20 }))).ok, false); } finally { clearInterval(keepAlive); }
});
test('missing secret: refused in production, skipped outside it', async () => {
  assert.equal((await verifyTurnstileToken('tok', 'ip', 'contact', cfg({ secret: '' }))).ok, false);
  assert.equal((await verifyTurnstileToken(null, 'ip', 'contact', cfg({ secret: '', production: false }))).ok, true);
});
test('empty hostname allowlist fails closed', async () => {
  assert.equal((await verifyTurnstileToken('tok', 'ip', 'contact', cfg({ hostnames: [] }))).ok, false);
});
test('remoteip is sent only when known', async () => {
  const seen: string[] = [];
  const fetchImpl = (async (_u: string, o: RequestInit) => { seen.push(String((o.body as URLSearchParams).get('remoteip'))); return new Response(JSON.stringify({ success: true, action: 'contact', hostname: 'noordkaravane.co.za' })); }) as unknown as typeof fetch;
  await verifyTurnstileToken('tok', '1.2.3.4', 'contact', cfg({ fetchImpl }));
  await verifyTurnstileToken('tok', 'unknown', 'contact', cfg({ fetchImpl }));
  assert.deepEqual(seen, ['1.2.3.4', 'null']);
});
test('invalid action names are a programmer error', async () => {
  await assert.rejects(verifyTurnstileToken('tok', 'ip', 'has space', cfg()));
  await assert.rejects(verifyTurnstileToken('tok', 'ip', 'x'.repeat(33), cfg()));
});

test('allowedHostnames: env list, site-host default, localhost stripped in production only', () => {
  assert.deepEqual(allowedHostnames('A.com, b.com', 'https://x.test', true), ['a.com', 'b.com']);
  assert.deepEqual(allowedHostnames('', 'https://noordkaravane.co.za/', true), ['noordkaravane.co.za']);
  assert.deepEqual(allowedHostnames('noordkaravane.co.za,localhost,127.0.0.1', 'https://x.test', true), ['noordkaravane.co.za']);
  assert.deepEqual(allowedHostnames('localhost', 'https://x.test', false), ['localhost']);
  assert.deepEqual(allowedHostnames('', 'not a url', true), []);
});
