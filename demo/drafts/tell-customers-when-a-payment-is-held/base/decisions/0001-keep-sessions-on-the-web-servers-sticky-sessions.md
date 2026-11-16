---
status: superseded
kind: choice
date: 2025-03-10
deciders: [Ana Lima]
affects: [web-application, api-application]
superseded-by: [0007]
---

# Keep sessions on the web servers (sticky sessions)

## Context

Signed-in customers need their session on every request. There was one web server per region and no shared cache.

## Decision

The load balancer sends each customer to the same server; the session lives in that server's memory.

## Alternatives

### Shared session cache

- Why not now: One more system to run, for two servers.

## Consequences

A server restart signs its customers out.
