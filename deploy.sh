#!/usr/bin/env bash
# Pull latest from main and refresh nginx. Run from the cloned repo root on DockPi.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

echo "==> chmod assets so nginx (in container) can read them"
find site/assets -type f -exec chmod 644 {} +

echo "==> refresh nginx container"
DOCKER_API_VERSION=1.41 docker compose up -d --force-recreate --no-deps noordkaravane

echo "==> health check"
for path in / /robots.txt /sitemap.xml; do
  for attempt in 1 2 3 4 5; do
    code="$(curl -sI -o /dev/null -w "%{http_code}" "http://localhost:8260${path}" || true)"
    if [ "$code" = "200" ]; then
      echo "${path} HTTP ${code}"
      break
    fi
    if [ "$attempt" = "5" ]; then
      echo "${path} HTTP ${code}"
      exit 1
    fi
    sleep 1
  done
done

echo "==> done"
