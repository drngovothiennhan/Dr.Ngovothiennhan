#!/usr/bin/env bash
set -euo pipefail
EXPECTED_PROJECT_ID='yhct-social-260902-42a4'
SQL_INSTANCE='yhct-postgres'
DB_NAME='yhct'
DB_USER='yhct_app'
PASSWORD_SECRET='yhct-db-password'
PROXY_PORT="${PROXY_PORT:-5433}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
[[ "$PROJECT_ID" == "$EXPECTED_PROJECT_ID" ]] || { echo 'MIGRATION_GATE=FAIL project mismatch' >&2; exit 1; }
command -v psql >/dev/null || { echo 'MIGRATION_GATE=FAIL psql missing' >&2; exit 1; }
PROXY_BIN="${CLOUD_SQL_PROXY_BIN:-cloud-sql-proxy}"
command -v "$PROXY_BIN" >/dev/null || { echo 'MIGRATION_GATE=FAIL cloud-sql-proxy missing' >&2; exit 1; }
CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID" --format='value(connectionName)' --quiet)"
[[ -n "$CONNECTION_NAME" ]] || { echo 'MIGRATION_GATE=FAIL connection name missing' >&2; exit 1; }
"$PROXY_BIN" --quiet --address 127.0.0.1 --port "$PROXY_PORT" "$CONNECTION_NAME" >/tmp/yhct-cloud-sql-proxy.log 2>&1 &
PROXY_PID=$!
cleanup(){ kill "$PROXY_PID" 2>/dev/null || true; unset PGPASSWORD; }
trap cleanup EXIT
for _ in $(seq 1 40); do (echo >/dev/tcp/127.0.0.1/"$PROXY_PORT") >/dev/null 2>&1 && break; sleep 0.25; done
export PGPASSWORD="$(gcloud secrets versions access latest --secret "$PASSWORD_SECRET" --project "$PROJECT_ID" --quiet)"
for migration in database/001_yhct_social.sql database/002_auth_governance.sql database/003_seed_club_members.sql database/004_management_role_refresh.sql; do
  echo "Applying $migration"
  psql "host=127.0.0.1 port=$PROXY_PORT dbname=$DB_NAME user=$DB_USER sslmode=disable" -v ON_ERROR_STOP=1 -f "$migration"
done
psql "host=127.0.0.1 port=$PROXY_PORT dbname=$DB_NAME user=$DB_USER sslmode=disable" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_name in ('users','posts','comments','auth_accounts','auth_sessions','ui_theme_config','moderation_queue');" | grep -qx '7' || { echo 'MIGRATION_GATE=FAIL reconciliation' >&2; exit 1; }
echo 'MIGRATION_GATE=PASS'
