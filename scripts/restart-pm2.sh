#!/bin/bash
# Пересоздаёт ecosystem.config.cjs и запускает api-server через pm2.
# Запускать: bash scripts/restart-pm2.sh
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIST="${APP_DIR}/artifacts/api-server/dist/index.mjs"
API_CWD="${APP_DIR}/artifacts/api-server"
ECOSYSTEM="${HOME}/ecosystem.config.cjs"
DB_PASS_FILE="${HOME}/.dpsradar_db_pass"
DOMAIN="ticketflowru.ru"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── DB_PASS ───────────────────────────────────────────────────────────────────
if [[ -f "$DB_PASS_FILE" ]]; then
    DB_PASS=$(cat "$DB_PASS_FILE")
    ok "DB_PASS прочитан из $DB_PASS_FILE"
else
    read -rsp "→ Введите пароль БД dpsradar: " DB_PASS; echo
fi
DATABASE_URL="postgresql://dpsradar:${DB_PASS}@localhost:5432/dpsradar"

# ── SESSION_SECRET ─────────────────────────────────────────────────────────────
SESSION_SECRET=""
# Пробуем найти в старых .env файлах
for f in "${HOME}/.env" "${APP_DIR}/.env" "${APP_DIR}/artifacts/api-server/.env"; do
    if [[ -f "$f" ]]; then
        val=$(grep -E '^SESSION_SECRET=' "$f" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
        [[ -n "$val" ]] && SESSION_SECRET="$val" && ok "SESSION_SECRET найден в $f" && break
    fi
done
if [[ -z "$SESSION_SECRET" ]]; then
    read -rsp "→ Введите SESSION_SECRET: " SESSION_SECRET; echo
fi

# ── TELEGRAM ──────────────────────────────────────────────────────────────────
TG_TOKEN=""
TG_USER=""
for f in "${HOME}/.env" "${APP_DIR}/.env" "${APP_DIR}/artifacts/api-server/.env"; do
    if [[ -f "$f" ]]; then
        t=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$f" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
        u=$(grep -E '^TELEGRAM_BOT_USERNAME=' "$f" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
        [[ -n "$t" ]] && TG_TOKEN="$t" && ok "TELEGRAM_BOT_TOKEN найден в $f"
        [[ -n "$u" ]] && TG_USER="$u" && ok "TELEGRAM_BOT_USERNAME найден в $f"
        [[ -n "$t" ]] && break
    fi
done
if [[ -z "$TG_TOKEN" ]]; then
    read -rsp "→ Введите TELEGRAM_BOT_TOKEN: " TG_TOKEN; echo
fi
if [[ -z "$TG_USER" ]]; then
    read -rp "→ Введите TELEGRAM_BOT_USERNAME (без @): " TG_USER
fi

# ── Проверяем что dist существует ─────────────────────────────────────────────
if [[ ! -f "$API_DIST" ]]; then
    warn "dist не найден, собираю..."
    cd "$APP_DIR"
    pnpm --filter @workspace/api-server run build
    ok "Сборка завершена"
fi

# ── Пишем ecosystem ───────────────────────────────────────────────────────────
cat > "$ECOSYSTEM" << EOF
module.exports = {
  apps: [{
    name: 'api-server',
    script: '${API_DIST}',
    cwd: '${API_CWD}',
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV:              'production',
      PORT:                  '8080',
      PUBLIC_BASE_URL:       'https://${DOMAIN}',
      DATABASE_URL:          '${DATABASE_URL}',
      SESSION_SECRET:        '${SESSION_SECRET}',
      TELEGRAM_BOT_TOKEN:    '${TG_TOKEN}',
      TELEGRAM_BOT_USERNAME: '${TG_USER}',
    }
  }]
}
EOF
ok "Ecosystem сохранён: $ECOSYSTEM"

# ── pm2 ───────────────────────────────────────────────────────────────────────
pm2 delete api-server 2>/dev/null || true
pm2 start "$ECOSYSTEM"
pm2 save
pm2 startup 2>/dev/null | grep "^sudo" | bash 2>/dev/null || true
ok "pm2 запущен"

echo ""
pm2 list
echo ""
echo "=== Проверка ==="
sleep 2
curl -s http://localhost:8080/api/dps-radar/cameras | head -c 200 && echo ""
echo ""
ok "Готово! https://${DOMAIN}/dps-radar/"
