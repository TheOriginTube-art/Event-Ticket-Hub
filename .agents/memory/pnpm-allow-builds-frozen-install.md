---
name: pnpm allowBuilds for frozen installs
description: pnpm-workspace.yaml onlyBuiltDependencies alone isn't enough for --frozen-lockfile installs in a fresh environment (Docker, CI).
---

`pnpm install --frozen-lockfile` in a brand-new environment (no prior local
approval state, e.g. a Docker build stage) fails with
`ERR_PNPM_IGNORED_BUILDS` for packages that need to run lifecycle/install
scripts (e.g. `esbuild`), even when `onlyBuiltDependencies` already lists
them in `pnpm-workspace.yaml`.

**Why:** pnpm (v10.1+) tracks build-script approval separately from the
`onlyBuiltDependencies` allowlist, via an `allowBuilds` map. Locally, prior
interactive `pnpm approve-builds` runs (or leftover state) can mask this;
a fresh container has no such state and the install hard-fails.

**How to apply:** add an explicit `allowBuilds` map to `pnpm-workspace.yaml`
alongside `onlyBuiltDependencies`, marking each package `true`, e.g.:

```yaml
onlyBuiltDependencies:
  - esbuild
allowBuilds:
  esbuild: true
```

Do this whenever a project needs to run `pnpm install --frozen-lockfile` in
a Dockerfile or fresh CI runner and hits this error.
