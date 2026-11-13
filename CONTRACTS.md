# Shop contracts (backend <-> storefront <-> infra)

The Noord Karavane shop copies Soft Rebellion's architecture (Astro SSR storefront + Medusa v2 + Postgres/Redis on DockPi).
Phase 2 built `backend/`, `infra/`, `catalogue/`, `config/`. Phase 3 (storefront) must build against this file.
Anything here that the storefront has to enforce is marked **STOREFRONT MUST**.

## Hard rules
- The live landing page is the nginx container `noordkaravane` (port 8260, Traefik file `noordkaravane.yml`, dir `/home/voogiepi/docker/noordkaravane`). **The shop never touches it.** Shop stack: compose project `nkshop`, dir `/home/voogiepi/docker/nkshop`, Traefik file `nkshop.yml`, containers/images `nkshop-*`.
- Ports (UNVERIFIED on the Pi, check `ss -ltn` first): storefront 8550, medusa 8551, staging 8552/8553.
- Do not copy from Soft Rebellion: `infra/.env`, the WeTransfer zips, `source-assets/`, its `business.json` (holds a real person's bank details), its Cloudflare automation.
- Payments: **EFT only** (`pp_eft_eft`). Payfast provider is scaffolded and off (`PAYFAST_ENABLED=false`, untested).

## URL scheme (storefront is served under `https://noordkaravane.co.za/shop`)
Astro `base: "/shop"`. Only `/shop*` is routed to Astro; every other path on the apex is the static landing page.
| Page | Path |
|---|---|
| shop home / catalogue | `/shop/` |
| category | `/shop/category/<handle>/` (parent categories include their children) |
| product | `/shop/<handle>/`  (feeds and the Cloudflare purge already assume this) |
| cart / checkout | `/shop/cart`, `/shop/checkout` |
| order confirmed | `/shop/order/confirmed/<order id>`  (linked from every EFT email) |
| sitemap | `/shop/sitemap.xml`  (the root `site/sitemap.xml` must reference it; root `robots.txt` too) |
Because `/shop/<handle>/` is a catch-all, reserved first segments are `cart`, `checkout`, `order`, `category`, `search`, `sitemap.xml`, `products` (images). No product handle may equal one of them (validate in phase 3).
Backend code must build storefront links with `shopUrl()` (`backend/src/lib/business.ts`), never bare `siteUrl()`.
Hostnames: `api.noordkaravane.co.za` (Medusa store API, `/feeds`, `/hooks`), `admin.noordkaravane.co.za` (`/app`, behind Cloudflare Access).

## Commerce model
- Region "South Africa", currency `zar`, prices tax-inclusive, amounts in major units (`1550` = R1,550). Sales channel "Webshop". Storefront uses the publishable key printed by the seed.
- Product handle = Woo slug. Categories (not collections) mirror Woo (`catalogue/categories.json`, 5 top-level, 12 children). `product.categories[].name` is the nav source.
- 53 products / 203 variants / 256 unique SKUs. Simple products carry one option `Default` = `Default` (hide it in the UI). Real options: `Colour`, `Size`, `T-shirt size`, `Jacket size`, `Capacity`, `Model`, `Flow rate`, `Flavour`, `Reflective gear`. Starter packs have two options (T-shirt size x Jacket size, 36 variants).
- `manage_inventory: false` everywhere: Woo exposes no stock counts. Every product is in stock until the owner says otherwise.
- Product `metadata`: `source_id`, `source_url` (old Woo page), `ship_tier` (`small|medium|bulky`), `tags`, `description_html` (rich Woo description; render it sanitised, `description` is the plain fallback), `dropship_supplier` (`the-first-responders` or null).
- Images: `/shop/products/<handle>-<n>.<ext>` (files in `storefront/public/products/`, to be converted to webp). The seed builds image URLs as `${IMAGE_BASE_URL or SITE_URL/shop}<src>`.

## Shipping (backend `modules/sa-courier`, rates in `config/business.json` `shipping`)
- Fulfilment provider `sa-courier` -> `fp_sa-courier_sa-courier`. Option ids (in `data.id`): `pudo-locker`, `tcg-door`, `workshop-collect`. Names: "Pudo Locker (locker-to-locker)", "The Courier Guy (door-to-door)", "Collect from the workshop (Pretoria North)".
- Priced by **total parcel weight in grams** (`variant.weight` x qty). Until real weights exist each variant carries its tier weight: small 500 g, medium 3000 g, bulky 15000 g. Pudo R99 (confirmed by the owner 2026-11-06); the other rates are still PLACEHOLDERS:  (<=1 kg), TCG R85 (<=1 kg) / R130 (<=5 kg) / R350 (heavier), collection free, free shipping over R2,500 for parcels up to 5 kg (never for bulky freight).
- **STOREFRONT MUST hide `pudo-locker` when the cart weight exceeds `pudo_max_weight_g` (1000 g).** The backend still lists it, priced at the TCG rate, because `calculatePrice` cannot throw (a throw breaks the whole shipping list). `validateFulfillmentData` rejects it with an error when someone selects it anyway.
- **STOREFRONT MUST clear/re-select the shipping method whenever cart contents change.** Medusa re-prices but does not re-validate a method after items are added, so a Pudo choice could survive a cart that became too heavy.
- Cart metadata set before completing (unchanged from SR): `pudo_locker` (required for Pudo), `marketing_consent`, `analytics_consent`, `meta_event_id`, `fbp`, `fbc`.
- Collection orders ship nothing: there is no "ready for collection" email yet (TODO). Use the manual fulfil flow for now.

## Orders, payments, emails
- Order reference prefix **`NK`** (`NK1042`), used as the EFT payment reference. EFT window 48 h, reminder after 24 h, unpaid orders auto-cancel (job `eft-unpaid-orders`).
- Emails (SMTP provider, NK palette): `order-placed-eft`, `eft-reminder`, `payment-received`, `order-shipped`, `order-canceled`, `password-reset`, `dropship-supplier`, plus staff alerts `staff-new-order`, `staff-order-paid`, `staff-payment-no-order`.
- **Staff alerts**: `business.json` `staff_order_alerts` (a list; a single string also works) lists the staff addresses that get an email for every new order, every paid order and any payment captured with no order. If it holds no valid address (unset, empty, placeholders or typos), alerts go to `email_orders`; if neither is valid, nothing is sent and the backend logs an error. Real addresses go only in the Pi's gitignored `business.json`, never in `config/business.example.json`. The config is read once and cached at startup, so restart both the Medusa server and the worker after editing it.
- **Dropship**: variants whose SKU starts with a prefix in `business.json` `dropship_suppliers` (`TFR-` = The First Responders) trigger a `dropship-supplier` email to that supplier **on `payment.captured`**, not on order placement (EFT orders are unpaid at placement). If the supplier email is unusable (blank, a placeholder such as `{{TFR_SUPPLIER_EMAIL}}` / `REPLACE_ME`, or no @), the supplier is NOT emailed: the backend logs a warning (placeholder) or an error (typo) naming the supplier, prefix, SKUs and order, and the staff paid alert lists those lines as not notified, for staff to order or pack themselves.
- Feeds: `https://api.noordkaravane.co.za/feeds/meta.xml` and `/feeds/google.xml`; `custom_label_0` = first category.

## Owner inputs still open (blockers before launch)
- Every `{{PLACEHOLDER}}` in `config/business.json` (legal name/status, registration, VAT, emails, Information Officer, **bank details**, socials, `TFR_SUPPLIER_EMAIL`), then `cp config/business.json backend/src/config/business.json`.
- Real weights (or confirm tiers) and real courier prices; `catalogue/GAPS.md` lists the 52 products on tier weights and the 27 with generated SKUs. Override per product in `catalogue/overrides.json` (`{handle: {ship_tier, sku}}`), then re-run `catalogue/scripts/normalise_kampi.py`.
- Policies/legal copy (phase 3, adapt SR's `_LAWYER_REVIEW` approach), food-product labelling for the BoskampKos items, whether `store.kampi.co.za` stays up (decided: parallel, no redirects yet).

## Storefront as built (phase 3)
- `storefront/`: Astro 5 SSR (`@astrojs/node`, `base: "/shop"`), Preact islands, Tailwind 4, `@medusajs/js-sdk`. Dark NK theme (ink/paper/orange `#e95e1d`, Bebas Neue + Barlow) matching the landing page. Token names are kept from the shared structure but values flipped for dark (`paper*` = dark grounds, `ink*` = light foreground, `wine*` = orange accent).
- Every storefront link goes through `u()` (`src/lib/url.ts`); the landing page is linked raw (`LANDING = "/"`).
- Data: `src/lib/products.ts` reads Medusa (`PUBLIC_MEDUSA_URL`) or, when unset, `catalogue/products.json` + `categories.json` (offline preview; checkout disabled). Generic options/variants, nothing is T-shirt specific.
- Pudo rule enforced in `islands/Checkout.tsx`: Pudo hidden when cart weight (`variant.weight` x qty) > `pudo_max_weight_g`; a Pudo method left over from an earlier cart is dropped on load so the customer must re-pick. Collection (`workshop-collect`) skips the address fields and submits the workshop address.
- Product descriptions: Woo HTML from `metadata.description_html`, passed through `src/lib/sanitize.ts` (allow-list, all attributes dropped except safe `a[href]`).
- Content: `src/content/{pages,legal}/*.md`, placeholders filled from `config/business.json` at render time. Legal text is ADAPTED from Soft Rebellion's drafts and is **not lawyer reviewed**.
- Reserved first path segments (never product handles): see `RESERVED_HANDLES` in `src/lib/format.ts`.
- Not done yet (go-live checklist): link the shop from the landing page nav, add `Sitemap: https://noordkaravane.co.za/shop/sitemap.xml` **and the `/shop/...` Disallow lines** (cart, checkout, order, api, filter params) to the ROOT `site/robots.txt` (crawlers ignore `/shop/robots.txt`), add the shop to the root sitemap, Cloudflare rules for `/shop*`, and a first run against a real Medusa + Postgres (seed, EFT order, emails, dropship, Pudo weight guard with real cart data).
