#!/bin/bash
set -e
cd ~/Event-Ticket-Hub
git pull

# ── Пароль БД ────────────────────────────────────────────────────────────────
if [ ! -f ~/.dpsradar_db_pass ]; then
  read -rsp "Введите пароль БД dpsradar: " _P; echo
  echo "$_P" > ~/.dpsradar_db_pass && chmod 600 ~/.dpsradar_db_pass
fi
export DATABASE_URL="postgresql://dpsradar:$(cat ~/.dpsradar_db_pass)@localhost:5432/dpsradar"
export PGPASSWORD="$(cat ~/.dpsradar_db_pass)"

# ── Миграция: создаём таблицу через Node.js ──────────────────────────────────
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS dps_direct_messages (
    id         SERIAL PRIMARY KEY,
    from_id    BIGINT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
    to_id      BIGINT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at    TIMESTAMPTZ
  )
\`).then(() => { console.log('✓ dps_direct_messages готова'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); process.exit(1); });
"
echo "✓ Миграция выполнена"

# ── Сборка ────────────────────────────────────────────────────────────────────
BASE_PATH=/dps-radar/ pnpm --filter @workspace/dps-radar run build
pnpm --filter @workspace/api-server run build

# ── pm2 ───────────────────────────────────────────────────────────────────────
pm2 restart api-server || bash scripts/restart-pm2.sh

echo "✅ Готово: https://ticketflowru.ru/dps-radar/"
