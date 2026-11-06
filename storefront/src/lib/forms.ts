import type { APIContext } from 'astro';
import { env } from './env';

const hits = new Map<string, number[]>();
/** Tiny in-memory limiter: n requests per window per IP. Good enough for one container; Cloudflare WAF is the real limit. */
export function rateLimited(ip: string, key: string, n = 5, windowMs = 10 * 60_000) {
  const k = key + ':' + ip;
  const now = Date.now();
  const arr = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  if (hits.size > 5000) for (const [kk, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(kk);
  return arr.length > n;
}

export const clientIp = (ctx: APIContext) =>
  ctx.request.headers.get('cf-connecting-ip') || ctx.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ctx.clientAddress || 'unknown';

/** Cloudflare Turnstile. With no TURNSTILE_SECRET: allowed in dev, refused in production (fail closed). */
export async function verifyTurnstile(token: string | null, ip: string): Promise<{ ok: boolean; reason?: string }> {
  const secret = env('TURNSTILE_SECRET');
  if (!secret) {
    // Not configured yet: forms still have the honeypot + per-IP rate limit. Set TURNSTILE_SECRET to enforce.
    console.warn('[turnstile] TURNSTILE_SECRET not set: skipping verification');
    return { ok: true };
  }
  if (!token) return { ok: false, reason: 'Please complete the spam check and try again.' };
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(6000) });
    const j = (await r.json()) as { success?: boolean };
    return j.success ? { ok: true } : { ok: false, reason: 'The spam check failed. Please try again.' };
  } catch {
    return { ok: false, reason: 'We could not run the spam check. Please try again.' };
  }
}

export function reply(ctx: APIContext, ok: boolean, message: string, status = ok ? 200 : 400, redirectTo?: string) {
  const wantsJson = (ctx.request.headers.get('accept') || '').includes('application/json');
  if (wantsJson || !redirectTo) return new Response(JSON.stringify({ ok, message }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  return ctx.redirect(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}${ok ? 'sent=1' : 'error=' + encodeURIComponent(message)}`, 303);
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

/** Brevo REST call with the server-side API key. Returns null on success, otherwise a log-safe error string. */
export async function brevo(path: string, body: unknown): Promise<string | null> {
  const key = env('BREVO_API_KEY');
  if (!key) return 'BREVO_API_KEY not set';
  try {
    const r = await fetch(`https://api.brevo.com/v3${path}`, {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return null;
    const j = (await r.json().catch(() => ({}))) as { code?: string; message?: string };
    // an existing contact is fine for a re-signup
    if (j.code === 'duplicate_parameter') return null;
    return `${r.status} ${j.code ?? ''} ${j.message ?? ''}`.trim();
  } catch (e) {
    return String(e);
  }
}
