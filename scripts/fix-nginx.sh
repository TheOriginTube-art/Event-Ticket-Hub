#!/bin/bash
set -e

# Убираем дефолтный сайт nginx, который перехватывает запросы
rm -f /etc/nginx/sites-enabled/default

# Пишем наш конфиг
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
mkdir -p /var/www/html
nginx -t && systemctl reload nginx

# Webroot: nginx остаётся запущен, certbot кладёт файл в /var/www/html
certbot certonly --webroot -w /var/www/html -d ticketflowru.ru

echo "=== Сертификат получен! Добавляю HTTPS в nginx ==="
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
