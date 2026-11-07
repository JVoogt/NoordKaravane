#!/usr/bin/env bash
# Candidate-first deploy for the landing site. Run from the cloned repo root on DockPi, as the user that
# owns the clone (the deploy lock lives in .git/).
#
#   1. take the deploy lock, git pull --ff-only, then re-run the PULLED copy of this script
#   2. refuse to start if a container with the live name exists outside this compose project, record
#      the running web image id, then build the new image under a CANDIDATE tag (noordkaravane-web:cand-<sha>;
#      type check, tests, guard and `nginx -t` run inside the build; the nginx config is baked into the
#      image, so there are no bind mounts). :latest does not move during the build
#   3. start the candidate image as a throwaway container on 127.0.0.1:${NK_CANDIDATE_PORT:-8261}, run the
#      probes and the quick container matrix against it
#   4. only if the candidate passes: promote the running image to :prev (only when it is a different build
#      AND is the image behind :proven), retag the candidate as :latest, recreate the real container and
#      probe it again; :proven is set only after those probes pass
# A failure before step 4 never touches the running site, :latest or :prev. Nothing is restored
# automatically and no state file is written; the rollback is manual (below).
#
# Env knobs: NK_CANDIDATE_PORT (candidate port, default 8261), NK_BASE (live URL, default http://localhost:8260).
#
# FIRST-DEPLOY RUNBOOK. The deploy.sh currently on the Pi is the OLD script: it pulls and recreates
# without any of the checks above. So run the first Astro deploy by hand, so the NEW script runs:
#     git pull --ff-only && ./deploy.sh
# It finds the legacy nginx:alpine + ./site container, which keeps serving until the candidate
# passes; then it is swapped for the new container.
#
# MANUAL ROLLBACK (the swap itself failed, or the new site is wrong in a way no probe catches). Roll back
# BEFORE re-running deploy.sh: a re-run builds and starts the same commit again.
#   web stack:    docker tag noordkaravane-web:prev noordkaravane-web:latest && docker compose up -d --force-recreate --no-deps --no-build noordkaravane
#   legacy stack: git checkout <legacy-sha> -- docker-compose.yml docker/nginx.conf && docker compose up -d --force-recreate --no-build noordkaravane
#                 (the failure text works out <legacy-sha> from history: the parent of the first commit that moved
#                 docker-compose.yml away from nginx:alpine; or on a dev machine: git revert -m 1 <merge-sha>, push,
#                 then on the Pi: git pull && ./deploy.sh)
set -euo pipefail

cd "$(dirname "$0")"
SELF="$PWD/$(basename "$0")"
export DOCKER_API_VERSION=1.41
export DOCKER_BUILDKIT=1

# Lock, pull, re-exec: one compound command, so bash has parsed all of it before git pull replaces this
# file on disk (bash reads a script lazily). The re-exec makes the PULLED script run everything below.
# fd 9 stays open across the exec, so the lock is held for the whole deploy.
if [ -z "${NK_DEPLOY_PULLED:-}" ]; then
  command -v flock >/dev/null 2>&1 || { echo "flock is not installed (it ships in util-linux); cannot take the deploy lock"; exit 1; }
  exec 9>.git/nk-deploy.lock
  flock -n 9 || { echo "another deploy is running"; exit 1; }
  echo "==> git pull"
  git pull --ff-only 9>&-   # fd 9 closed for git: an auto-gc it detaches must not keep holding the lock
  NK_DEPLOY_PULLED=1 exec bash "$SELF" "$@"
fi
unset NK_DEPLOY_PULLED NK_IMAGE_TAG NK_COMMIT   # must not leak into docker/compose child processes

BASE="${NK_BASE:-http://localhost:8260}"
CANDIDATE=noordkaravane-candidate
CANDIDATE_PORT="${NK_CANDIDATE_PORT:-8261}"
CANDIDATE_BASE="http://127.0.0.1:${CANDIDATE_PORT}"

# Names come from the compose file, so the checks follow it (a scratch override renames them).
COMPOSE_CFG="$(docker compose config)" || { echo "docker compose config failed; nothing was built or touched"; exit 1; }
PROJECT="$(printf '%s\n' "$COMPOSE_CFG" | awk '/^name:/ {print $2; exit}')"
LIVE_NAME="$(printf '%s\n' "$COMPOSE_CFG" | awk '/container_name:/ {print $2; exit}')"
LIVE_REF="$(docker compose config --images | head -n 1)"      # for example noordkaravane-web:latest
IMAGE_REPO="${LIVE_REF%:*}"
PREV_REF="${IMAGE_REPO}:prev"
PROVEN_REF="${IMAGE_REPO}:proven"
HEAD_SHA="$(git rev-parse HEAD)"
CAND_REF="${IMAGE_REPO}:cand-$(git rev-parse --short HEAD)"

SERVICE=noordkaravane
SWAPPING=0
LEGACY=0
PREV_NOTE="not updated by this deploy"

remove_candidate() { docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true; }

# The commit holding the legacy (nginx:alpine) stack, found from history: the parent of the OLDEST commit of the
# current run of docker-compose.yml versions that no longer use nginx:alpine. Prints nothing when not found
# (no such commit, or the current compose still uses nginx:alpine).
legacy_sha() {
  local sha newer=""
  for sha in $(git rev-list HEAD -- docker-compose.yml); do
    if git show "${sha}:docker-compose.yml" 2>/dev/null | grep -q 'nginx:alpine'; then
      [ -n "$newer" ] && git rev-parse --verify -q "${newer}^"
      return 0
    fi
    newer="$sha"
  done
  return 0
}

rollback_text() {
  local lsha
  if [ "$LEGACY" = 1 ]; then
    lsha="$(legacy_sha || true)"
    echo "Restore the old (legacy) stack by hand, BEFORE re-running deploy.sh:"
    if [ -n "$lsha" ]; then
      echo "  git checkout ${lsha} -- docker-compose.yml docker/nginx.conf && docker compose up -d --force-recreate --no-build ${SERVICE}"
    else
      echo "  no legacy sha found; restore docker-compose.yml and docker/nginx.conf from the commit before the Astro merge, then: docker compose up -d --force-recreate --no-build ${SERVICE}"
    fi
  else
    echo "Roll back by hand, BEFORE re-running deploy.sh (a re-run builds and starts this same commit again):"
    echo "  docker tag ${PREV_REF} ${LIVE_REF} && docker compose up -d --force-recreate --no-deps --no-build ${SERVICE}"
    if docker image inspect "$PREV_REF" >/dev/null 2>&1; then
      echo "  (${PREV_REF} is ${PREV_NOTE})"
    else
      echo "  (${PREV_REF} does not exist: there is no earlier web image to roll back to)"
    fi
  fi
}

on_exit() {
  local rc=$?
  remove_candidate
  docker rmi "$CAND_REF" >/dev/null 2>&1 || true   # best effort: only the candidate tag, :latest and :prev are separate tags
  if [ "$SWAPPING" = 1 ] && [ "$rc" -ne 0 ]; then
    echo "DEPLOY INTERRUPTED during the swap: the live container state is unknown. Nothing was restored automatically."
    docker ps -a --filter "name=^/${LIVE_NAME}$" --format '  docker ps: {{.Names}} {{.Image}} {{.Status}}' || true
    rollback_text
  fi
}
trap on_exit EXIT
trap 'exit 130' INT TERM
trap 'exit 129' HUP

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
  echo "DEPLOY ABORTED: the running site, ${LIVE_REF} and ${PREV_REF} were not touched"
  exit 1
}

# A container with the live name that this compose project does not own would make the swap fail on a
# name conflict. Find that out now, before anything is built.
echo "==> preflight"
named="$(docker ps -aq --filter "name=^/${LIVE_NAME}$")"
if [ -n "$named" ]; then
  owner="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$named")"
  if [ "$owner" != "$PROJECT" ]; then
    echo "DEPLOY ABORTED before the build: a container named ${LIVE_NAME} exists but is not part of compose project ${PROJECT}"
    echo "  found: image $(docker inspect --format '{{.Config.Image}}' "$named"), compose project label '${owner:-none}', status $(docker inspect --format '{{.State.Status}}' "$named")"
    echo "  The swap would fail on the name conflict. If it is the live site started by hand (docker run, or another project name),"
    echo "  stop and remove it, then re-run (the site is down until the deploy finishes):"
    echo "    docker stop ${LIVE_NAME} && docker rm ${LIVE_NAME} && ./deploy.sh"
    exit 1
  fi
fi

# Record the running web image id before anything is built: a build moves tags, and some Docker image
# stores then drop the old image.
cid="$(docker compose ps -aq "$SERVICE")" || { echo "DEPLOY ABORTED before the build: docker compose ps failed, so what is running is unknown"; exit 1; }
RUNNING_ID=""
if [ -z "$cid" ]; then
  echo "no existing container for ${SERVICE}"
else
  # Assigned first, so an inspect failure aborts here instead of being read as "legacy".
  cid_image="$(docker inspect --format '{{.Config.Image}}' "$cid")" || { echo "DEPLOY ABORTED before the build: could not inspect container ${cid}"; exit 1; }
  if [ "$cid_image" = "$LIVE_REF" ]; then
    RUNNING_ID="$(docker inspect --format '{{.Image}}' "$cid")" || { echo "DEPLOY ABORTED before the build: could not inspect container ${cid}"; exit 1; }
    echo "existing web image ${RUNNING_ID}"
  else
    LEGACY=1
    echo "existing container is the legacy stack (${cid_image})"
  fi
fi

# No timeout around the build: a cold Node build on the Pi can legitimately take many minutes and a
# timeout that kills it would only force a restart from scratch. The candidate probes and matrix are bounded.
echo "==> build ${CAND_REF} (a failed build or nginx -t stops here; ${LIVE_REF} does not move and the running container is untouched)"
NK_COMMIT="$HEAD_SHA" NK_IMAGE_TAG="cand-$(git rev-parse --short HEAD)" docker compose build "$SERVICE"
NEW_ID="$(docker image inspect --format '{{.Id}}' "$CAND_REF")"

echo "==> candidate on ${CANDIDATE_BASE}"
remove_candidate   # a stale candidate from a crashed run
if ! docker run -d --name "$CANDIDATE" -p "127.0.0.1:${CANDIDATE_PORT}:80" "$CAND_REF" >/dev/null; then
  echo "candidate could not start: is port ${CANDIDATE_PORT} busy? Set NK_CANDIDATE_PORT to a free port."
  echo "DEPLOY ABORTED: the running site was not touched"
  exit 1
fi
probes "$CANDIDATE_BASE" || abort "candidate failed a probe"
echo "==> candidate container matrix (--quick, 180 s limit)"
matrix_rc=0
matrix_out="$(BASE="$CANDIDATE_BASE" timeout 180 bash web/scripts/container-matrix.sh --quick 2>&1)" || matrix_rc=$?
if [ "$matrix_rc" -ne 0 ]; then
  echo "$matrix_out"
  [ "$matrix_rc" -eq 124 ] && echo "the matrix timed out after 180 s"
  abort "candidate failed the quick container matrix"
fi
echo "$matrix_out" | tail -n 1
remove_candidate

# The candidate passed: only now do tags move. The image that is replaced becomes :prev (the manual rollback
# target) only when ALL hold:
#   - it is a different build: a different image id AND a different nk.commit label than HEAD (a rebuild of
#     the same commit gets a new id from the build timestamp, so the id alone cannot tell);
#   - it is the image behind :proven, which is set only after a swap's probes passed. A fix-forward after a
#     failed swap would otherwise promote the bad image that is running;
# With no container at all (removed by hand) the image behind :latest stands in for the running one.
PREV_SRC="$RUNNING_ID"
if [ -z "$cid" ]; then
  PREV_SRC="$(docker image inspect --format '{{.Id}}' "$LIVE_REF" 2>/dev/null || true)"
fi
PREV_SRC_COMMIT=""
[ -n "$PREV_SRC" ] && PREV_SRC_COMMIT="$(docker inspect --format '{{index .Config.Labels "nk.commit"}}' "$PREV_SRC" 2>/dev/null || true)"
PROVEN_ID="$(docker image inspect --format '{{.Id}}' "$PROVEN_REF" 2>/dev/null || true)"
if [ -z "$PREV_SRC" ]; then
  echo ":prev unchanged (no earlier web image)"
elif [ "$PREV_SRC" = "$NEW_ID" ] || [ "$PREV_SRC_COMMIT" = "$HEAD_SHA" ]; then
  echo ":prev unchanged"
elif [ "$PREV_SRC" != "$PROVEN_ID" ]; then
  echo "running image unproven, :prev left alone"
else
  docker tag "$PREV_SRC" "$PREV_REF" || { echo "DEPLOY ABORTED before the swap: could not tag ${PREV_REF}; the running site and ${LIVE_REF} were not touched"; exit 1; }
  PREV_NOTE="fresh: set by this deploy to ${PREV_SRC}"
  echo ":prev now ${PREV_SRC}"
fi
docker tag "$CAND_REF" "$LIVE_REF"

echo "==> swap: recreate the real container from the proven image"
SWAPPING=1
if ! docker compose up -d --force-recreate --no-deps --no-build "$SERVICE"; then
  SWAPPING=0
  echo "DEPLOY FAILED: docker compose up failed, so the live container state is UNKNOWN. Nothing was restored automatically."
  docker ps -a --filter "name=^/${LIVE_NAME}$" --format '  docker ps: {{.Names}} {{.Image}} {{.Status}}' || true
  rollback_text
  exit 1
fi
if ! probes "$BASE"; then
  SWAPPING=0
  docker compose logs --tail 40 "$SERVICE" || true
  echo "DEPLOY FAILED: the swap happened but the new container failed its probes. Nothing was restored automatically."
  rollback_text
  exit 1
fi
SWAPPING=0
docker tag "$NEW_ID" "$PROVEN_REF"   # probes passed: this image is proven

echo "image $(docker inspect --format '{{.Id}}' "$LIVE_REF")"
echo "DEPLOYED"
