# Noord Karavane on DockPi: runbook

> **Noord Karavane specifics (read first)**
> - This shop stack is **separate from the live landing page**. The landing page is the nginx container `noordkaravane`
>   (repo root `docker-compose.yml`, clone at `/home/voogiepi/docker/noordkaravane`, Traefik file `noordkaravane.yml`, port 8260).
>   The shop uses project `nkshop`, dir `/home/voogiepi/docker/nkshop`, Traefik file `nkshop.yml`, ports 8550/8551
>   (staging 8552/8553). **Never `make route` into `noordkaravane.yml`, never sync into the `noordkaravane` dir.**
> - Ports 8550-8553 and the `nkshop` names were chosen without access to DockPi: run `ss -ltn` and `docker ps` there
>   and confirm they are free before the first `make up`.
> - The storefront is served under `https://noordkaravane.co.za/shop` (Astro `base: "/shop"`, phase 3).
> - Cloudflare: the zone already exists and serves the live site. Add only `api.` and `admin.` records, an Access app on
>   `admin.`, and cache rules for `/shop*`. Do NOT apply SR's automation scripts (removed on purpose).
> - Payment is EFT only. Payfast stays disabled (`PAYFAST_ENABLED=false`).
> - The same stack also runs the **Kampi Store** (`store.kampi.co.za`): container `nkshop-storefront-kampi`, port 8554
>   (`PORT_WEB_KAMPI`; staging 8555). 8554 was free when planned, but run `ss -ltn` on the Pi before its first `up`
>   and pick the next free port if it is taken. See "Kampi storefront" below.


Host: Raspberry Pi 5, 16 GB, arm64, Docker 20.10 + Compose v5, **every docker call prefixed `DOCKER_API_VERSION=1.41`** (the Makefile does it; do it by hand too).
Project dir on the Pi: `/home/voogiepi/docker/nkshop/` (compose and `.env` in `infra/`). Files owned by `voogiepi`.
Edge: Cloudflare -> home IP -> shared Traefik v3 (`/home/voogiepi/docker/traefik/config/dynamic/*.yml`, Let's Encrypt) -> host ports.

| Container | Host port | Limit |
|---|---|---|
| nkshop-storefront | 192.168.0.120:8550 | 384 MB |
| nkshop-storefront-kampi | `BIND_IP`:8554 (`PORT_WEB_KAMPI`) | 384 MB |
| nkshop-medusa-server | 192.168.0.120:8551 | 768 MB |
| nkshop-medusa-worker | none | 512 MB |
| nkshop-postgres | none (internal net) | 512 MB |
| nkshop-redis | none (internal net) | 192 MB |
| nkshop-pgdump | none | 32 MB |
| nkshop-migrate (one-shot) | none | 768 MB, only while it runs |

Running total is 2784 MB (2400 MB before the Kampi storefront). Staging (8552/8553) is about 1.5 GB more if started, so keep it stopped when not in use.

Run all `make` commands from `infra/` on the laptop (`make -C infra ...`). Port check on 2026-11-03: 8550 to 8553 were free on the Pi (8530 is kampi-mail).

## What Redis is doing (so nobody "optimises" it later)

All Medusa Redis modules (event bus/BullMQ, workflow engine, cache, locking) share one Redis. It runs `maxmemory 160mb` with **`noeviction`** and AOF (`everysec`). `allkeys-lru` would be right for a pure cache, but here it could evict queued jobs or in-flight workflow state, silently losing emails or half-completed checkouts. `noeviction` fails loudly instead, and AOF means queued work survives a Pi reboot. If you ever want an evicting cache, split it onto a second Redis.

## Before you start: storefront owner notes (things the infra assumes)

1. `backend/` builds with `medusa build` and runs from `.medusa/server` (`infra/docker/backend.Dockerfile`). Seeding runs the compiled script `./src/scripts/seed.js` there. If you add `backend/Dockerfile`, set `BACKEND_DOCKERFILE=Dockerfile` in `.env`.
2. `storefront/` must be Astro with `@astrojs/node` in `standalone` mode (entry `./dist/server/entry.mjs`), listen on `HOST`/`PORT`, and has a `package.json` build script `build`. `infra/docker/storefront.Dockerfile` copies `config/business.json` to `/config/business.json` (so `../config/business.json` resolves for code in `/app`).
3. `PUBLIC_*` variables are inlined at build time: change them and you must rebuild the storefront image.
4. The storefront should send `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` on anonymous HTML, and `private, no-store` on `/cart`, `/checkout`, `/account`, `/order/*`. Cloudflare relies on it (the Cloudflare dashboard section 4).
5. The Medusa admin bundle bakes its API base URL at build time. The Dockerfile sets it to `https://admin.noordkaravane.co.za` (build arg `ADMIN_BACKEND_URL`) while runtime `MEDUSA_BACKEND_URL` stays the `api.` host. If the admin cannot log in after the first deploy, check the browser network tab: if it is calling `api.noordkaravane.co.za/admin/...`, the build arg did not take; fix it in `backend/medusa-config.ts` (`admin.backendUrl`) rather than opening `/admin` on the `api.` host.
6. The docker-compose healthchecks use `GET /health` on Medusa (server and worker) and a TCP connect on the storefront. Verify the worker really answers `/health` in worker mode; if it shows `unhealthy` while jobs run fine, change that one healthcheck to a process check.

## First deploy (step by step)

### 0. Pre-flight
```bash
ssh dockpi 'free -h; df -h /home; ss -ltn | grep -E ":854[0-3]" || echo "ports 8550-8553 free"'
```
Save the `free -h` output: you compare against it in step 9.

### 1. Sync the code
```bash
make -C infra sync        # rsync repo -> /home/voogiepi/docker/nkshop/, then chown -R voogiepi:voogiepi
make -C infra env-init    # creates infra/.env (chmod 600) from .env.example if missing
```

### 2. Fill in `.env` on the Pi
```bash
ssh dockpi
cd /home/voogiepi/docker/nkshop/infra
nano .env
# secrets (hex, so no quoting problems):
openssl rand -hex 32     # JWT_SECRET, COOKIE_SECRET (different values)
openssl rand -hex 24     # POSTGRES_PASSWORD, REDIS_PASSWORD
ls -l .env               # must be -rw------- voogiepi voogiepi
```
Leave `PUBLIC_MEDUSA_PUBLISHABLE_KEY` empty for now. Leave S3/SMTP/CF/Meta/Turnstile blank until those accounts exist; the backend runs without them (local file storage, no email, no purge). Set at least the Brevo SMTP before taking real orders.

### 3. Build the backend image on the Pi
```bash
make -C infra build-backend
```
Expect this to take a while on a Pi 5 (`npm install` plus `medusa build` including the admin bundle): plan for 10 to 25 minutes the first time, with 1 to 2 GB of RAM used. I have not measured it. Do not start a second build at the same time. If it is killed with exit 137 it ran out of memory: stop non-essential containers or lower `NODE_OPTIONS` in the Dockerfile and retry.

### 4. Migrate, seed, create the admin user
```bash
make -C infra migrate                              # starts postgres+redis (healthy), runs medusa db:migrate
make -C infra seed                                 # region, shipping, collections, products from catalogue/products.json
make -C infra create-admin-user EMAIL=owner@example.com   # prompts for the password on the Pi
```

### 5. Get the publishable key, then build the storefront
```bash
make -C infra publishable-key     # prints pk_... from the api_key table
```
(or Admin > Settings > Publishable API Keys once the admin is reachable.) Put the `pk_...` value in `.env` as `PUBLIC_MEDUSA_PUBLISHABLE_KEY`, plus `PUBLIC_GA4_ID`, `PUBLIC_META_PIXEL_ID`, `PUBLIC_TURNSTILE_SITE_KEY` if you have them, then:
```bash
make -C infra build-storefront
```

### 6. Start everything and test on the LAN
```bash
make -C infra up
make -C infra ps                # all healthy; migrate shows "exited (0)"
curl -fsS http://192.168.0.120:8551/health
curl -fsSI http://192.168.0.120:8550/ | head -1
```

### 7. Cloudflare Access first, then the Traefik route, then DNS
1. In Cloudflare (configure in the Cloudflare dashboard): zone active, SSL Full (strict), **Access app for `admin.` created**, WAF ACME-skip rule, cache rules.
2. Install the route (Traefik reloads on its own):
```bash
make -C infra route          # backs up any existing nkshop.yml, installs traefik/nkshop.yml.example
ssh dockpi 'docker logs --tail 50 traefik 2>&1 | grep -iE "nkshop|error" || true'
```
3. Add the DNS records: apex, www, api, admin, all proxied, same origin IP the other DockPi domains use.

### 8. Verify certs and the site
```bash
curl -sI https://noordkaravane.co.za | head -5              # 200, content-security-policy present
curl -sI https://www.noordkaravane.co.za | grep -i location  # 301 -> https://noordkaravane.co.za/
curl -s  https://api.noordkaravane.co.za/health
curl -sI https://api.noordkaravane.co.za/admin/users | head -1   # 404 (not routed on api.)
curl -sI https://admin.noordkaravane.co.za/app | head -3     # Cloudflare Access login redirect
echo | openssl s_client -connect noordkaravane.co.za:443 -servername noordkaravane.co.za 2>/dev/null | openssl x509 -noout -issuer -dates   # Let's Encrypt via Cloudflare edge
ssh dockpi 'docker logs traefik 2>&1 | grep -i "acme\|certificate" | tail'
```
Through the orange cloud `openssl` shows Cloudflare's edge cert, not Let's Encrypt. To prove the origin cert, test with Cloudflare out of the way: `curl -sI --resolve noordkaravane.co.za:443:<home-ip> https://noordkaravane.co.za` (valid LE cert, Full strict will work). If issuance fails: grey-cloud the record, retry, re-enable.

Smoke test: browse a product, add to cart, run an EFT checkout, confirm the order email arrives (Brevo), log in to `admin.` (Access, then Medusa), mark the payment captured, confirm the "paid" email, fetch `https://api.noordkaravane.co.za/feeds/meta.xml`, save a product and check the CF purge.

### 9. Memory budget check
```bash
ssh dockpi free -h                      # compare with step 0
make -C infra free                           # docker stats --no-stream for nkshop-* containers
```
Expected: about 1.5 to 2.2 GB more "used" at idle; "available" must stay above ~2 GB. If it does not, lower the Node heaps (`MEDUSA_NODE_OPTIONS`, `STOREFRONT_NODE_OPTIONS`) or Postgres `shared_buffers`. The Pi already uses swap (1.2 of 2 GB at the time of writing); watch `si/so` in `vmstat 5`.

### 10. Dump check
```bash
make -C infra pgdump-now        # writes infra/backups/nkshop-<timestamp>.dump and lists the folder
```

## Redeploy
`HOST` defaults to the ssh alias `dockpi` (`root@dockpi` does not resolve). Every `build*` target and `staging-build` runs `sync` first, and `sync` copies the checkout you run it from into the **production** tree on the Pi (`rsync --delete`). So run them only from a merged checkout (a clean deploy worktree of `main`), never from a feature branch. Run `make -C infra sync-check` first: it changes nothing and prints only the files `sync` would delete on the Pi. The exclude list keeps the Pi-only files (both `business.json` copies, `.env*`, backups, `/infra/cloudflare/`, any `*.bak*` file, `/web/.impeccable/`, and a worktree's `.git` file via `--exclude='/.git'`); `sync` refuses to run from a worktree if that last exclude is ever removed. Read every `*deleting` line before you sync.

`:prev` check around a build: record the image ids first (`ssh dockpi 'DOCKER_API_VERSION=1.41 docker image inspect --format "{{.Id}}" nkshop-backend:latest nkshop-storefront:latest'`). After the build, `docker image inspect --format "{{.Id}}" nkshop-<image>:prev` must equal the recorded id; if it does not (two builds in a row), `docker tag <recorded id> nkshop-<image>:prev` by hand.
```bash
make -C infra pgdump-now        # restore point BEFORE any deploy (migrations are not reversible)
ssh dockpi free -h
make -C infra sync-check        # what sync would delete on the Pi (must be nothing Pi-only)
make -C infra build             # sync + tag :prev + build all three images as :<git-sha> and :latest
make -C infra up                # migrate runs first, then server/worker/storefront are recreated
make -C infra ps && make -C infra logs S=medusa-server
```
Storefront-only change: `make -C infra build-storefront && make -C infra up`. Backend-only: `build-backend`. The `up` only recreates containers whose image changed.
Tidy old images now and then: `ssh dockpi "DOCKER_API_VERSION=1.41 docker images 'nkshop-*'"`, then `docker rmi nkshop-backend:<old-sha>`. Never run a blanket `docker system prune` on this host.

## Rollback
```bash
make -C infra rollback      # retags nkshop-*:prev -> :latest, recreates migrate/server/worker/storefront
```
The Kampi storefront is rolled back too when `nkshop-storefront-kampi:prev` exists; its first deploy has none, and that never blocks NK's rollback.
`:prev` is whatever `:latest` was before the last `make build`. Building twice in a row without deploying makes `:prev` an undeployed image: check `docker images` and tag by hand if needed: `docker tag nkshop-backend:<sha> nkshop-backend:latest`.
**Database**: Medusa has no down-migrations. If the bad release ran a migration that the old code cannot handle, restore the pre-deploy dump (below) after rolling the images back. Note the `migrate` job runs on every `up`, including during rollback; it is a no-op when the schema is already current, and the old code will normally tolerate a newer schema only if the migration was additive.

## Restore from a pg_dump
```bash
ssh dockpi 'ls -lht /home/voogiepi/docker/nkshop/infra/backups'
make -C infra restore DUMP=backups/nkshop-20261103-0130.dump
```
The script asks you to type `restore`, stops server/worker/storefront, drops and recreates the database, `pg_restore`s the dump, flushes Redis (queued jobs referred to the old state), and brings everything back up (the migrate job then applies any newer migrations). Afterwards check admin login and a recent order.
To restore into staging instead (a good dry run, and the real test that your backups work): copy the file into `infra/backups-staging/` and `make -C infra staging-restore DUMP=backups-staging/<file>.dump`.
If the Pi itself is lost: reinstall Docker, restore `/home/voogiepi/docker/nkshop` from the central backup (below), then `make build`, `up`, `route`, and restore the latest dump.

## How backups fit together
- `nkshop-pgdump` writes `infra/backups/nkshop-YYYYmmdd-HHMM.dump` (`pg_dump -Fc`) daily at **01:30** (`PGDUMP_AT`) and keeps the newest 7 (`PGDUMP_KEEP`). It also dumps at container start if the newest dump is older than 24 h. It checks the archive is readable and touches `backups/.last_success`; the container healthcheck turns `unhealthy` if that is older than 26 h.
- The central `dockpi-backup` container (cron `0 2 * * *`) tars `/home/voogiepi/docker/**` and `/var/lib/docker/volumes/**` to Azure Blob (30-day retention). So `infra/backups/` is picked up at 02:00, after the 01:30 dump. The raw Postgres volume in `/var/lib/docker/volumes` is also copied but may be inconsistent mid-write: restore from the `.dump`, not from the volume.
- The central backup also copies `infra/.env` (all secrets) to Azure. That is the existing arrangement for every project on the host.
- Product images live in R2 (not on the Pi). R2 has no versioning by default: enable object versioning/lifecycle or periodically sync the bucket if the images matter more than the originals the owner keeps.
- Test a restore into staging at least once before launch and then quarterly.

## Secrets rotation
Always: edit `infra/.env` on the Pi (`chmod 600`), then `make -C infra up` (compose recreates only affected containers).
- `JWT_SECRET` / `COOKIE_SECRET`: replace, `make up`. All sessions and admin logins are invalidated.
- `POSTGRES_PASSWORD`: the DB keeps the old one until changed. `docker compose exec postgres psql -U medusa -c "ALTER USER medusa PASSWORD 'newvalue'"`, then update `.env` and `make up` (server, worker, pgdump reconnect).
- `REDIS_PASSWORD`: edit `.env`, `docker compose up -d --force-recreate redis medusa-server medusa-worker`.
- R2 keys: create a new token in Cloudflare, update `.env`, `make up`, then delete the old token.
- Brevo SMTP key, Turnstile secret, Meta CAPI token, Payfast passphrase, `CF_API_TOKEN`: create the new one at the provider, update `.env`, `make up`, revoke the old. Turnstile site key and other `PUBLIC_*` are build-time: rebuild the storefront.
- Cloudflare Access: review allowed emails when anyone leaves.
Rotate immediately if `.env` is ever pasted anywhere or the Azure backup account is exposed.

## Kampi storefront
`store.kampi.co.za` is the same storefront code built with `BRAND=kampi` (base `/`, Kampi look), selling NK's catalogue through the Kampi sales channel. Compose service `storefront-kampi`, container `nkshop-storefront-kampi`, image `nkshop-storefront-kampi:<sha>|latest|prev`, port `PORT_WEB_KAMPI` (default 8554). Contracts, config schema and the env mapping: `CONTRACTS.md`, "Kampi storefront".

**BRAND is a build arg, never runtime.** Compose passes `BRAND: kampi`; the Dockerfile defaults to `nk`, so a build that loses the arg silently produces the NK store. `make build` and `make build-storefront-kampi` read the image label `org.noordkaravane.storefront.brand` back and fail unless it says `kampi`. Check by hand with `docker image inspect -f '{{index .Config.Labels "org.noordkaravane.storefront.brand"}}' nkshop-storefront-kampi:latest`. A hand build outside compose needs `--build-context config=../config --build-arg BRAND=kampi` (the guard reads `config/business.example.json` from that context; `infra/docker/storefront.Dockerfile` also copies `config/business.json`). `docker exec nkshop-storefront-kampi printenv BRAND` prints nothing, and that is correct.

### First deploy (after the PR is merged, from a deploy worktree of `main`)
```bash
ssh dockpi 'ss -ltn | grep -E ":855[45]\b" || echo "8554/8555 free"'   # else set PORT_WEB_KAMPI to a free port
make -C infra pgdump-now
make -C infra sync-check && make -C infra sync
make -C infra build-backend      # then: docker compose up -d migrate medusa-server medusa-worker (named services only)
make -C infra kampi-channel      # prints KAMPI_SALES_CHANNEL_ID, KAMPI_PUBLISHABLE_KEY and a kampi-channel {...} summary
```
1. **Config.** Back up and edit both `business.json` copies (`config/` and `backend/src/config/`) with the real `brands.kampi` block: `sales_channel_ids` = [the printed id], `name`, `shop_url`, `logo_url`, `palette`, `from_name`, and the optional display keys you have. **Leave an optional key out** rather than setting it to `""`. `python3 -m json.tool` on both, then `docker compose restart medusa-server medusa-worker`.
2. **Positive probe** (a quiet log proves nothing: the config is read lazily). In both containers:
   ```bash
   for c in nkshop-medusa-server nkshop-medusa-worker; do
     DOCKER_API_VERSION=1.41 docker exec -w /app "$c" node -e 'const b=require("./src/lib/business.js");const id=process.argv[1];console.log(JSON.stringify({kampi_valid:b.kampiBrandConfig() !== null,brand:b.brandFor(id).key,has_id:b.kampiChannelIds().includes(id)}))' "<sales channel id>"
   done
   ```
   Both must print `{"kampi_valid":true,"brand":"kampi","has_id":true}`, or stop and fix the block.
3. **`.env`** (back up, keep `chmod 600`): `STORE_CORS` += `,https://store.kampi.co.za`; `KAMPI_PUBLIC_MEDUSA_PUBLISHABLE_KEY` = the printed key; the other `KAMPI_*` keys as `.env.example` describes. Recreate `medusa-server` (`docker compose up -d medusa-server`; a restart does not re-read `.env`).
4. `make -C infra build-storefront-kampi` (the brand check runs inside it), then `make -C infra up` and `make -C infra ps`. Build the Kampi image before the first `up`: otherwise `up` would build it itself, without the brand check.
5. LAN checks: `curl -s http://<BIND_IP>:8554/healthz`; `/` answers 200 and contains `Kampi Store`. Scripted POSTs from the LAN get 403 from Astro's origin check (the LAN host is not in `security.allowedDomains`); test forms through the real hostname.

### Preview on the real hostname, then the switch (homelab runbook, never `make route`)
- Template: `infra/traefik/kampi-store.yml.example`, installed by hand as `kampi-store.yml` in the Traefik dynamic dir (owner `voogiepi`, mode 644). Replace `REPLACE_WITH_PI_LAN_IP` and `REPLACE_WITH_TOKEN` on the Pi only. Before installing, no file in the dynamic dir may already use a `kampi-store` name.
- Preview phase (as shipped): router `kampi-store-preview` (priority 300) matches only a request whose `Cookie` header holds `kampi_preview=<token>`; everyone else still reaches the old store through `kampi-shop.yml`. Set the cookie for `store.kampi.co.za` in the browser to test.
- Switch: delete the `PREVIEW ROUTER` block and strip the `#S ` prefixes (the template header has the `sed` line). The three public routers (priority 200) then win over `kampi-shop.yml`; `shop.kampi.co.za` answers 301 to `store.kampi.co.za`. Move `kampi-shop.yml` into `dynamic-archive/` as `kampi-shop.yml.pre-nk-cutover-<YYYYMMDD>`.
- Route rollback: copy the archived `kampi-shop.yml` back into the dynamic dir (start the old store if it was stopped), then move `kampi-store.yml` out. Traefik reloads by itself; check `docker logs --since 2m traefik`.

### Redeploy and rollback
- Kampi-only change: `make -C infra sync-check && make -C infra build-storefront-kampi && make -C infra up`. `make -C infra build` builds all three images (the Kampi one last, then the brand check).
- `make -C infra rollback` retags `nkshop-storefront-kampi:prev` too when it exists. Kampi only: `docker tag nkshop-storefront-kampi:prev nkshop-storefront-kampi:latest && docker compose up -d --force-recreate storefront-kampi`.
- A `business.json` change needs only a restart of `medusa-server` and `medusa-worker`, then the probe above. A `KAMPI_PUBLIC_*` change needs `make -C infra build-storefront-kampi && make -C infra up`.

## Staging
```bash
make -C infra env-init      # creates .env.staging from .env.staging.example; edit it on the Pi
make -C infra staging-build staging-migrate staging-seed staging-up
make -C infra staging-create-admin-user EMAIL=owner@example.com
```
Uncomment the staging blocks in `traefik/nkshop.yml.example`, `make route`, add DNS and Access. Separate containers (`nkshop-staging-*`), Postgres/Redis volumes (`nkshop-staging_pg_data`), ports 8552/8553. No nightly dump and no real Cloudflare/Meta credentials. Stop it when done: `make staging-down` (volumes kept).
As with production, the staging storefront needs `PUBLIC_MEDUSA_PUBLISHABLE_KEY` from the staging DB before `staging-build` is useful (build, migrate, seed, read key, rebuild).
The Kampi storefront is not part of staging unless asked for: `nkshop-staging-storefront-kampi` (port `PORT_WEB_KAMPI=8555` in `.env.staging`) sits behind the compose profile `staging-kampi`, which the `staging-*` targets do not pass. Build and start it by hand with `--profile staging-kampi` added to the `DCS` command line.

## Incident checklist
1. Is it the Pi? `ssh dockpi uptime; free -h; df -h /; dmesg -T | tail` (OOM killer lines mention the container). Is Traefik up (`docker ps | grep traefik`)?
2. Is it Cloudflare? Status page; try `curl --resolve noordkaravane.co.za:443:<home-ip> -I https://noordkaravane.co.za` to bypass it. 521/522 means Cloudflare cannot reach the origin (home internet, port forward, Traefik, or the IP changed: update the A records).
3. `make ps`: which container is unhealthy or restarting? `make logs S=medusa-server` (also in Loki/Grafana: promtail already ships every container's json log by container name).
4. Site up but checkout broken: `medusa-server` and `medusa-worker` logs, Redis (`docker compose exec redis redis-cli -a "$REDIS_PASSWORD" info memory`; `used_memory` near 160 MB with noeviction means writes are failing: investigate what is filling it, then restart the worker), Postgres connections.
5. Emails not sending: worker logs (notification subscribers), Brevo dashboard (quota, blocked sender), SPF/DKIM status.
6. Admin unreachable: Cloudflare Access (are you in the policy?), `curl -I http://192.168.0.120:8551/app` on the Pi.
7. Stale pages after product edits: check `CF_API_TOKEN`/`CF_ZONE_ID`, then purge manually in Cloudflare.
8. Suspected compromise: `make down`; rotate every secret (above) and the R2/CF tokens; check `docker logs` and Access logs; restore from a known-good dump if data changed.
9. Disk full: `df -h`; `docker system df` (read only); remove old `nkshop-*:<sha>` images; check `infra/backups` size.
10. Bad deploy: `make rollback`, then the restore procedure if the schema changed.
Note any outage that exposed personal information: follow the breach notification steps in the Data Retention and Protection policy (and notify the Information Regulator and affected people as it requires).

## Optional: Glance and promtail
- **promtail**: nothing to do. The host's promtail uses Docker service discovery on every container and labels logs by `container_name` (`nkshop-*`), so Loki already has them. Query in Grafana: `{container_name=~"nkshop-.*"}`.
- **Glance** (`/home/voogiepi/docker/glance/config/glance.yml`): add a monitor widget in the same style as the Kampi sites:
```yaml
          - type: monitor
            title: Noord Karavane
            cache: 2m
            style: compact
            sites:
              - title: Storefront
                url: https://noordkaravane.co.za
              - title: Store API
                url: https://api.noordkaravane.co.za/health
              - title: Admin
                url: https://admin.noordkaravane.co.za/app
                alt-status-codes: [302, 401, 403]   # behind Cloudflare Access
```
Keep a dated copy of `glance.yml` first, like the existing `.bak` files. Do not edit it automatically from the Makefile.
