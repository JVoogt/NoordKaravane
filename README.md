# Noord Karavane

Landing site for **Noord Karavane**, a specialist caravan workshop in Pretoria North.
Live at [noordkaravane.co.za](https://noordkaravane.co.za).

The repo is public. Real business details (bank, VAT, registration number) never go in it:
they live in an untracked `business.json`, and only the placeholder file `config/business.example.json`
is committed (`.gitignore` blocks `**/business.json`, and `web/scripts/guard.mjs` fails on a tracked `business.json` under `web/` or `docker/`).

## Stack

- Static multi-page Astro site in `web/`: Home, five service pages and Find us (seven pages, plus a 404 page).
- Built inside a Docker image and served by `nginx:alpine` (config baked in, no bind mounts), behind Traefik on DockPi (`192.168.0.120:8260`).
- Cloudflare in front for DNS, edge cache and TLS.
- `site/` is the legacy single-file page. It stays in the repo until parity with the Astro site is accepted, because the legacy rollback restores it. Delete it only in a separate follow-up PR.

## Repo layout

```
.
├── web/                        # the Astro site (own package.json, Dockerfile)
│   ├── src/data/               # business.ts, pricing.ts, services.ts, routes.ts, reviews.ts, legacy-hash-map.json
│   ├── src/content/services/   # one markdown file per service page
│   ├── src/lib/                # tokens, FAQ, hours, JSON-LD, estimator, WhatsApp URL helpers (with unit tests)
│   ├── src/pages/              # index, find-us, 404, services/[slug]
│   └── scripts/                # guard.mjs, verify.mjs, browser-check.mjs, container-matrix.sh
├── docker/
│   ├── nginx.conf              # nginx server config (baked into the image)
│   └── security-headers.conf   # security header snippet (baked into the image)
├── docker-compose.yml          # builds and runs the web image
├── deploy.sh                   # candidate-first deploy, run on DockPi
├── config/business.example.json  # placeholder shape only, never real values
├── site/                       # legacy page, kept until parity
├── docs/plans/                 # design and plan for the Astro site
├── traefik-noordkaravane.yml   # Traefik dynamic route (lives on DockPi)
└── social-media-posts/         # standalone HTML templates for socials
```

## Where facts live

Never type hours, prices or contact details into a page. Change them once, at the source:

- Hours, address, phone, WhatsApp number, Google rating and similar business facts: `web/src/data/business.ts`.
- Prices (axle options and add-ons): `web/src/data/pricing.ts`. `web/src/lib/estimator.ts` only computes totals from them.
- Service names, blurbs and card tags: `web/src/data/services.ts`. Service slugs and paths: `web/src/data/routes.ts`.
- Approved Google reviews: `web/src/data/reviews.ts` (only entries with `approved: true` render).

`guard.mjs` and `verify.mjs` fail the build on stale hours, unspaced prices (write `R2 299`, not `R2299`), em dashes and the other forbidden strings.

## Content collection (service pages)

Each service page is a markdown file in `web/src/content/services/`, validated by `web/src/lib/content-schema.ts` (strict: an unknown frontmatter key fails the build).

- Required frontmatter: `title`, `description`, `h1`, `eyebrow`, `order`, `whatsappText`, `ctaLabel`, `schemaName`, `faq` (at least one item), `related`.
- Optional: `facts` (list of `k`/`v`), `priceFrom` (`amount`, `from`).
- `related`: at most three slugs, from the slug list only, no duplicates, never the page itself.
- FAQ items are `q`, `a`, optional `list` and `note`. Every string field supports two tokens, expanded at build time: `{hours}` (from `business.ts`) and `{price:<id>}` (an axle or add-on id from `pricing.ts`). An unknown token or id fails the build.
- The markdown body is prose only: no prices and no hours.
- One page per FAQ: each of the seven original questions appears on exactly one page, and no FAQ sentence (20+ characters) repeats across or within pages. `verify.mjs` check 4b enforces it. Visible FAQ text must also equal the FAQPage JSON-LD (check 4).

### Add or edit a service page

- Edit: change the markdown file, run `npm run ci` from `web/`.
- Add: append the slug to `SERVICE_SLUGS` in `web/src/data/routes.ts`, add its entry in `web/src/data/services.ts`, create `web/src/content/services/<slug>.md`, then update the independent route lists that deliberately do not import from `src`: `ROUTES` in `web/scripts/verify.mjs`, `DEFAULT_PAGES` in `web/scripts/browser-check.mjs`, and the probe list in `deploy.sh`. The checks fail until those agree.

## Local preview and checks

From `web/` (Node 22):

```bash
npm ci
npm run dev        # astro dev server
```

| Script | What it proves |
|---|---|
| `npm run check` | `astro check` type check, then `guard` |
| `npm test` | vitest unit tests (hours, FAQ tokens, JSON-LD, estimator, WhatsApp URLs, content schema, legacy hash map) |
| `npm run build` | static build to `web/dist` |
| `npm run guard` | forbidden strings and files in `src`, `scripts`, `public` |
| `npm run guard:dist` | the same scan on the built `dist` |
| `npm run verify` | dist integrity: page set, titles, canonical, JSON-LD, FAQ parity and uniqueness, hours, price allow-lists, internal links, images, sitemap, WhatsApp CTAs, render accidents |
| `npm run ci` | `check`, `test`, `build`, `guard:dist`, `verify` in order. The Docker build runs it too, so a failure stops the image. |
| `npm run browser` | headless Chromium (`web/scripts/browser-check.mjs`) against a running site: overflow, CTA size, focus outlines, page weight, JS-disabled pass, legacy hash redirects. Env: `BASE` (default `http://localhost:18260`), `PW_CHROMIUM`, `SHOTS_DIR`. |

Container matrix, against the real nginx image (curl only):

```bash
DOCKER_BUILDKIT=1 docker build --build-context nkdocker=docker -t nk-web:test web
docker run -d --rm --name nk-web-test -p 127.0.0.1:18260:80 nk-web:test
BASE=http://127.0.0.1:18260 bash web/scripts/container-matrix.sh        # full: redirects, headers, caching, gzip, 404
BASE=http://127.0.0.1:18260 bash web/scripts/container-matrix.sh --quick  # gating rows only, what deploy.sh runs
docker stop nk-web-test; docker image rm nk-web:test
```

Full-stack preview with the production compose file: `docker compose up --build` from the repo root, then open http://localhost:8260. Compose tags the image `noordkaravane-web:latest`, so do not run it on a machine where that tag matters.

## Deploying to DockPi

The container runs from a clone of this repo at `/home/voogiepi/docker/noordkaravane`. Run the deploy there, as the user who owns the clone:

```bash
ssh -i ~/.ssh/id_voogiepi voogiepi@192.168.0.120 'cd /home/voogiepi/docker/noordkaravane && ./deploy.sh'
```

`deploy.sh` is candidate-first:

1. Takes the deploy lock, runs `git pull --ff-only`, and re-runs the pulled copy of itself.
2. Preflight: refuses to start if a container with the live name exists outside this compose project. Builds the image under a candidate tag (`noordkaravane-web:cand-<sha>`). Type check, tests, guard, verify and `nginx -t` run inside the build. `:latest` does not move.
3. Starts the candidate as a throwaway container on `127.0.0.1:8261` (override with `NK_CANDIDATE_PORT`), then runs the page probes and `container-matrix.sh --quick` against it.
4. Only if the candidate passes: promotes the running image to `:prev`, retags the candidate as `:latest`, recreates the real container (port 8260) and probes it again.

Tag meaning: `:latest` is what compose runs. `:proven` is the image whose live probes passed after a swap. `:prev` is the manual rollback target: the previous image, set only when it differs from the new build and is the one behind `:proven`.

A failure before step 4 leaves the running site, `:latest` and `:prev` untouched. There is **no automated rollback**: if the swap fails or the new site is wrong, `deploy.sh` prints the commands and you run them by hand.

Port 8261 is the candidate port. Check it is free on the Pi before the first deploy (`ss -ltn | grep 8261`), or set `NK_CANDIDATE_PORT`.

### Manual rollback

Roll back BEFORE re-running `deploy.sh` (a re-run rebuilds and starts the same commit).

```bash
# web stack (Astro image running)
docker tag noordkaravane-web:prev noordkaravane-web:latest && docker compose up -d --force-recreate --no-deps --no-build noordkaravane

# legacy stack (the swap from the old nginx:alpine + ./site container failed)
git checkout <legacy-sha> -- docker-compose.yml docker/nginx.conf && docker compose up -d --force-recreate --no-build noordkaravane
```

`deploy.sh` works out `<legacy-sha>` itself and prints the filled-in line: it is the parent of the first commit that moved `docker-compose.yml` off `nginx:alpine`.

### First deploy of the Astro site (legacy to Astro)

The `deploy.sh` currently on the Pi is the old script (pull, recreate, no checks). So run the first Astro deploy by hand, so the new script is the one that runs:

```bash
cd /home/voogiepi/docker/noordkaravane
git pull --ff-only && ./deploy.sh
```

The legacy container keeps serving until the candidate passes, then it is swapped. Afterwards: purge the Cloudflare cache for `/` and `sitemap*.xml`, resubmit `sitemap-index.xml` in Search Console, and confirm the shop still routes at `/shop/`.

### Rolling back the merge itself

nginx config, security-headers snippet, compose file, `deploy.sh` and `web/` are one coupled set (the new nginx config includes a snippet the old compose does not mount, and serves a 404 page the old `site/` lacks). Never revert only some of them. Merge the PR with a merge commit and roll back with:

```bash
git revert -m 1 <merge-sha>      # a squash merge: git revert <sha>
git push
# then on the Pi:
git pull --ff-only && ./deploy.sh
```

Pull first: the script replaces itself during its own pull. `site/` is still in the repo, so the revert restores a working legacy stack.

## Not done: facts to confirm (owner)

Shipped as written, non-blocking, the owner may veto:

- "Recoveries 24/7" (owner claim carried over from the old page).
- "500+ caravans serviced".
- "Factory-trained on Jurgens, Sprite, Gypsey, Conqueror".
- Which two or three genuine Google reviews to quote (reviewer first name, date, profile link). Until then the reviews slot shows a Google profile link card.
- Turnaround and warranty claims: "most services done same or next day", "2-3 days for larger jobs", lift kit "~1 day" fit and "12 months" warranty on fitments.
- Google 5.0 from 24 reviews (stored with `asOf: 2026-11-06`).
- On-site service "for a call-out fee", and `paymentAccepted: Cash, Credit Card, EFT` in the JSON-LD.
- Pending work, not part of this change: Pi (arm64) build proof, the production deploy itself, and deleting `site/` after parity.

## Editing notes

- Images for the Astro site go in `web/src/assets/` (processed at build) or `web/public/assets/` (served as is). Files must be mode 644 before commit (`chmod 644`), or nginx cannot read them.
- Avoid em dashes in copy; use periods, commas or colons. The guard enforces it.
- WhatsApp links use `https://wa.me/27833349357?text=<encoded>`, built by `web/src/lib/whatsapp.ts`.

## Domain and DNS

- `noordkaravane.co.za` and `www.noordkaravane.co.za` go through Cloudflare to DockPi.
- Traefik route defined in
  `/home/voogiepi/docker/traefik/config/dynamic/noordkaravane.yml` on DockPi
  (also tracked here as `traefik-noordkaravane.yml` for reference).
- TLS via Let's Encrypt through Traefik.

## Online shop (in progress)

The shop (Astro storefront + Medusa backend) lives alongside the landing page in `storefront/`, `backend/`, `infra/`, `catalogue/`
and is served at noordkaravane.co.za/shop. It is independent of the landing site above. See `CONTRACTS.md` and `infra/RUNBOOK.md`.
