#!/bin/bash
set -e
# Remove GitHub Actions workflows — task agents keep adding them
# but our PAT doesn't have workflow scope so pushes fail
rm -f .github/workflows/healthcheck.yml
pnpm install --no-frozen-lockfile
pnpm --filter db push
