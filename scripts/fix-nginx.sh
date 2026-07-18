#!/bin/bash
set -e

CONF=/etc/nginx/sites-available/dps-radar

echo "=== Пишу конфиг nginx ==="
mkdir -p /var/www/html/.well-known/acme-challenge
cat > "$CONF" << 'NGINXEOF'
server {
    listen 80;
    server_name ticketflowru.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location /dps-radar/ {
        proxy_pass http://localhost:8080/dps-radar/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/dps-radar/ {
        proxy_pass http://localhost:8080/api/dps-radar/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINXEOF

ln -sf "$CONF" /etc/nginx/sites-enabled/dps-radar
nginx -t && systemctl reload nginx

echo "=== Кладу test-файл ==="
echo "ok" > /var/www/html/.well-known/acme-challenge/test
sleep 1

echo "--- Тест через localhost ---"
curl -s --max-time 5 -H "Host: ticketflowru.ru" http://localhost/.well-known/acme-challenge/test || echo "FAIL"

echo "--- Тест через публичный домен (ticketflowru.ru) ---"
curl -s --max-time 10 http://ticketflowru.ru/.well-known/acme-challenge/test || echo "FAIL"

echo "--- Что слушает :80 ---"
ss -tlnp | grep :80 || echo "никто"

echo "--- sites-enabled ---"
ls /etc/nginx/sites-enabled/

rm -f /var/www/html/.well-known/acme-challenge/test
echo "=== Скопируй вывод выше и отправь разработчику ==="
