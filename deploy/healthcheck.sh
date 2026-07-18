#!/usr/bin/env bash
# deploy/healthcheck.sh — post-deploy health check for ДПС Радар
#
# Usage:
#   bash deploy/healthcheck.sh
#
# Called automatically by deploy/update.sh after every deploy.
# Can also be run manually at any time.
#
# Environment variables (loaded from deploy/.env or exported before running):
#   PUBLIC_BASE_URL     — base URL of the deployed server, e.g. https://example.com
#   TELEGRAM_BOT_TOKEN  — Telegram bot token
#
# Optional tuning (with defaults):
#   HEALTHCHECK_RETRIES      — how many times to retry the API check (default: 6)
#   HEALTHCHECK_RETRY_DELAY  — seconds between retries (default: 5)
#
# Exit codes:
#   0 — all enabled checks passed
#   1 — one or more checks failed

set -euo pipefail

# ── Load deploy/.env if present ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$' | xargs)
fi

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}[OK]${RESET}   $*"; }
fail() { echo -e "  ${RED}[FAIL]${RESET} $*"; FAILED=$((FAILED + 1)); }
skip() { echo -e "  ${YELLOW}[SKIP]${RESET} $*"; }
wait_msg() { echo -e "  ${YELLOW}[WAIT]${RESET} $*"; }

FAILED=0

echo ""
echo "═══════════════════════════════════════════"
echo "  ДПС Радар — post-deploy health check"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. HTTP /api/health  (with retry/backoff for container warm-up) ───────────
echo "1. API server — GET /api/health"
if [[ -z "${PUBLIC_BASE_URL:-}" ]]; then
  skip "PUBLIC_BASE_URL not set — skipping HTTP check"
else
  HTTP_URL="${PUBLIC_BASE_URL%/}/api/health"
  MAX_ATTEMPTS=${HEALTHCHECK_RETRIES:-6}
  RETRY_DELAY=${HEALTHCHECK_RETRY_DELAY:-5}

  HTTP_RESPONSE=""
  HTTP_EXIT=1
  for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
    HTTP_RESPONSE=$(curl -sf --max-time 10 "$HTTP_URL" 2>&1) && HTTP_EXIT=0 && break || HTTP_EXIT=$?
    if [[ $attempt -lt $MAX_ATTEMPTS ]]; then
      wait_msg "API not ready yet (attempt $attempt/$MAX_ATTEMPTS) — retrying in ${RETRY_DELAY}s…"
      sleep "$RETRY_DELAY"
    fi
  done

  if [[ $HTTP_EXIT -eq 0 ]]; then
    STATUS=$(echo "$HTTP_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 || true)
    if [[ "$STATUS" == '"status":"ok"' ]]; then
      ok "Server is up — $HTTP_URL → $STATUS"
    else
      fail "Unexpected response from $HTTP_URL: $HTTP_RESPONSE"
    fi
  else
    fail "Could not reach $HTTP_URL after $MAX_ATTEMPTS attempts (each waited ${RETRY_DELAY}s)"
  fi
fi

echo ""

# ── 2. Telegram getWebhookInfo ────────────────────────────────────────────────
echo "2. Telegram bot — getWebhookInfo"
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  skip "TELEGRAM_BOT_TOKEN not set — skipping Telegram check"
else
  TG_URL="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
  TG_RESPONSE=$(curl -sf --max-time 10 "$TG_URL" 2>&1) && TG_EXIT=0 || TG_EXIT=$?

  if [[ $TG_EXIT -ne 0 ]]; then
    fail "Could not reach Telegram API (curl exit $TG_EXIT)"
  else
    TG_OK=$(echo "$TG_RESPONSE" | grep -o '"ok":true' || true)
    if [[ -z "$TG_OK" ]]; then
      fail "Telegram API returned ok:false — $TG_RESPONSE"
    else
      WEBHOOK_URL=$(echo "$TG_RESPONSE" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//;s/"//')
      LAST_ERROR=$(echo "$TG_RESPONSE" | grep -o '"last_error_message":"[^"]*"' | head -1 | sed 's/"last_error_message":"//;s/"//' || true)
      PENDING=$(echo "$TG_RESPONSE" | grep -o '"pending_update_count":[0-9]*' | head -1 | sed 's/"pending_update_count"://' || echo "?")

      if [[ -z "$WEBHOOK_URL" ]]; then
        fail "Webhook is NOT registered (url is empty)"
      else
        ok "Webhook registered: $WEBHOOK_URL"
        ok "Pending updates: $PENDING"
        if [[ -n "$LAST_ERROR" ]]; then
          fail "Last webhook error: $LAST_ERROR"
        else
          ok "No recent webhook errors"
        fi
      fi
    fi
  fi
fi

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════"
if [[ $FAILED -eq 0 ]]; then
  echo -e "  ${GREEN}All checks passed ✓${RESET}"
  echo "═══════════════════════════════════════════"
  echo ""
  exit 0
else
  echo -e "  ${RED}$FAILED check(s) failed ✗${RESET}"
  echo "═══════════════════════════════════════════"
  echo ""
  exit 1
fi
