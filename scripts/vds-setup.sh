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

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       ДПС Радар — настройка сервера          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 0. Проверка root ──────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Запустите скрипт под root: sudo bash scripts/vds-setup.sh"

# ── 1. Зависимости ────────────────────────────────────────────────────────────
info "Устанавливаю nginx и certbot..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx

# ── 2. Nginx конфиг (HTTP → прокси на Express) ────────────────────────────────
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

# Убираем дефолтный сайт, включаем наш
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/dps-radar /etc/nginx/sites-enabled/dps-radar

# Освобождаем порт 80 если занят не nginx-ом
if ss -tlnp | grep -q ':80 ' && ! systemctl is-active --quiet nginx; then
    warn "Порт 80 занят. Останавливаю Apache/другие сервисы..."
    systemctl stop apache2 2>/dev/null || true
    systemctl disable apache2 2>/dev/null || true
    fuser -k 80/tcp 2>/dev/null || true
    sleep 1
fi

nginx -t
systemctl enable nginx
systemctl start nginx 2>/dev/null || systemctl restart nginx
info "nginx запущен"

# ── 3. SSL-сертификат ─────────────────────────────────────────────────────────
if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    warn "Сертификат для ${DOMAIN} уже есть — пропускаю certbot"
else
    info "Получаю SSL-сертификат (Let's Encrypt)..."
    warn "Убедитесь, что DNS ${DOMAIN} → $(curl -s ifconfig.me) уже обновился!"
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
        --register-unsafely-without-email || {
        warn "certbot не прошёл. Если домен ещё не указывает на этот IP — запустите скрипт позже."
        warn "Продолжаю без HTTPS пока что..."
    }
fi

# ── 4. Читаю текущие env-переменные pm2 (чтобы не потерять DATABASE_URL и т.д.) ──
EXISTING_ENV=""
if pm2 show api-server &>/dev/null 2>&1; then
    warn "Читаю переменные из текущего pm2-процесса..."
    # Достаём переменные, которые точно нужны
    DB_URL=$(pm2 env 0 2>/dev/null | grep DATABASE_URL | head -1 | sed "s/.*DATABASE_URL: //;s/ .*//") || true
    SESSION_SEC=$(pm2 env 0 2>/dev/null | grep SESSION_SECRET | head -1 | sed "s/.*SESSION_SECRET: //;s/ .*//") || true
    TG_TOKEN=$(pm2 env 0 2>/dev/null | grep TELEGRAM_BOT_TOKEN | head -1 | sed "s/.*TELEGRAM_BOT_TOKEN: //;s/ .*//") || true
    TG_USER=$(pm2 env 0 2>/dev/null | grep TELEGRAM_BOT_USERNAME | head -1 | sed "s/.*TELEGRAM_BOT_USERNAME: //;s/ .*//") || true
fi

# Если pm2 env не дал результат — пробуем из .env файлов
load_env_var() {
    local varname="$1"
    local val="${!varname:-}"
    if [[ -z "$val" ]]; then
        val=$(grep -h "^${varname}=" "${HOME}/.env" "${APP_DIR}/.env" "${APP_DIR}/artifacts/api-server/.env" 2>/dev/null \
              | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'") || true
    fi
    echo "$val"
}

[[ -z "${DB_URL:-}" ]]      && DB_URL=$(load_env_var DATABASE_URL)
[[ -z "${SESSION_SEC:-}" ]] && SESSION_SEC=$(load_env_var SESSION_SECRET)
[[ -z "${TG_TOKEN:-}" ]]    && TG_TOKEN=$(load_env_var TELEGRAM_BOT_TOKEN)
[[ -z "${TG_USER:-}" ]]     && TG_USER=$(load_env_var TELEGRAM_BOT_USERNAME)

# Просим ввести вручную то, чего не нашли
prompt_if_empty() {
    local varname="$1"; local prompt="$2"; local secret="${3:-no}"
    local val="${!varname:-}"
    if [[ -z "$val" ]]; then
        if [[ "$secret" == "yes" ]]; then
            read -rsp "  → Введите ${prompt}: " val; echo ""
        else
            read -rp  "  → Введите ${prompt}: " val
        fi
    fi
    eval "$varname=\"$val\""
}

echo ""
echo "─── Переменные окружения ────────────────────────"
prompt_if_empty DB_URL      "DATABASE_URL (postgres://...)"       yes
prompt_if_empty SESSION_SEC "SESSION_SECRET (случайная строка)"   yes
prompt_if_empty TG_TOKEN    "TELEGRAM_BOT_TOKEN"                  yes
prompt_if_empty TG_USER     "TELEGRAM_BOT_USERNAME (без @)"       no
echo "─────────────────────────────────────────────────"
echo ""

# ── 5. Пишу ecosystem.config.cjs ─────────────────────────────────────────────
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
      DATABASE_URL:          '${DB_URL}',
      SESSION_SECRET:        '${SESSION_SEC}',
      TELEGRAM_BOT_TOKEN:    '${TG_TOKEN}',
      TELEGRAM_BOT_USERNAME: '${TG_USER}',
    }
  }]
}
EOF

# ── 6. Сборка ─────────────────────────────────────────────────────────────────
info "Обновляю код..."
cd "${APP_DIR}"
git pull

info "Собираю API-сервер..."
pnpm --filter @workspace/api-server run build

info "Собираю фронтенд..."
BASE_PATH=/dps-radar/ pnpm --filter @workspace/dps-radar run build

# ── 7. Перезапуск pm2 ────────────────────────────────────────────────────────
info "Перезапускаю pm2..."
pm2 delete api-server 2>/dev/null || true
pm2 start "${ECOSYSTEM}"
pm2 save
pm2 startup 2>/dev/null | tail -1 | bash 2>/dev/null || true

# ── 8. Итог ──────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Готово!                                                 ║"
echo "║                                                          ║"
echo "║  Мини-приложение: https://${DOMAIN}/dps-radar/  ║"
echo "║  Webhook бота:    https://${DOMAIN}/api/dps-radar/      ║"
echo "║                   telegram-webhook                       ║"
echo "║                                                          ║"
echo "║  Логи:  pm2 logs api-server                              ║"
echo "║  Стат:  pm2 monit                                        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
