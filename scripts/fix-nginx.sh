#!/bin/bash
set -e

HOST_CONF="/root/Event-Ticket-Hub/nginx.conf"
echo "=== Редактирую host nginx конфиг: $HOST_CONF ==="

echo "--- Текущее содержимое ---"
cat "$HOST_CONF"

echo ""
echo "=== Добавляю DPS Radar location блоки ==="

python3 - "$HOST_CONF" <<'PYEOF'
import sys, re

path = sys.argv[1]
with open(path) as f:
    conf = f.read()

dps_static = """
    # DPS Radar static frontend
    location /dps-radar/ {
        proxy_pass http://172.17.0.1:5174/dps-radar/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
"""

dps_api = """
    # DPS Radar API
    location /api/dps-radar/ {
        proxy_pass http://172.17.0.1:8080/api/dps-radar/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
"""

# Не добавлять повторно
if '/dps-radar/' not in conf:
    # Вставить перед блоком location /api/ или location /
    target = re.search(r'(\s*# (?:Proxy API|Single-page|location\s*/[^\n]*))', conf)
    if target:
        pos = target.start()
        conf = conf[:pos] + dps_static + dps_api + conf[pos:]
    else:
        # Вставить перед последней закрывающей } в server блоке
        pos = conf.rfind('}')
        conf = conf[:pos] + dps_static + dps_api + '\n' + conf[pos:]
    with open(path, 'w') as f:
        f.write(conf)
    print("Блоки DPS Radar добавлены.")
else:
    print("Блоки DPS Radar уже присутствуют, пропускаю.")
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
echo "Готово! Проверь: https://ticketflowru.ru/api/dps-radar/cameras"
