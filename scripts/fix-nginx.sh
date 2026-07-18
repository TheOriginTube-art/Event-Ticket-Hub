#!/bin/bash
set -e

echo "=== Ищу nginx конфиг для ticketflowru.ru ==="
CONF=$(grep -rl "ticketflowru.ru" /etc/nginx/ 2>/dev/null | head -1)
if [ -z "$CONF" ]; then
    echo "ОШИБКА: конфиг не найден"
    exit 1
fi
echo "Найден: $CONF"

echo "=== Ищу порт API-сервера (pm2) ==="
API_PORT=$(pm2 env 0 2>/dev/null | grep "^PORT:" | awk '{print $2}' | tr -d '[:space:]')
if [ -z "$API_PORT" ]; then
    API_PORT=$(pm2 list 2>/dev/null | grep api-server | head -1 || true)
    # Проверяем стандартные порты
    for p in 8080 3000 4000 5000; do
        if ss -tlnp | grep -q ":$p "; then
            API_PORT=$p
            break
        fi
    done
fi
echo "Порт API: ${API_PORT:-не найден, используем 8080}"
API_PORT=${API_PORT:-8080}

echo "=== Добавляю DPS Радар в $CONF ==="
# Проверяем, не добавлен ли уже
if grep -q "dps-radar" "$CONF"; then
    echo "Уже есть, пропускаю"
else
    # Вставляем location блоки перед последней закрывающей }
    sed -i "s|}$|    location /dps-radar/ {\n        proxy_pass http://localhost:${API_PORT}/dps-radar/;\n        proxy_set_header Host \$host;\n        proxy_set_header X-Forwarded-Proto \$scheme;\n    }\n    location /api/dps-radar/ {\n        proxy_pass http://localhost:${API_PORT}/api/dps-radar/;\n        proxy_set_header Host \$host;\n    }\n}|" "$CONF"
fi

echo "=== Добавляю ACME challenge для certbot ==="
if ! grep -q "acme-challenge" "$CONF"; then
    mkdir -p /var/www/html/.well-known/acme-challenge
    sed -i "s|}$|    location /.well-known/acme-challenge/ {\n        root /var/www/html;\n    }\n}|" "$CONF"
fi

nginx -t && systemctl reload nginx

echo "=== Тест: nginx отдаёт challenge? ==="
echo "ok" > /var/www/html/.well-known/acme-challenge/test
sleep 1
RESULT=$(curl -s --max-time 5 http://localhost/.well-known/acme-challenge/test || echo "fail")
echo "Ответ: $RESULT"
rm -f /var/www/html/.well-known/acme-challenge/test

if [ "$RESULT" != "ok" ]; then
    echo "ОШИБКА: nginx не отдаёт файл. Конфиг:"
    cat "$CONF"
    exit 1
fi

echo "=== Получаю SSL сертификат ==="
certbot certonly --webroot -w /var/www/html -d ticketflowru.ru

echo "=== Готово! Сертификат получен ==="
echo "Теперь добавьте в $CONF listen 443 ssl и ssl_certificate вручную"
echo "Или запустите: certbot --nginx -d ticketflowru.ru"
