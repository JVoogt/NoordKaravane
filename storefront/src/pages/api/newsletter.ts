import type { APIRoute } from 'astro';
import { brevo, clientIp, isEmail, rateLimited, reply, verifyTurnstile } from '~/lib/forms';
import { env } from '~/lib/env';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const form = await ctx.request.formData().catch(() => null);
  if (!form) return reply(ctx, false, 'That did not look like a form submission.');
  if (String(form.get('website') || '')) return reply(ctx, true, 'Thanks!'); // honeypot: pretend success
  const ip = clientIp(ctx);
  if (rateLimited(ip, 'newsletter', 5)) return reply(ctx, false, 'Too many attempts. Try again in a few minutes.', 429);

  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!isEmail(email)) return reply(ctx, false, 'That email address does not look right.', 400, '/#newsletter');
  if (!form.get('consent')) return reply(ctx, false, 'Please tick the box so we know you want our emails.', 400, '/#newsletter');

  const ts = await verifyTurnstile(String(form.get('cf-turnstile-response') || '') || null, ip, 'newsletter');
  if (!ts.ok) return reply(ctx, false, ts.reason!, 400, '/#newsletter');

  // POPIA s69: explicit opt-in (checkbox above); keep when and from where consent was given
  const err = await brevo('/contacts', {
    email,
    listIds: [Number(env('BREVO_LIST_ID') || 4)],
    updateEnabled: true,
    attributes: { SOURCE: 'website-footer', OPT_IN_AT: new Date().toISOString() },
  });
  if (err) {
    console.error('[newsletter] brevo failed:', err);
    return reply(ctx, false, 'We could not add you right now. Please try again in a minute.', 502, '/#newsletter');
  }

  return reply(ctx, true, 'You are on the list. Thanks for joining us.', 200, '/#newsletter');
};
