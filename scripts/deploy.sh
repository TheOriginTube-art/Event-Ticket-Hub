#!/bin/bash
set -e
cd ~/Event-Ticket-Hub
git pull

# Пароль БД (нужен для сборки переменных окружения pm2)
if [ ! -f ~/.dpsradar_db_pass ]; then
  read -rsp "Введите пароль БД dpsradar: " _P; echo
  echo "$_P" > ~/.dpsradar_db_pass && chmod 600 ~/.dpsradar_db_pass
fi

# Сборка
BASE_PATH=/dps-radar/ pnpm --filter @workspace/dps-radar run build
pnpm --filter @workspace/api-server run build

# Рестарт (миграция выполняется автоматически при старте сервера)
pm2 restart api-server || bash scripts/restart-pm2.sh

echo "✅ Готово: https://ticketflowru.ru/dps-radar/"
