#!/usr/bin/env bash
# Pull latest from main and refresh nginx. Run from the cloned repo root on DockPi.
# A failed health check or container matrix rolls the service back to the previous image (tagged :prev).
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

export DOCKER_API_VERSION=1.41

# The image the compose file builds and runs (for example noordkaravane-web:latest); :prev is its rollback twin.
IMAGE_REF="$(docker compose config --images | head -n 1)"
PREV_IMAGE="${IMAGE_REF%:*}:prev"

echo "==> tag the currently running image as ${PREV_IMAGE} (rollback target)"
cid="$(docker compose ps -q noordkaravane 2>/dev/null || true)"
if [ -n "$cid" ]; then
  docker tag "$(docker inspect --format '{{.Image}}' "$cid")" "$PREV_IMAGE"
  echo "tagged the running container's image"
elif docker image inspect "$IMAGE_REF" >/dev/null 2>&1; then
  docker tag "$IMAGE_REF" "$PREV_IMAGE"
  echo "no running container; tagged the existing ${IMAGE_REF}"
else
  echo "first deploy: no previous image, rollback unavailable"
fi

echo "==> build web image (type check, tests and guard run inside the build)"
docker compose build noordkaravane

echo "==> nginx -t in the fresh image, with the mounted config, before touching the running container"
docker compose run --rm --no-deps --entrypoint nginx noordkaravane -t

BASE="${NK_BASE:-http://localhost:8260}"

# Recreate the service from the previous image (compose reads NK_WEB_IMAGE), then say what happened.
rollback() {
  if ! docker image inspect "$PREV_IMAGE" >/dev/null 2>&1; then
    echo "ROLLBACK UNAVAILABLE: no ${PREV_IMAGE} (first deploy). The broken container is still running."
    return 0
  fi
  echo "ROLLBACK: recreating noordkaravane from ${PREV_IMAGE}"
  if NK_WEB_IMAGE="$PREV_IMAGE" docker compose up -d --force-recreate --no-deps --no-build noordkaravane; then
    echo "ROLLBACK DONE: serving ${PREV_IMAGE}, home page HTTP $(curl -s -o /dev/null --max-time 5 --connect-timeout 3 -w '%{http_code}' "${BASE}/" || true)"
  else
    echo "ROLLBACK FAILED: could not recreate from ${PREV_IMAGE}. Fix the service by hand."
  fi
}

fail() {
  echo "health check FAILED: $1"
  docker compose logs --tail 40 noordkaravane || true
  rollback
  exit 1
}

echo "==> refresh nginx container"
docker compose up -d --force-recreate --no-deps noordkaravane || fail "docker compose up could not recreate the container"

# probe NAME WANT_CODE URL [curl args]: retries up to 5 times, 1s apart.
probe() {
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
  fail "${name} wanted ${want}, got ${code:-none}"
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

echo "==> done"
