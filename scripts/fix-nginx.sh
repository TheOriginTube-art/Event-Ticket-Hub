#!/bin/bash
set -e

echo "=== Нахожу nginx-контейнер ==="
NGINX_CTR=""
for id in $(docker ps -q); do
    if docker exec "$id" which nginx >/dev/null 2>&1; then
        NGINX_CTR="$id"
        NGINX_NAME=$(docker inspect --format '{{.Name}}' "$id" | tr -d '/')
        echo "Найден: $NGINX_NAME ($id)"
        break
    fi
done

if [ -z "$NGINX_CTR" ]; then
    echo "ОШИБКА: nginx-контейнер не найден"
    docker ps
    exit 1
fi

echo "=== Пишу новый конфиг с DPS Радар ==="
# Копируем текущий конфиг с хоста для редактирования
docker exec "$NGINX_CTR" cat /etc/nginx/conf.d/default.conf > /tmp/nginx-original.conf
echo "Текущий конфиг:"
cat /tmp/nginx-original.conf

# Проверяем, не добавлен ли уже dps-radar
if grep -q "dps-radar" /tmp/nginx-original.conf; then
    echo "DPS Радар уже в конфиге"
else
    # Добавляем локации перед закрывающей скобкой последнего server-блока
    python3 - << 'PYEOF'
with open('/tmp/nginx-original.conf') as f:
    content = f.read()

dps_locations = '''
    # DPS Radar
    location /dps-radar/ {
        proxy_pass http://172.17.0.1:8080/dps-radar/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/dps-radar/ {
        proxy_pass http://172.17.0.1:8080/api/dps-radar/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
'''

# Insert before the last closing brace
last_brace = content.rfind('}')
new_content = content[:last_brace] + dps_locations + '}\n'

with open('/tmp/nginx-new.conf', 'w') as f:
    f.write(new_content)
print("Готово")
PYEOF
fi

echo "=== Копирую конфиг в контейнер ==="
docker cp /tmp/nginx-new.conf "$NGINX_CTR":/etc/nginx/conf.d/default.conf

echo "=== Проверяю конфиг внутри контейнера ==="
docker exec "$NGINX_CTR" nginx -t

echo "=== Перезагружаю nginx ==="
docker exec "$NGINX_CTR" nginx -s reload

echo ""
echo "=== Готово! https://ticketflowru.ru/dps-radar/ ==="
