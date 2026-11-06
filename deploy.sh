#!/usr/bin/env bash
# Candidate-first deploy for the landing site. Run from the cloned repo root on DockPi.
#
#   1. take the deploy lock, git pull --ff-only, then re-run the PULLED copy of this script
#   2. build the image (type check, tests, guard and `nginx -t` run inside the build; the nginx
#      config is baked into the image, so there are no bind mounts)
#   3. tag the running web image :prev (a manual rollback aid)
#   4. start the new image as a throwaway candidate on 127.0.0.1:${NK_CANDIDATE_PORT:-8261}, run the
#      probes and the quick container matrix against it
#   5. only if the candidate passes: recreate the real container and probe it again
# A failure before step 5 never touches the running site. Nothing is restored automatically and no
# state file is written; the rollback is manual (below).
#
# Env knobs: NK_CANDIDATE_PORT (candidate port, default 8261), NK_BASE (live URL, default http://localhost:8260).
#
# FIRST-DEPLOY RUNBOOK. The deploy.sh currently on the Pi is the OLD script: it pulls and recreates
# without any of the checks above. So run the first Astro deploy by hand, so the NEW script runs:
#     git pull --ff-only && ./deploy.sh
# It finds the legacy nginx:alpine + ./site container, which keeps serving until the candidate
# passes; then it is swapped for the new container.
#
# MANUAL ROLLBACK (the swap itself failed, or the new site is wrong in a way no probe catches):
#   web stack:    docker tag noordkaravane-web:prev noordkaravane-web:latest
#                 docker compose up -d --force-recreate --no-deps --no-build noordkaravane
#   legacy stack: git revert -m 1 <merge-sha> (on a dev machine, push), then on the Pi: git pull && ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"
SELF="$PWD/$(basename "$0")"
export DOCKER_API_VERSION=1.41
export DOCKER_BUILDKIT=1

# Lock, pull, re-exec: one compound command, so bash has parsed all of it before git pull replaces this
# file on disk (bash reads a script lazily). The re-exec makes the PULLED script run everything below.
# fd 9 stays open across the exec, so the lock is held for the whole deploy.
if [ -z "${NK_DEPLOY_PULLED:-}" ]; then
  exec 9>.git/nk-deploy.lock
  flock -n 9 || { echo "another deploy is running"; exit 1; }
  echo "==> git pull"
  git pull --ff-only
  NK_DEPLOY_PULLED=1 exec bash "$SELF" "$@"
fi

BASE="${NK_BASE:-http://localhost:8260}"
CANDIDATE=noordkaravane-candidate
CANDIDATE_PORT="${NK_CANDIDATE_PORT:-8261}"
CANDIDATE_BASE="http://127.0.0.1:${CANDIDATE_PORT}"

remove_candidate() { docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true; }
trap remove_candidate EXIT
trap 'exit 130' INT TERM

# try_probe NAME WANT_CODE URL [curl args]: up to 5 tries, 1s apart. Returns 1 instead of exiting.
try_probe() {
  local name="$1" want="$2" url="$3"; shift 3
  local code="" attempt
  for attempt in 1 2 3 4 5; do
    code="$(curl -s --max-time 5 --connect-timeout 3 -o /dev/null -w "%{http_code}" "$@" "$url" || true)"
    if [ "$code" = "$want" ]; then echo "${name} HTTP ${code}"; return 0; fi
    sleep 1
  done
  echo "PROBE FAILED: ${name} wanted ${want}, got ${code:-none}"
  return 1
}

# probes BASE_URL: the page, asset, 404 and host-routing probes. Returns 1 at the first failure.
probes() {
  local base="$1" path css
  for path in / /robots.txt /sitemap.xml /sitemap-index.xml /services/recoveries/; do
    try_probe "${path}" 200 "${base}${path}" || return 1
  done
  # A hashed build asset: a page that loads without its CSS is broken even when / answers 200.
  css="$(curl -s --max-time 5 --connect-timeout 3 "${base}/" | grep -o '/_astro/[^"]*\.css' | head -n 1 || true)"
  if [ -z "$css" ]; then echo "PROBE FAILED: home page references no /_astro/ css asset"; return 1; fi
  try_probe "${css}" 200 "${base}${css}" || return 1
  try_probe "/nonexistent-xyz/" 404 "${base}/nonexistent-xyz/" || return 1
  try_probe "www host /" 301 "${base}/" -H "Host: www.noordkaravane.co.za" || return 1
}

abort() {
  echo "$1"
  docker logs --tail 40 "$CANDIDATE" 2>&1 || true
  remove_candidate
  echo "DEPLOY ABORTED: the running site was not touched"
  exit 1
}

IMAGE_REF="$(docker compose config --images | head -n 1)"   # for example noordkaravane-web:latest
PREV_IMAGE="${IMAGE_REF%:*}:prev"

echo "==> build ${IMAGE_REF} (a failed build or nginx -t stops here; the running container is untouched)"
docker compose build noordkaravane

echo "==> tag the running image as ${PREV_IMAGE}"
cid="$(docker compose ps -q noordkaravane 2>/dev/null || true)"
if [ -n "$cid" ] && [ "$(docker inspect --format '{{.Config.Image}}' "$cid")" = "$IMAGE_REF" ]; then
  docker tag "$(docker inspect --format '{{.Image}}' "$cid")" "$PREV_IMAGE"
  echo "tagged"
else
  echo "skipped (nothing running, or the running container is the legacy stack)"
fi

echo "==> candidate on ${CANDIDATE_BASE}"
remove_candidate   # a stale candidate from a crashed run
if ! docker run -d --rm --name "$CANDIDATE" -p "127.0.0.1:${CANDIDATE_PORT}:80" "$IMAGE_REF" >/dev/null; then
  echo "candidate could not start: is port ${CANDIDATE_PORT} busy? Set NK_CANDIDATE_PORT to a free port."
  echo "DEPLOY ABORTED: the running site was not touched"
  exit 1
fi
probes "$CANDIDATE_BASE" || abort "candidate failed a probe"
echo "==> candidate container matrix (--quick)"
if ! matrix_out="$(BASE="$CANDIDATE_BASE" bash web/scripts/container-matrix.sh --quick 2>&1)"; then
  echo "$matrix_out"
  abort "candidate failed the quick container matrix"
fi
echo "$matrix_out" | tail -n 1
remove_candidate

echo "==> swap: recreate the real container from the proven image"
if ! docker compose up -d --force-recreate --no-deps --no-build noordkaravane || ! probes "$BASE"; then
  docker compose logs --tail 40 noordkaravane || true
  echo "DEPLOY FAILED after the swap. Nothing was restored automatically. Roll back by hand:"
  echo "  docker tag ${PREV_IMAGE} ${IMAGE_REF} && docker compose up -d --force-recreate --no-deps --no-build noordkaravane"
  echo "  (legacy stack: git revert -m 1 <merge-sha>, push, then on the Pi: git pull && ./deploy.sh)"
  exit 1
fi

echo "image $(docker inspect --format '{{.Id}}' "$IMAGE_REF")"
echo "DEPLOYED"
