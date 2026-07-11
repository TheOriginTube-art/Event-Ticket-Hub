---
name: Self-hostable Replit-connector code
description: When a feature depends on a Replit connector (Stripe, etc.), add a plain-env-var fallback so the same code works when the project is exported and self-hosted off Replit.
---

Code written against a Replit connector (e.g. fetching Stripe credentials
from `REPLIT_CONNECTORS_HOSTNAME` / `REPL_IDENTITY`) only works inside a
Replit workspace or deployment. If the user ever wants to self-host the
project on their own server, that code path throws immediately.

**Why:** the user may ask to move the project to their own VDS/server after
it was built with Replit integrations; rewriting the integration layer at
that point is extra, avoidable work if the plain-env-var fallback was
there from the start.

**How to apply:** in the credential-fetching function, check for a plain
env var first (e.g. `STRIPE_SECRET_KEY`) and only fall back to the Replit
connector fetch if it's absent. Also make any Replit-only config (webhook
base URL from `REPLIT_DOMAINS`, etc.) overridable via a plain env var
(e.g. `PUBLIC_BASE_URL`). This keeps one codebase working both on Replit
and on a generic Docker/VDS deployment.
