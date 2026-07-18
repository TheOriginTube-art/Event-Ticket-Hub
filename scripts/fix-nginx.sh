#!/bin/bash
set -e

echo "=== Что на портах 80/443 ==="
ss -tlnp | grep -E ":(80|443)" || echo "никто"

echo "=== Пишу nginx конфиг (только 443, без конфликта с Docker на 80) ==="
cat > /etc/nginx/sites-available/dps-radar << 'NGINXEOF'
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

nginx -t
systemctl start nginx
systemctl status nginx | head -5
echo ""
echo "=== Готово! https://ticketflowru.ru/dps-radar/ ==="
