#!/bin/sh
# Restore a pg_dump -Fc archive into the stack's Postgres. Runs ON the Pi, from infra/.
#   ./scripts/restore.sh backups/nkshop-20261103-0230.dump           # production
#   ./scripts/restore.sh backups-staging/xyz.dump staging                   # staging
# DESTRUCTIVE: drops and recreates the database. Stops the Medusa server and worker first.
set -eu
DUMP="${1:?usage: restore.sh <dump file> [staging]}"
[ -f "$DUMP" ] || { echo "no such file: $DUMP" >&2; exit 1; }
export DOCKER_API_VERSION=1.41
if [ "${2:-}" = "staging" ]; then
  DC="docker compose -p nkshop-staging --env-file .env.staging -f docker-compose.yml -f compose.staging.yml"
else
  DC="docker compose"
fi
echo "About to DROP and restore the database from $DUMP ($($DC ps -q postgres | wc -l) postgres container)."
printf "Type 'restore' to continue: "; read -r ans; [ "$ans" = "restore" ] || { echo aborted; exit 1; }

$DC stop medusa-server medusa-worker storefront || true
$DC up -d postgres redis
# wait for postgres
i=0; until $DC exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d postgres' >/dev/null 2>&1; do
  i=$((i+1)); [ $i -gt 30 ] && { echo "postgres not ready" >&2; exit 1; }; sleep 2; done

$DC exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
$DC exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < "$DUMP"
# Redis holds queued jobs / workflow state that refer to the old database: flush it after a restore.
$DC exec -T redis sh -c 'redis-cli flushall' || true
$DC up -d
echo "restore complete"
