#!/bin/bash
set -e

# Kill any processes holding dev ports so workflows restart cleanly
fuser -k 8080/tcp 22129/tcp 24131/tcp 2>/dev/null || true
sleep 1

# Task agents keep adding this file; remove it so git push doesn't fail
rm -f .github/workflows/healthcheck.yml

pnpm install --no-frozen-lockfile
pnpm --filter db push
