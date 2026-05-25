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
curl -sI -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8260/
curl -sI -o /dev/null -w "robots.txt HTTP %{http_code}\n" http://localhost:8260/robots.txt
curl -sI -o /dev/null -w "sitemap.xml HTTP %{http_code}\n" http://localhost:8260/sitemap.xml

echo "==> done"
