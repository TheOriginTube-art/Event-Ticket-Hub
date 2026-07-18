#!/bin/bash
set -e

echo "=== Нахожу nginx-контейнер ==="
NGINX_CTR=""
for id in $(docker ps -q); do
    if docker exec "$id" which nginx >/dev/null 2>&1; then
        NGINX_CTR="$id"
        break
    fi
done
echo "Контейнер: $NGINX_CTR"

echo "=== Монтирования контейнера ==="
docker inspect "$NGINX_CTR" --format '{{json .Mounts}}' | python3 -c "
import json,sys
mounts = json.load(sys.stdin)
for m in mounts:
    print(m.get('Source','?'), '->', m.get('Destination','?'))
"

echo "=== Ищу host-путь к default.conf ==="
HOST_CONF=$(docker inspect "$NGINX_CTR" --format '{{json .Mounts}}' | python3 -c "
import json,sys
mounts = json.load(sys.stdin)
for m in mounts:
    dest = m.get('Destination','')
    src = m.get('Source','')
    if 'conf' in dest or 'nginx' in dest:
        print(src)
" | head -1)

if [ -z "$HOST_CONF" ]; then
    echo "Монтирование конфига не найдено, ищу через /proc..."
    # Альтернативный способ — найти через /proc
    PID=$(docker inspect "$NGINX_CTR" --format '{{.State.Pid}}')
    nsenter -t "$PID" -m -- find /etc/nginx/conf.d -name "*.conf" 2>/dev/null | head -5
    HOST_CONF=$(findmnt -n -o SOURCE --target /proc/$PID/root/etc/nginx/conf.d/default.conf 2>/dev/null || echo "")
fi

echo "Host путь к конфигу: ${HOST_CONF:-не найден}"

echo ""
echo "=== docker-compose файлы ==="
find / -name "docker-compose*.yml" -not -path "*/proc/*" 2>/dev/null | head -5
