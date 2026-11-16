---
status: accepted
kind: time-boxed
date: 2026-07-01
deciders: [Payments team]
affects: [customer-db, ledger-worker]
tags: [data, debt]
expires: 2027-06-30
---

# Write balances to the shared accounts table until the ledger has its own store

## Context

Balances live in the shared accounts table, which the online banking apps read.

## Decision

The Ledger Worker updates accounts directly. No other project writes it.

## Consequences

Schema changes to accounts need the payments team's review until the ledger has its own store.
