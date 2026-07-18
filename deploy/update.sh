#!/usr/bin/env bash
# deploy/update.sh — pull latest code, rebuild containers, then health-check.
#
# Usage (run from repo root or from the deploy/ directory):
#   bash deploy/update.sh
#
# Exit code:
#   0 — deploy succeeded and all health checks passed
#   1 — health check failed (containers are up but something is wrong)
#   2 — docker compose itself failed

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

# ── 2. Build & restart containers ────────────────────────────────────────────
step "Building and restarting containers"
docker compose -f "$COMPOSE_FILE" up -d --build || {
  fail "docker compose up failed (exit $?)"
  exit 2
}
ok "Containers started"

# ── 3. Wait for the API server to become ready ───────────────────────────────
# Give containers time to boot before running health checks.
# The health check script already has per-check retries, but we add a small
# initial grace period here so the first attempt isn't against a still-starting
# Node process.
WARMUP_SECONDS=10
step "Waiting ${WARMUP_SECONDS}s for services to warm up…"
sleep "$WARMUP_SECONDS"
ok "Grace period done"

# ── 4. Run post-deploy health checks ─────────────────────────────────────────
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
