# Noord Karavane shop storefront

Astro 5 SSR (Node standalone) served under **/shop** on noordkaravane.co.za. Talks to the Medusa v2 backend in `../backend`.
See `../CONTRACTS.md` for the binding contracts (URL scheme, shipping rules, order references).

## Local preview (no backend needed)

```bash
export PATH=$HOME/.local/node22/bin:$PATH
npm install
npm run dev            # http://localhost:4321/shop/
npm run build && PORT=4399 HOST=127.0.0.1 npm start   # production build, http://127.0.0.1:4399/shop/
```

Without `PUBLIC_MEDUSA_URL` the storefront serves all 53 products from `../catalogue/products.json`. Checkout and add-to-cart are switched off ("Preview mode").

## With the backend

Set `PUBLIC_MEDUSA_URL`, `PUBLIC_MEDUSA_PUBLISHABLE_KEY` (printed by the seed), `PUBLIC_SITE_URL` (see `.env.example`). `PUBLIC_*` values are inlined at build time: rebuild after changing them.

## Rules for contributors

- Link with `u('/path')` from `src/lib/url.ts`, never a bare `/path` (Astro's `base` does not rewrite hrefs). The landing page is `LANDING`.
- Images live in `public/products/` as webp, produced by `../catalogue/scripts/download_images.py`. Regenerate, do not hand-edit.
- Business details come from `../config/business.json` (never hardcode bank/VAT/address in components).
- `npx astro check` must stay at 0 errors.
