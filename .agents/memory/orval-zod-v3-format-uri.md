---
name: orval zod v3 format:uri incompatibility
description: OpenAPI `format: uri` on a string schema breaks orval-generated zod code in projects pinned to zod v3.
---

If an OpenAPI schema field has `type: string, format: uri`, orval's zod generator emits `.url()` as `zod.url()` (the zod v4 API), not `z.string().url()`. In a project pinned to zod v3 (`@workspace/api-zod` etc.), this produces a runtime/type error because `zod.url()` doesn't exist in v3.

**Why:** discovered while adding object-storage upload response schemas — the generated code referenced `zod.url()` and failed to typecheck/run.

**How to apply:** either drop `format: uri` from string fields in `lib/api-spec/openapi.yaml` (simplest, no functional loss — the field is still a plain string) or upgrade zod to v4 project-wide if that's ever wanted. Don't try to hand-patch the generated file — it's regenerated on every `codegen` run.
