#!/bin/bash
set -e

echo "=== Docker контейнеры на порту 80 ==="
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Ports}}" | grep -E "0.0.0.0:80|Header"

echo ""
echo "=== Останавливаю Docker-контейнеры на порту 80 ==="
CONTAINERS=$(docker ps --format "{{.ID}} {{.Ports}}" | grep "0\.0\.0\.0:80->" | awk '{print $1}')
if [ -n "$CONTAINERS" ]; then
    echo "Останавливаю: $CONTAINERS"
    docker stop $CONTAINERS
else
    echo "Нет контейнеров на 80"
fi

echo ""
echo "=== Останавливаю nginx, запускаю certbot standalone ==="
systemctl stop nginx 2>/dev/null || true
sleep 1
certbot certonly --standalone -d ticketflowru.ru

echo ""
echo "=== Запускаю контейнеры обратно ==="
[ -n "$CONTAINERS" ] && docker start $CONTAINERS || true
systemctl start nginx 2>/dev/null || true

echo ""
echo "=== Пишу nginx конфиг с HTTPS ==="
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
cat > /etc/nginx/sites-available/dps-radar << 'NGINXEOF'
server {
    listen 80;
    server_name ticketflowru.ru;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name ticketflowru.ru;
    ssl_certificate /etc/letsencrypt/live/ticketflowru.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ticketflowru.ru/privkey.pem;

    location /dps-radar/ {
        proxy_pass http://localhost:8080/dps-radar/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/dps-radar/ {
        proxy_pass http://localhost:8080/api/dps-radar/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/dps-radar /etc/nginx/sites-enabled/dps-radar
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "=== Готово! https://ticketflowru.ru/dps-radar/ ==="
