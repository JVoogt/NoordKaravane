# Noord Karavane deploy helpers. Run from the laptop, in infra/ (or `make -C infra <target>`).
# Everything executes on DockPi over ssh; every docker call carries DOCKER_API_VERSION=1.41.
# Images are built ON the Pi (arm64, no registry). `make help` lists targets.

# The ssh alias from ~/.ssh/config (`root@dockpi` does not resolve).
HOST        ?= dockpi
OWNER       ?= voogiepi
REMOTE_DIR  ?= /home/voogiepi/docker/nkshop
INFRA       := $(REMOTE_DIR)/infra
TRAEFIK_DYN ?= /home/voogiepi/docker/traefik/config/dynamic
# Where `sync` and `sync-check` copy to. Override only to dry-run against a local scratch dir.
SYNC_DEST   ?= $(HOST):$(REMOTE_DIR)/
ROOT        := $(abspath ..)

# Image tag for this build: git short sha, or a timestamp when the repo is not a git checkout.
TAG         ?= $(shell git -C $(ROOT) rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)

DOCKER      := DOCKER_API_VERSION=1.41 docker
DC          := $(DOCKER) compose
DCS         := $(DOCKER) compose -p nkshop-staging --env-file .env.staging -f docker-compose.yml -f compose.staging.yml
SSH         := ssh $(HOST)
IN_INFRA    := cd $(INFRA) &&
S           ?=
# Build one image at a time: a Pi 5 with ~7GB free must not run two Node builds in parallel.
export COMPOSE_PARALLEL_LIMIT := 1

# rsync excludes shared by `sync` and `sync-check` (one list, so the two never drift). Excluded paths are never
# deleted on the Pi by --delete, so everything that only lives on the Pi must be matched here:
#   - the business.json copies, .env files and backups;
#   - /infra/cloudflare/ (Pi-only notes), /web/.impeccable/ (tool cache), any *.bak* file (covers the `*.bak-*`
#     and `*.bak.*` backups made by hand on the Pi);
#   - /.git: in a git worktree .git is a FILE (gitdir: ...), which the '.git/' directory pattern does not match.
SYNC_EXCLUDES := \
	  --exclude='node_modules/' --exclude='.git/' --exclude='/source-assets/' --exclude='*.zip' \
	  --exclude='.medusa/' --exclude='dist/' --exclude='.astro/' --exclude='.DS_Store' \
	  --exclude='.git/' --exclude='node_modules/' --exclude='/social-media-posts/' --exclude='.env' --exclude='.env.local' --exclude='.env.production' --exclude='/infra/.env.staging' \
	  --exclude='/infra/backups/' --exclude='/infra/backups-staging/' \
	  --exclude='/config/business.json' --exclude='/backend/src/config/business.json' \
	  --exclude='/infra/.last_tag' --exclude='/infra/build-*.log' \
	  --exclude='/.cc10x/' --exclude='/.claude/' --exclude='/.remember/' --exclude='/.impeccable/' \
	  --exclude='/infra/cloudflare/' --exclude='*.bak*' --exclude='/web/.impeccable/' --exclude='/.git'

# Refuses to sync from a git worktree (.git is a file) unless the exclude list covers that file: rsync --delete would
# otherwise copy it over the Pi tree as a broken .git.
SYNC_GUARD = $(if $(findstring --exclude='/.git',$(SYNC_EXCLUDES)),true,[ ! -f $(ROOT)/.git ] || { echo "refusing to sync: $(ROOT)/.git is a file (git worktree) and SYNC_EXCLUDES lacks --exclude='/.git'"; exit 1; })

# Fail-closed preflight for `sync` (and every build* target, which all depend on it): the same dry run as
# `sync-check`, then a refusal if any path it would DELETE matches SYNC_PROTECTED. The regex is deliberately
# independent of SYNC_EXCLUDES, so a typo or a dropped exclude cannot also silence the check that would catch it.
SYNC_PROTECTED ?= business\.json|(^|/)\.env|(^|/)cloudflare/|\.bak|(^|/)\.impeccable/|(^|/)backups(-staging)?/|^\.git(/|$$)
SYNC_DRYRUN = rsync -azn --delete --itemize-changes $(SYNC_EXCLUDES) $(ROOT)/ $(SYNC_DEST)
SYNC_PREFLIGHT = out=$$($(SYNC_DRYRUN)) || exit $$?; \
	  bad=$$(printf '%s\n' "$$out" | sed -n 's/^\*deleting  *//p' | grep -E '$(SYNC_PROTECTED)'); \
	  [ -z "$$bad" ] || { echo "refusing to sync: the dry run would delete protected Pi-only paths (check SYNC_EXCLUDES):"; \
	  printf '%s\n' "$$bad" | sed 's/^/  /'; exit 1; }

# Runs on the Pi after the Kampi image build: the Dockerfile defaults BRAND to nk, so a build that lost the BRAND arg
# would silently produce an NK store. The image label records the brand it was really built as.
KAMPI_BRAND_CHECK = b=$$($(DOCKER) image inspect -f "{{index .Config.Labels \"org.noordkaravane.storefront.brand\"}}" nkshop-storefront-kampi:$(TAG)) && [ "$$b" = kampi ] || { echo "nkshop-storefront-kampi:$(TAG) was built as brand [$$b], not kampi: check BRAND in docker-compose.yml"; exit 1; }

.DEFAULT_GOAL := help
.PHONY: help sync sync-check env-init build build-backend build-storefront build-storefront-kampi kampi-channel up down restart logs ps migrate seed \
        create-admin-user rollback publishable-key route route-diff pgdump-now restore free \
        staging-build staging-up staging-down staging-logs staging-ps staging-migrate staging-seed \
        staging-create-admin-user staging-publishable-key staging-pgdump-now staging-restore

help:
	@echo "Production : sync sync-check env-init build up down restart logs ps migrate seed create-admin-user rollback publishable-key route pgdump-now restore free"
	@echo "Kampi      : build-storefront-kampi (nkshop-storefront-kampi) kampi-channel (Kampi sales channel + key)"
	@echo "Staging    : staging-build staging-up staging-down staging-logs staging-ps staging-migrate staging-seed staging-create-admin-user staging-pgdump-now staging-restore"
	@echo "Variables  : HOST=$(HOST) TAG=$(TAG) S=<service> (logs)  EMAIL=<admin email> (create-admin-user)  DUMP=<file under infra/> (restore)"

# ---------------------------------------------------------------- code + env
sync:
	@$(SYNC_GUARD)
	@$(SYNC_PREFLIGHT)
	rsync -az --delete --human-readable $(SYNC_EXCLUDES) $(ROOT)/ $(SYNC_DEST)
	$(SSH) 'mkdir -p $(INFRA)/backups $(INFRA)/backups-staging && chown -R $(OWNER):$(OWNER) $(REMOTE_DIR) && \
	  for f in $(INFRA)/.env $(INFRA)/.env.staging; do [ -f $$f ] && chmod 600 $$f; done; true'

# Dry run of `sync`: prints only the files it would DELETE on the Pi, changes nothing. Read it before every sync.
sync-check:
	@$(SYNC_GUARD)
	@out=$$($(SYNC_DRYRUN)) || exit $$?; \
	  printf '%s\n' "$$out" | grep '^\*deleting' || echo "sync-check: nothing would be deleted"

# create infra/.env (and .env.staging) from the examples if missing, then edit them on the Pi
env-init:
	$(SSH) '$(IN_INFRA) [ -f .env ] || { cp .env.example .env && chmod 600 .env && chown $(OWNER):$(OWNER) .env && echo "created .env: edit it now"; }; \
	  [ -f .env.staging ] || { cp .env.staging.example .env.staging && chmod 600 .env.staging && chown $(OWNER):$(OWNER) .env.staging && echo "created .env.staging"; }; true'

# ---------------------------------------------------------------- build / run (production)
# Tags: nkshop-<image>:<TAG> (immutable), :latest (what compose runs), :prev (the :latest before this build).
build: sync
	$(SSH) '$(IN_INFRA) set -e; \
	  for i in backend storefront storefront-kampi; do $(DOCKER) image inspect nkshop-$$i:latest >/dev/null 2>&1 && $(DOCKER) tag nkshop-$$i:latest nkshop-$$i:prev || true; done; \
	  IMAGE_TAG=$(TAG) $(DC) build migrate; \
	  IMAGE_TAG=$(TAG) $(DC) build storefront; \
	  IMAGE_TAG=$(TAG) $(DC) build storefront-kampi; $(KAMPI_BRAND_CHECK); \
	  for i in backend storefront storefront-kampi; do $(DOCKER) tag nkshop-$$i:$(TAG) nkshop-$$i:latest; done; \
	  echo "built tag $(TAG)"; $(DOCKER) images "nkshop-*"'

# The storefront needs PUBLIC_MEDUSA_PUBLISHABLE_KEY at build time, so on a first deploy: build-backend, migrate,
# seed, put the key in .env, then build-storefront.
build-backend: sync
	$(SSH) '$(IN_INFRA) set -e; \
	  $(DOCKER) image inspect nkshop-backend:latest >/dev/null 2>&1 && $(DOCKER) tag nkshop-backend:latest nkshop-backend:prev || true; \
	  IMAGE_TAG=$(TAG) $(DC) build migrate; $(DOCKER) tag nkshop-backend:$(TAG) nkshop-backend:latest'

build-storefront: sync
	$(SSH) '$(IN_INFRA) set -e; \
	  $(DOCKER) image inspect nkshop-storefront:latest >/dev/null 2>&1 && $(DOCKER) tag nkshop-storefront:latest nkshop-storefront:prev || true; \
	  IMAGE_TAG=$(TAG) $(DC) build storefront; $(DOCKER) tag nkshop-storefront:$(TAG) nkshop-storefront:latest'

# Kampi Store image (BRAND=kampi). Needs KAMPI_PUBLIC_MEDUSA_PUBLISHABLE_KEY in .env (from `make kampi-channel`).
build-storefront-kampi: sync
	$(SSH) '$(IN_INFRA) set -e; \
	  $(DOCKER) image inspect nkshop-storefront-kampi:latest >/dev/null 2>&1 && $(DOCKER) tag nkshop-storefront-kampi:latest nkshop-storefront-kampi:prev || true; \
	  IMAGE_TAG=$(TAG) $(DC) build storefront-kampi; $(KAMPI_BRAND_CHECK); \
	  $(DOCKER) tag nkshop-storefront-kampi:$(TAG) nkshop-storefront-kampi:latest'

up:
	$(SSH) '$(IN_INFRA) $(DC) up -d --remove-orphans && $(DC) ps'

down:
	$(SSH) '$(IN_INFRA) $(DC) down'

restart:
	$(SSH) '$(IN_INFRA) $(DC) restart $(S)'

logs:
	ssh -t $(HOST) '$(IN_INFRA) $(DC) logs --tail=200 -f $(S)'

ps:
	$(SSH) '$(IN_INFRA) $(DC) ps -a'

free:
	$(SSH) 'free -h; echo; $(DOCKER) stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}" $$($(DOCKER) ps --filter name=nkshop --format "{{.Names}}")'

# `medusa db:migrate` also syncs module links. Idempotent; it also runs automatically before server/worker on every `up`.
migrate:
	$(SSH) '$(IN_INFRA) $(DC) run --rm migrate'

# Creates (once) the Kampi sales channel and its publishable key, links every product, prints a summary line.
# Idempotent. The key goes into .env as KAMPI_PUBLIC_MEDUSA_PUBLISHABLE_KEY (CONTRACTS.md, Kampi storefront).
kampi-channel:
	$(SSH) '$(IN_INFRA) $(DC) run --rm migrate npx medusa exec ./src/scripts/setup-kampi-channel.js'

# Reads ../catalogue/products.json (mounted at /catalogue). Safe to re-run only if the seed script is idempotent.
seed:
	$(SSH) '$(IN_INFRA) $(DC) run --rm migrate npx medusa exec ./src/scripts/seed.js'

# make create-admin-user EMAIL=owner@example.com   (password is prompted on the Pi, not stored)
create-admin-user:
	@test -n "$(EMAIL)" || { echo "usage: make create-admin-user EMAIL=you@example.com"; exit 1; }
	ssh -t $(HOST) '$(IN_INFRA) ./scripts/create-admin.sh "$(EMAIL)"'

# prints the publishable API key(s) (needed as PUBLIC_MEDUSA_PUBLISHABLE_KEY before building the storefront)
publishable-key:
	$(SSH) '$(IN_INFRA) ./scripts/publishable-key.sh'

staging-publishable-key:
	$(SSH) '$(IN_INFRA) ./scripts/publishable-key.sh staging'

# Retag :prev as :latest and recreate. (A DB migration is NOT undone: see RUNBOOK.md rollback.)
# The Kampi image is rolled back only when it has a :prev (its first deploy has none); that never blocks NK's rollback.
rollback:
	$(SSH) '$(IN_INFRA) set -e; \
	  for i in backend storefront; do $(DOCKER) image inspect nkshop-$$i:prev >/dev/null 2>&1 || { echo "no :prev image for $$i"; exit 1; }; done; \
	  for i in backend storefront; do $(DOCKER) tag nkshop-$$i:prev nkshop-$$i:latest; done; \
	  K=; if $(DOCKER) image inspect nkshop-storefront-kampi:prev >/dev/null 2>&1; then $(DOCKER) tag nkshop-storefront-kampi:prev nkshop-storefront-kampi:latest; K=storefront-kampi; else echo "no :prev image for storefront-kampi: left as is"; fi; \
	  $(DC) up -d --remove-orphans --force-recreate migrate medusa-server medusa-worker storefront $$K; $(DC) ps'

# ---------------------------------------------------------------- traefik route
route:
	scp traefik/nkshop.yml.example $(HOST):/tmp/nkshop.yml.new
	$(SSH) 'f=$(TRAEFIK_DYN)/nkshop.yml; [ -f $$f ] && cp $$f $$f.bak.$$(date +%Y%m%d-%H%M%S); \
	  install -o $(OWNER) -g $(OWNER) -m 644 /tmp/nkshop.yml.new $$f && rm /tmp/nkshop.yml.new && echo "installed $$f (Traefik reloads by itself)"'

route-diff:
	scp -q traefik/nkshop.yml.example $(HOST):/tmp/nkshop.yml.new
	-$(SSH) 'diff -u $(TRAEFIK_DYN)/nkshop.yml /tmp/nkshop.yml.new; rm -f /tmp/nkshop.yml.new'

# ---------------------------------------------------------------- backups
pgdump-now:
	$(SSH) '$(IN_INFRA) $(DC) exec pgdump sh /scripts/pgdump.sh once && ls -lh backups'

# make restore DUMP=backups/nkshop-20261103-0230.dump   (DESTRUCTIVE, prompts for confirmation)
restore:
	@test -n "$(DUMP)" || { echo "usage: make restore DUMP=backups/<file>.dump"; exit 1; }
	ssh -t $(HOST) '$(IN_INFRA) ./scripts/restore.sh "$(DUMP)"'

# ---------------------------------------------------------------- staging (project nkshop-staging, ports 8552/8553)
staging-build: sync
	$(SSH) '$(IN_INFRA) set -e; $(DCS) build migrate; $(DCS) build storefront'

staging-up:
	$(SSH) '$(IN_INFRA) $(DCS) up -d --remove-orphans && $(DCS) ps'

staging-down:
	$(SSH) '$(IN_INFRA) $(DCS) down'

staging-logs:
	ssh -t $(HOST) '$(IN_INFRA) $(DCS) logs --tail=200 -f $(S)'

staging-ps:
	$(SSH) '$(IN_INFRA) $(DCS) ps -a'

staging-migrate:
	$(SSH) '$(IN_INFRA) $(DCS) run --rm migrate'

staging-seed:
	$(SSH) '$(IN_INFRA) $(DCS) run --rm migrate npx medusa exec ./src/scripts/seed.js'

staging-create-admin-user:
	@test -n "$(EMAIL)" || { echo "usage: make staging-create-admin-user EMAIL=you@example.com"; exit 1; }
	ssh -t $(HOST) '$(IN_INFRA) ./scripts/create-admin.sh "$(EMAIL)" staging'

staging-pgdump-now:
	$(SSH) '$(IN_INFRA) $(DCS) --profile staging-backups run --rm pgdump once && ls -lh backups-staging'

staging-restore:
	@test -n "$(DUMP)" || { echo "usage: make staging-restore DUMP=backups-staging/<file>.dump"; exit 1; }
	ssh -t $(HOST) '$(IN_INFRA) ./scripts/restore.sh "$(DUMP)" staging'
