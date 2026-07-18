#!/bin/bash

echo "=== Docker контейнеры ==="
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}"

echo ""
echo "=== Ищу nginx внутри контейнеров ==="
for id in $(docker ps -q); do
    name=$(docker inspect --format '{{.Name}}' $id)
    if docker exec $id which nginx 2>/dev/null; then
        echo "nginx найден в: $name ($id)"
        echo "--- nginx конфиги внутри ---"
        docker exec $id find /etc/nginx /usr/local/nginx -name "*.conf" 2>/dev/null | head -10
        echo "--- default site ---"
        docker exec $id cat /etc/nginx/conf.d/default.conf 2>/dev/null \
            || docker exec $id cat /etc/nginx/sites-enabled/default 2>/dev/null \
            || echo "не найдено"
    fi
done

echo ""
echo "=== Docker host IP (для proxy_pass изнутри контейнера) ==="
docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || echo "172.17.0.1"
