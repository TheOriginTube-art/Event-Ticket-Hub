#!/bin/bash
set -e

HOST_CONF="/root/Event-Ticket-Hub/nginx.conf"
echo "=== Обновляю DPS Radar location блоки в $HOST_CONF ==="

python3 - "$HOST_CONF" <<'PYEOF'
import sys, re

path = sys.argv[1]
with open(path) as f:
    conf = f.read()

# Удалить все старые блоки DPS Radar (если были добавлены ранее с неверным портом)
conf = re.sub(
    r'\n\s*# DPS Radar.*?(?=\n\s*(?:#|location|server|$))',
    '',
    conf,
    flags=re.DOTALL
)
# Дополнительно убрать осиротевшие location /dps-radar/ и /api/dps-radar/ блоки
conf = re.sub(
    r'\n\s*location\s+/(?:api/)?dps-radar/\s*\{[^}]*\}',
    '',
    conf,
    flags=re.DOTALL
)

new_block = """
    # DPS Radar — статика + API через pm2 (host:8080)
    location /dps-radar/ {
        proxy_pass http://172.17.0.1:8080/dps-radar/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
"""

# Вставить перед location /api/ или location /
m = re.search(r'(\n\s*(?:# (?:Proxy API|Single-page)|location\s*/(?:api)?[/ {]))', conf)
if m:
    pos = m.start()
    conf = conf[:pos] + new_block + conf[pos:]
else:
    pos = conf.rfind('}')
    conf = conf[:pos] + new_block + '\n' + conf[pos:]

with open(path, 'w') as f:
    f.write(conf)
print("Готово.")
PYEOF

echo ""
echo "--- Итоговый конфиг ---"
cat "$HOST_CONF"

echo ""
echo "=== Нахожу nginx-контейнер ==="
NGINX_CTR=""
for id in $(docker ps -q); do
    if docker exec "$id" which nginx >/dev/null 2>&1; then
        NGINX_CTR="$id"
        break
    fi
done
echo "Контейнер: $NGINX_CTR"

echo "=== Проверка синтаксиса ==="
docker exec "$NGINX_CTR" nginx -t

echo "=== Перезагрузка nginx ==="
docker exec "$NGINX_CTR" nginx -s reload

echo ""
echo "=== Проверяю pm2 ==="
pm2 list 2>/dev/null || echo "(pm2 не установлен или не запущен)"

echo ""
echo "Готово! Проверь:"
echo "  curl -s https://ticketflowru.ru/dps-radar/"
echo "  curl -s https://ticketflowru.ru/api/dps-radar/cameras | head -c 200"
