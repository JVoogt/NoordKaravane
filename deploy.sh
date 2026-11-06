#!/usr/bin/env bash
# Pull latest from main and refresh nginx. Run from the cloned repo root on DockPi.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

export DOCKER_API_VERSION=1.41

echo "==> build web image (type check, tests and guard run inside the build)"
docker compose build noordkaravane

echo "==> nginx -t in the fresh image, with the mounted config, before touching the running container"
docker compose run --rm --no-deps --entrypoint nginx noordkaravane -t

echo "==> refresh nginx container"
docker compose up -d --force-recreate --no-deps noordkaravane

BASE="http://localhost:8260"
fail() {
  echo "health check FAILED: $1"
  docker compose logs --tail 40 noordkaravane || true
  exit 1
}

# probe NAME WANT_CODE URL [curl args]: retries up to 5 times, 1s apart.
probe() {
  local name="$1" want="$2" url="$3"; shift 3
  local code="" attempt
  for attempt in 1 2 3 4 5; do
    code="$(curl -s -o /dev/null -w "%{http_code}" "$@" "$url" || true)"
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
css="$(curl -s "${BASE}/" | grep -o '/_astro/[^"]*\.css' | head -n 1 || true)"
[ -n "$css" ] || fail "home page references no /_astro/ css asset"
probe "${css}" 200 "${BASE}${css}"

# Unknown paths must be the real 404 page, and www must redirect (nginx host routing).
probe "/nonexistent-xyz/" 404 "${BASE}/nonexistent-xyz/"
probe "www host /" 301 "${BASE}/" -H "Host: www.noordkaravane.co.za"

echo "==> done"
