#!/bin/sh
echo "=== push-force output ==="
docker compose exec api sh -c "cd /repo && pnpm --filter @workspace/db run push-force"
echo "=== tables now ==="
docker compose exec db psql -U ticketflow -d ticketflow -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"
