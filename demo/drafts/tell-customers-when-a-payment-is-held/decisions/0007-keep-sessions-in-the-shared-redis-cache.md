---
status: accepted
kind: reversal
date: 2026-05-12
deciders: [Ana Lima, Site reliability]
affects: [session-cache, web-application, api-application]
supersedes: [0001]
---

# Keep sessions in the shared Redis cache

## Context

There are now six web servers and they restart on every deploy, signing customers out.

## Decision

Sessions are kept in the Session Cache (Redis). Any server can serve any customer.

## Consequences

The Session Cache is now needed for sign-in; it runs with a replica.
