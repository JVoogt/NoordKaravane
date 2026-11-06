# Noord Karavane Astro multi-page site: execution plan

## Metadata
- Created: 2026-11-06
- Workflow: wf-20261106172456-39a3d732
- Status: draft (plan revision 3; `planning_review_status` = `revised_after_review`; `last_reviewed_revision` = 2)
- **Revision 3 — UNREVIEWED BY A FRESH PASS.** Fresh-review passes: 2/2 (cap reached). This revision was amended after the last fresh pass and has been checked only by amendment verification (not run); no adversarial pass has read it whole. Sections changed since the last fresh review: Metadata, Codebase Reality Check (two rows added), Durable Decisions (new `pricing.ts` interface block, `estimator.ts` interface narrowed, `priceRange` in `schema.ts`, `expandTokens` note, price constants and price-ownership paragraph, `SERVICES` tag note, nginx `gzip_types`), Risk-Based Testing Matrix (one row amended), Test Seams (global), P1 header (out-of-scope drift, test_seams), P1-B (files, new step 1c, faq step 4, schema step 5, Consumes/Produces), P1-E (Home JSON-LD wording, h1 and `priceRange` checks, exit criterion, Consumes), P1-F (curl row 14), P1-G (`browser-check.mjs` `PAGES` default), P2 header (test_seams), P2-A (files, steps renumbered, checks, exit, Consumes/Produces), P2-B (estimator imports, h1 check, Consumes), P2-E (check 6, plain-JS constraint), P3-A (steps 2 and 4), P3-C (README line), Self-Review, Differences from agreement (items 11, 19, 20). Revision 3 is an amendment whose only check is the diff-scoped amendment lane (pending at save time); the fresh-review cap is spent, so no fresh pass will read it.
- Verification Rigor: standard (static marketing site, no money, auth or state; the only irreversible step, deploy, is out of this pass)
- Plan Mode: execution_plan
- Design: `docs/plans/2026-11-06-noord-karavane-astro-site-design.md` (Decisions 1-11 are SETTLED; this plan only refines mechanisms, see "Differences from agreement")
- Branch: `feat/astro-site` off `main`. The build ends in a pushed branch plus an open PR. No merge, no deploy, no `deploy.sh` run, no `docker compose up` in the DockPi project dir.

## Agreement Snapshot
- **Goal:** Replace `site/index.html` (one 1,784-word page) with a static Astro 5 site in `web/`: Home, five service pages, Find us and a real 404, same visual identity, one source for business facts.
- **Constraints:**
  - Visual identity preserved: ink `#0e0f11`, paper `#ebe6dd`, orange `#e95e1d`, Bebas Neue + Barlow, topbar ticker, glass nav, pill buttons, rounded cards. Hand-written CSS, no Tailwind.
  - Astro `^5.18.2`, `node:22-alpine` build stage, nginx runtime. Traefik routing unchanged; the landing build never claims a `/shop` path.
  - Hours are the Google profile: Mon-Thu 08:00-16:00, Fri 08:00-14:00, weekends closed. They come from one module.
  - No em dashes (U+2014) in any copy or code. No `aggregateRating`. No invented claims: every sentence must trace to old-page copy (see Content Map).
  - Public repo: no `business.json`, no bank or VAT numbers, no glob that can reach `config/`.
  - `site/` stays untouched until the owner approves parity.
- **In Scope:** `web/` (whole app), `docker/nginx.conf`, new `docker/security-headers.conf`, `docker-compose.yml`, `deploy.sh`, `README.md` (stale stack section), the plan and design docs.
- **Out of Scope:** deploy, merge, Cloudflare changes (cache purge, rules), Search Console resubmission, a `/services/` hub, town or area pages, blog, Afrikaans, analytics, the shop app, GBP edits, solar prices, the `/shop` Disallow lines in `robots.txt` (still an open item in `CONTRACTS.md`; flag to the owner in the PR, do not fold in).
- **Open Decisions:** none. Owner-confirmation items are non-blocking Facts to Confirm (below).

## Codebase Reality Check (read before planning)
| Fact | Evidence | Class |
|---|---|---|
| Old page: 2,505 lines, one inline `<script>`, two JSON-LD blocks, 8 service articles, 5 process steps, inspection report block, 7 FAQ items, estimator, Kampi iframe, map iframe | `site/index.html` | proven_by_code |
| Old CSS section map (port source): ticker 83, nav 114, hero 233, section chrome 486, services 525, process 599, inspection 650, pricing+estimator 799, promo 1001, why-us 1108, reviews 1141, Kampi 1237, location 1260, FAQ 1347, contact 1462, footer 1518, wa-float 1562, focus-visible 1581, responsive 1604 | `grep` of section comments | proven_by_code |
| Old nav hides links below 1360 px and shows `.mobile-quicknav`; the orange CTA stays at every width | `site/index.html` lines 1624-1650 | proven_by_code |
| Old `fmtR` uses `toLocaleString('en-ZA')` then replaces commas. Modern ICU groups en-ZA with U+00A0 or U+202F, so that port is not deterministic | `site/index.html` line 2374-2376 | proven_by_code (reasoning on ICU) |
| Old JSON-LD has `"priceRange": "R949 - R2299"` (unspaced). The plan's own guard and P2-E check 6 forbid unspaced `R2299`, so the new `priceRange` is generated as `R949 - R2 299` from the same constants the estimator uses; those constants therefore live in a Phase 1 module (`pricing.ts`), not in Phase 2's `estimator.ts` | `site/index.html` line 2481 | proven_by_code |
| `docker/nginx.conf` `gzip_types` lists `application/javascript` but not `text/javascript` | `docker/nginx.conf` lines 57-64 | proven_by_code; inferred, non-critical (that `nginx:alpine` maps `.js` to `text/javascript`: `text/javascript` is added unconditionally and P1-F row 14 clause (b) proves it on a real `.js`) |
| Old FAQ visible text and JSON-LD text already differ in wording; Q07 (hours) is hard-coded prose | lines 2211-2252 vs 2489-2503 | proven_by_code |
| `docker/nginx.conf`: SPA catch-all, `www` 301, `default_server`, favicon location with `expires` only, `/assets/` location whose `add_header` drops the server-level security headers | `docker/nginx.conf` | proven_by_code |
| Compose bind-mounts `./site` and `./docker/nginx.conf`; `deploy.sh` does `git pull`, chmod of `site/assets`, `up -d --force-recreate --no-deps`, health curl of `/ /robots.txt /sitemap.xml` on `:8260` | `docker-compose.yml`, `deploy.sh` | proven_by_code |
| Shop emits `Organization` with `@id` `https://noordkaravane.co.za/#org`; `/shop/sitemap.xml` exists; only `/shop*` goes to Astro | `storefront/src/lib/seo.ts`, `CONTRACTS.md` | proven_by_code |
| Storefront is Astro `^5.18.2`, `typescript ^6.0.3`, `@astrojs/check ^0.9.12`, `@fontsource/bebas-neue` + `barlow ^5.2.0`; its Dockerfile uses `# syntax=docker/dockerfile:1` and `--from=config`, so BuildKit works on the Pi | `storefront/package.json`, `infra/docker/storefront.Dockerfile` | proven_by_code |
| `npm view` latest values are WRONG for this project: `astro` 7.4.7, `typescript` 7.0.2, `vitest` 5.1.0, `sharp` 0.35.5. `astro@5.18.2` carries `sharp ^0.34` as an optional dependency and `vite ^6.4.1`; `@astrojs/check@0.9.12` peers `typescript ^5 \|\| ^6` | `npm view` run 2026-11-06 | proven_by_code |
| `@astrojs/sitemap@3.7.4` has no `astro` peer dependency; `customSitemaps` exists since 3.5.0; default output `sitemap-index.xml` + `sitemap-0.xml` | `npm view`, Astro docs | proven_by_code |
| Local machine: node v22.23.4, Docker 29.9.2 with BuildKit v0.34, platforms amd64 only (no qemu-aarch64 binfmt), cached browser `~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`, `playwright-core` 1.65.0 on npm | commands run | proven_by_code |
| DockPi: Pi 5, 16 GB, arm64, Docker 20.10 + Compose v5, every docker call needs `DOCKER_API_VERSION=1.41`, one Node build at a time (`COMPOSE_PARALLEL_LIMIT=1`), access is `ssh root@dockpi` (an SSH attempt as `voogiepi` from this session was refused). On Docker 20.10 a plain `docker build` defaults to the legacy builder, which does not honour `# syntax=` or `FROM --platform=$BUILDPLATFORM`; the deploy path (`docker compose up --build`, Compose v5) builds under BuildKit, so every hand-run build in this plan sets `DOCKER_BUILDKIT=1` | `infra/RUNBOOK.md`, `infra/Makefile` | proven_by_code (Compose/BuildKit); inferred (legacy-builder default on 20.10, so `DOCKER_BUILDKIT=1` is set unconditionally) |
| `docker compose config` prints bind mounts in long form (`type`, `source`, `target`, `read_only`, `bind` on separate lines), so one mount produces one `source:` line and one `target:` line | `docker compose config` run 2026-11-06 against the current `docker-compose.yml` (Compose v5.6.1) | proven_by_code |
| Old `docker-compose.yml` mounts only `./site` and `./docker/nginx.conf` (no `snippets/` mount); old `site/` has no `/404.html` and no `sitemap-index.xml` (it has `sitemap.xml` and `sitemap-main.xml`). The new `docker/nginx.conf` includes `/etc/nginx/snippets/security-headers.conf`, rewrites `/sitemap.xml` to `/sitemap-index.xml` and sets `error_page 404 /404.html`, so the new nginx config only works with the new compose file and the new `web/` image: nginx, security-headers snippet, compose and deploy.sh are one coupled set | `docker-compose.yml`, `ls site`, Durable Decisions nginx contract | proven_by_code |
| Working tree has untracked `docs/` and `social-media-posts/` noise: never `git add -A` | `git status` | proven_by_code |
| The hero/promo photo source is `site/assets/images/lift-kit.jpg` (2250x2252, tracked); `logo.png` 512x512; `og-image-1200.jpg` 1200x630 | `file` | proven_by_code |
| ADRs: `docs/adr/`, `docs/decisions/`, `docs/rfcs/` do not exist; no `CONTEXT.md`. Design Decisions 1-11 are treated as the settled ADRs | glob | proven_by_code |

## Hidden-Assumption Pass
| Assumption | Class | Handling |
|---|---|---|
| Docker 20.10 on the Pi defaults a plain `docker build` to the legacy builder | inferred (non-critical: not load-bearing, because `DOCKER_BUILDKIT=1` is set unconditionally on every hand-run build and the deploy path is Compose/BuildKit) | Set `DOCKER_BUILDKIT=1`; P3-D checks for BuildKit-style output |
| sharp's musl-arm64 prebuilt installs on `node:22-alpine` on the Pi | inferred (critical) | Deterministic proxy in Phase 1 (lockfile must contain the musl-arm64 entries, see P1-A); real proof is the HITL Pi build in Phase 3 (P3-D). Contingency is a one-line cross-build, already designed in. |
| Compose v5 on the Pi builds `web/` with `FROM --platform=$BUILDPLATFORM` | proven_by_code (BuildKit already required by the storefront Dockerfile) | none |
| Vitest 3.2 works beside Vite 6 from Astro 5.18 | inferred (non-critical) | Phase 1 runs it; vitest 5.x is the fallback because it also accepts Vite 6.4+ |
| 8 old service lines map to 5 pages as in the Content Map | inferred (non-critical, derived from design Decision 5 and the old estimator add-ons) | Content Map is visible in this plan; owner reviews it at the Phase 1 checkpoint |
| Google 5.0 / 24 reviews is still true at launch | needs_user_confirmation | Stored once with `asOf`; non-blocking Fact to Confirm |
| The real Google reviews are quotable | needs_user_confirmation | Reviews slot ships empty-safe (profile link card until the owner supplies reviews) |
| Cloudflare may cache old HTML | inferred (non-critical) | Out of scope; listed in the deploy checklist for the owner |

## Durable Decisions (every phase references these)
**Routes (final URLs, trailing slash):**
`/`, `/services/caravan-service/`, `/services/repairs/`, `/services/solar-electrical/`, `/services/recoveries/`, `/services/lift-kits/`, `/find-us/`; 404 page file `/404.html` served via `error_page`; `/sitemap-index.xml`, `/sitemap-0.xml`, `/sitemap.xml` (internal rewrite to the index, no redirect), `/robots.txt`, `/_astro/*` (hashed assets), `/assets/images/logo.png` and `/assets/images/og-image-1200.jpg` (stable URLs kept because the JSON-LD and OG caches reference them), favicons at root. Nothing under `/shop`.

**Anchors:** Home keeps `#services`, `#location`, plus new `#reviews`, `#rentals`. Caravan service page owns `#pricing`, `#process`, `#inspection-report`, `#faq`.

**Entity:** `ORG_ID = 'https://noordkaravane.co.za/#org'`. Full `AutoRepair` node on Home and Find us; service pages reference it with `{ '@id': ORG_ID }`.

**Module interfaces (verbatim; later phases consume exactly these spellings):**
```ts
// src/data/business.ts
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type DayHours = { opens: string; closes: string } | null;   // 'HH:MM' 24h, null = closed
export const DAY_ORDER: readonly DayKey[];                          // mon..sun
export const BUSINESS: {
  name: 'Noord Karavane'; schemaType: 'AutoRepair'; url: 'https://noordkaravane.co.za';
  phone: { e164: '+27833349357'; display: '083 334 9357' };
  whatsappNumber: '27833349357';
  address: { street: '252 General Beyers Street'; locality: 'Pretoria North'; city: 'Pretoria';
             region: 'Gauteng'; postalCode: '0182'; country: 'ZA' };
  geo: { lat: -25.676593; lng: 28.1774316 };
  links: { facebook: 'https://www.facebook.com/NoordKaravane'; googleProfile: 'https://share.google/T9FFV2QHsZb1VuVMD';
           kampi: 'https://kampi.co.za'; mapsQuery: string };
  google: { rating: 5.0; reviewCount: 24; asOf: '2026-11-06' };
  crossBorder: ReadonlyArray<{ code: 'BW' | 'MZ' | 'ZW' | 'NA' | 'SZ'; name: string }>;
  areaServed: readonly string[];
  recoveriesNote: 'Recoveries 24/7';   // owner claim, kept as written
  hours: Record<DayKey, DayHours>;      // mon-thu 08:00-16:00, fri 08:00-14:00, sat/sun null
};

// src/data/routes.ts
export const SERVICE_SLUGS: readonly ['caravan-service','repairs','solar-electrical','recoveries','lift-kits'];
export type ServiceSlug = typeof SERVICE_SLUGS[number];
export function servicePath(slug: ServiceSlug): string;   // '/services/<slug>/'
export const ROUTES: readonly string[];                    // all 7 page paths
// routes.ts is the ONE source of truth for slugs; nothing else spells a slug list.

// src/data/services.ts   (pure: imports only the ServiceSlug type; no astro:*, no content collection)
import type { ServiceSlug } from './routes';
export interface ServiceMeta {
  slug: ServiceSlug;
  name: string;     // card title, footer link text, hasOfferCatalog item name
  blurb: string;    // one or two sentences, old-page wording only (see Content Map)
  tag: string;      // old card foot label (Repairs: the old hero trust item); carries the price where the old page stated one
}
export const SERVICES: Readonly<Record<ServiceSlug, ServiceMeta>>;   // Record over ServiceSlug: a missing or extra slug is a type error
export const SERVICE_LIST: readonly ServiceMeta[];                   // SERVICE_SLUGS.map(s => SERVICES[s]), display order = SERVICE_SLUGS order
export function serviceMeta(slug: ServiceSlug): ServiceMeta;         // total over ServiceSlug, never undefined
// Consumers: Home ServiceCard grid, Footer service links, orgNode hasOfferCatalog, Service.astro related cards.
// None of them calls getEntry for these facts, so Phase 1 works with only recoveries.md in the collection.

// src/lib/whatsapp.ts
export const WA_TEXT: { book: string; enquire: string; findUs: string };
export function waUrl(text?: string, number?: string): string;   // throws RangeError unless number matches /^\d{8,15}$/

// src/lib/hours.ts
export interface HoursGroup { days: DayKey[]; opens: string | null; closes: string | null }
export function groupHours(hours: Record<DayKey, DayHours>): HoursGroup[];
export function hoursToSchema(hours: Record<DayKey, DayHours>): Array<{ '@type': 'OpeningHoursSpecification'; dayOfWeek: string[]; opens: string; closes: string }>;
export function formatHoursCompact(hours: Record<DayKey, DayHours>): string;   // 'Mon–Thu 08:00–16:00 · Fri 08:00–14:00' (en dashes)
export function formatHoursLines(hours: Record<DayKey, DayHours>): string[];   // ['Mon to Thu · 08:00 to 16:00','Fri · 08:00 to 14:00','Sat and Sun · closed']
export function formatHoursProse(hours: Record<DayKey, DayHours>): string;     // 'Monday to Thursday 08:00 to 16:00 and Friday 08:00 to 14:00. Closed on weekends.'

// src/data/pricing.ts   (Phase 1, P1-B; pure: no imports, no astro:*, no DOM; the ONLY owner of price numbers)
export type AxleId = 'unbraked-1' | 'braked-1' | 'braked-2' | 'other';
export type AddonId = 'lift-kit' | 'pre-trip' | 'water-test' | 'solar-quote';
export const AXLE_OPTIONS: ReadonlyArray<{ id: AxleId; label: string; price: number }>;
export const ADDONS: ReadonlyArray<{ id: AddonId; label: string; price: number }>;   // solar-quote price 0 renders 'POA'
export function fmtR(n: number): string;   // 'R1 499', plain U+0020 grouping via digit-grouping regex, no toLocaleString

// src/lib/estimator.ts   (Phase 2, P2-A; imports AxleId, AddonId, AXLE_OPTIONS, ADDONS, fmtR from '../data/pricing' and waUrl; holds NO price number)
export const DEFAULT_AXLE: AxleId;   // 'braked-1'
export interface Estimate { total: number; totalLabel: string; lines: Array<{ label: string; price: number }>; message: string; url: string }
export function estimate(axle: AxleId, addons: AddonId[]): Estimate;

// src/lib/legacy-hash.ts   (Phase 2)
export const LEGACY_HASH_MAP: Readonly<Record<string, string>>;
export function resolveLegacyHash(hash: string, currentPath: string): string | null;

// src/lib/faq.ts
export interface FaqItem { q: string; a: string; list?: string[]; note?: string }
export function expandTokens(s: string): string;        // {hours} and {price:<AxleId|AddonId>} (looked up in AXLE_OPTIONS then ADDONS, rendered with fmtR); unknown token or unknown id throws
export function faqPlainText(item: FaqItem): string;    // a + list joined with '; ' + note, tokens expanded
export function normalizeForParity(s: string): string;  // lowercase, strip all non [a-z0-9]

// src/lib/schema.ts
export const ORG_ID: 'https://noordkaravane.co.za/#org';
export function priceRange(): string;                            // EXACTLY 'R949 - R2 299': fmtR(lowest AXLE_OPTIONS price) + ' - ' + fmtR(highest AXLE_OPTIONS price); ASCII hyphen-minus with one U+0020 each side, spaced thousands (the old page's unspaced 'R949 - R2299' is deliberately not reproduced)
export function orgNode(): Record<string, unknown>;              // full AutoRepair, hours from hoursToSchema(BUSINESS.hours), priceRange: priceRange(), hasOfferCatalog items from SERVICE_LIST (name, servicePath(slug))
export function orgRef(): { '@id': string };
export function breadcrumbNode(items: Array<{ name: string; path: string }>): Record<string, unknown>;
export function faqNode(faq: FaqItem[]): Record<string, unknown>;
export function serviceNode(s: { name: string; description: string; path: string; price?: { amount: number; from: boolean } }): Record<string, unknown>;
export function buildGraph(nodes: Array<Record<string, unknown>>): { '@context': 'https://schema.org'; '@graph': Array<Record<string, unknown>> };
export function jsonLd(graph: ReturnType<typeof buildGraph>): string;   // JSON.stringify with '<' escaped as <
```
Price constants (ported from old page, owned by `src/data/pricing.ts`): axles `unbraked-1` "Single, unbraked" 949 / `braked-1` "Single, braked" 1499 / `braked-2` "Double, braked" 2299 / `other` "Not sure" 1499 (adds caveat in the estimator); add-ons `lift-kit` "50 mm lift kit fitted" 1980, `pre-trip` "Pre-trip safety inspection" 850, `water-test` "Water system pressure test" 1200, `solar-quote` "Solar system quote (free)" 0.

**Price ownership (cross-phase, Revision 3):** `pricing.ts` is the only non-test source file under `web/src` that holds a price number (test files assert numbers by design), and it is a Phase 1 module so nothing in Phase 1 needs a stub or a forward reference. Its consumers are `faq.ts` (`{price:<id>}` tokens), `schema.ts` (`priceRange()`), `services.test.ts` (tag parity), and in Phase 2 `estimator.ts`, `Estimator.astro` and `scripts/estimator.ts`. `pricing.ts` stores amounts as bare numbers (`price: 2299`) and formats them only through `fmtR`, so it contains no `R`-prefixed literal and satisfies the unspaced-price guard (P1-A) with no guard exemption; no non-test `web/src` file other than `services.ts` (the two tags below) and the Home hero ghost CTA label "See packages from R949" in `index.astro` (P1-E, old copy kept verbatim; the third and last typed price literal) types a price string.

**`SERVICES` table values (every word from the old page, nothing invented; builder may fix punctuation only):**
| slug | name | blurb (old copy) | tag (old card foot label; Repairs is the one exception, see note) |
|---|---|---|---|
| `caravan-service` | Caravan service | Full caravan and trailer servicing. Mechanical, structural and cosmetic repairs, executed by technicians who work on caravans every day, not as a side line. Pre-trip checks: brakes, tyres, lights, signals, gas seals. We sign it off or we don't. | From R949 |
| `repairs` | Repairs | Wheel bearings, brakes, suspension, leaf springs, coupling and jockey wheel work. Pumps, tanks, geysers, pipe repairs and full plumbing overhauls. Floors, walls and frames restored to solid condition. | Quote before work |
| `solar-electrical` | Electrical and solar | Panels, charge controllers, LiFePO₄ banks, inverters and proper 12 V / 220 V rewiring. | Quote on brief |
| `recoveries` | Recoveries | Breakdowns, accidents, roadside. Local nationwide and cross-border to Botswana, Mozambique, Zimbabwe, Namibia and Eswatini. One number, one operator. | Cross-border ready |
| `lift-kits` | 50 mm lift kits | Fitted at the workshop. Easier towing, better clearance, protects stabilisers. | R1 980 fitted |
Tag notes: `Quote before work` is the old hero trust item, not a card foot (the old repairs-side card feet "Torque & test", "Pressure-tested", "Scoped on site" belong to sub-items that now sit on the Repairs page body). `Recoveries 24/7` is NOT a tag: it stays a single literal in `BUSINESS.recoveriesNote` (an owner claim under Facts to Confirm) and is rendered from there. The two price tags (`From R949`, `R1 980 fitted`) are the only price literals in `src/data` outside `pricing.ts` (the one other typed price string is the Home hero label, see Price ownership above); a P1-B test (`services.test.ts`, step 1c) pins them to `AXLE_OPTIONS` and `ADDONS` so they cannot drift. In Phase 1 the Recoveries card links like the other four, to `servicePath(slug)`.

**Phase 1 link policy for the four not-yet-built service pages (stated explicitly, already accepted as Difference 13):** their Home cards, footer links and nav links are live anchors to `servicePath(slug)` and return the 404 page until P2-B. They are NOT hidden, disabled, or pointed at placeholders, so Phase 2 changes no markup, only adds pages. The owner sees them in the checkpoint's expected-dead-link list.

**Deploy and rollback unit (coupled set, cross-phase):** `docker/nginx.conf`, `docker/security-headers.conf`, `docker-compose.yml`, `deploy.sh` and `web/` only work together (see Reality Check). They ship in one PR and roll back in one `git revert` of the whole PR commit. `site/` is neither modified nor deleted in this PR, so the revert restores a working old stack with no extra file moves. Deleting `site/` is a separate later PR, after the owner accepts parity.

**Content collection `services`** (`src/content.config.ts`, loader `glob({ pattern: '*.md', base: './src/content/services' })`; every string field passes through `expandTokens`): `title`, `description`, `h1`, `eyebrow`, `order`, `whatsappText`, `ctaLabel`, `schemaName`, `facts?: {k,v}[]`, `heroImage?: { src, alt (min 5 chars) }`, `faq: FaqItem[] (min 1)`, `related: ServiceSlug[] (max 3)` (zod `z.enum(SERVICE_SLUGS)`, so a typo fails the build; related cards render from `serviceMeta(slug)`, never from `getEntry`, so a related slug whose `.md` does not exist yet, as in Phase 1, still renders), `priceFrom?: { amount, from }`. Body markdown carries prose only: no prices, no hours (they come from tokens or components).

**nginx contract** (`docker/nginx.conf` + `docker/security-headers.conf`, both bind-mounted):
- `server { listen 80; server_name www...; return 301 https://noordkaravane.co.za$request_uri; }` kept.
- `listen 80 default_server; server_name noordkaravane.co.za; root /usr/share/nginx/html; index index.html; absolute_redirect off; error_page 404 /404.html; error_page 403 =404 /404.html;`
- `location = /404.html { internal; }`
- `location / { rewrite ^([^.]*[^/])$ $1/ permanent; try_files $uri $uri/index.html =404; }` (dotless, slashless paths 301 to the slash form; a bare directory such as `/services/` matches `try_files` as a directory, has no `index.html`, makes nginx answer 403, and `error_page 403 =404` turns that into the 404 page).
- `location ~ ^/(favicon\.ico|favicon-\d+\.png|apple-touch-icon\.png)$ { try_files $uri =404; expires 1d; }` (no `add_header`).
- `location = /robots.txt` (text/plain, `expires 1h`), `location = /sitemap.xml { rewrite ^ /sitemap-index.xml last; }`, `location = /sitemap-main.xml { return 301 /sitemap-0.xml; }`.
- `location /_astro/ { add_header Cache-Control "public, max-age=31536000, immutable"; include /etc/nginx/snippets/security-headers.conf; }`
- `location /assets/ { expires 7d; }` (stable, non-hashed names: no `immutable`, no `add_header`).
- Security headers (the existing four, verbatim) live in the snippet and are included at server level AND inside every location that calls `add_header`.
- Existing `gzip_*` block kept, with ONE addition: `text/javascript` appended to `gzip_types` (the current list has `application/javascript` only, and `nginx:alpine` maps `.js` to `text/javascript`, so Astro's bundled scripts would otherwise ship uncompressed and eat the 250 KB weight budget). Final `gzip_types`: `text/css text/plain text/javascript application/xml application/javascript application/json image/svg+xml font/woff2`.

**Compose:** service `noordkaravane`, `build: { context: ./web }`, `image: noordkaravane-web:latest`, `container_name: noordkaravane`, `ports: ["8260:80"]`, volumes `./docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro` and `./docker/security-headers.conf:/etc/nginx/snippets/security-headers.conf:ro`. Port 8260, container name and Traefik file unchanged.

**WhatsApp:** plain `https://wa.me/27833349357?text=<encodeURIComponent>` anchors, `target="_blank" rel="noopener"`. Header CTA label "Book on WhatsApp", orange pill, `min-height: 44px`, never hidden at any width. Base layout takes an optional `waText` prop (default `WA_TEXT.book`) so a service page's header CTA carries that page's message.

**Third-party boundaries:** Google Fonts removed (self-hosted `@fontsource`, latin subset, woff2 only); Google Maps iframe only on Find us, `loading="lazy"`, text fallback link; Kampi is a link card on Home, no iframe; `wa.me`, Facebook, Google profile are outbound links only.

## Content Map (nothing dropped, nothing invented)
| Old content (`site/index.html`) | Lands on | Notes |
|---|---|---|
| Hero (h1, lede, 4 trust items, stats), lift-kit hero photo | Home hero | Stat tiles reduced to a trust strip: Google 5.0 / 24 reviews, insurance accredited, quote before work, 500+ serviced (owner claim), WhatsApp direct |
| 8 service articles | Home: 5 service cards, text from the `SERVICES` table (Durable Decisions) | Service and repairs + pre-trip checks => Caravan service; bearings and chassis + water systems + woodrot => Repairs; electrical and solar => Solar and electrical; recoveries => Recoveries; lift kits => Lift kits |
| Process (5 steps), inspection report block | Caravan service (`#process`, `#inspection-report`) | wording unchanged |
| Packages R949 / R1 499 / R2 299, estimator (add-ons R1 980, R850, R1 200, solar POA) | Caravan service (`#pricing`) | static price cards + JS-enhanced estimator; no-JS shows the table and a baked CTA |
| FAQ Q01 (what services in Pretoria North) | Caravan service FAQ ONLY | verbatim |
| FAQ Q02 (what is in a basic service) | Caravan service FAQ ONLY | verbatim; keeps its 9-item list and note |
| FAQ Q03 (cost) | Caravan service FAQ ONLY | verbatim, prices via `{price:...}` tokens |
| FAQ Q04 (recoveries) | Recoveries FAQ ONLY | verbatim |
| FAQ Q05 (how long does a service take) | Caravan service FAQ ONLY | verbatim; NOT re-cut on Repairs or Solar (it names solar and woodrot, but the whole item lives on one page) |
| FAQ Q06 (solar) | Solar and electrical FAQ ONLY | verbatim |
| FAQ Q07 (location, hours, call-out fee) | Find us FAQ ONLY | `{hours}` token, never frozen text |
| Authored FAQ re-cuts (Repairs 2, Solar 1, Recoveries 1, Lift kits 2) | see "Authored FAQ re-cuts" below | each derived only from named old-page lines; no sentence repeated from another page |

**FAQ assignment rule:** each of the seven old FAQ items (Q01-Q07) appears on exactly one page, as written. A page that needs more than its one source item gets an authored re-cut from the table below. A re-cut may restate a fact the old page already states elsewhere (service cards, promo block, hero trust items, Q-items), in different wording and never as the same sentence as another page's FAQ answer. P2-E check 4b enforces this on `dist/`.

**Authored FAQ re-cuts (intended wording; the builder may adjust punctuation and tokens only; any change of meaning must be traced to an old line):**
| Page | Question | Intended answer | Derived only from (old `site/index.html`) |
|---|---|---|---|
| Repairs | What repairs do you handle? | Wheel bearings, brakes, suspension, leaf springs, coupling and jockey wheel work. Pumps, tanks, geysers and pipe repairs. Floors, walls and frames restored to solid condition. | service cards 04 Bearings and chassis, 06 Water systems, 08 Woodrot (line 1816 and neighbours) |
| Repairs | Do I see the cost before work starts? | Yes. We quote before work starts, and replacement parts are quoted separately so nothing lands on the bill unseen. | hero trust item "Quote before work" (line 1740); Q02 note and Q03 last sentence (meaning only, not their wording) |
| Solar and electrical | How is solar work priced? | Solar work is quoted on your brief, and the quote is free. | service card 02 foot "Quote on brief"; estimator add-on "Solar system quote (free)" |
| Recoveries | Who do I deal with when I need a recovery? | You deal with one operator on one number, with no call centre in between. Message us on WhatsApp or call the number at the top of the page. | service card 05 ("One number, one operator. No call-centre tango."); Q04 "WhatsApp us for immediate assistance" (meaning only) |
| Lift kits | How much is a fitted lift kit, and how long does the fit take? | {price:lift-kit} fitted, taxes included. Fit time is about one day, and fitments carry a 12 month warranty. | promo block (lines 2015-2050): "R1 980 Fitted · taxes incl.", "Fit time ~ 1 day", "Warranty 12 months" |
| Lift kits | Why fit a lift kit? | It gives 50 mm of clearance, easier and more level towing, and it protects your stabilisers. | promo block ("50 mm of clearance. Easier, more level towing. ... your stabilisers will thank you.") and service card 07 |
The cross-border country list is NOT a Recoveries FAQ re-cut: it is rendered once from `BUSINESS.crossBorder` and appears inside Q04, so a "which countries" item would only repeat it. Phone numbers never appear in FAQ text (components render them). The caravan-service FAQ therefore has 4 items (Q01, Q02, Q03, Q05), Repairs 2, Solar 2 (Q06 plus the pricing item), Recoveries 2 (Q04 plus the contact item), Lift kits 2, Find us 1 (Q07).
| Lift kit promo (R1 980 fitted, 50 mm, ~1 day, 12 months, most models) | Lift kits | price via `{price:lift-kit}`; old stray "R1980" normalised to "R1 980" |
| Why us (4 items, wording unchanged) | Home | |
| Three unattributed testimonials | NOT migrated (Decision 8) | Reviews slot shows only entries in `src/data/reviews.ts` with `approved: true`; empty => Google profile link card |
| Kampi iframe | Home one-line link card (`#rentals`) | |
| Map iframe, address, hours, service-areas paragraph | Find us | service-areas paragraph kept as one paragraph, no area pages (default) |
| Contact CTA band | Home bottom band | |
| Footer, floating WhatsApp button | Base layout | footer lists the five service pages from `SERVICE_LIST` (name + `servicePath(slug)`) |

Content rule for the builder: every sentence on a service page must trace to a line in the table above. Where a page needs a FAQ Q&A that the old page lacks, use the "Authored FAQ re-cuts" table only; the answer may only restate existing copy. No new numbers, brands, certifications, turnaround times or guarantees.

## Facts to Confirm (non-blocking; shipped as written, owner may veto)
1. "Recoveries 24/7" (owner claim on the old page).
2. "500+ caravans serviced".
3. "Factory-trained on Jurgens, Sprite, Gypsey, Conqueror".
4. Which 2 or 3 genuine Google reviews to quote (reviewer first name and date, link to profile).
5. "Most services done same or next day", "2-3 days for larger jobs", lift kit "~1 day" fit time and "12 months" warranty on fitments.
6. Google 5.0 from 24 reviews (stored with `asOf: 2026-11-06`).
7. On-site service "for a call-out fee" (old Q07), `paymentAccepted: Cash, Credit Card, EFT` (old JSON-LD).

## Risk-Based Testing Matrix
| Risk | P | I | Test required |
|---|---|---|---|
| Hours drift again (a stray `17:00` or "Mon-Fri 08") | med | high | Deterministic: `guard.mjs` (src and dist) + `hours.test.ts` + verify.mjs forbidden-string scan |
| FAQ visible text and FAQPage JSON-LD diverge | high (already diverged once) | high | Deterministic: `faq.test.ts`, `schema.test.ts`, verify.mjs parity on `dist/` (question list equal and in order; answers equal under `normalizeForParity`) |
| sharp musl-arm64 missing from lockfile or Pi build fails | med | high | Deterministic proxy: lockfile grep (P1-A); HITL: Pi build (P3-D) |
| nginx headers dropped on a location, 403 on bare dir, absolute-redirect leak | high | med | Deterministic: container curl matrix (header on every location, `/services/` 404, `Location` relative) |
| Header CTA hidden or under 44 px, horizontal overflow at 320 | med | high | Deterministic: `browser-check.mjs` at 320/390/768/1440 on every page |
| WhatsApp message encoding differs from the old links | low | high | Deterministic: `whatsapp.test.ts` against verbatim old URLs |
| Estimator money math or format wrong, or a price constant, token or JSON-LD `priceRange` drifting from the single source | low | high | Deterministic: `pricing.test.ts` (constants, `fmtR`), `schema.test.ts` (`priceRange()`), `estimator.test.ts` (worked totals below) |
| Legacy hash redirects loop or miss | med | med | Deterministic: `legacy-hash.test.ts` + browser check `/#pricing` |
| Page weight over 250 KB | med | med | Deterministic: browser-check weight sum (gzip, excl. map iframe) |
| Dead Phase 1 links read as bugs by owner | high | low | Manual: checkpoint note lists the expected-404 set |
| Sitemap index missing the shop sitemap or listing a 404 | med | med | Deterministic: curl matrix + verify.mjs sitemap check |
| Public repo leak (`business.json`, bank, VAT) | low | high | Deterministic: guard `git ls-files web docker` has no `business` match; `web/.dockerignore` |
| Focus ring missing on an interactive element | med | med | Deterministic: global `:focus-visible` rule + tab-walk in browser-check |
| `git add -A` sweeps untracked social-media-posts | med | low | Manual: stage by explicit path (`web docker docker-compose.yml deploy.sh README.md docs/plans`) |
| Partial rollback (reverting only compose and deploy.sh) leaves the new nginx config with no snippet mount, no `/404.html`, no `sitemap-index.xml`, so nginx fails to start or serves wrong paths | med | high | Deterministic: P3-E check that the PR touches no file under `site/`; rollback written as one whole-PR `git revert`; rehearsed once on a scratch clone (P3-E step 4) |
| Same FAQ sentence on two pages (the split's point defeated) | med | med | Deterministic: `verify.mjs` check 4b (no identical normalized sentence of 20+ characters across two pages' FAQ answers); Content Map assigns each of Q01-Q07 to exactly one page |
| Home cards, footer, `hasOfferCatalog` or `related` reference a service the collection lacks (Phase 1 has one `.md`) | high | med | Deterministic: `services.test.ts` (keys equal `SERVICE_SLUGS`, order equal) plus `schema.test.ts` (catalog names equal `SERVICE_LIST`); all consumers read `SERVICES`, not `getEntry` |

## Test Seams (global)
- **Unit seam** (vitest, node environment, no Astro runtime): `whatsapp`, `hours`, `pricing`, `faq`, `schema`, `estimator`, `legacy-hash`, plus `business.ts` shape. These modules import no `astro:*` and no DOM.
- **Integration seam** (on `dist/` HTML): `scripts/verify.mjs` parses built pages; `scripts/guard.mjs` greps sources and dist.
- **E2E seam** (real nginx container plus headless Chromium): curl matrix and `scripts/browser-check.mjs`.
- Existing seams: none (no suite today). These three are the new ones, kept to the minimum that covers the risks above.

## Branch and staging discipline
`git switch -c feat/astro-site` from `main`. One commit per task group (P1-A ... ). Stage by explicit path only. Push and open the PR once, at the end of Phase 3. PR body ends with the attribution line from the session reminder. Never `gh pr merge`. The PR never touches `site/` (no edit, no delete, no move), so the whole PR is one revertable unit; the owner should merge with a merge commit (`git revert -m 1 <merge-sha>` then undoes it), and if a squash merge is chosen instead the rollback is `git revert <squash-sha>`. Either way rollback is a single revert of everything the PR changed, never a revert of a subset of files.

---

# PHASE 1: Scaffold, Home, Recoveries template, container (STOP for owner review)

**phase id:** P1. **Autonomy:** AFK for P1-A..P1-F, then HITL (`manual-verification` + `design-decision`) at the owner-review checkpoint.
**Objective:** A buildable `web/` with the shared system, Home and one service page (Recoveries), served through the production nginx config in a container, with unit-tested pure code and browser-verified header CTA, ready for the owner to judge identity, tone and structure before the other four pages are written.
**Depends on:** none. **Enables:** P2.
**Inputs:** design file, `site/index.html`, `docker/nginx.conf`, `docker-compose.yml`, `deploy.sh`, `storefront/package.json`, `storefront/astro.config.mjs`, `infra/docker/storefront.Dockerfile`, `CONTRACTS.md`.
**Allowed scope:** everything under "In Scope" needed for Home + Recoveries + chrome + container.
**Out-of-scope drift:** writing the other four service pages' copy, the estimator (`estimator.ts`, `Estimator.astro`; the pure `pricing.ts` is in scope), Find us, legacy-hash script, README, any change to `site/`, any deploy, any new design token or component the old page does not imply.
**test_seams:** unit (whatsapp, hours, pricing, faq, schema), E2E (container curl subset, browser-check on `/` and `/services/recoveries/`).
**Validation level:** Deterministic for P1-A..P1-F, Manual for the checkpoint.

### P1-A: Scaffold and tooling
**Objective:** `web/` skeleton that installs, type-checks, tests and builds an empty page, with pinned versions and an arm64-safe lockfile.
**Files/Surfaces (create):** `web/package.json`, `web/package-lock.json`, `web/astro.config.mjs`, `web/tsconfig.json`, `web/vitest.config.ts`, `web/.dockerignore`, `web/.gitignore`, `web/scripts/guard.mjs`, `web/src/pages/index.astro` (placeholder, replaced in P1-E), `web/public/` (copy `site/favicon.ico`, `favicon-48.png`, `favicon-96.png`, `favicon-192.png`, `apple-touch-icon.png`, `site/robots.txt`; `public/assets/images/logo.png` and `public/assets/images/og-image-1200.jpg` copied from `site/assets/images/`).
**Dependencies:** none.
**Pinned dependencies:** `astro@^5.18.2`, `@astrojs/sitemap@^3.7.4`, `@fontsource/bebas-neue@^5.2.0`, `@fontsource/barlow@^5.2.0`; dev: `typescript@^6.0.3`, `@astrojs/check@^0.9.12`, `@types/node@^22.20.5`, `vitest@^3.2.7`, `node-html-parser@^9.0.7`, `playwright-core@^1.65.0`. Do NOT add `sharp` (Astro's optional `^0.34` is the single copy). Do NOT add Tailwind, any UI framework or `@astrojs/node`.
**Scripts:** `dev`, `build` (`astro build`), `preview`, `check` (`astro check && node scripts/guard.mjs`), `test` (`vitest run`), `verify` (`node scripts/verify.mjs`, Phase 2), `browser` (`node scripts/browser-check.mjs`), `ci` (`npm run check && npm test && npm run build && npm run verify`).
**`astro.config.mjs`:** `site: 'https://noordkaravane.co.za'`, `trailingSlash: 'always'`, `build: { format: 'directory' }`, `devToolbar: { enabled: false }`, `integrations: [sitemap({ customSitemaps: ['https://noordkaravane.co.za/shop/sitemap.xml'] })]` (wired here so nginx routes can be exercised in P1-F; completeness is verified in P2), no `base`.
**`guard.mjs`:** fails (exit 1, prints file:line) on any of: U+2014 in `web/src`, `web/scripts`, `web/public` text files; the strings `17:00`, `Mon-Fri 08`, `Mon–Fri`, `Mon to Fri`, `aggregateRating`, `business.json` in `web/src` (excluding `*.test.ts`, which assert these strings are absent) and (if present) `web/dist`; unspaced prices (`R1980`, `R1499`, `R2299`) in the same scope; any tracked file under `web/` or `docker/` whose name matches `business` (uses `git ls-files`; `src/data/business.ts` is the one allowed name, so the match is on `business.json` and `business.*.json`). Glob scope is `web/src`, `web/scripts`, `web/public`, `web/dist` only; never `config/` or `**/business.json`. The string checks skip `web/scripts` (the scripts hold the forbidden literals as oracles); the U+2014 check does not.
**`.dockerignore`:** `node_modules`, `dist`, `.astro`, `.git`, `*.log`, `.env*`.
**Required Checks (exact):**
- `cd web && npm install && npm ci` => exit 0 (proves the committed lock is installable).
- `npm ls astro typescript vitest --depth=0` => `astro@5.18.x`, `typescript@6.x`, `vitest@3.2.x` (any 7.x astro or typescript is a FAIL).
- `grep -c '"node_modules/@img/sharp-linuxmusl-arm64"' web/package-lock.json` => at least `1`, and the same for `"node_modules/@img/sharp-libvips-linuxmusl-arm64"`. If `0`: `cd web && npm install --os=linux --libc=musl --cpu=arm64 --package-lock-only`, commit the lock, re-run the grep.
- `npm view @astrojs/sitemap@<resolved> peerDependencies` has no `astro` range that excludes 5.x (currently none).
- `cd web && npm run check` => `0 errors`, guard prints `guard: ok`.
- `cd web && npx vitest run` with zero test files => exits 0 only if `passWithNoTests: true` is set in `vitest.config.ts`; set it for this task, remove it in P1-B once tests exist.
**Exit Criteria:** all checks above pass, lock committed, `npm run build` emits `web/dist/index.html` and `sitemap-index.xml`.
**Checkpoint Type:** none. **Validation:** Deterministic.
**Consumes:** none. **Produces:** npm scripts `check`, `test`, `build`, `verify`, `browser`, `ci`; `web/scripts/guard.mjs`; sitemap integration config.

### P1-B: Pure code, test first (TDD order)
**Objective:** The tested core every page depends on.
**Files (create):** `web/src/data/business.ts`, `web/src/data/routes.ts`, `web/src/data/services.ts`, `web/src/data/pricing.ts`, `web/src/lib/whatsapp.ts`, `web/src/lib/hours.ts`, `web/src/lib/faq.ts`, `web/src/lib/schema.ts`, and beside each a `*.test.ts` (`web/src/lib/whatsapp.test.ts`, `hours.test.ts`, `faq.test.ts`, `schema.test.ts`, `web/src/data/business.test.ts`, `web/src/data/services.test.ts`, `web/src/data/pricing.test.ts`; `routes.ts` is covered inside `business.test.ts` as before). Remove `passWithNoTests` from `vitest.config.ts`; set `include: ['src/**/*.test.ts']`.
**Dependencies:** P1-A. **Order (RED then GREEN, one module at a time; run `npx vitest run <file>` and watch it fail first):**
1. `business.ts` + `routes.ts`: test asserts the verbatim business facts (phone, address, geo, hours per day, 5 slugs, `ROUTES.length === 7`, `servicePath('recoveries') === '/services/recoveries/'`).
1b. `services.ts` (after `routes.ts`): RED tests in `services.test.ts` (a) `Object.keys(SERVICES)` equals `[...SERVICE_SLUGS]` as a set, and `SERVICE_LIST.map(s => s.slug)` deep-equals `[...SERVICE_SLUGS]` in order (one source of truth for slugs); (b) every entry's `slug` equals its key, `name`, `blurb`, `tag` are non-empty, and `serviceMeta(s)` returns the same object as `SERVICES[s]` for all five slugs; (c) the five `name`, `blurb`, `tag` values equal the `SERVICES` table in Durable Decisions verbatim; (d) no field contains U+2014, `17:00`, or an unspaced price (`R949` is allowed only as `R949` inside `From R949`; `R1980`, `R1499`, `R2299` are not); (e) `SERVICE_LIST` is frozen or `readonly` at type level (a `// @ts-expect-error` assignment test is acceptable).
1c. `pricing.ts` (after `services.ts`; it imports nothing, so it could go first, but `faq.ts` and `schema.ts` below need it): RED tests in `pricing.test.ts` (a) `fmtR`: `0` => `R0`; `949` => `R949`; `1499` => `R1 499`; `2299` => `R2 299`; `12345` => `R12 345`; `1234567` => `R1 234 567`; every output matches `/^R[0-9 ]+$/` and contains no U+00A0 or U+202F; implemented with a digit-grouping regex, NO `toLocaleString`; (b) `AXLE_OPTIONS` deep-equals `[{id:'unbraked-1',label:'Single, unbraked',price:949},{id:'braked-1',label:'Single, braked',price:1499},{id:'braked-2',label:'Double, braked',price:2299},{id:'other',label:'Not sure',price:1499}]`; (c) `ADDONS` deep-equals `[{id:'lift-kit',label:'50 mm lift kit fitted',price:1980},{id:'pre-trip',label:'Pre-trip safety inspection',price:850},{id:'water-test',label:'Water system pressure test',price:1200},{id:'solar-quote',label:'Solar system quote (free)',price:0}]`; (d) ids are unique within each list and every `price` is a non-negative integer; (e) source check: `pricing.ts` read as text contains no `R`-prefixed amount (`/\bR\d/` has no match, comments included), so it satisfies the unspaced-price guard without an exemption. Then extend `services.test.ts` with price-tag parity (moved here from P2-A, because `pricing.ts` now exists in Phase 1): `SERVICES['caravan-service'].tag === 'From ' + fmtR(Math.min(...AXLE_OPTIONS.map(a => a.price)))` and `SERVICES['lift-kits'].tag === fmtR(ADDONS.find(a => a.id === 'lift-kit')!.price) + ' fitted'`; no other `SERVICES` tag contains an `R<digit>` amount. Run the parity test RED first by temporarily editing a tag.
2. `whatsapp.ts`: RED tests (a) `waUrl()` => `https://wa.me/27833349357`; (b) `waUrl("Hi, I'd like to book a service slot.")` => `https://wa.me/27833349357?text=Hi%2C%20I'd%20like%20to%20book%20a%20service%20slot.` (verbatim old link, apostrophe left unescaped); (c) the old Kampi-era strings for enquire and find-us texts match their old URLs exactly; (d) newline => `%0A`, bullet `•` => `%E2%80%A2`; (e) `& # ? %` are escaped; (f) `waUrl('x', '12ab')` throws `RangeError`; (g) default number comes from `BUSINESS.whatsappNumber`.
3. `hours.ts`: RED tests (a) `groupHours(BUSINESS.hours)` deep-equals `[{days:['mon','tue','wed','thu'],opens:'08:00',closes:'16:00'},{days:['fri'],opens:'08:00',closes:'14:00'},{days:['sat','sun'],opens:null,closes:null}]`; (b) `hoursToSchema` deep-equals the two objects in the old JSON-LD (`dayOfWeek: ["Monday","Tuesday","Wednesday","Thursday"]`, `opens:"08:00"`, `closes:"16:00"`; then Friday `08:00`-`14:00`), weekends omitted; (c) `formatHoursCompact` equals exactly `Mon–Thu 08:00–16:00 · Fri 08:00–14:00` (the old ticker string); (d) `formatHoursLines` and `formatHoursProse` equal the strings in Durable Decisions; (e) non-adjacent identical days group separately; (f) a fully closed week gives `[]` schema; (g) no output for `BUSINESS.hours` contains `17:00`.
4. `faq.ts`: RED tests (a) `expandTokens('{hours}')` equals `formatHoursProse(BUSINESS.hours)`; (b) `expandTokens('{price:braked-1}')` => `R1 499`, `{price:lift-kit}` => `R1 980`, `{price:unbraked-1}` => `R949`, and `{price:nope}` throws (the resolver finds the id in `AXLE_OPTIONS` then `ADDONS` and renders `fmtR(price)`; there is no stub and no Phase 2 dependency); (c) unknown token (for example `{nope}`) throws; (d) `faqPlainText({q,a,list:['x','y'],note:'n'})` => `a x; y n` shape (single spaces, list joined with `; `); (e) `normalizeForParity('A, b-C!')` => `abc`.
5. `schema.ts`: RED tests (a) `orgNode()['@id'] === ORG_ID`, `@type === 'AutoRepair'`, `openingHoursSpecification` deep-equals `hoursToSchema(BUSINESS.hours)`, and `JSON.stringify(orgNode())` does not contain `aggregateRating` or `17:00`, and `orgNode().hasOfferCatalog` lists exactly five offers whose names deep-equal `SERVICE_LIST.map(s => s.name)` and whose URLs equal `https://noordkaravane.co.za` + `servicePath(slug)` for each slug in order; (b) `orgRef()` is exactly `{ '@id': ORG_ID }`; (c) `breadcrumbNode([{name:'Home',path:'/'},{name:'Recoveries',path:'/services/recoveries/'}])` has positions 1 and 2 and `item` URLs `https://noordkaravane.co.za/` and `https://noordkaravane.co.za/services/recoveries/`; (d) `faqNode(items)` question names equal input order and each answer text equals `faqPlainText(item)`; (e) `serviceNode` has `provider` equal to `orgRef()`; (f) `jsonLd()` output contains no raw `<` and `JSON.parse` round-trips; (g) `buildGraph` sets `@context` once; (h) `priceRange()` equals exactly `R949 - R2 299` (ASCII hyphen-minus with one U+0020 each side, spaced thousands), equals `fmtR(Math.min(...AXLE_OPTIONS.map(a => a.price))) + ' - ' + fmtR(Math.max(...AXLE_OPTIONS.map(a => a.price)))`, and contains none of `R2299`, `R1499`, `R1980`; `orgNode().priceRange === priceRange()`; `JSON.stringify(orgNode())` contains `"priceRange":"R949 - R2 299"`.
**Required Checks:** `cd web && npx vitest run` => all files pass; `pgrep -f vitest || echo Clean` => `Clean`; `npm run check` => 0 errors.
**Exit Criteria:** tests green after being seen red; coverage of every exported function above; no module imports `astro:*`.
**Checkpoint Type:** none. **Validation:** Deterministic. **Test seam:** unit.
**Consumes:** `BUSINESS`, `DayKey`, `DayHours` (defined in this task); `SERVICE_SLUGS`, `ServiceSlug`, `servicePath` (defined in step 1, consumed by `services.ts` and `schema.ts`); `SERVICE_LIST` (defined in step 1b, consumed by `schema.ts`); `AxleId`, `AddonId`, `AXLE_OPTIONS`, `ADDONS`, `fmtR` (defined in step 1c, consumed by `faq.ts`, `schema.ts` and the parity test in `services.test.ts`). **Produces:** every signature in Durable Decisions for `business`, `routes`, `services` (`ServiceMeta`, `SERVICES`, `SERVICE_LIST`, `serviceMeta`), `pricing` (`AxleId`, `AddonId`, `AXLE_OPTIONS`, `ADDONS`, `fmtR`), `whatsapp`, `hours`, `faq` (`{hours}` and `{price:<id>}` tokens both working), `schema` (including `priceRange`).

### P1-C: Styles and fonts
**Objective:** The old design system as three CSS files, with the old accessibility gaps closed.
**Files (create):** `web/src/styles/tokens.css`, `web/src/styles/base.css`, `web/src/styles/components.css`.
**Dependencies:** P1-A.
**Port map (read the old line ranges, copy only rules that Phase 1 components use; Phase 2 ports the rest):** tokens: `site/index.html` 41-63 (verbatim values). base: 65-81 plus new global rules below. components (P1 subset): ticker 83-112, nav 114-232, hero 233-485 (trim to what Home uses), section chrome 486-524, services 525-598, why-us 1108-1140, reviews+trust 1141-1236, location 1260-1346, FAQ 1347-1461 (restyled for `<details>`), contact 1462-1517, footer 1518-1561, wa-float 1562-1580, responsive 1604-1650 (re-measured).
**New global rules (fixes for old gotchas):** one wildcard `:where(a, button, summary, input, [tabindex]):focus-visible { outline: 2px solid var(--orange-2); outline-offset: 3px; }` (replaces the hand-maintained selector list); `scroll-behavior: smooth` only inside `@media (prefers-reduced-motion: no-preference)`; `scroll-margin-top` on `[id]` so anchors clear the sticky nav; ticker animation paused under `prefers-reduced-motion: reduce`; `.js` hook class for progressive enhancement.
**Fonts:** `import '@fontsource/bebas-neue/latin-400.css'` and Barlow `latin-400/500/600/700.css` from `Base.astro` (no Google Fonts links). If P3 weight check fails, drop Barlow 500 first.
**Nav responsive contract:** at every width the header holds brand + the orange "Book on WhatsApp" CTA (`min-height: 44px`). From 1360 px down the text links collapse to the quicknav row (flex-wrap, count-agnostic, 44 px targets). At 400 px and below hide `.brand-txt small`; at 340 px and below hide `.brand-txt` text and keep the logo mark. Verified, not assumed, by P1-G.
**Required Checks:** `npm run build` succeeds; `grep -c "googleapis" web/dist/index.html` => `0`; `grep -c "focus-visible" web/src/styles/*.css` shows the single wildcard rule.
**Exit Criteria:** no tokens or colors that are not in the old `:root`; no new font; no Tailwind. **Checkpoint Type:** none. **Validation:** Deterministic (build) + Manual (visual at P1-G).
**Consumes:** none. **Produces:** CSS classes used by P1-D (`.topbar`, `.nav`, `.nav-cta`, `.mobile-quicknav`, `.hero`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-whatsapp`, `.sec-head`, `.svc-grid`, `.svc`, `.why-grid`, `.reviews`, `.loc-grid`, `.faq-list`, `.contact`, `.foot`, `.wa-float`), same names as the old page.

### P1-D: Layouts and components
**Objective:** Shared chrome and the service frame.
**Files (create):** `web/src/layouts/Base.astro`, `web/src/layouts/Service.astro`, `web/src/components/Ticker.astro`, `Nav.astro`, `QuickNav.astro`, `Footer.astro`, `CtaButton.astro`, `Hours.astro`, `Breadcrumbs.astro`, `Faq.astro`, `ServiceCard.astro`, `TrustStrip.astro`, `Reviews.astro`, `KampiCard.astro`, `web/src/data/reviews.ts` (`export const REVIEWS: Array<{ name: string; date: string; text: string; url: string; approved: boolean }> = []`).
**Dependencies:** P1-B, P1-C.
**Behavior contracts:**
- `Base.astro` props `{ title, description, path, ogImage?, waText?, jsonLd }`: emits one `<title>`, description, `canonical` = `https://noordkaravane.co.za` + `path`, OG/Twitter tags (image `/assets/images/og-image-1200.jpg`), robots meta, favicons, one `<script type="application/ld+json">` from `jsonLd()`, `lang="en-ZA"`, `<html class>` `js` hook. Sets `waText` default `WA_TEXT.book`.
- `Ticker.astro`: items from `BUSINESS` and `formatHoursCompact(BUSINESS.hours)`; second copy `aria-hidden="true"`.
- `Nav.astro` (+ `QuickNav.astro`): links Services (`/#services`), Recoveries (`servicePath('recoveries')`), Pricing (`servicePath('caravan-service') + '#pricing'`), Shop (`/shop/`), Find us (`/find-us/`), CTA via `waUrl(waText)`; `aria-current="page"` on the matching link; phone link at 1360 px and up, `Call` in the quicknav.
- `Faq.astro`: native `<details><summary>`, content from `FaqItem[]` via `faqPlainText` pieces (a, optional `<ul>`, optional note); no JS; open-by-default none. The same array feeds `faqNode()`.
- `ServiceCard.astro`: prop `{ slug: ServiceSlug }`; renders `serviceMeta(slug)` (`name`, `blurb`, `tag`) as an anchor to `servicePath(slug)`; no `getEntry`, no props carrying copy. Home maps `SERVICE_LIST` to cards.
- `Footer.astro`: service links are `SERVICE_LIST.map(s => [s.name, servicePath(s.slug)])`, five links, plus Find us and contact; no hard-coded slug or link text.
- `Hours.astro`: renders `formatHoursLines(BUSINESS.hours)` plus `BUSINESS.recoveriesNote` on its own line.
- `Reviews.astro`: renders cards only for `approved` entries (name, date, text, link); if none, renders a single card "Rated 5.0 on Google from 24 reviews" with the profile link (values from `BUSINESS.google`). No `blockquote` when empty.
- `KampiCard.astro`: id `rentals`, one line plus link to `BUSINESS.links.kampi`.
- `Service.astro`: breadcrumbs, `<h1>` (one per page), eyebrow, primary CTA (`waUrl(entry.data.whatsappText)`), rendered markdown body slot, optional extras slot, `Faq`, related cards (each `entry.data.related` slug rendered through `ServiceCard` from `serviceMeta(slug)`, so a related page whose `.md` is not written yet still renders; a `getEntry` lookup for related is forbidden), hours strip; passes `waText` to Base; builds the graph (`orgRef`, `breadcrumbNode`, `serviceNode`, `faqNode`).
- All images use `astro:assets` (`Image` or `Picture`) with required `alt`; hero `loading="eager" fetchpriority="high"`.
**Required Checks:** `npm run check` => 0 errors; `npm run build` => success.
**Exit Criteria:** no component hard-codes a phone number, hours string, price or address (grep: `grep -rn "083 334\|08:00\|27833349357" web/src/components web/src/layouts` => no matches); no component or layout calls `getEntry` or `getCollection` for service names, blurbs or related links (grep: `grep -rn "getEntry" web/src/components web/src/layouts` => no matches; only `[slug].astro` and `Service.astro`'s `entry` prop touch the collection, and only for page body, FAQ and frontmatter).
**Checkpoint Type:** none. **Validation:** Deterministic. **Test seam:** integration (build), covered further by P1-F/G.
**Consumes:** `BUSINESS`, `servicePath`, `SERVICE_SLUGS`, `ServiceSlug`, `SERVICE_LIST`, `serviceMeta`, `waUrl`, `WA_TEXT`, `formatHoursCompact`, `formatHoursLines`, `FaqItem`, `faqPlainText`, `orgRef`, `breadcrumbNode`, `serviceNode`, `faqNode`, `buildGraph`, `jsonLd`. **Produces:** `Base.astro` (props above), `Service.astro` (prop `entry` of collection `services`, slot `extras`), `ServiceCard.astro` (prop `slug: ServiceSlug`), `Footer.astro`, the component names above.

### P1-E: Home, Recoveries, content collection, assets
**Objective:** The two reviewable pages.
**Files (create):** `web/src/content.config.ts`, `web/src/content/services/recoveries.md`, `web/src/pages/index.astro`, `web/src/pages/services/[slug].astro` (`getStaticPaths` over the collection), `web/src/pages/404.astro`, `web/src/assets/lift-kit.jpg` (copy of `site/assets/images/lift-kit.jpg`), `web/src/assets/logo.png`.
**Dependencies:** P1-D.
**Home (about 600 words of `<main>` text; verify range 450-750):** hero (old h1 "Keep her road-ready. No surprise repairs.", old lede, CTA "Book on WhatsApp" + ghost "See packages from R949" => `/services/caravan-service/#pricing`, `Picture` of the lift-kit photo avif/webp/jpg), trust strip, five service cards (id `services`, `SERVICE_LIST.map` to `ServiceCard`, each a live link to `servicePath(slug)`; text and price tags come from the `SERVICES` table, so all five render in Phase 1 even though only Recoveries has a page yet; the other four links 404 until P2-B, as stated in Durable Decisions), why-us (4 items, wording unchanged), reviews slot (id `reviews`), location and hours strip (id `location`, `Hours`, address, link to Find us), Kampi card, contact band. JSON-LD: `orgNode()` only (full AutoRepair; `hasOfferCatalog` lists the 5 services from `SERVICE_LIST`, so it is complete in Phase 1; `priceRange` is `priceRange()` from `schema.ts`, fed by `pricing.ts`, and its output is exactly `R949 - R2 299`; it is never typed as a literal). Home ships no page script in Phase 1 (the legacy-hash script arrives in P2-C).
**Recoveries (`recoveries.md` frontmatter + body):** h1 containing "Pretoria North" and recoveries, eyebrow, `whatsappText` "Hi, I need help with a caravan or trailer recovery." (old text), `Recoveries 24/7` tag via `BUSINESS.recoveriesNote`, cross-border list rendered from `BUSINESS.crossBorder`, body from the old recoveries card and Q04 only, FAQ: Q04 verbatim plus exactly one authored re-cut ("Who do I deal with when I need a recovery?", wording in the Content Map "Authored FAQ re-cuts" table; no "which countries" item, the list is already in Q04 and rendered from `BUSINESS.crossBorder`), `related: ['repairs','caravan-service']` (valid `ServiceSlug`s; the two cards render in Phase 1 from `serviceMeta`, and their links 404 until P2-B). No hero photo (none exists; do not invent imagery).
**404:** h1, link home, WhatsApp CTA, noindex.
**Required Checks:**
- `cd web && npm run build` => pages built: `/index.html`, `/services/recoveries/index.html`, `/404.html`.
- `for f in web/dist/index.html web/dist/services/recoveries/index.html; do grep -o '<h1' $f | wc -l; done` => `1` each (`grep -o ... | wc -l` counts elements; `grep -c` counts lines, and Astro minifies each page to about one line, so `grep -c` would print `1` even with two `<h1`).
- `grep -o 'R949 - R2 299' web/dist/index.html | wc -l` => `1` (the Home JSON-LD `priceRange`, exact format) and `grep -c 'R2299\|R1499\|R1980' web/dist/index.html` => `0`.
- `node -e` sanity: `JSON.parse` of each page's `application/ld+json` succeeds (formal check lands in P2-E).
- `ls web/dist | grep -c '^shop$'` => `0`.
- `grep -o 'href="/services/[a-z-]*/"' web/dist/index.html | sort -u | wc -l` => `5` (all five service links exist in Phase 1; the card grid and the footer use the same five paths); `grep -c 'href="/services/repairs/"' web/dist/services/recoveries/index.html` is at least `1` and the same for `caravan-service` (the `related` cards render although those `.md` files do not exist yet); the Home JSON-LD `hasOfferCatalog` has 5 items (`node -e` parse and count).
**Exit Criteria:** one h1 per page (`grep -o '<h1' <file> | wc -l` => `1` for each); unique title, description and canonical (trailing slash) on both; FAQ visible questions equal JSON-LD questions on Recoveries; alt text on every `<img>`.
**Checkpoint Type:** none. **Validation:** Deterministic.
**Consumes:** `Base.astro`, `Service.astro`, `ServiceCard.astro`, components, `REVIEWS`, `SERVICE_LIST`, `serviceMeta`, `orgNode()` (its `priceRange` comes from `priceRange()` over `AXLE_OPTIONS`, both produced in P1-B), collection schema. **Produces:** collection `services` with entry id `recoveries`, route `/services/[slug]/`, `404.astro`.

### P1-F: Docker, nginx, compose, deploy.sh, container verification
**Objective:** The production serving path, proven locally.
**Files:** create `web/Dockerfile`, `docker/security-headers.conf`; modify `docker/nginx.conf`, `docker-compose.yml`, `deploy.sh`.
**Dependencies:** P1-E.
**`web/Dockerfile`:**
```dockerfile
# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
ENV NODE_OPTIONS=--max-old-space-size=1536 ASTRO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /src/dist /usr/share/nginx/html
```
The runtime stage has only `COPY` (no `RUN`), so an arm64 image can be cross-built on this amd64 machine with no emulation. The build stage is native on both the amd64 laptop and the Pi, and `dist/` is architecture independent.
**`deploy.sh`:** drop the `chmod site/assets` step (no longer served); the refresh line becomes `DOCKER_API_VERSION=1.41 docker compose up -d --build --force-recreate --no-deps noordkaravane`; health loop line in Phase 1 is exactly `for path in / /robots.txt /sitemap.xml /sitemap-index.xml /services/recoveries/; do`. P2-C appends `/find-us/` AND the four other service pages (`/services/caravan-service/ /services/repairs/ /services/solar-electrical/ /services/lift-kits/`), so the final line is the one written in P2-C. Not executed in this pass; `bash -n deploy.sh` must exit 0 after each edit.
**Required Checks (exact; BASE below):**
```
cd /home/jpvoogt/Documents/_Code/NoordKaravane
DOCKER_BUILDKIT=1 docker build -t nk-web:test web   # BuildKit set explicitly: Dockerfile uses `# syntax=` and FROM --platform=$BUILDPLATFORM
docker run -d --rm --name nk-web-test -p 18260:80 \
  -v "$PWD/docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/docker/security-headers.conf:/etc/nginx/snippets/security-headers.conf:ro" nk-web:test
docker exec nk-web-test nginx -t        # expect: "syntax is ok" and "test is successful"
BASE=http://localhost:18260
```
| # | Command | Expected |
|---|---|---|
| 1 | `curl -s -o /dev/null -w '%{http_code}' $BASE/` and `$BASE/services/recoveries/` | `200` each |
| 2 | `curl -sI $BASE/services/recoveries` | `301` and `Location: /services/recoveries/` (relative, no host or port) |
| 3 | `curl -s -o /dev/null -w '%{http_code}' $BASE/services/` | `404` (not 403) |
| 4 | `curl -s -w '\n%{http_code}' $BASE/nope/ \| tail -n 3` | `404` and body from `/404.html` (contains `<h1`) |
| 5 | `curl -s $BASE/sitemap.xml` | `<sitemapindex` containing `https://noordkaravane.co.za/sitemap-0.xml` and `https://noordkaravane.co.za/shop/sitemap.xml` |
| 6 | `diff <(curl -s $BASE/sitemap.xml) <(curl -s $BASE/sitemap-index.xml) && echo same` | `same` |
| 7 | `curl -sI $BASE/robots.txt \| grep -i content-type` | `text/plain` |
| 8 | `curl -sI $BASE/favicon.ico`, `/favicon-96.png`, `/favicon-192.png`, `/apple-touch-icon.png` | `200`, image types (`image/png`, `image/x-icon` or `image/vnd.microsoft.icon`) |
| 9 | `curl -s -o /dev/null -w '%{http_code}' $BASE/favicon-999.png` | `404` (not an HTML 200) |
| 10 | `curl -sI -H 'Host: www.noordkaravane.co.za' $BASE/services/recoveries/` | `301`, `Location: https://noordkaravane.co.za/services/recoveries/` |
| 11 | security headers on `/`, the hashed CSS under `/_astro/`, `/assets/images/logo.png`, `/404.html` via a missing path, `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, and the 301 in row 2: `curl -sI <url> \| grep -ci -E 'x-frame-options\|x-content-type-options\|referrer-policy'` | `3` for every URL |
| 12 | `curl -sI $BASE/_astro/<file>.css \| grep -i cache-control` | `public, max-age=31536000, immutable` |
| 13 | `curl -s -o /dev/null -w '%{http_code}' $BASE/shop/` and `$BASE/shop/sitemap.xml`; `test ! -e web/dist/shop && echo ok` | `404`, `404`, `ok` (landing never claims `/shop`) |
| 14 | (a) `curl -sI -H 'Accept-Encoding: gzip' $BASE/ \| grep -i content-encoding`; (b) one bundled script: `JS=/_astro/$(docker exec nk-web-test ls /usr/share/nginx/html/_astro \| grep '\.js$' \| head -n 1)` (on the Pi: `docker exec nk-web-smoke ...`; if the listing has no `.js`, `$JS` is `/_astro/`, treated as empty) then `curl -sI -H 'Accept-Encoding: gzip' "$BASE$JS" \| grep -i content-encoding` (also check `curl -sI "$BASE$JS" \| grep -i content-type` is `text/javascript` or `application/javascript`) | (a) `gzip`; (b) `gzip` (proves the `text/javascript` entry in `gzip_types`). Phase 1 ships no page script, so `$JS` is empty and clause (b) is recorded as `n/a: no bundled script yet` (not a FAIL); from P2-C on (Home and the caravan page carry bundled scripts) an empty `$JS` or a missing `content-encoding: gzip` is a FAIL. P3-A step 4 and P3-D inherit clause (b) |
| 15 | `docker compose config --quiet; echo $?` then `docker compose config \| grep -c 'target: /etc/nginx/snippets/security-headers.conf'` and `docker compose config \| grep -c 'source: .*/docker/security-headers.conf$'` | `0`, then `1`, then `1` (long-form output: one mount is one `source:` line and one `target:` line; the `snippets/` path appears only on the target line, so a bare `grep -c security-headers.conf` would print 2) |
| 16 | `bash -n deploy.sh; echo $?` and `grep -c '^for path in / /robots.txt /sitemap.xml /sitemap-index.xml /services/recoveries/; do$' deploy.sh` | `0` and `1` |
**The container `nk-web-test` and image `nk-web:test` are LEFT RUNNING at the end of P1-F**: P1-G depends on `BASE=http://localhost:18260`. Cleanup (`docker stop nk-web-test`; `docker image rm nk-web:test`) is the last step of P1-G, after its browser run. (Sitemap rows 5-6 pass in P1 because the sitemap integration is wired; completeness is P2.)
**arm64 cross-build rehearsal (no emulation, proves the Dockerfile shape for the Pi; `buildx` is BuildKit by definition):** `docker buildx build --platform linux/arm64 -t nk-web:arm64-rehearsal --load web && docker image inspect nk-web:arm64-rehearsal --format '{{.Architecture}}'` => `arm64`. (The image cannot be run here; running it is P3-D.) Remove the image afterwards.
**Compose build parity (the deploy path builds through Compose, so prove that too, locally):** `docker compose build noordkaravane` => exit 0 and `docker image inspect noordkaravane-web:latest --format '{{.Architecture}}'` => `amd64`; then `docker image rm noordkaravane-web:latest`. (Laptop only; on the Pi the tag `noordkaravane-web:latest` is never built by this plan, see P3-D.)
**Exit Criteria:** all 16 rows, the rehearsal and the compose build parity pass; `git diff --stat` shows only the intended files; `site/` untouched; container `nk-web-test` still running for P1-G.
**Checkpoint Type:** none. **Validation:** Deterministic. **Test seam:** E2E.
**Consumes:** `web/dist` layout, `/_astro/` output path, sitemap integration config. **Produces:** image `nk-web:test` recipe, `docker/security-headers.conf`, compose `build:` service, row-by-row curl matrix reused in P3-A.

### P1-G: Browser check and owner-review package
**Objective:** Prove the header CTA contract and give the owner something to judge.
**Files (create):** `web/scripts/browser-check.mjs`.
**Dependencies:** P1-F (container `nk-web-test` left running on `:18260` by P1-F; P1-G owns the cleanup). If the container is not running when P1-G starts (new session), re-run the three `docker` lines of the P1-F block first.
**`browser-check.mjs`:** `playwright-core` `chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/home/jpvoogt/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell' })` (never lets Playwright try to download a browser). Args: `BASE` (env, default `http://localhost:18260`), `PAGES` (comma list; default the seven routes hard-coded in the script as an independent oracle: `/`, `/services/caravan-service/`, `/services/repairs/`, `/services/solar-electrical/`, `/services/recoveries/`, `/services/lift-kits/`, `/find-us/`; the script is plain Node and never imports `routes.ts`, see the plain-JS constraint in P2-E), `SHOTS_DIR` (default `/tmp/nk-shots`, never inside the repo). For each page and each width in 320, 390, 768, 1440: no horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`); the header CTA (`.nav-cta`) is visible, fully inside the viewport, `getBoundingClientRect().height >= 44`; a Tab walk of the first 40 stops records `outline-style` and width of `document.activeElement` and fails on `none`; page weight (CDP `Network.loadingFinished.encodedDataLength` sum, excluding `maps.google.com`) is under 250 KB; full-page screenshot saved as `<page>-<width>.png`. A second pass with `javaScriptEnabled: false` checks: CTA `href` starts with `https://wa.me/27833349357`, every `<details>` toggles via `summary.click()`, and the estimator no-JS fallback (P2) is visible. Prints a table and exits 1 on any failure.
**Required Checks (Phase 1 subset):**
`cd web && BASE=http://localhost:18260 PAGES=/,/services/recoveries/ npm run browser` => every row `PASS` for widths 320, 390, 768, 1440; weight rows under 250 KB.
Lighter review passes on the template (read-only, findings only): run the `impeccable` critique and the `good-ux` review on `/` and `/services/recoveries/`; record findings in the checkpoint note; do NOT fix yet (fixes land in P2-0 after owner feedback, so owner and critique feedback are applied together).
**Cleanup (last step of P1-G, after the browser run and the review passes that need the container):** `docker stop nk-web-test` (the `--rm` flag removes it), `docker image rm nk-web:test`, then `docker ps -a --format '{{.Names}}' | grep -c '^nk-web-test$'` => `0` and `docker images -q nk-web:test | wc -l` => `0`. The owner checkpoint's `docker compose up --build` is independent of this container.
**Exit Criteria:** all browser rows PASS; screenshots exist in `/tmp/nk-shots/`; the cleanup checks above print `0` and `0`.
**Checkpoint Type:** `human_verify` (see below). **Validation:** Deterministic + Manual.
**Consumes:** running container, `.nav-cta` class. **Produces:** `scripts/browser-check.mjs` (args `BASE`, `PAGES`, `SHOTS_DIR`, `PW_CHROMIUM`), screenshots.

### >>> OWNER-REVIEW CHECKPOINT (end of Phase 1): STOP <<<
**Checkpoint type:** `human_verify`, reason-category `manual-verification` + `design-decision`. The build workflow must not start Phase 2 until the owner answers.
**What the owner gets:** branch `feat/astro-site` (committed, not pushed unless asked); screenshots in `/tmp/nk-shots/` (Home and Recoveries at 4 widths); how to look: `docker compose up --build` then `http://localhost:8260/` and `/services/recoveries/`; the curl table and unit-test results; the impeccable critique and good-ux findings (unfixed); the Content Map above.
**Expected dead links in this phase (not bugs; live links to Phase 2 pages that 404 on purpose):** nav Pricing and Find us, the four other service cards on Home (Caravan service, Repairs, Electrical and solar, 50 mm lift kits; their text is complete because it comes from the `SERVICES` table), the matching four footer links, the two `related` cards on Recoveries.
**Owner questions:** (1) Does the identity read as the same brand? (2) Is the header CTA right at phone width? (3) Is the Recoveries copy and layout the template for the other four? (4) Any Facts to Confirm answered now (24/7, 500+, brands, which Google reviews)? (5) Go for Phase 2, or list changes.
**Resolution rule:** "go" => P2 starts at P2-0. Change list => applied inside P2-0 before new pages are written. A rejection of the template structure => re-plan (set `REMEDIATION_NEEDED`).

---

# PHASE 2: Remaining pages, estimator, sitemap, 404, legacy hashes, verify script

**phase id:** P2. **Autonomy:** AFK (all tasks).
**Objective:** Complete the seven-page site, ship the estimator and legacy-hash map as tested pure code, wire sitemap and robots, and add the dist-level verify script.
**Depends on:** P1 and the owner's "go". **Enables:** P3.
**Inputs:** Phase 1 branch, owner feedback, Content Map.
**Allowed scope:** four content files, extras components, Find us, estimator and legacy-hash modules and scripts, robots and sitemap files, `verify.mjs`, `deploy.sh` health paths (P2-C: `/find-us/` plus the four P2-B service pages).
**Out-of-scope drift:** a `/services/` hub, area pages, new copy beyond the Content Map, reviews not supplied by the owner, edits to `site/`.
**test_seams:** unit (estimator, legacy-hash), integration (verify.mjs on dist), E2E (browser-check on all pages).
**Validation level:** Deterministic.

### P2-0: Apply owner and critique feedback from Phase 1
**Objective:** Fix what the owner and the Phase 1 critique/good-ux findings say, before copying the pattern four times.
**Files:** whatever the feedback touches in `web/src/**` and `web/src/styles/**`.
**Dependencies:** owner "go". **Required Checks:** `npm run check && npm test && npm run build`; re-run P1-G browser rows on `/` and `/services/recoveries/`. **Exit Criteria:** every accepted finding fixed or recorded as rejected with a reason in the PR body. **Validation:** Deterministic.
**Consumes/Produces:** none (edits only).

### P2-A: Estimator and legacy-hash, test first (TDD order)
**Files (create):** `web/src/lib/estimator.ts`, `estimator.test.ts`, `web/src/lib/legacy-hash.ts`, `legacy-hash.test.ts`, `web/src/data/legacy-hash-map.json` (the 8 entries below; `legacy-hash.ts` exports it as `LEGACY_HASH_MAP`; `verify.mjs` reads the same JSON). No existing file is modified: `fmtR`, `AXLE_OPTIONS`, `ADDONS` and the `{price:*}` tokens already exist from P1-B (`pricing.ts`, `faq.ts`), and the price-tag parity test already lives in P1-B step 1c.
**Dependencies:** P1-B. **Order (RED then GREEN each step):**
Moved to P1-B step 1c (`pricing.test.ts`) and not repeated in P2-A: the `fmtR` worked values and the rule that no output may contain the two space look-alikes U+00A0 and U+202F (rendered here as ` ` or ` `), and the implementation rule (digit-grouping regex, NO `toLocaleString`).
1. `estimate('braked-1', [])`: `total === 1499`, `totalLabel === 'R1 499'`, `message` is exactly
   `Hi Noord Karavane, estimate from your site:\n• Single, braked: R1 499\nTotal est.: R1 499 (excl. parts)\nCan you confirm availability?`, `url === waUrl(message)`.
2. Totals: `('braked-1',['lift-kit'])` => `3479`; `('braked-1',['lift-kit','pre-trip'])` => `4329`; `('braked-2',['lift-kit','pre-trip','water-test','solar-quote'])` => `6329` with line `• Solar system quote (free): POA`; `('unbraked-1',[])` => `949`; `('braked-2',[])` => `2299`.
3. `('other', [])` => `total 1499` and the axle line ends `(not sure on axle config, please confirm)`.
4. Robustness: unknown axle id falls back to `DEFAULT_AXLE`; unknown add-on ids ignored; duplicate add-on ids counted once.
5. `legacy-hash.ts`: `LEGACY_HASH_MAP` equals exactly
   `#pricing` => `/services/caravan-service/#pricing`; `#process` => `/services/caravan-service/#process`; `#inspection-report` => `/services/caravan-service/#inspection-report`; `#promo` => `/services/lift-kits/`; `#faq` => `/services/caravan-service/#faq`; `#reviews` => `/#reviews`; `#contact` => `/find-us/`; `#kampi-widget` => `/#rentals`.
   Tests: each entry resolves from `currentPath '/'` except `#reviews` which returns `null` from `'/'` (target is the same page, let the browser scroll); `('#pricing','/services/caravan-service/')` => `null`; `('#PRICING','/')` resolves (case-insensitive); `('#services','/')`, `('#location','/')`, `('', '/')`, `('#','/')`, `('#unknown','/')` => `null`; current path without trailing slash is normalised; every map target path (before `#`) is in `ROUTES`.
**Required Checks:** `cd web && npx vitest run` => all green; `pgrep -f vitest || echo Clean` => `Clean`; `grep -nE "949|1499|2299|1980|850|1200" web/src/lib/estimator.ts` => no matches (the worked totals live only in `estimator.test.ts`).
**Exit Criteria:** tests red-then-green; `estimator.ts` has no import of DOM or `astro:*` and declares no price number (it imports `AXLE_OPTIONS`, `ADDONS`, `fmtR`, `AxleId`, `AddonId` from `../data/pricing`); sources of truth for prices exist once, in `pricing.ts` (P1-B).
**Checkpoint Type:** none. **Validation:** Deterministic. **Test seam:** unit.
**Consumes:** `waUrl`, `BUSINESS`, `ROUTES`; from P1-B `pricing.ts`: `AxleId`, `AddonId`, `AXLE_OPTIONS`, `ADDONS`, `fmtR`. **Produces:** `estimate`, `Estimate`, `DEFAULT_AXLE`, `LEGACY_HASH_MAP`, `resolveLegacyHash` (all as in Durable Decisions).

### P2-B: Four service pages and their extras
**Files (create):** `web/src/content/services/caravan-service.md`, `repairs.md`, `solar-electrical.md`, `lift-kits.md`; `web/src/components/Estimator.astro`, `ProcessSteps.astro`, `InspectionReport.astro`, `LiftKitSpecs.astro`; `web/src/scripts/estimator.ts` (client enhancement); modify `web/src/pages/services/[slug].astro` (per-slug extras map) and `web/src/styles/components.css` (port process 599-649, inspection 650-798, pricing+estimator 799-1000, promo 1001-1107).
**Dependencies:** P2-0, P2-A. Slug to extras: `caravan-service` => `ProcessSteps` (id `process`), `InspectionReport` (id `inspection-report`), pricing section (id `pricing`: three static price cards + `Estimator`); `lift-kits` => `LiftKitSpecs` (50 mm, ~1 day, 12 months, most models) with the hero `Picture`; `repairs` and `solar-electrical` => none. Copy only from the Content Map. Solar page states no prices ("Quote on brief"). Repairs lists bearings and chassis, water systems, woodrot; its FAQ is exactly the two authored re-cuts in the Content Map table ("What repairs do you handle?", "Do I see the cost before work starts?"), NOT Q05 (Q05 lives on Caravan service only). FAQ per page, from the Content Map: Caravan service Q01, Q02, Q03, Q05 verbatim (4 items); Repairs 2 re-cuts; Solar Q06 verbatim plus "How is solar work priced?"; Lift kits the two re-cuts ("How much is a fitted lift kit, and how long does the fit take?", "Why fit a lift kit?"). Each page's `related` uses valid `ServiceSlug`s and renders from `serviceMeta`.
**Estimator progressive enhancement:** server renders the price table (cards plus add-on list) visible without JS and a baked CTA `href = estimate(DEFAULT_AXLE, []).url`; `html.js` reveals the interactive controls; `scripts/estimator.ts` imports `estimate` from `lib/estimator` and `AXLE_OPTIONS`, `ADDONS` from `data/pricing`, and updates total and CTA `href` on change; controls are real `<button type="button" aria-pressed>`; estimator options 44 px high.
**Required Checks:** `npm run check && npm test && npm run build`; build emits 5 service pages plus Home plus 404; `grep -c "R1980\|R1499\|R2299" web/dist -r` => `0`; each page: `for f in $(find web/dist -name '*.html'); do echo "$f $(grep -o '<h1' $f | wc -l)"; done` => `1` for every file (`grep -c` counts lines and a minified page is about one line, so it cannot detect a second `<h1`); lift-kit page contains `R1 980`.
**Exit Criteria:** every service page has one h1, one primary service CTA with its own `wa.me` text, a visible FAQ whose questions equal its JSON-LD, breadcrumbs with `BreadcrumbList` JSON-LD. **Checkpoint Type:** none. **Validation:** Deterministic.
**Consumes:** `estimate`, `DEFAULT_AXLE` (P2-A, `lib/estimator.ts`), `AXLE_OPTIONS`, `ADDONS`, `fmtR` (P1-B, `data/pricing.ts`), `Service.astro`, `Faq.astro`, collection schema, `{price:*}` tokens (P1-B, `faq.ts`). **Produces:** collection entries `caravan-service`, `repairs`, `solar-electrical`, `lift-kits`; anchors `#pricing`, `#process`, `#inspection-report`, `#faq` on the caravan page.

### P2-C: Find us, 404 polish, Home legacy-hash script
**Files (create):** `web/src/pages/find-us.astro`, `web/src/scripts/legacy-hash.ts`; modify `web/src/pages/index.astro` (include the script), `deploy.sh` (extend the health loop with `/find-us/` AND the four P2-B service pages; final line exactly `for path in / /robots.txt /sitemap.xml /sitemap-index.xml /services/recoveries/ /find-us/ /services/caravan-service/ /services/repairs/ /services/solar-electrical/ /services/lift-kits/; do`).
**Dependencies:** P2-A, P2-B (the four service pages the health loop now probes must exist).
**Find us:** h1, address, phone and WhatsApp CTA (`WA_TEXT.findUs`), `Hours`, Google Maps iframe (`BUSINESS.links.mapsQuery`, `loading="lazy"`, `title`) with the text fallback link, the old service-areas paragraph as one paragraph (default), FAQ with Q07 using `{hours}`, full `orgNode()` plus `breadcrumbNode` plus `faqNode` graph.
**Legacy-hash script (about 15 lines, Home only):** on load and on `hashchange`, `const t = resolveLegacyHash(location.hash, location.pathname); if (t) location.replace(t);`. Bundled by Astro, no inline logic duplication.
**Required Checks:** build; `grep -c "legacy" web/dist/index.html` is not used (script is bundled); browser check in P2-E covers the redirect; `bash -n deploy.sh` => exit 0 and `grep -c '^for path in / /robots.txt /sitemap.xml /sitemap-index.xml /services/recoveries/ /find-us/ /services/caravan-service/ /services/repairs/ /services/solar-electrical/ /services/lift-kits/; do$' deploy.sh` => `1` (the live `200` check of the ten paths runs against the rebuilt container in the Phase 2 Exit Criteria).
**Exit Criteria:** Find us has one h1, hours identical to Home ticker output (same function), map iframe only on this page (`grep -l "maps.google" web/dist -r` lists only `find-us/index.html`). **Checkpoint Type:** none. **Validation:** Deterministic.
**Consumes:** `resolveLegacyHash`, `LEGACY_HASH_MAP`, `orgNode`, `WA_TEXT.findUs`, `Hours.astro`. **Produces:** route `/find-us/`, Home legacy redirect behaviour.

### P2-D: Sitemap, robots, nginx extras
**Files (modify):** `web/public/robots.txt` (`User-agent: *`, `Allow: /`, `Sitemap: https://noordkaravane.co.za/sitemap-index.xml`), `web/astro.config.mjs` (sitemap `filter` excluding `/404`; nothing else), `docker/nginx.conf` (confirm the `/sitemap-main.xml` 301 from the Durable Decisions block is present and tested).
**Dependencies:** P2-B, P2-C.
**Required Checks:** `grep -o "<loc>[^<]*</loc>" web/dist/sitemap-0.xml | wc -l` => `7`; `grep -c "https://noordkaravane.co.za/shop/sitemap.xml" web/dist/sitemap-index.xml` => `1`; `grep -c "sitemap-index.xml" web/dist/robots.txt` => `1`; `grep -c "/404" web/dist/sitemap-0.xml` => `0`; container row: `curl -sI $BASE/sitemap-main.xml` => `301` `Location: /sitemap-0.xml`.
**Exit Criteria:** all `loc` URLs end in `/` and use `https://noordkaravane.co.za`. **Checkpoint Type:** none. **Validation:** Deterministic.
**Consumes:** sitemap integration config, `ROUTES`. **Produces:** final sitemap and robots contract (`sitemap-index.xml`, `sitemap-0.xml`).

### P2-E: `verify.mjs` (dist integrity)
**Files (create):** `web/scripts/verify.mjs` (uses `node-html-parser`).
**Dependencies:** P2-B, P2-C, P2-D.
**Checks (each prints PASS or FAIL with page and detail; exit 1 on any FAIL):**
1. Exactly the expected page set exists in `dist/` (7 pages plus `404.html`) and `dist/shop` does not.
2. Per page: exactly one `<h1>`; `<title>`, meta description and canonical present and unique across pages; canonical ends in `/` and equals `https://noordkaravane.co.za` + path.
3. Every `application/ld+json` block parses; no `aggregateRating` anywhere; exactly one JSON-LD block per page; the `AutoRepair` node appears on Home and Find us with `@id` `https://noordkaravane.co.za/#org`; service pages reference it by `@id`.
4. FAQ parity per page: ordered question list of the visible `<details>` equals the JSON-LD `FAQPage` questions; each answer's visible text equals the JSON-LD answer under `normalizeForParity`.
4b. FAQ uniqueness across pages (the point of the split): (i) the seven old question strings Q01-Q07 (hard-coded in `verify.mjs` as an independent oracle, compared under the plain-JS `normalizeForParity` regex) each appear as a visible FAQ question on exactly one page, and on the page the Content Map assigns (Q01, Q02, Q03, Q05 on `/services/caravan-service/`; Q04 on `/services/recoveries/`; Q06 on `/services/solar-electrical/`; Q07 on `/find-us/`); (ii) across all pages, no two FAQ answers share an identical sentence: split every visible answer on `[.!?]`, normalise each piece, ignore pieces under 20 normalised characters, and FAIL if any piece occurs on two different pages (the same page may repeat nothing either); (iii) no FAQ answer text is identical across pages under `normalizeForParity`.
5. Hours (independent oracle, deliberately not imported from `business.ts`): no `17:00`, `Mon-Fri 08`, `Mon–Fri` in `dist`; the Home ticker contains exactly `Mon–Thu 08:00–16:00 · Fri 08:00–14:00`; Find us and Home location strip contain `08:00 to 16:00` and `08:00 to 14:00`; Find us FAQ Q07 contains `Monday to Thursday 08:00 to 16:00 and Friday 08:00 to 14:00`. These literals are the Google-profile facts the owner decided, so a typo in `business.ts` fails here.
6. Prices: scanning only visible text nodes and the string values of parsed JSON-LD (never attribute values such as the URL-encoded `wa.me` hrefs, which contain `R1%20499`, and never `/_astro/` asset file names), every amount matched by `R\d+(?: \d{3})*` (so a trailing space or the ` - ` in the Home JSON-LD `priceRange` `R949 - R2 299` is never swallowed: it yields 949 and 2299) belongs to {949, 1499, 2299, 1980, 850, 1200} and is space-grouped (`R1 499`): the matched text with its spaces removed is parsed for set membership, and a parsed amount of 1000 or more whose matched text contains no space group FAILs (`R2299` FAILs, `R2 299` passes); the Home JSON-LD `priceRange` equals exactly `R949 - R2 299`.
7. Internal links: every `href` starting with `/` (excluding `/shop/`, which is another app) resolves to a file in `dist/`; every `#fragment` target exists in the destination page; every `LEGACY_HASH_MAP` target resolves the same way.
8. Images: every `<img>` has non-empty `alt`; no `<img>` without `width` and `height`.
9. Home word count of `<main>` is within 450-750; no page contains an em dash.
10. Sitemap lists exactly the 7 routes; robots references `sitemap-index.xml`.
11. Reviews guard: if `REVIEWS` has no `approved` entry, Home has no `<blockquote>`.
**Required Checks:** `cd web && npm run build && npm run verify` => final line `verify: all checks passed`; mutate-test once by temporarily inserting `17:00` into a content file and confirming `verify` and `guard` FAIL, then revert; mutate-test check 4b once by copying one Repairs FAQ answer sentence into the Solar FAQ and confirming `verify` FAILs, then revert.
**Exit Criteria:** passes on a clean build; fails on the mutation. **Checkpoint Type:** none. **Validation:** Deterministic. **Test seam:** integration.
**Plain-JS constraint:** `verify.mjs`, `guard.mjs` and `browser-check.mjs` cannot import `.ts` modules (extensionless TS imports do not resolve under plain Node). So `browser-check.mjs` hard-codes its own seven routes (its `PAGES` default, see P1-G) and the `https://wa.me/27833349357` prefix as independent oracles, and imports no `routes.ts`, `business.ts` or `pricing.ts`. And `verify.mjs` (a) reads the legacy map from `web/src/data/legacy-hash-map.json` (the single JSON file `legacy-hash.ts` also imports), (b) re-implements the one-line `normalizeForParity` regex (`s.toLowerCase().replace(/[^a-z0-9]+/g,'')`), and (c) hard-codes the expected seven routes as an independent oracle taken from design success criterion 2.
**Consumes:** `dist/` layout, `web/src/data/legacy-hash-map.json`. **Produces:** `scripts/verify.mjs`, npm script `verify`.

**Phase 2 Exit Criteria:** `cd web && npm run ci` => exit 0; `npx vitest run` shows all suites green; `node scripts/browser-check.mjs` with the container rebuilt (`DOCKER_BUILDKIT=1 docker build -t nk-web:test web` and rerun the P1-F `docker run`) passes for all 7 pages at 4 widths; browser check also asserts `/#pricing` ends at `/services/caravan-service/#pricing` and `/#contact` at `/find-us/`; each of the ten `deploy.sh` health-loop paths (`/ /robots.txt /sitemap.xml /sitemap-index.xml /services/recoveries/ /find-us/ /services/caravan-service/ /services/repairs/ /services/solar-electrical/ /services/lift-kits/`) returns `200` from the container (`for p in ...; do curl -s -o /dev/null -w '%{http_code}\n' $BASE$p; done` => ten `200`). The container is stopped and its image removed afterwards (`docker stop nk-web-test; docker image rm nk-web:test`).

---

# PHASE 3: Full verification matrix, critique fixes, PR

**phase id:** P3. **Autonomy:** AFK except P3-D (HITL, `external-access`).
**Objective:** Run the design's whole testing strategy, fix review findings, prove the arm64 path, open the PR.
**Depends on:** P2. **Enables:** owner decision to deploy (outside this plan).
**Allowed scope:** fixes surfaced by the matrix and reviews, `README.md`, PR creation. **Out-of-scope drift:** deploy, merge, Cloudflare, `site/` deletion, new features.
**test_seams:** unit, integration, E2E (all three).
**Validation level:** Deterministic, plus Manual (reviews) and Live-lite (Pi build, no traffic).

### P3-A: Full matrix
Run in this order and record outputs in the PR body:
1. `cd web && npm run check` => `astro check` 0 errors, 0 warnings that are not pre-existing; `guard: ok`.
2. `npx vitest run` => all suites pass (whatsapp, hours, pricing, faq, schema, services, estimator, legacy-hash, business); `pgrep -f vitest || echo Clean`.
3. `npm run build && npm run verify` => `verify: all checks passed`.
4. Container: rebuild with `DOCKER_BUILDKIT=1 docker build -t nk-web:test web`, run with the production `docker/nginx.conf` (the P1-F `docker run` block), execute all 16 rows of the P1-F table (row 14 clause (b), gzip on a real `/_astro/*.js`, must now find a script: an empty `$JS` is a FAIL here; row 15 is the compose parity row, row 16 the deploy.sh health-loop line) plus: every one of the 7 pages `200`; `/sitemap-main.xml` `301`; `docker exec nk-web-test nginx -t`; and the compose build parity step from P1-F. Leave the container running for step 5.
5. `BASE=http://localhost:18260 npm run browser` => PASS for 7 pages x 4 widths (overflow, CTA visible and >= 44 px, tab-walk outlines, weight under 250 KB excluding the map iframe, screenshots to `/tmp/nk-shots/`), plus the JS-disabled pass and the legacy-hash redirects.
6. Link check: `verify.mjs` internal links (already in step 3) plus an external-URL syntax check of every `https://` href (no network); and one manual confirmation that `https://wa.me/27833349357` and the Google profile and Facebook links open.
7. JSON-LD and FAQ parity: covered by `verify` checks 3 and 4; additionally paste Home, one service page and Find us into Google's Rich Results Test or the Schema.org validator by hand and record the outcome (Manual).
8. Weight check summary: print the per-page transferred KB table from step 5.
9. Cleanup after step 8 (and after any matrix re-run): `docker stop nk-web-test; docker image rm nk-web:test`; `docker ps -a --format '{{.Names}}' | grep -c '^nk-web-test$'` => `0`.
**Exit Criteria:** every step passes. Failures are fixed in the owning task's files and the whole matrix re-run from step 1. **Checkpoint Type:** none.
**Consumes:** `npm run ci`, `browser-check.mjs`, the P1-F curl table. **Produces:** matrix results for the PR body.

### P3-B: `impeccable` and `good-ux` review and fixes
**Objective:** Full-site review (the Phase 1 pass covered only Home and Recoveries).
**Method:** `Skill(impeccable)` critique across the seven pages and four widths using the screenshots, then `Skill(good-ux)` on flows (header CTA at 320, FAQ states, estimator states, no-JS fallback, 404, legacy hash arrival, dead-end checks). Focus areas known from the old page: contrast of low-emphasis text (keep `--paper-low` at alpha 0.58 or higher), 44 px targets on every control, focus ring coverage, quicknav wrapping, iframe fallbacks, ticker motion.
**Exit Criteria:** each finding is fixed, or rejected with a reason in the PR body; after fixes re-run P3-A step 1-5. **Checkpoint Type:** none. **Validation:** Manual + Deterministic re-run.

### P3-C: Docs
**Files (modify):** `README.md` (replace the stale "Syne + Archivo + JetBrains Mono, no build step" stack and layout sections with the `web/` build, `npm run ci`, local preview via `docker compose up --build`, the new nginx and compose files, "Hours live in `web/src/data/business.ts` and prices in `web/src/data/pricing.ts` (`web/src/lib/estimator.ts` only computes totals)", service names and blurbs in `web/src/data/services.ts`), plus a **Rollback** section: "nginx config, security-headers snippet, compose file and deploy.sh are a coupled set and roll back together: `git revert -m 1 <merge-sha>` of the whole PR merge commit (or `git revert <sha>` for a squash merge), then on the Pi `git pull --ff-only` followed by `./deploy.sh` (pull first: the script replaces itself during its own pull). Never revert only the compose file and deploy.sh. `site/` stays in the repo until parity is accepted, so the revert restores a working stack." `docs/plans/` design and this plan are included in the PR. **Exit Criteria:** README commands run as written. **Validation:** Deterministic (run them).

### P3-D: arm64 proof on DockPi (HITL, `external-access`, owner-run or owner-authorised)
**Why HITL:** access is `root@dockpi`, and the Pi is the shared production host. Nothing here deploys. This step can be pulled forward to the end of Phase 1 if the owner says so.
**Builder (why `DOCKER_BUILDKIT=1`):** Docker 20.10 defaults plain `docker build` to the legacy builder, which does not honour `# syntax=docker/dockerfile:1` or `FROM --platform=$BUILDPLATFORM`. The real deploy path (`docker compose up --build`, Compose v5) builds under BuildKit, so the smoke build sets `DOCKER_BUILDKIT=1` to exercise the same builder on the same Dockerfile. Do NOT use `docker compose build` with the repo `docker-compose.yml` here: its `image: noordkaravane-web:latest` would create the production tag on the shared Pi. (The compose build path is proven on the laptop, P1-F compose build parity.)
**Precheck:** `ssh root@dockpi 'free -m; df -h /home; docker ps --format "{{.Names}}" | wc -l'` and confirm no storefront or backend build is running (one Node build at a time).
**Run (scratch copy synced from the laptop, so the branch need not be pushed; never `/home/voogiepi/docker/noordkaravane`, never `compose up` there):**
```
ssh root@dockpi 'rm -rf /tmp/nk-web-smoke && mkdir -p /tmp/nk-web-smoke'
rsync -a --exclude node_modules --exclude dist --exclude .astro web docker root@dockpi:/tmp/nk-web-smoke/
ssh root@dockpi 'cd /tmp/nk-web-smoke && { while :; do free -m | sed -n 2p; sleep 5; done > /tmp/nk-build-mem.log & MEMPID=$!; DOCKER_API_VERSION=1.41 DOCKER_BUILDKIT=1 docker build -t nk-web-test web; kill $MEMPID; }'
ssh root@dockpi 'cd /tmp/nk-web-smoke && DOCKER_API_VERSION=1.41 docker run -d --rm --name nk-web-smoke -p 18260:80 \
  -v $PWD/docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  -v $PWD/docker/security-headers.conf:/etc/nginx/snippets/security-headers.conf:ro nk-web-test'
```
Then run rows 1-14 of the P1-F curl table (rows 15-16 are repo-file checks, laptop only) against `http://<dockpi-ip>:18260` (ports: confirm 18260 is free first), plus `docker image inspect nk-web-test --format '{{.Architecture}}'` => `arm64`.
**Expected:** build exits 0 and its progress output is BuildKit style (lines such as `#1 [internal] load build definition from Dockerfile`; legacy output prints `Step 1/9` instead, which is a FAIL of the setup, not of the project); sharp resolves its musl-arm64 prebuilt and `npm ci` needs no `python3 make g++`; `docker exec nk-web-smoke nginx -t` ok; curl rows pass; `dmesg | grep -ci oom` unchanged; lowest `available` memory in `/tmp/nk-build-mem.log` stays above 2000 MB; build wall time under 6 minutes.
**Cleanup:** `docker stop nk-web-smoke; docker image rm nk-web-test; rm -rf /tmp/nk-web-smoke /tmp/nk-build-mem.log`.
**amd64 laptop versus Pi:** Day-to-day iteration and every automated check run on the amd64 laptop (faster, `dist/` is architecture independent, only sharp's native binary differs). The Pi proves two things only: sharp's musl-arm64 prebuilt installs, and the build fits in memory next to ~80 containers. If the Pi build fails, in this order: (1) re-check the lockfile greps from P1-A; (2) lower `NODE_OPTIONS` heap or set `SHARP_CONCURRENCY=1` as a build `ENV`; (3) contingency that needs no code change: the Dockerfile already uses `FROM --platform=$BUILDPLATFORM`, so cross-build on the laptop with `docker buildx build --platform linux/arm64 -t noordkaravane-web:latest --load web`, ship with `docker save noordkaravane-web:latest | ssh root@dockpi docker load`, and run compose without `--build` (`buildx` is BuildKit by definition, so no `DOCKER_BUILDKIT` setting is needed there). Record whichever path worked in the PR.
**Exit Criteria:** a recorded outcome (pass, or failed with the contingency verified by `docker image inspect` on the laptop-built arm64 image). **Checkpoint Type:** `human_action` (owner provides or authorises SSH). **Validation:** Live-lite.

### P3-E: PR (no merge, no deploy)
**Steps:**
1. `git status` clean for `web/ docker/ docker-compose.yml deploy.sh README.md docs/plans`.
2. **`site/` stays in place (rollback precondition):** `git diff --stat main...HEAD -- site/ | wc -l` => `0` (the PR does not edit, delete or move anything under `site/`). If non-zero, FAIL and fix before pushing.
3. **Revert rehearsal (deterministic, local, scratch worktree, nothing pushed):** `git worktree add --detach /tmp/nk-revert-rehearsal main && cd /tmp/nk-revert-rehearsal && git merge --no-ff --no-edit feat/astro-site && git revert -m 1 --no-edit HEAD` then `git diff --stat main -- . | wc -l` => `0` (tree identical to `main` again, so `docker/nginx.conf`, `docker-compose.yml`, `deploy.sh` are the old ones and `docker/security-headers.conf` and `web/` are gone together) and `docker compose config --quiet; echo $?` => `0`; then `cd - && git worktree remove --force /tmp/nk-revert-rehearsal`. (`--detach` is mandatory: the merge and revert land on a detached HEAD and vanish with the worktree, so local `main` is never advanced. Scratch path under `/tmp` is deliberate; it is not the repo.)
4. `git push -u origin feat/astro-site`; `gh pr create --title "Astro multi-page site (web/)" --body-file <prepared body>`.
**PR body sections:** summary, what changed, screenshots location, verification matrix results (P3-A), review findings and dispositions (P3-B), Pi outcome (P3-D), Facts to Confirm, the revert rehearsal output (step 3), and:
- **Deploy checklist for the owner (not done here):** on DockPi run `git pull --ff-only` first, then `./deploy.sh` (same reason as in Rollback; on the first roll-forward the old script body would otherwise run `up` without `--build`, which still builds the missing image but should not be relied on), purge Cloudflare cache for `/` and `sitemap*.xml`, resubmit `sitemap-index.xml` in Search Console, confirm `/shop/` still routes to the shop, and only after parity is accepted, delete `site/` in a SEPARATE follow-up PR (never in this one).
- **Rollback (read before merging):** `docker/nginx.conf`, `docker/security-headers.conf`, `docker-compose.yml`, `deploy.sh` and `web/` are one coupled set. The new nginx config includes `/etc/nginx/snippets/security-headers.conf` (the old compose has no such mount, so nginx would not start), rewrites `/sitemap.xml` to `/sitemap-index.xml` and serves `/404.html` (the old `site/` has neither). Reverting only the compose file and `deploy.sh` therefore breaks the site. Rollback is ONE revert of the whole PR: merge with a merge commit and run `git revert -m 1 <merge-sha>` (if the PR is squash-merged instead, `git revert <squash-sha>`), then on the Pi run `git pull --ff-only` FIRST and then `./deploy.sh` (`deploy.sh` pulls itself; git replaces the file while bash keeps executing the old body, so after a rollback pull the already-running new body would probe `/sitemap-index.xml` and the service pages against the restored old site and exit 1 although the rollback worked; pulling first makes the script's own pull a no-op and the running body match the tree). Because this PR leaves `site/` untouched, the revert restores the old stack with no file recovery step. The same text is in `README.md`.
PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
**Exit Criteria:** PR URL recorded, state `OPEN`, `gh pr view --json mergeable,state` shows `OPEN`; no merge command run; steps 2 and 3 printed `0`, `0`, `0`; the PR body contains the "Rollback" and "Deploy checklist" sections (`gh pr view --json body --jq .body | grep -c 'git revert -m 1'` => at least `1`). **Checkpoint Type:** none (merge is the owner's). **Validation:** Deterministic.

---

## Functionality Flow Mapping
```
Flow: stressed owner needs a recovery (phone, one thumb)
1. Lands on Home or /services/recoveries/ at 390 px  -> test: browser-check overflow + CTA visible >= 44 px
2. Taps header "Book on WhatsApp"                    -> test: whatsapp.test.ts (URL) + browser href check (JS off too)
3. WhatsApp opens with the recovery message           -> test: waUrl verbatim old string; manual spot check
Error paths:
- JS disabled                                        -> test: browser-check no-JS pass
- Old bookmark #pricing                              -> test: legacy-hash.test.ts + browser redirect row
- Unknown URL                                        -> test: curl row 4 (404 page with CTA)

Flow: owner comparing a service price
1. Home hero "See packages from R949"               -> test: verify link check to /services/caravan-service/#pricing
2. Picks axle and add-ons in the estimator          -> test: estimator.test.ts worked totals
3. Sends the pre-filled estimate                    -> test: estimate().url equals waUrl(message)
Error paths:
- "Not sure" axle                                    -> test: estimator caveat test
- No JS                                              -> test: static price table + baked CTA href (browser no-JS pass)

Flow: search engine
1. Crawls sitemap.xml                                -> test: curl rows 5-6, verify sitemap check
2. Reads page JSON-LD                                -> test: schema.test.ts + verify checks 3-4
3. Merges with shop entity                           -> test: ORG_ID equality test
```

## Self-Review (plan cross-phase drift check)
- Every `Consumes` in P1-D, P1-E, P2-A..P2-E names an identifier defined under a `Produces` of an earlier task or under Durable Decisions (`BUSINESS`, `servicePath`, `SERVICE_SLUGS`, `ROUTES`, `ServiceSlug`, `SERVICES`, `SERVICE_LIST`, `serviceMeta`, `waUrl`, `WA_TEXT`, `formatHoursCompact`, `formatHoursLines`, `formatHoursProse`, `groupHours`, `hoursToSchema`, `FaqItem`, `faqPlainText`, `expandTokens`, `normalizeForParity`, `orgNode`, `orgRef`, `breadcrumbNode`, `faqNode`, `serviceNode`, `buildGraph`, `jsonLd`, `ORG_ID`, `priceRange`, `fmtR`, `estimate`, `Estimate`, `AXLE_OPTIONS`, `ADDONS`, `DEFAULT_AXLE`, `AxleId`, `AddonId`, `LEGACY_HASH_MAP`, `resolveLegacyHash`).
- Revision 3 forward reference removed, not deferred: the price constants and `fmtR` moved from P2-A (`estimator.ts`) to a Phase 1 module (`src/data/pricing.ts`, P1-B step 1c), so `expandTokens({price:*})` is fully implemented in P1-B (no throwing stub, no flip in P2-A) and `schema.ts` `priceRange()` is built in P1-B from the same `AXLE_OPTIONS`. Produced/Consumed chain: P1-B Produces `AxleId`, `AddonId`, `AXLE_OPTIONS`, `ADDONS`, `fmtR`, `priceRange`; P1-B `faq.ts`/`schema.ts`/`services.test.ts` and P1-E Home Consume them; P2-A (`estimator.ts`) and P2-B (`Estimator.astro`, `scripts/estimator.ts`, price cards) Consume them; P2-A Produces only `estimate`, `Estimate`, `DEFAULT_AXLE`, `LEGACY_HASH_MAP`, `resolveLegacyHash`. The unspaced-price guard needs no exemption for `pricing.ts` (bare numbers, no `R`-prefixed literal).
- Known deliberate dead links in Phase 1 are listed in the checkpoint; their card, footer and related text comes from `SERVICES`, never from `getEntry`, so no Phase 1 component depends on a collection entry that Phase 2 creates.
- Revision 2 drift re-check: `SERVICE_LIST`/`serviceMeta` are Produced in P1-B and Consumed in P1-D, P1-E and (test only) P2-A; `ServiceCard.astro` prop `slug: ServiceSlug` is Produced in P1-D and Consumed in P1-D `Service.astro`/Footer and P1-E; the `deploy.sh` health-loop line is spelled once in P1-F (Phase 1 form) and once in P2-C (final form), P2-C extends the P1-F string by appending ` /find-us/ /services/caravan-service/ /services/repairs/ /services/solar-electrical/ /services/lift-kits/` before `; do`; the container `nk-web-test` is Produced running by P1-F and cleaned up at the end of P1-G, then recreated and cleaned in the Phase 2 exit and P3-A step 9.
- Revision 3 spot check: no remaining text says the estimator owns `fmtR`, `AXLE_OPTIONS` or `ADDONS`, mentions a `{price:*}` stub, or schedules the tag-parity test in P2-A (stale sweep recorded in the amendment contract).
- Self-review: no cross-phase reference drift.

## Differences from agreement
1. nginx: `rewrite ^([^.]*[^/])$ $1/ permanent` plus `try_files $uri $uri/index.html =404`, `absolute_redirect off` and `error_page 403 =404`, instead of the design's `try_files` line alone. Reason: avoids duplicate slashless URLs, a 403 on bare directories, and `:80`/`:8260` leaking into redirects behind Traefik. The container curl matrix (rows 2 and 3) is the proof; if the rewrite misbehaves the fallback is `try_files $uri $uri/ =404` with the same `error_page` lines.
2. Caching: `/_astro/` gets `immutable` (it is hashed); `/assets/` drops `immutable` for `expires 7d` (stable names such as the OG image).
3. The security-header snippet needs a second bind mount in compose (`docker/security-headers.conf`).
4. Version pins stated explicitly: `astro ^5.18.2`, `typescript ^6.0.3`, `vitest ^3.2.7`; no direct `sharp`. Latest majors on npm (astro 7, typescript 7) are deliberately not used.
5. Dockerfile build stage is `FROM --platform=$BUILDPLATFORM node:22-alpine`, runtime stage `COPY`-only, so arm64 images can be cross-built without emulation.
6. FAQ source shape `{ q, a, list?, note? }` with `{hours}` and `{price:<id>}` tokens; visible copy wins over the old, differently worded JSON-LD text.
7. Pricing cards are static (no dead buttons without JS); the estimator carries the interaction.
8. The reviews slot renders only owner-approved genuine reviews, else a Google profile link card (design Decision 8, made concrete).
9. `/sitemap-main.xml` 301 to `/sitemap-0.xml` (listed as a recommended default).
10. Impeccable and good-ux run twice: findings-only at the Phase 1 checkpoint (as the design asks), fixes plus full-site pass in Phase 3 (as the task asks).
11. Extra modules not in the design tree: `src/data/pricing.ts` (the single owner of `AXLE_OPTIONS`, `ADDONS`, `fmtR`, `AxleId`, `AddonId`; the design placed estimator pricing math in `lib/estimator.ts`, which now only computes estimates; moved to Phase 1 so `{price:*}` tokens and the Home JSON-LD `priceRange` need no Phase 2 module), `src/data/routes.ts`, `src/data/reviews.ts`, `src/lib/hours.ts`, `src/lib/faq.ts`, `src/lib/legacy-hash.ts` (design listed `scripts/legacy-hash.ts`; the pure resolver lives in `lib/` so it can be unit tested, the map is a JSON file `src/data/legacy-hash-map.json` that `verify.mjs` can also read, and `src/scripts/legacy-hash.ts` only calls the resolver), plus components `Estimator`, `ProcessSteps`, `InspectionReport`, `LiftKitSpecs`, `TrustStrip`, `Reviews`, `KampiCard`.
12. `guard.mjs` also forbids U+2014, unspaced prices and any tracked `business*` file; `browser-check.mjs` is built in Phase 1 (not Phase 3) because Phase 1 must prove the header CTA contract.
13. Phase 1 deliberately contains links to Phase 2 pages that 404 until Phase 2.
14. The service-areas paragraph from the old page is kept once, on Find us (listed as a recommended default).
15. Extra module `src/data/services.ts` (`SERVICES`, `SERVICE_LIST`, `serviceMeta`) is the single metadata table for service name, blurb and price tag, used by Home cards, Footer, `hasOfferCatalog`, `related` cards; slugs still live only in `routes.ts`. Not in the design tree; added so Phase 1 renders all five services before four pages exist.
16. Rollback is defined as one revert of the whole PR (`git revert -m 1 <merge-sha>`), with `site/` untouched by the PR; the design said only "`site/` stays until parity is approved".
17. Old FAQ items Q01-Q07 each land on exactly one page; six short authored FAQ re-cuts (Repairs 2, Solar 1, Recoveries 1, Lift kits 2) restate existing old-page facts in new wording (listed in the Content Map). P2-E check 4b enforces uniqueness. Recoveries no longer has a "which countries" item.
18. Hand-run Docker builds set `DOCKER_BUILDKIT=1`; the Pi smoke build uses plain `docker build` with it (not `docker compose build`, which would create the production image tag on the shared Pi); local laptop proof also runs `docker compose build noordkaravane`.
19. Home and Find us JSON-LD `priceRange` is generated as `R949 - R2 299` (spaced thousands, same convention as every visible price) instead of the old page's typed `R949 - R2299`; the values are unchanged.
20. nginx `gzip_types` gains `text/javascript` (the one change to the otherwise kept `gzip_*` block), so bundled scripts are compressed; proven by P1-F row 14 clause (b).

## Recommended Defaults (unapproved, owner may veto)
- `/sitemap-main.xml` (the old index's child) answers 301 to `/sitemap-0.xml`.
- The old "Service Areas" paragraph survives as one paragraph on Find us; no area pages.

## Durability horizon
`business.ts`, `routes.ts`, `schema.ts`, `nginx.conf`: stable (architectural). `components.css` port: near-term-refactor (expect owner-driven tweaks after review). `reviews.ts`: session-only data that the owner fills. `browser-check.mjs`, `guard.mjs`, `verify.mjs`: stable tooling. `/tmp/nk-shots`: session-only.

## Plan Review Gate
Run `Skill(cc10x:plan-review-gate)` after save; revise this file in place on SPEC_GATE_FAIL (max 3 iterations).
