# Noord Karavane shop storefront

Astro 5 SSR (Node standalone) served under **/shop** on noordkaravane.co.za. Talks to the Medusa v2 backend in `../backend`.
The same code also builds the **Kampi Store** (store.kampi.co.za, served at `/`) when `BRAND=kampi`.
See `../CONTRACTS.md` for the binding contracts (URL scheme, shipping rules, order references, "Kampi storefront").

## Local preview (no backend needed)

```bash
export PATH=$HOME/.local/node22/bin:$PATH
npm install
npm run dev            # http://localhost:4321/shop/
npm run build && PORT=4399 HOST=127.0.0.1 npm start   # production build, http://127.0.0.1:4399/shop/
```

Without `PUBLIC_MEDUSA_URL` the storefront serves all 53 products from `../catalogue/products.json`. Checkout and add-to-cart are switched off ("Preview mode").

## Two brands: `BRAND`

`BRAND` picks the store at **build time**: `nk` (the default when unset) or `kampi`. Anything else fails the build with `Unknown BRAND "<v>" (expected nk or kampi)`.

```bash
npm run build                                          # NK: base /shop
BRAND=kampi npm run dev                                # Kampi: http://localhost:4321/
BRAND=kampi npm run build && PORT=4398 HOST=127.0.0.1 npm start   # Kampi production build, http://127.0.0.1:4398/
```

- `astro.config.mjs` inlines the brand as the bare constant `__BRAND__`. Nothing reads `BRAND` at runtime, so setting it on a running server does nothing: rebuild instead.
- An unset `BRAND` builds NK without complaint. Docker builds pass it as a build arg (compose does this for `storefront-kampi`). A hand build of `Dockerfile` needs the `config` context too:
  `docker build --build-context config=../config --build-arg BRAND=kampi -f Dockerfile .`
  The image label `org.noordkaravane.storefront.brand` records which brand it is.
- Kampi-only code and copy live in `src/brands/kampi/`, `src/components/kampi/` and `src/content/kampi/`. Islands and client scripts take brand strings only from `@brand-copy`, never from `src/lib/brand(s).ts`.
- Against a real backend, the Kampi build needs the Kampi publishable key (`PUBLIC_MEDUSA_PUBLISHABLE_KEY`, scoped to the Kampi sales channel).
- Scripted POSTs to a local Kampi build must send `Origin: http://localhost` (with any other origin Astro answers 403, because Kampi's `security.allowedDomains` lists only store.kampi.co.za).

## Guard

`npm run guard` (also the second half of `npm run check`, and run first by `npm run build`) fails on an em dash anywhere in the storefront, on a raw-number price in Kampi copy (write `{{zar:<key>}}` or use `zar()`), and on any Kampi `{{token}}` that does not resolve against `../config/business.example.json`.

## Woo redirects (Kampi only)

Old Woo URLs answer 301 per `src/lib/woo-redirects.ts`. Check a running Kampi build:

```bash
node scripts/redirect-smoke.mjs http://127.0.0.1:4398      # prints redirect-smoke {"checked":..,"failed":0}
```

## With the backend

Set `PUBLIC_MEDUSA_URL`, `PUBLIC_MEDUSA_PUBLISHABLE_KEY` (printed by the seed), `PUBLIC_SITE_URL` (see `.env.example`). `PUBLIC_*` values are inlined at build time: rebuild after changing them.

## Rules for contributors

- Link with `u('/path')` from `src/lib/url.ts`, never a bare `/path` (Astro's `base` does not rewrite hrefs). The landing page is `LANDING`.
- Images live in `public/products/` as webp, produced by `../catalogue/scripts/download_images.py`. Regenerate, do not hand-edit.
- Business details come from `../config/business.json` (never hardcode bank/VAT/address in components).
- `npx astro check` must stay at 0 errors.
- Tailwind scans every file under `storefront/`, this README included: after adding or editing any file here, rebuild NK and compare its CSS with `main` (a stray word can add a utility).
