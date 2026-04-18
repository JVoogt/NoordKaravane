#!/usr/bin/env bash
# Pull latest from main and reload nginx. Run from the cloned repo root on DockPi.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

echo "==> chmod assets so nginx (in container) can read them"
find site/assets -type f -exec chmod 644 {} +

echo "==> reload nginx"
DOCKER_API_VERSION=1.41 docker exec noordkaravane nginx -s reload

echo "==> health check"
curl -sI -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8260/

echo "==> done"
