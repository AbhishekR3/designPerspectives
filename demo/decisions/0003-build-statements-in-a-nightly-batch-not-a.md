---
status: accepted
kind: conditional
date: 2026-06-18
deciders: [Tom Becker, Ana Lima]
affects: [statement-job, statement-store]
tags: [data]
review-by: 2027-05-01
---

# Build statements in a nightly batch, not a streaming pipeline

## Context

Customers get a monthly statement and can download the current month's so far. Nobody has asked for statements that update during the day.

## Decision

A nightly job (Statement Job) reads the day's transactions, builds the statements and stores them as files (Statement Store).

## Alternatives

### Streaming pipeline (Kafka Streams)

- Why not now: We would need people on call for a stateful streaming system, and nobody asks for intraday statements.
- Would choose if:
  - we had a platform team on call for streaming
  - product asked for statements that update during the day
  - the batch no longer finished overnight

## Consequences

Statements are up to a day old. A failed night is re-run the next morning.

## Revisit triggers

- [ ] A platform team is on call for streaming (→ Streaming pipeline (Kafka Streams))
- [ ] Product asks for intraday statements (→ Streaming pipeline (Kafka Streams))
- [ ] The batch runs past 06:00 twice in a month (→ Streaming pipeline (Kafka Streams))
