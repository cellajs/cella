#!/usr/bin/env bash
# =============================================================================
# Dry-run: verify the dump → current schema migration plan is complete
# =============================================================================
#
# Spins up two throwaway PG17 containers:
#   - dump-db:    restored from the production dump (schema-only)
#   - target-db:  result of `pnpm --filter backend migrate` against an empty DB
#
# After applying pre.sql to target-db, dumps both schemas and diffs them.
# A clean diff (or one limited to known-acceptable noise) means the migration
# script will succeed.
#
# Usage:
#   DUMP_FILE=./dump.custom ./dry-run-schema-diff.sh
# =============================================================================

set -euo pipefail

DUMP_FILE="${DUMP_FILE:?DUMP_FILE env var required}"
DUMP_DIR="$(cd "$(dirname "$DUMP_FILE")" && pwd)"
DUMP_NAME="$(basename "$DUMP_FILE")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cleanup() {
  docker rm -f cella-dryrun-dump cella-dryrun-target >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Start two throwaway PG17 containers"
docker run -d --name cella-dryrun-dump   -e POSTGRES_PASSWORD=pw -p 55411:5432 postgres:17-alpine >/dev/null
docker run -d --name cella-dryrun-target -e POSTGRES_PASSWORD=pw -p 55412:5432 postgres:17-alpine >/dev/null

DUMP_URL='postgres://postgres:pw@localhost:55411/postgres'
TARGET_URL='postgres://postgres:pw@localhost:55412/postgres'

echo "==> Wait for both to accept connections"
for port in 55411 55412; do
  for i in {1..30}; do
    if docker run --rm --network host postgres:17-alpine \
         pg_isready -h localhost -p "$port" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
done

echo "==> Restore SCHEMA ONLY from production dump into dump-db"
docker run --rm --network host -v "$DUMP_DIR:/dump:ro" postgres:17-alpine \
  pg_restore --schema-only --no-owner --no-acl \
  --dbname "$DUMP_URL" "/dump/$DUMP_NAME" 2>&1 | grep -v 'WARNING' || true

echo "==> Apply current Drizzle migrations to target-db"
( cd "$REPO_ROOT/backend" && \
  DATABASE_ADMIN_URL="$TARGET_URL" DATABASE_URL="$TARGET_URL" \
  ./node_modules/.bin/tsx scripts/migrate.ts )

echo "==> Apply pre.sql reshape to target-db"
docker run --rm --network host -v "$SCRIPT_DIR:/scripts:ro" postgres:17-alpine \
  psql "$TARGET_URL" -v ON_ERROR_STOP=1 -f /scripts/migrate-from-dump.pre.sql

echo "==> Dump both schemas"
TMP=$(mktemp -d)
docker run --rm --network host postgres:17-alpine \
  pg_dump --schema-only --no-owner --no-acl --schema=public "$DUMP_URL" \
  | grep -vE '^(--|SET |SELECT pg_catalog|$)' > "$TMP/dump.sql"

docker run --rm --network host postgres:17-alpine \
  pg_dump --schema-only --no-owner --no-acl --schema=public "$TARGET_URL" \
  | grep -vE '^(--|SET |SELECT pg_catalog|$)' > "$TMP/target.sql"

echo "==> Diff (target ← dump). Empty output means the migration is complete."
echo "    Output saved to: $TMP/diff.txt"
diff -u "$TMP/dump.sql" "$TMP/target.sql" > "$TMP/diff.txt" || true
wc -l "$TMP/diff.txt"
echo
echo "--- first 80 diff lines ---"
head -80 "$TMP/diff.txt"
