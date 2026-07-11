# Memory Index

- [pnpm allowBuilds for frozen installs](pnpm-allow-builds-frozen-install.md) — `onlyBuiltDependencies` alone isn't enough for `pnpm install --frozen-lockfile` in a fresh env (e.g. Docker); also need `allowBuilds` map in pnpm-workspace.yaml.
- [Docker networking restricted in this sandbox](sandbox-docker-nested-networking.md) — nested Docker here can't do container exec or bridge-network routing between containers; can't fully validate multi-container compose stacks in-sandbox.
- [Self-hostable Replit-connector code](replit-connector-plain-env-fallback.md) — when a feature depends on a Replit connector (Stripe, etc.), add a plain-env-var fallback so the app still runs when exported off-platform.
- [orval zod v3 format:uri incompatibility](orval-zod-v3-format-uri.md) — OpenAPI `format: uri` on strings makes orval emit zod v4's `.url()`, which breaks projects pinned to zod v3.
- [object-storage-web (Uppy) setup gotchas](object-storage-web-setup-gotchas.md) — its tsconfig template needs `composite: true`, and the react pnpm-override trick needs react/react-dom in root package.json deps first.
