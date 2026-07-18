#!/bin/bash
set -e

rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/dps-radar << 'NGINXEOF'
server {
    listen 80 default_server;
    server_name ticketflowru.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/dps-radar /etc/nginx/sites-enabled/dps-radar
mkdir -p /var/www/html/.well-known/acme-challenge
echo "ok" > /var/www/html/.well-known/acme-challenge/test
nginx -t && systemctl reload nginx
sleep 1

echo "=== Проверка: nginx отдаёт challenge-файл? ==="
RESULT=$(curl -s http://localhost/.well-known/acme-challenge/test)
echo "Ответ: $RESULT"
if [ "$RESULT" != "ok" ]; then
    echo "ОШИБКА: nginx не отдаёт файл из /var/www/html"
    echo "Что слушает :80:"
    ss -tlnp | grep :80
    echo "Включённые сайты:"
    ls -la /etc/nginx/sites-enabled/
    echo "nginx.conf include:"
    grep include /etc/nginx/nginx.conf
    exit 1
fi

rm /var/www/html/.well-known/acme-challenge/test
echo "=== OK, запускаю certbot ==="
certbot certonly --webroot -w /var/www/html -d ticketflowru.ru

cat > /etc/nginx/sites-available/dps-radar << 'NGINXEOF'
server {
    listen 80 default_server;
    server_name ticketflowru.ru;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl default_server;
    server_name ticketflowru.ru;
    ssl_certificate /etc/letsencrypt/live/ticketflowru.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ticketflowru.ru/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINXEOF

nginx -t && systemctl reload nginx
echo "=== Готово! https://ticketflowru.ru ==="
