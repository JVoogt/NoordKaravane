#!/bin/sh
# Print the Medusa publishable API key(s) (title|token). Runs ON the Pi, from infra/.   [staging]
set -eu
export DOCKER_API_VERSION=1.41
if [ "${1:-}" = "staging" ]; then
  DC="docker compose -p nkshop-staging --env-file .env.staging -f docker-compose.yml -f compose.staging.yml"
else
  DC="docker compose"
fi
echo "select title, token from api_key where type = 'publishable' and deleted_at is null;" \
  | $DC exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'
