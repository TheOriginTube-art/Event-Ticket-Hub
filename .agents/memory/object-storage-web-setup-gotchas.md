---
name: object-storage-web (Uppy) setup gotchas
description: Two setup steps the object-storage skill's copy-paste instructions miss when wiring @workspace/object-storage-web into a web artifact.
---

When adding `@workspace/object-storage-web` (Uppy-based uploader) to a pnpm-workspace project:

1. `lib/object-storage-web/tsconfig.json` (copied from the skill template) is missing `"composite": true` / `"declarationMap": true` / `"emitDeclarationOnly": true`. Without these, any project that references it via TS project references fails with `TS6306: Referenced project must have setting "composite": true`. Add them to match the other `lib/*` packages' tsconfig pattern.
2. The skill's `pnpm.overrides: { react: "$react", "react-dom": "$react-dom" }` trick (to stop Uppy's `react@>=19` peer dep from installing a duplicate React) only works if the **root** `package.json` itself declares `react`/`react-dom` as direct dependencies (pointing at the catalog). If the root package.json has no such dependency, `pnpm install` fails with "Cannot resolve version $react in overrides." Add `"react": "catalog:", "react-dom": "catalog:"` to the root deps first.

**Why:** hit both errors back-to-back when wiring an admin QR-code upload feature; the skill's copy/paste steps assume things the template/monorepo don't already have.

**How to apply:** after copying `lib/object-storage-web`, immediately check its tsconfig for the composite flags, and check whether root `package.json` already lists react/react-dom before adding the overrides block.
