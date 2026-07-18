#!/bin/bash

echo "=== /etc/nginx/conf.d/ ==="
ls -la /etc/nginx/conf.d/ 2>/dev/null || echo "пусто"

echo "=== sites-enabled ==="
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "пусто"

echo "=== include-директивы в nginx.conf ==="
grep include /etc/nginx/nginx.conf

echo "=== Все server_name в конфигах ==="
grep -rn "server_name" /etc/nginx/ 2>/dev/null

echo "=== Все listen в конфигах ==="
grep -rn "listen 80" /etc/nginx/ 2>/dev/null

echo "=== Тест: публичный vs localhost ==="
echo "ok" > /var/www/html/.well-known/acme-challenge/test
sleep 1
echo "localhost:"
curl -s --max-time 5 -H "Host: ticketflowru.ru" http://localhost/.well-known/acme-challenge/test || echo "FAIL"
echo ""
echo "ticketflowru.ru:"
curl -s --max-time 5 http://ticketflowru.ru/.well-known/acme-challenge/test || echo "FAIL"
rm -f /var/www/html/.well-known/acme-challenge/test
