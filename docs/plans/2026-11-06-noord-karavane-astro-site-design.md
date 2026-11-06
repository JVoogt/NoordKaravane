# Noord Karavane multi-page site: design

Workflow: wf-20261106172456-39a3d732 (PLAN). Status: draft for owner approval. No deploy in this pass.

## Purpose
The landing page is one 1,784-word file with 11 sections and a 10-link nav. Visitors with different needs (an emergency recovery, a service booking, a lift-kit buyer) share one scroll, and each service competes for search ranking on a single URL. Replace it with a small static site where each service has its own page, the home page is short, and one source of truth feeds the business facts (hours, address, phone) so they cannot drift again (they did: the site said Mon-Fri 08:00-17:00, Google says Mon-Thu 08:00-16:00 and Fri 08:00-14:00).

## Users
- Caravan owner in Gauteng with a breakdown or an insurance recovery (phone, stressed, one thumb).
- Owner planning a service, pre-trip check or repair (comparing price and trust).
- Owner or buyer looking at solar, a lift kit or a specific repair.
- Search engines: one clear page per service and one consistent local business entity.

## Success criteria
1. `web/` builds with `astro build` and passes `astro check`; Docker image builds on DockPi (arm64).
2. Seven pages exist: `/`, `/services/caravan-service/`, `/services/repairs/`, `/services/solar-electrical/`, `/services/recoveries/`, `/services/lift-kits/`, `/find-us/`, plus a real `404`.
3. Home is about 600 words (down from 1,784); each service page has one h1, one primary CTA with a service-specific WhatsApp message, a visible FAQ matching its FAQPage JSON-LD, breadcrumbs with BreadcrumbList JSON-LD, unique title, description and canonical (trailing slash).
4. Hours appear identically everywhere and come from one module. No string `17:00` or "Mon-Fri 08" anywhere in `web/`.
5. No `aggregateRating`, no unverifiable testimonials, no new claims beyond the old page and the shop copy.
6. "Book on WhatsApp" is visible in the header at 320, 390, 768 and 1440 px, 44 px high, no horizontal overflow at any width.
7. Served through the production nginx config in a container: all pages 200, `/shop/` unaffected by the landing config, sitemap index lists the site's own sitemap plus `/shop/sitemap.xml`, `/sitemap.xml` and `/sitemap-index.xml` both resolve, favicon routes still real files, `www` still 301s to the apex.
8. Page weight: no page over 250 KB transferred on first load excluding the map iframe.

## Constraints
- Preserve the visual identity: ink `#0e0f11`, paper `#ebe6dd`, orange `#e95e1d`, Bebas Neue and Barlow, the topbar ticker, glass nav, pill buttons, rounded cards.
- Hand-written CSS with those tokens (no Tailwind; the shop uses Tailwind but this site's design is a different system).
- Astro 5.18 to match the shop; `node:22-alpine` build image (proven on the Pi in `infra/docker/storefront.Dockerfile`).
- Traefik routing is unchanged: `Host(noordkaravane.co.za) && PathPrefix(/shop)` goes to the shop, everything else to the landing nginx on `:8260`. The landing build must not claim any `/shop` path.
- The repo is public: no `business.json`, no bank or VAT numbers.
- No em dashes in copy (project standard).
- Do not deploy or merge in this pass. `site/` stays in place until the owner approves parity.

## Out of scope
- A `/services/` hub page, town or area pages (doorway risk), a blog, Afrikaans pages, analytics changes, the shop app, the Cloudflare config, Google Business Profile edits, the payment or booking flows.
- Solar pricing (unknown to us): the Solar page states no prices.

## Approach chosen
Static Astro in `web/`, built in Docker (node build stage, nginx runtime), content in a content collection plus shared layout components.

Rejected:
- **Hand-written HTML pages**: header, footer, schema and hours would be copied into every file; the hours bug would come back.
- **Keep one page, restructure**: cheapest, but forgoes one-page-per-service ranking.
- **Put the landing pages inside the shop's Astro app**: the shop is SSR under `base: /shop` with Medusa dependencies; coupling the marketing site's deploys to the shop's would raise the blast radius of every copy edit.

## Decisions and ADR notes
1. **One entity id.** The landing page's `AutoRepair` JSON-LD uses `@id: https://noordkaravane.co.za/#org`, the same id the shop already emits for its `Organization`, so search engines merge them into one business. Service pages reference it by `@id` instead of repeating the data. No `aggregateRating` (self-serving ratings are not eligible for stars and invented counts risk a manual action).
2. **Hours live in `src/data/business.ts`** (structured per day). Ticker, Find us, FAQ text and the `openingHoursSpecification` are generated from it.
3. **Sitemap.** `@astrojs/sitemap` with `customSitemaps: ['https://noordkaravane.co.za/shop/sitemap.xml']` produces `sitemap-index.xml` and `sitemap-0.xml`. Because `/sitemap.xml` is already in use, nginx rewrites `/sitemap.xml` to `/sitemap-index.xml` internally (no redirect), and `robots.txt` lists `sitemap-index.xml`.
4. **Old in-page anchors.** A hash never reaches the server, so redirects are impossible. Home keeps `#services` and `#location` ids; a 15-line script on Home maps the legacy hashes `#pricing`, `#inspection-report`, `#process`, `#promo`, `#faq`, `#reviews`, `#contact`, `#kampi-widget` to the new pages.
5. **Nav (5 items plus CTA):** Services (Home `#services`), Recoveries, Pricing (`/services/caravan-service/#pricing`), Shop (`/shop/`), Find us, and the orange "Book on WhatsApp" button. Under about 1360 px the links collapse to the quicknav row, as shipped; the CTA stays in the header at every width.
6. **Fonts self-hosted** (`@fontsource/bebas-neue`, `@fontsource/barlow`), removing the render-blocking Google Fonts requests.
7. **Images** via `astro:assets` `<Picture>` (avif, webp, jpg fallback) from `src/assets`; favicons, `og-image-1200.jpg`, `robots.txt` stay in `public/`.
8. **Testimonials not migrated.** The old reviews section shows three unattributed five-star quotes with no way to verify them. The owner's real Google profile has 24 five-star reviews. The new Home quotes 2 or 3 genuine Google reviews (reviewer's displayed first name and date, link to the profile), chosen from the live profile at build time of the content and approved by the owner. Safe default; the owner may veto.
9. **Kampi rentals** becomes a one-line link card on Home (no iframe, uses the existing fallback link). The Google map iframe moves to Find us, lazy-loaded, with the existing text fallback link.
10. **nginx.** The SPA catch-all (`try_files $uri $uri/ /index.html`) is replaced by `try_files $uri $uri/index.html =404` with `error_page 404 /404.html`. Existing guards are kept: `www` 301 block, `default_server` on the apex block, favicon location using `expires` only. Security headers move into one snippet included in every location that sets its own `add_header`, fixing the existing quirk where `/assets/` dropped them.
11. **Compose.** The `noordkaravane` service changes from a bind-mounted `./site` to a `build:` of `./web` (nginx conf still bind-mounted). Port 8260 and `deploy.sh` stay; `deploy.sh` gains `up -d --build`.

## Architecture
```
web/
  astro.config.mjs        site, trailingSlash:'always', sitemap(customSitemaps)
  Dockerfile              node:22-alpine build -> nginx:alpine
  src/
    data/business.ts      NAP, hours (structured), geo, social, whatsapp()
    lib/                  schema.ts (JSON-LD builders), whatsapp.ts, estimator.ts
    layouts/Base.astro    head (SEO/OG/canonical/schema slot), ticker, nav, footer
    layouts/Service.astro service page frame (h1, CTA, body, FAQ, related)
    components/           Ticker, Nav, QuickNav, Footer, CtaButton, Faq, Breadcrumbs, ServiceCard, Hours
    content.config.ts     collection `services` (glob md)
    content/services/*.md five service pages (frontmatter: title, description, h1, whatsappText, faq[], related[])
    pages/index.astro, find-us.astro, services/[slug].astro, 404.astro
    scripts/estimator.ts, legacy-hash.ts
    styles/               tokens.css, base.css, components.css
    assets/               hero + lift-kit photos (src for <Picture>)
  public/                 favicons, apple-touch-icon, og-image-1200.jpg, robots.txt
docker/nginx.conf         updated as in Decision 10
docker-compose.yml        build: ./web
```

## Components and data flow
Build time only: `business.ts` and the `services` collection feed layouts and `schema.ts`, which emits one JSON-LD block per page (`@graph` with the shared `#org` reference, `BreadcrumbList`, and `Service` or `FAQPage` where relevant). Runtime JS is limited to the FAQ accordion (details/summary, no JS if possible), the quicknav, the estimator and the legacy-hash redirect. No client framework.

## Error handling and edge cases
- Unknown URL: real 404 page with links home and the WhatsApp CTA.
- JS disabled: all content, nav links, FAQ (native `<details>`) and WhatsApp links still work; the estimator degrades to a static price table and the CTA.
- Map iframe or Kampi blocked: text fallback links remain.
- WhatsApp links are plain `https://wa.me/...?text=` anchors (work without JS, new tab, `rel="noopener"`).
- Build fails on: a service page without alt text, missing frontmatter, a hours string containing `17:00` (a small guard script in `npm run check`).

## Testing strategy
No test suite exists today (project gotcha). Add a minimal one that earns its place:
- `vitest` unit tests for pure code: WhatsApp URL builder (encoding), hours-to-schema generation, estimator pricing math (ported from the current page), legacy-hash map.
- `scripts/verify.mjs`: parse `dist/` HTML, check one h1, unique title/description/canonical, JSON-LD parses and the FAQPage questions equal the visible FAQ, no `aggregateRating`, no forbidden hours strings, internal links resolve, sitemap lists all pages.
- Container check: build the image, run it with the production `docker/nginx.conf`, curl all routes (200s, 404, `/sitemap.xml`, `www` 301, favicon types, security headers on every location).
- Headless Chromium at 320, 390, 768 and 1440 px: no horizontal overflow, header CTA visible and at least 44 px, screenshots for owner review.

## Observability
None added. Cloudflare analytics and the existing setup are unchanged.

## UI notes
Mode: Persuade. Home order: hero with CTA, trust strip (Google 5.0 from 24 reviews, insurance accredited, quote before work), service cards (5), real Google reviews (2 or 3), location and hours strip, Kampi link card. Service pages: h1 with the service and "Pretoria North", primary CTA, what we do, how it works or what is checked, price facts only where the old site already stated them, FAQ, related services, hours strip. After the first template exists (Home and Recoveries), run the impeccable critique and the good-ux review before building the remaining pages.

## Questions resolved
- Scope, hours, approach, nav, deploy gate: resolved by the owner in this session.
- Where the estimator lives: the caravan-service page, under `#pricing`.
- Where the process steps and inspection report content live: caravan-service page.
- Why-us claims (specialists, quote before spanners, quick turnaround, photographed and logged): kept as short trust items on Home; wording unchanged.
- Rental iframe, testimonials, anchors, sitemap name: Decisions 3, 4, 8, 9.

## Facts the owner must confirm before the pages go live (not blockers for the build)
- "Recoveries 24/7" and "500+ caravans serviced" are the owner's claims on the old page; kept as written.
- Factory-trained on Jurgens, Sprite, Gypsey, Conqueror: kept as written.
- "Most services done same or next day": kept as written.
- Which 2 or 3 genuine Google reviews to quote.
