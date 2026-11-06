#!/usr/bin/env bash
# Pull latest from main and refresh nginx. Run from the cloned repo root on DockPi.
# If a probe or the container matrix fails, the service is rolled back to what was running before:
# the previous commit's compose file and nginx config are restored, the previous image (tagged :prev)
# is put back, and the rolled-back container must pass the probes again. Every failure path exits 1.
set -euo pipefail

cd "$(dirname "$0")"
export DOCKER_API_VERSION=1.41

GIT_DIR_PATH="$(git rev-parse --git-dir)"
DEPLOYED_FILE="${GIT_DIR_PATH}/nk-deployed-commit"   # the commit whose files the running container was started from
ROLLED_BACK_FILE="${GIT_DIR_PATH}/nk-rolled-back"    # set when a rollback left old config files in the working tree
CONFIG_FILES=(docker-compose.yml docker/nginx.conf docker/security-headers.conf)

# A previous rollback left the old config in the working tree: put HEAD's files back before pulling.
if [ -f "$ROLLED_BACK_FILE" ]; then
  echo "==> previous rollback left old config files in the tree; restoring HEAD's versions before the pull"
  git checkout HEAD -- docker docker-compose.yml
  rm -f "$ROLLED_BACK_FILE"
fi

# The commit the running container was deployed from (before the pull moves HEAD).
if [ -f "$DEPLOYED_FILE" ]; then PREV_COMMIT="$(cat "$DEPLOYED_FILE")"; else PREV_COMMIT="$(git rev-parse HEAD)"; fi

echo "==> git pull (previous deployed commit ${PREV_COMMIT})"
git pull --ff-only

# The image the compose file builds and runs (for example noordkaravane-web:latest); :prev is its rollback twin.
IMAGE_REF="$(docker compose config --images | head -n 1)"
PREV_IMAGE="${IMAGE_REF%:*}:prev"

# PREV_KIND: web = previous container ran this web image (rollback needs :prev),
#            legacy = it ran something else, for example the old nginx:alpine + ./site bind-mount stack
#            (rollback is the old compose file, no :prev needed), none = nothing was running.
echo "==> record what is running now as the rollback target"
PREV_KIND="none"
cid="$(docker compose ps -q noordkaravane 2>/dev/null || true)"
if [ -n "$cid" ]; then
  if [ "$(docker inspect --format '{{.Config.Image}}' "$cid")" = "$IMAGE_REF" ]; then
    docker tag "$(docker inspect --format '{{.Image}}' "$cid")" "$PREV_IMAGE"
    PREV_KIND="web"
    echo "running container uses ${IMAGE_REF}: tagged as ${PREV_IMAGE}"
  else
    PREV_KIND="legacy"
    echo "running container uses $(docker inspect --format '{{.Config.Image}}' "$cid") (previous stack): rollback will restore the compose file from ${PREV_COMMIT}"
  fi
elif docker image inspect "$IMAGE_REF" >/dev/null 2>&1; then
  docker tag "$IMAGE_REF" "$PREV_IMAGE"
  PREV_KIND="web"
  echo "no running container; tagged the existing ${IMAGE_REF} as ${PREV_IMAGE}"
else
  echo "first deploy ever: nothing to roll back to"
fi

echo "==> build web image (type check, tests and guard run inside the build)"
docker compose build noordkaravane

echo "==> nginx -t in the fresh image, with the mounted config, before touching the running container"
docker compose run --rm --no-deps --entrypoint nginx noordkaravane -t

BASE="${NK_BASE:-http://localhost:8260}"

# try_probe NAME WANT_CODE URL [curl args]: up to 5 tries, 1s apart. Returns 1 instead of exiting.
try_probe() {
  local name="$1" want="$2" url="$3"; shift 3
  local code="" attempt
  for attempt in 1 2 3 4 5; do
    code="$(curl -s --max-time 5 --connect-timeout 3 -o /dev/null -w "%{http_code}" "$@" "$url" || true)"
    if [ "$code" = "$want" ]; then
      echo "${name} HTTP ${code}"
      return 0
    fi
    sleep 1
  done
  echo "${name} wanted ${want}, got ${code:-none}"
  return 1
}

rollback_failed() {
  echo "ROLLBACK FAILED: $1"
  docker compose logs --tail 40 noordkaravane || true
  echo "The service is NOT healthy. Fix it by hand; the working tree holds the config of ${PREV_COMMIT}."
}

# Restore the previous commit's config and compose file, bring the previous stack back, and verify it.
rollback() {
  if [ "$PREV_KIND" = "none" ]; then
    echo "ROLLBACK UNAVAILABLE: nothing was running before this deploy. The broken container is still running."
    return 0
  fi
  if [ "$PREV_KIND" = "web" ] && ! docker image inspect "$PREV_IMAGE" >/dev/null 2>&1; then
    echo "ROLLBACK UNAVAILABLE: ${PREV_IMAGE} is missing. The broken container is still running."
    return 0
  fi

  echo "ROLLBACK: restoring compose file and nginx config from ${PREV_COMMIT} (the bind-mounted files were already updated by git pull)"
  local f
  for f in "${CONFIG_FILES[@]}"; do
    if git cat-file -e "${PREV_COMMIT}:${f}" 2>/dev/null; then
      git checkout "$PREV_COMMIT" -- "$f"
      echo "  restored ${f}"
    else
      echo "  ${f} does not exist at ${PREV_COMMIT}: left in place (the previous compose file does not mount it)"
    fi
  done
  touch "$ROLLED_BACK_FILE"

  if [ "$PREV_KIND" = "web" ]; then
    # The restored compose file runs <image>:latest: point that tag at the previous image.
    docker tag "$PREV_IMAGE" "$(docker compose config --images | head -n 1)"
  elif [ ! -d site ]; then
    rollback_failed "previous stack serves ./site and that directory is missing"
    return 0
  fi

  echo "ROLLBACK: recreating noordkaravane from the restored compose file"
  if ! docker compose up -d --force-recreate --no-deps --no-build noordkaravane; then
    rollback_failed "docker compose up failed with the restored compose file"
    return 0
  fi

  echo "ROLLBACK: verifying the rolled-back container"
  local p
  for p in / /robots.txt /sitemap.xml; do
    try_probe "rolled-back ${p}" 200 "${BASE}${p}" || { rollback_failed "rolled-back container failed probe ${p}"; return 0; }
  done
  if [ "$PREV_KIND" = "web" ]; then
    local out
    if ! out="$(BASE="$BASE" bash web/scripts/container-matrix.sh --quick 2>&1)"; then
      echo "$out"
      rollback_failed "rolled-back container failed the quick container matrix"
      return 0
    fi
    echo "$out" | tail -n 1
  fi
  echo "$PREV_COMMIT" > "$DEPLOYED_FILE"   # what is running is the previous commit's stack, not HEAD
  echo "ROLLBACK DONE: the previous stack (${PREV_KIND}) is serving again and passed its probes. Config files in the tree are those of ${PREV_COMMIT}; the next deploy restores HEAD's first."
}

fail() {
  echo "health check FAILED: $1"
  docker compose logs --tail 40 noordkaravane || true
  rollback
  exit 1
}

echo "==> refresh nginx container"
docker compose up -d --force-recreate --no-deps noordkaravane || fail "docker compose up could not recreate the container"

# probe NAME WANT_CODE URL [curl args]: like try_probe, but a miss fails the deploy (and rolls back).
probe() {
  local name="$1"
  try_probe "$@" || fail "${name} did not answer as expected"
}

echo "==> health check"
for path in / /robots.txt /sitemap.xml /sitemap-index.xml /services/recoveries/; do
  probe "${path}" 200 "${BASE}${path}"
done

# A hashed build asset (a page that loads without its CSS is broken even when / answers 200).
css="$(curl -s --max-time 5 --connect-timeout 3 "${BASE}/" | grep -o '/_astro/[^"]*\.css' | head -n 1 || true)"
[ -n "$css" ] || fail "home page references no /_astro/ css asset"
probe "${css}" 200 "${BASE}${css}"

# Unknown paths must be the real 404 page, and www must redirect (nginx host routing).
probe "/nonexistent-xyz/" 404 "${BASE}/nonexistent-xyz/"
probe "www host /" 301 "${BASE}/" -H "Host: www.noordkaravane.co.za"

# The committed matrix, trimmed to what gates nginx behaviour: security headers, Cache-Control, hostile paths.
echo "==> container matrix (--quick: headers, Cache-Control, hostile paths)"
matrix_out="$(BASE="$BASE" bash web/scripts/container-matrix.sh --quick 2>&1)" && matrix_rc=0 || matrix_rc=$?
if [ "$matrix_rc" -ne 0 ]; then
  echo "$matrix_out"
  fail "container matrix (--quick) reported FAIL rows (exit ${matrix_rc})"
fi
echo "$matrix_out" | tail -n 1

git rev-parse HEAD > "$DEPLOYED_FILE"
echo "==> done"
