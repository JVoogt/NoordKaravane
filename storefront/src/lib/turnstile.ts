// Cloudflare Turnstile server-side verification. Pure (no Astro imports) so node:test can run it.
// Follows Cloudflare's guidance: Siteverify only from the backend, success + action + hostname all required,
// bounded token length, 10 s timeout, network/non-OK = failure, fail closed in production.

export type TurnstileResult = { ok: boolean; reason?: string };

export interface TurnstileConfig {
  secret: string;
  /** Allowed `hostname` values from Siteverify (comma separated list already split). */
  hostnames: string[];
  /** true in production builds: a missing secret refuses instead of skipping. */
  production: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const MAX_TOKEN_LENGTH = 2048;
/** Cloudflare: actions are 1-32 chars of letters, numbers, underscore, hyphen. */
export const ACTION_RE = /^[A-Za-z0-9_-]{1,32}$/;

const REASON = {
  missing: 'Please complete the spam check and try again.',
  failed: 'The spam check failed. Please try again.',
  unavailable: 'We could not run the spam check. Please try again.',
} as const;

/** Hostnames to accept: TURNSTILE_HOSTNAMES if set, otherwise the site's own host. localhost never in production. */
export function allowedHostnames(csv: string, siteUrl: string, production: boolean): string[] {
  let list = csv.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!list.length) {
    try { list = [new URL(siteUrl).hostname.toLowerCase()]; } catch { list = []; }
  }
  return production ? list.filter((h) => h !== 'localhost' && h !== '127.0.0.1' && h !== '::1') : list;
}

export async function verifyTurnstileToken(
  token: string | null,
  ip: string,
  action: string,
  cfg: TurnstileConfig,
): Promise<TurnstileResult> {
  if (!ACTION_RE.test(action)) throw new Error(`invalid Turnstile action: ${action}`); // programmer error, not user input
  if (!cfg.secret) {
    if (cfg.production) {
      console.error('[turnstile] TURNSTILE_SECRET not set in production: refusing form submission');
      return { ok: false, reason: REASON.unavailable };
    }
    console.warn('[turnstile] TURNSTILE_SECRET not set: skipping verification (non-production only)');
    return { ok: true };
  }
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: REASON.missing };
  if (!cfg.hostnames.length) {
    console.error('[turnstile] no allowed hostnames configured: refusing form submission');
    return { ok: false, reason: REASON.unavailable };
  }
  try {
    const body = new URLSearchParams({ secret: cfg.secret, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const r = await (cfg.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 10_000),
    });
    if (!r.ok) {
      console.error(`[turnstile] siteverify HTTP ${r.status}`);
      return { ok: false, reason: REASON.unavailable };
    }
    const j = (await r.json()) as { success?: boolean; action?: string; hostname?: string; 'error-codes'?: string[] };
    if (j.success !== true) {
      console.warn('[turnstile] rejected:', (j['error-codes'] || []).join(',') || 'no error code');
      return { ok: false, reason: REASON.failed };
    }
    if (j.action !== action) {
      console.warn(`[turnstile] action mismatch: expected ${action}, got ${j.action ?? 'none'}`);
      return { ok: false, reason: REASON.failed };
    }
    if (!j.hostname || !cfg.hostnames.includes(j.hostname.toLowerCase())) {
      console.warn(`[turnstile] hostname not allowed: ${j.hostname ?? 'none'}`);
      return { ok: false, reason: REASON.failed };
    }
    return { ok: true };
  } catch (e) {
    console.error('[turnstile] siteverify error:', e instanceof Error ? e.name : 'unknown');
    return { ok: false, reason: REASON.unavailable };
  }
}
