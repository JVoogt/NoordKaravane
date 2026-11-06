# Noord Karavane backend (Medusa v2)

Medusa 2.22 commerce backend for noordkaravane.co.za: PostgreSQL + Redis, Medusa Admin at `/app`.

## What is custom here

| Path | Purpose |
|---|---|
| `src/modules/eft` | Direct EFT payment provider (`pp_eft_eft`). Authorises at once; you "Capture payment" in Admin when the money lands. Refund/cancel are manual. |
| `src/modules/sa-courier` | Fulfilment provider (`sa-courier_sa-courier`): options `pudo-locker`, `tcg-door`. Flat rates and the free-shipping threshold come from `config/business.json`. Pudo requires `pudo_locker`. `TODO(phase 2)` hooks mark where the Ship Logic API goes. |
| `src/modules/payfast` | PayFast redirect provider (`pp_payfast_payfast`), registered only when `PAYFAST_ENABLED=true`. ITN webhook: `src/api/hooks/payfast/route.ts` (`POST /hooks/payfast`). |
| `src/modules/notification-smtp` | SMTP (nodemailer) notification provider, channel `email`, branded HTML + plain-text templates in `templates.ts`. |
| `src/subscribers` | order placed (EFT email + Meta CAPI), payment captured, shipment created, order canceled, product cache purge. |
| `src/jobs/eft-unpaid-orders.ts` | Hourly: one reminder after `eft_reminder_after_hours`, cancel after `eft_payment_window_hours`. |
| `src/api/store/feeds/*.xml`, `src/api/feeds/*.xml` | Meta and Google product feeds. |
| `src/api/store/sitemap-products` | JSON for the storefront sitemap. |
| `src/scripts/seed.ts` | Region, channel, key, shipping, collections, products. |

Business details (bank account, shipping prices, windows) are read from `config/business.json`
(`BUSINESS_CONFIG_PATH`, default `../config/business.json`). If that file is not found a bundled copy,
`src/config/business.json`, is used. In Docker the bundled copy is what runs unless you mount the file and set
`BUSINESS_CONFIG_PATH`. Keep them in sync: `cp ../config/business.json src/config/business.json`.
Replace every `{{PLACEHOLDER}}` (especially the bank details) before launch, or customers will be emailed placeholders.

## Local development

Needs Node 22, PostgreSQL 16 and (optional) Redis 7.

```bash
export PATH=$HOME/.local/node22/bin:$PATH
cp .env.template .env            # edit DATABASE_URL etc.
npm install
npx medusa db:migrate            # migrations + module links
npm run seed                     # prints the PUBLISHABLE API KEY
npx medusa user -e you@example.com -p 'a-strong-password'   # Admin login
npm run dev                      # http://localhost:9000 , Admin at /app
```

Without `REDIS_URL` Medusa uses in-memory modules (fine for dev, not for production). Without `SMTP_HOST`
emails are logged, not sent. Without `S3_BUCKET` files go to local disk.

Checks: `npm run typecheck`, `npm run test:unit` (PayFast signature tests), `npm run build`.

## Environment

All names are listed in `infra/.env.example`. Backend-relevant:
`DATABASE_URL, REDIS_URL, JWT_SECRET, COOKIE_SECRET, STORE_CORS, ADMIN_CORS, AUTH_CORS, MEDUSA_BACKEND_URL,
MEDUSA_WORKER_MODE (shared|server|worker), DISABLE_MEDUSA_ADMIN, S3_* (Cloudflare R2), SMTP_*, CF_ZONE_ID, CF_API_TOKEN,
SITE_URL, META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE, PAYFAST_*`, plus optional `BUSINESS_CONFIG_PATH`,
`CATALOGUE_PATH`, `PAYFAST_SKIP_IP_CHECK` (sandbox only).

Run one `server` and one `worker` in production (`MEDUSA_WORKER_MODE`); scheduled jobs and subscribers run on the worker.

## Migrations, seed, admin user

```bash
npx medusa db:migrate                               # on every deploy (idempotent)
npx medusa exec ./src/scripts/seed.ts               # dev
npx medusa exec ./src/scripts/seed.js               # inside the built Docker image
npx medusa user -e owner@example.com -p '<password>'
```
The seed is idempotent: it re-uses existing region/channel/collections and skips products whose handle exists.
If `../catalogue/products.json` is missing it logs and skips products. Image URLs are built as `SITE_URL + images[].src`,
so the storefront must serve `/products/*`; replace them by uploading to R2 through Admin later.
Copy the printed publishable key to `PUBLIC_MEDUSA_PUBLISHABLE_KEY`. Fulfilment provider id in the DB is
`sa-courier_sa-courier` (the `fp_` prefix in CONTRACTS.md is only the container registration name).

## Feeds

- `/store/feeds/meta.xml`, `/store/feeds/google.xml`: contract paths, but every `/store/*` route needs the
  `x-publishable-api-key` header, which Meta and Google cannot send.
- `/feeds/meta.xml`, `/feeds/google.xml`: identical, public. Give these URLs to Meta Commerce Manager and Merchant Center
  (route `api.noordkaravane.co.za/feeds/*` in Cloudflare/Traefik and cache for 15 minutes).
- `custom_label_0` is `explicit` or `clean`; build Meta ad catalogue sets from `clean` only.

## Day-to-day in Medusa Admin (owner)

Sign in at `https://admin.noordkaravane.co.za/app`.

- **Products**: add or edit a product, its images, description, and variants (Colour x Size). Price is per variant.
  Published products appear on the site within minutes (the cache is purged automatically).
- **A new order** arrives as "Awaiting payment" and the customer is emailed the bank details. Use the order number
  (`SR1042`) as the EFT reference.
- **Money received**: open the order, Payment section, **Capture payment**. The customer gets "in production".
  Orders not paid within 48 hours are reminded at 24h and cancelled at 48h automatically.
- **Ship it**: book the courier in the TCG / Pudo portal, then on the order choose **Create fulfilment**, then
  **Mark as shipped** and enter the waybill number as the tracking number. The customer is emailed a tracking link.
- **Refund / cancel**: do the EFT yourself, then record the refund in Admin (manual provider).
- Pudo orders show the customer's chosen locker in the order metadata and shipping section.

## Notes and TODOs

- Cloudflare Access should protect `admin.` (and `/app`); `/hooks/payfast` and `/feeds/*` must stay public.
- PayFast needs the storefront to render `data.form_action` + `data.form_fields` from the payment session and to handle
  `/checkout/payfast-return`; sandbox test before go-live.
- Phase 2: TCG Ship Logic API (quotes, waybills, tracking webhooks) at the `TODO(phase 2)` markers in `sa-courier`.
