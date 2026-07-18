#!/bin/bash

echo "=== sites-enabled (точно) ==="
ls -la /etc/nginx/sites-enabled/

echo "=== iptables NAT PREROUTING ==="
iptables -t nat -L PREROUTING -n 2>/dev/null || echo "нет прав / нет правил"

echo "=== Удаляю default из sites-enabled ==="
rm -f /etc/nginx/sites-enabled/default

echo "=== Наш dps-radar конфиг ==="
cat /etc/nginx/sites-available/dps-radar

echo "=== Симлинк ==="
ln -sf /etc/nginx/sites-available/dps-radar /etc/nginx/sites-enabled/dps-radar
nginx -t && systemctl reload nginx

echo "=== Кладу файл ==="
echo "ok" > /var/www/html/.well-known/acme-challenge/test
sleep 1

echo "--- curl verbose на домен ---"
curl -v --max-time 10 http://ticketflowru.ru/.well-known/acme-challenge/test 2>&1 | grep -E "< |> |ok|404|Connected|Host"

rm -f /var/www/html/.well-known/acme-challenge/test
