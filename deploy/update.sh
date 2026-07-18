#!/usr/bin/env bash
# deploy/update.sh — pull latest code, rebuild containers, then health-check.
#
# Usage (run from repo root or from the deploy/ directory):
#   bash deploy/update.sh
#
# Exit code:
#   0 — deploy succeeded and all health checks passed
#   1 — health check failed (containers are up but something is wrong)
#   2 — docker compose or migration failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

# ── Colour helpers ────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
fail() { echo -e "${RED}✗ $*${RESET}"; }

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
echo -e "${BOLD}  ДПС Радар — deploy & health check${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
step "Pulling latest code"
cd "$REPO_ROOT"
git pull
ok "Code up to date"

# ── 2. Ensure postgres is running ─────────────────────────────────────────────
step "Ensuring postgres is up"
docker compose -f "$COMPOSE_FILE" up -d postgres

# Wait up to 40 s for postgres to become healthy
for i in $(seq 1 20); do
  STATUS=$(docker compose -f "$COMPOSE_FILE" ps --format json postgres 2>/dev/null \
    | grep -o '"Health":"[^"]*"' | grep -o '[^"]*$' || echo "unknown")
  [[ "$STATUS" == "healthy" ]] && break
  sleep 2
done
ok "Postgres is up"

# ── 3. Guard against push-based databases ─────────────────────────────────────
# Detect databases that were initialised with `drizzle-kit push` and have never
# been tracked by `drizzle-kit migrate`.  Trying to run migrate on such a DB
# would fail with "relation already exists" errors.
step "Checking database migration state"
HAS_TRACKING=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U dpsradar -tAX -c \
  "SELECT count(*) FROM information_schema.tables \
   WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations';" \
  2>/dev/null || echo "0")
HAS_TABLES=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U dpsradar -tAX -c \
  "SELECT count(*) FROM information_schema.tables \
   WHERE table_schema = 'public' AND table_name = 'dps_events';" \
  2>/dev/null || echo "0")

if [[ "${HAS_TRACKING:-0}" == "0" && "${HAS_TABLES:-0}" -gt "0" ]]; then
  fail "Push-based database detected — drizzle migration tracking is missing."
  echo ""
  echo "  This database was previously set up with  drizzle-kit push."
  echo "  Run the one-time baseline script before deploying:"
  echo ""
  echo "    DATABASE_URL=postgresql://dpsradar:<password>@localhost:5432/dpsradar \\"
  echo "      bash $SCRIPT_DIR/baseline.sh"
  echo ""
  echo "  Then re-run:  bash $SCRIPT_DIR/update.sh"
  exit 2
fi
ok "Database state OK"

# ── 4. Apply pending migrations ───────────────────────────────────────────────
step "Applying database migrations"
docker compose -f "$COMPOSE_FILE" --profile migrate run --rm migrate || {
  fail "Database migration failed (exit $?)"
  exit 2
}
ok "Migrations applied"

# ── 5. Build & restart containers ────────────────────────────────────────────
step "Building and restarting containers"
docker compose -f "$COMPOSE_FILE" up -d --build || {
  fail "docker compose up failed (exit $?)"
  exit 2
}
ok "Containers started"

# ── 6. Wait for the API server to become ready ───────────────────────────────
# Give containers time to boot before running health checks.
# The health check script already has per-check retries, but we add a small
# initial grace period here so the first attempt isn't against a still-starting
# Node process.
WARMUP_SECONDS=10
step "Waiting ${WARMUP_SECONDS}s for services to warm up…"
sleep "$WARMUP_SECONDS"
ok "Grace period done"

# ── 7. Run post-deploy health checks ─────────────────────────────────────────
step "Running health checks"
bash "$SCRIPT_DIR/healthcheck.sh" && HC_EXIT=0 || HC_EXIT=$?

echo ""
if [[ $HC_EXIT -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}Deploy complete — all checks passed ✓${RESET}"
  exit 0
else
  fail "One or more health checks failed. Check the output above."
  echo "  Hint: run  docker compose -f $COMPOSE_FILE logs api  for details."
  exit 1
fi
