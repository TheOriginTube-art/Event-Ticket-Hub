#!/bin/bash
# =============================================================================
#  ДПС Радар — автонастройка VDS
#  Домен: ticketflowru.ru  →  Express на localhost:8080
#
#  Запуск: bash scripts/vds-setup.sh
# =============================================================================
set -euo pipefail

DOMAIN="ticketflowru.ru"
PUBLIC_BASE_URL="https://${DOMAIN}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIST="${APP_DIR}/artifacts/api-server/dist/index.mjs"
API_CWD="${APP_DIR}/artifacts/api-server"
ECOSYSTEM="${HOME}/ecosystem.config.cjs"
PORT=8080
DB_NAME="dpsradar"
DB_USER="dpsradar"
DB_PASS="dpsradar_$(tr -dc 'a-z0-9' < /dev/urandom | head -c 12)"
DB_PASS_FILE="${HOME}/.dpsradar_db_pass"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       ДПС Радар — настройка сервера          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 0. Root ───────────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Запустите под root: sudo bash scripts/vds-setup.sh"

# ── 1. Системные пакеты ───────────────────────────────────────────────────────
info "Устанавливаю пакеты (nginx, certbot, postgresql)..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx postgresql postgresql-contrib

# ── 2. PostgreSQL ─────────────────────────────────────────────────────────────
info "Настраиваю PostgreSQL..."
systemctl enable postgresql
systemctl start postgresql

# Читаем сохранённый пароль если уже запускали скрипт раньше
if [[ -f "$DB_PASS_FILE" ]]; then
    DB_PASS=$(cat "$DB_PASS_FILE")
    info "Использую существующий пароль БД из ${DB_PASS_FILE}"
else
    echo "$DB_PASS" > "$DB_PASS_FILE"
    chmod 600 "$DB_PASS_FILE"
fi

# Создаём пользователя и базу (игнорируем ошибку если уже есть)
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || \
    sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || \
    warn "База ${DB_NAME} уже существует — пропускаю"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
info "DATABASE_URL сформирован"

# ── 3. Читаем остальные переменные из pm2 или файлов ─────────────────────────
load_from_pm2() {
    local key="$1"
    pm2 env 0 2>/dev/null | grep "^${key}:" | head -1 | sed "s/^${key}: //" | xargs || true
}
load_from_files() {
    local key="$1"
    grep -rh "^${key}=" "${HOME}/.env" "${APP_DIR}/.env" \
        "${APP_DIR}/artifacts/api-server/.env" 2>/dev/null \
        | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

get_var() {
    local key="$1"; local label="$2"; local secret="${3:-no}"
    local val
    val="$(load_from_pm2 "$key")"
    [[ -z "$val" ]] && val="$(load_from_files "$key")"
    if [[ -z "$val" ]]; then
        if [[ "$secret" == "yes" ]]; then
            read -rsp "  → Введите ${label}: " val; echo ""
        else
            read -rp  "  → Введите ${label}: " val
        fi
    else
        info "${key} найден автоматически"
    fi
    echo "$val"
}

SESSION_SECRET="$(get_var SESSION_SECRET "SESSION_SECRET (любая случайная строка)" yes)"
TG_TOKEN="$(get_var TELEGRAM_BOT_TOKEN "TELEGRAM_BOT_TOKEN" yes)"
TG_USER="$(get_var TELEGRAM_BOT_USERNAME "TELEGRAM_BOT_USERNAME (без @)" no)"

# ── 4. Nginx ──────────────────────────────────────────────────────────────────
info "Настраиваю nginx для ${DOMAIN}..."
cat > /etc/nginx/sites-available/dps-radar << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 20M;

    location / {
        proxy_pass         http://localhost:${PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/dps-radar /etc/nginx/sites-enabled/dps-radar

# Освобождаем порт 80 если занят не nginx-ом
if ss -tlnp | grep -q ':80 ' && ! systemctl is-active --quiet nginx; then
    warn "Порт 80 занят — останавливаю Apache..."
    systemctl stop apache2  2>/dev/null || true
    systemctl disable apache2 2>/dev/null || true
    fuser -k 80/tcp 2>/dev/null || true
    sleep 1
fi

nginx -t
systemctl enable nginx
systemctl start nginx 2>/dev/null || systemctl restart nginx
info "nginx запущен"

# ── 5. SSL ────────────────────────────────────────────────────────────────────
if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    warn "Сертификат для ${DOMAIN} уже есть — пропускаю certbot"
else
    info "Получаю SSL-сертификат..."
    warn "DNS ${DOMAIN} должен указывать на $(curl -s ifconfig.me 2>/dev/null || echo '?')"
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
        --register-unsafely-without-email && \
        info "SSL настроен" || \
        warn "certbot не прошёл — попробуйте позже когда DNS обновится"
fi

# ── 6. Ecosystem pm2 ─────────────────────────────────────────────────────────
info "Создаю ${ECOSYSTEM}..."
cat > "${ECOSYSTEM}" << EOF
module.exports = {
  apps: [{
    name: 'api-server',
    script: '${API_DIST}',
    cwd: '${API_CWD}',
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV:              'production',
      PORT:                  '${PORT}',
      PUBLIC_BASE_URL:       '${PUBLIC_BASE_URL}',
      DATABASE_URL:          '${DATABASE_URL}',
      SESSION_SECRET:        '${SESSION_SECRET}',
      TELEGRAM_BOT_TOKEN:    '${TG_TOKEN}',
      TELEGRAM_BOT_USERNAME: '${TG_USER}',
    }
  }]
}
EOF

# ── 7. Сборка ─────────────────────────────────────────────────────────────────
info "git pull..."
cd "${APP_DIR}"
git pull

info "Собираю API-сервер..."
pnpm --filter @workspace/api-server run build

info "Собираю фронтенд..."
BASE_PATH=/dps-radar/ pnpm --filter @workspace/dps-radar run build

info "Применяю миграции БД..."
DATABASE_URL="${DATABASE_URL}" pnpm --filter db push

# ── 8. pm2 ────────────────────────────────────────────────────────────────────
info "Перезапускаю pm2..."
pm2 delete api-server 2>/dev/null || true
pm2 start "${ECOSYSTEM}"
pm2 save
pm2 startup 2>/dev/null | grep "^sudo" | bash 2>/dev/null || true

# ── 9. Итог ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Готово!                                                     ║"
printf "║  Мини-приложение:  https://%-35s║\n" "${DOMAIN}/dps-radar/"
printf "║  Пароль БД сохранён в: %-38s║\n" "${DB_PASS_FILE}"
echo "║                                                              ║"
echo "║  Логи:   pm2 logs api-server                                 ║"
echo "║  Статус: pm2 monit                                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
