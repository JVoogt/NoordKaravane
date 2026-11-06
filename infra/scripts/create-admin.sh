#!/bin/sh
# Create a Medusa admin user. Runs ON the Pi, from infra/. The password is read without echo and never stored.
#   ./scripts/create-admin.sh owner@example.com            # production
#   ./scripts/create-admin.sh owner@example.com staging    # staging
set -eu
EMAIL="${1:?usage: create-admin.sh <email> [staging]}"
export DOCKER_API_VERSION=1.41
if [ "${2:-}" = "staging" ]; then
  DC="docker compose -p nkshop-staging --env-file .env.staging -f docker-compose.yml -f compose.staging.yml"
else
  DC="docker compose"
fi
printf "Admin password for %s: " "$EMAIL"; trap 'stty echo' EXIT INT; stty -echo; read -r PW; stty echo; echo
[ -n "$PW" ] || { echo "empty password" >&2; exit 1; }
# password goes via the environment, not argv (argv is visible in ps)
export ADMIN_EMAIL="$EMAIL" ADMIN_PW="$PW"
$DC run --rm -e ADMIN_EMAIL -e ADMIN_PW migrate sh -c 'npx medusa user -e "$ADMIN_EMAIL" -p "$ADMIN_PW"'
