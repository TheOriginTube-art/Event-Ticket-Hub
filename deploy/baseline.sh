#!/usr/bin/env bash
# deploy/baseline.sh — One-time baseline for databases initialised with drizzle-kit push.
#
# WHEN TO RUN
#   Run this script ONCE on any production database that was previously set up
#   with `drizzle-kit push` before switching to the versioned-migration workflow.
#   After running it, `drizzle-kit migrate` (and deploy/update.sh) will work
#   correctly — migration 0000 will be treated as already applied.
#
#   For brand-new (empty) databases you do NOT need to run this script;
#   `drizzle-kit migrate` will create all tables from scratch.
#
# USAGE
#   # Option A — connect directly with DATABASE_URL
#   DATABASE_URL=postgresql://dpsradar:<password>@<host>:5432/dpsradar \
#     bash deploy/baseline.sh
#
#   # Option B — run psql inside the running postgres container
#   docker compose -f deploy/docker-compose.yml exec postgres bash
#   # then inside the container:
#   DATABASE_URL=postgresql://dpsradar:<password>@localhost:5432/dpsradar \
#     bash deploy/baseline.sh
#
# SAFETY
#   The script is fully idempotent: running it multiple times is safe.

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✓ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠  $*${RESET}"; }
fail()  { echo -e "${RED}✗ $*${RESET}"; }

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
echo -e "${BOLD}  ДПС Радар — migration baseline${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"

# ── Require DATABASE_URL ──────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is not set."
  echo "  Export it before running this script:"
  echo "    DATABASE_URL=postgresql://dpsradar:<password>@localhost:5432/dpsradar \\"
  echo "      bash deploy/baseline.sh"
  exit 1
fi

# ── These values must match lib/db/migrations/meta/_journal.json exactly ──────
# Migration tag : 0000_useful_tarot
# SHA-256 of the SQL file content (lib/db/migrations/0000_useful_tarot.sql):
MIGRATION_HASH="c2f78215a7db6c2c7448ee90952917e0d5838eb42542ccce69f457258203412c"
# journal entry "when" timestamp (milliseconds since epoch):
MIGRATION_MILLIS="1784337046392"

# ── Locate psql ───────────────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  fail "psql is not installed or not in PATH."
  echo "  Install it (e.g. apt install postgresql-client) and re-run."
  exit 1
fi

# ── Check whether application tables already exist (push-based DB) ────────────
step "Detecting database state…"
HAS_TABLES=$(psql -tAX "$DATABASE_URL" \
  -c "SELECT count(*) FROM information_schema.tables \
      WHERE table_schema = 'public' AND table_name = 'dps_events';" 2>/dev/null || echo "0")

if [[ "$HAS_TABLES" == "0" ]]; then
  warn "No application tables found — this looks like a fresh database."
  warn "You do NOT need to run baseline.sh on a fresh database."
  warn "Simply run:  docker compose -f deploy/docker-compose.yml --profile migrate run --rm migrate"
  exit 0
fi

ok "Application tables detected (push-based database confirmed)."

# ── Create drizzle tracking schema and table (idempotent) ────────────────────
step "Creating drizzle migration-tracking schema and table…"
psql "$DATABASE_URL" <<SQL
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id         SERIAL PRIMARY KEY,
  hash       text   NOT NULL,
  created_at bigint
);
SQL
ok "Schema and table ready."

# ── Check whether migration 0000 is already recorded ─────────────────────────
step "Checking whether migration 0000 is already recorded…"
EXISTS=$(psql -tAX "$DATABASE_URL" \
  -c "SELECT count(*) FROM drizzle.__drizzle_migrations WHERE hash = '$MIGRATION_HASH';")

if [[ "$EXISTS" -gt "0" ]]; then
  ok "Migration 0000 is already marked as applied — nothing to do."
else
  psql "$DATABASE_URL" <<SQL
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('$MIGRATION_HASH', $MIGRATION_MILLIS);
SQL
  ok "Migration 0000 recorded in drizzle.__drizzle_migrations."
fi

echo ""
echo -e "${GREEN}${BOLD}Baseline complete.${RESET}"
echo "The database is now ready for versioned migrations."
echo ""
echo "Next step — deploy as usual:"
echo "  bash deploy/update.sh"
