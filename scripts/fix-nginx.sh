#!/bin/bash
set -e

API_PORT=8080
CONF=/etc/nginx/sites-available/dps-radar

echo "=== Пишу чистый nginx конфиг ==="
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

echo "=== Тест ACME ==="
echo "ok" > /var/www/html/.well-known/acme-challenge/test
sleep 1
RESULT=$(curl -s --max-time 5 -H "Host: ticketflowru.ru" http://localhost/.well-known/acme-challenge/test || echo "FAIL")
echo "Ответ localhost: $RESULT"
rm -f /var/www/html/.well-known/acme-challenge/test

if [ "$RESULT" != "ok" ]; then
    echo "nginx не отдаёт файл! Проверяю что слушает :80:"
    ss -tlnp | grep :80
    echo "Все включённые сайты:"
    ls /etc/nginx/sites-enabled/
    exit 1
fi

echo "=== Получаю SSL сертификат ==="
certbot certonly --webroot -w /var/www/html -d ticketflowru.ru

echo "=== Добавляю HTTPS ==="
cat > "$CONF" << 'NGINXEOF'
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

nginx -t && systemctl reload nginx
echo "=== Готово! https://ticketflowru.ru/dps-radar/ ==="
