#!/bin/bash

echo "=== conf.d ==="
ls -la /etc/nginx/conf.d/
cat /etc/nginx/conf.d/*.conf 2>/dev/null || echo "пусто"

echo "=== sites-enabled ==="
ls -la /etc/nginx/sites-enabled/

echo "=== nginx -T (полная конфигурация) ==="
nginx -T 2>&1 | grep -v "^#" | grep -v "^$"

echo "=== Права на /var/www/html ==="
ls -la /var/www/html/.well-known/acme-challenge/ 2>/dev/null || echo "нет директории"
echo "ok" > /var/www/html/.well-known/acme-challenge/test
ls -la /var/www/html/.well-known/acme-challenge/test
echo "Nginx user:"
ps aux | grep nginx | grep -v grep | head -2
