---
status: accepted
kind: time-boxed
date: 2026-04-22
deciders: [Ana Lima]
affects: [database, payments-service, api-application]
tags: [data, debt]
expires: 2027-03-31
---

# Let the Payments Service use the main database until it has its own

## Context

The Payments Service was split out of the API Application. Its tables are still in the main Oracle schema, next to the accounts tables it reads.

## Decision

The Payments Service reads and writes its own tables in the main schema, and reads the accounts tables. No other service may write its tables.

## Alternatives

### Separate payments database now

- Why not now: Needs a data migration during the busiest quarter.

## Consequences

A schema change to the accounts tables must be checked with the payments team until the split is done.
