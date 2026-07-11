# Memory Index

- [pnpm allowBuilds for frozen installs](pnpm-allow-builds-frozen-install.md) — `onlyBuiltDependencies` alone isn't enough for `pnpm install --frozen-lockfile` in a fresh env (e.g. Docker); also need `allowBuilds` map in pnpm-workspace.yaml.
- [Docker networking restricted in this sandbox](sandbox-docker-nested-networking.md) — nested Docker here can't do container exec or bridge-network routing between containers; can't fully validate multi-container compose stacks in-sandbox.
- [Self-hostable Replit-connector code](replit-connector-plain-env-fallback.md) — when a feature depends on a Replit connector (Stripe, etc.), add a plain-env-var fallback so the app still runs when exported off-platform.
