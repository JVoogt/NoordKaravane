import type { APIRoute } from 'astro';
import { u } from '~/lib/url';
import { brevo, clientIp, isEmail, rateLimited, reply, verifyTurnstile } from '~/lib/forms';
import { business } from '~/lib/business';
import { env } from '~/lib/env';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const form = await ctx.request.formData().catch(() => null);
  if (!form) return reply(ctx, false, 'That did not look like a form submission.');
  if (String(form.get('website') || '')) return reply(ctx, true, 'Thanks, message sent.'); // honeypot
  const ip = clientIp(ctx);
  if (rateLimited(ip, 'contact', 4)) return reply(ctx, false, 'Too many messages. Please wait a few minutes.', 429);

  const name = String(form.get('name') || '').trim().slice(0, 120);
  const email = String(form.get('email') || '').trim();
  const topic = String(form.get('topic') || 'general').slice(0, 40);
  const order = String(form.get('order') || '').trim().slice(0, 40);
  const message = String(form.get('message') || '').trim().slice(0, 5000);
  if (!name) return reply(ctx, false, 'Please tell us your name.', 400, u('/contact'));
  if (!isEmail(email)) return reply(ctx, false, 'That email address does not look right.', 400, u('/contact'));
  if (message.length < 5) return reply(ctx, false, 'Your message is a bit short. What can we help with?', 400, u('/contact'));

  const ts = await verifyTurnstile(String(form.get('cf-turnstile-response') || '') || null, ip);
  if (!ts.ok) return reply(ctx, false, ts.reason!, 400, u('/contact'));

  // From is always our authenticated sender (SPF/DKIM/DMARC); the visitor goes in Reply-To
  const to = env('CONTACT_TO') || business.email_general;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const err = await brevo('/smtp/email', {
    sender: { name: 'Noord Karavane shop website', email: env('CONTACT_FROM') || 'orders@noordkaravane.co.za' }, // must be an authenticated Brevo sender
    to: [{ email: to }],
    replyTo: { email, name },
    subject: `[Contact] ${topic}${order ? ` (order ${order})` : ''}: ${name}`,
    textContent: `From: ${name} <${email}>\nTopic: ${topic}\nOrder: ${order || '-'}\n\n${message}`,
    htmlContent: `<p><strong>From:</strong> ${esc(name)} &lt;${esc(email)}&gt;<br><strong>Topic:</strong> ${esc(topic)}<br><strong>Order:</strong> ${esc(order || '-')}</p><p style="white-space:pre-wrap">${esc(message)}</p>`,
  });
  if (err) {
    console.error('[contact] brevo failed:', err);
    return reply(ctx, false, `We could not send that just now. Please email ${business.email_general} directly.`, 502, u('/contact'));
  }

  return reply(ctx, true, 'Message sent. We read every one and reply within two working days.', 200, u('/contact'));
};
