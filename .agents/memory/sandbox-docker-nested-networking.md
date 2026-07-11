---
name: Docker networking restricted in this sandbox
description: This Replit workspace's Docker is nested/sandboxed -- container exec and cross-container bridge networking don't work, even though single-container image builds and runs work fine.
---

Docker is available inside this Replit workspace and can build and run
individual images correctly, but the Docker daemon here is itself running
in a nested/restricted environment:

- `docker exec <container> ...` fails with
  `OCI runtime exec failed ... error executing setns process`.
- Raw ICMP or TCP traffic between two containers on the same
  user-defined bridge network does not reach its destination (e.g. `ping`
  between containers times out, `pg_isready` from a sibling container never
  gets a response), even though the target service is confirmed healthy
  from its own logs.

**Why:** the sandbox's Docker-in-Docker setup lacks full bridge
routing/iptables and namespace-exec privileges that a normal VDS or CI
runner would have.

**How to apply:** when validating a `docker-compose.yml` meant for a real
server, verify what's actually testable here -- each image builds cleanly,
each container starts and serves traffic on its own (e.g. nginx on its
published port, Postgres logs "ready to accept connections") -- but do not
conclude a multi-container networking failure here means the compose file
is broken. Say so explicitly to the user rather than iterating further on
in-sandbox container-to-container connectivity.
