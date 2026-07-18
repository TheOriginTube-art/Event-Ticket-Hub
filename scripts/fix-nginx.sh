#!/bin/bash

echo "=== iptables NAT PREROUTING ==="
iptables -t nat -L PREROUTING -n -v 2>/dev/null || echo "нет прав"

echo "=== Все процессы на порту 80 ==="
ss -tlnp | grep :80

echo "=== Все процессы на портах 3000-9000 ==="
ss -tlnp | grep -E ":(3000|4000|5000|8080|9000)"

echo "=== Удаляю все REDIRECT/DNAT правила на порту 80 (если есть) ==="
iptables -t nat -L PREROUTING -n --line-numbers 2>/dev/null | grep "dpt:80" | awk '{print $1}' | sort -rn | xargs -I{} iptables -t nat -D PREROUTING {} 2>/dev/null && echo "удалены" || echo "нечего удалять"

echo ""
echo "=== Останавливаю nginx, запускаю certbot standalone ==="
systemctl stop nginx
sleep 1
certbot certonly --standalone -d ticketflowru.ru
systemctl start nginx

echo ""
echo "=== Добавляю HTTPS в nginx ==="
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

nginx -t && systemctl reload nginx
echo "=== Готово! https://ticketflowru.ru/dps-radar/ ==="
