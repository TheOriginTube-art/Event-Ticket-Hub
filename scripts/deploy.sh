#!/bin/bash
set -e
cd ~/Event-Ticket-Hub
git pull

# Пароль БД
if [ ! -f ~/.dpsradar_db_pass ]; then
  P=$(tr -dc 'a-z0-9' < /dev/urandom | head -c 16)
  sudo -u postgres psql -c "ALTER USER dpsradar WITH PASSWORD '$P';"
  echo "$P" > ~/.dpsradar_db_pass && chmod 600 ~/.dpsradar_db_pass
fi
export DATABASE_URL="postgresql://dpsradar:$(cat ~/.dpsradar_db_pass)@localhost:5432/dpsradar"

# Сборка
BASE_PATH=/dps-radar/ pnpm --filter @workspace/dps-radar run build
pnpm --filter @workspace/api-server run build

# Миграция БД
pnpm --filter @workspace/db push

# Рестарт pm2
pm2 restart api-server 2>/dev/null || bash scripts/restart-pm2.sh

echo "✅ Готово: https://ticketflowru.ru/dps-radar/"
