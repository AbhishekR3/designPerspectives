---
id: ADR-0001
approvals: []
architecturallySignificant:
  - structure
  - nonfunctional
category: application
characteristics:
  - responsiveness
  - availability
elements:
  - ibs.api.statements
  - ibs.statementStore
fitnessFunctions: []
status: accepted
supersedes: []
title: Cache generated statements in object storage
---

## Context

Customers download account statements as PDF documents. Building a statement needs the transaction history for the period, and the Core Banking System answers such historical queries slowly. Asking it every time a customer opens a statement would make downloads sluggish and add load to a system we do not own.

## Decision

The Statement Component stores each statement it generates in an object storage bucket (the Statement Store). Later requests for the same statement are served from the bucket; the Core Banking System is only queried when no cached copy exists.

## Consequences

- Repeat downloads are fast and independent of core banking response times.
- The bucket holds customer financial documents, so it needs encryption, tight access policies and a retention rule.
- A cached statement can go stale if the core system corrects past transactions; we need a way to invalidate it.
- One more piece of infrastructure to run, plus a local substitute for development.

## Compliance

Code review and a dependency check confirm that only the Statement Component writes to the Statement Store and that statement requests consult the cache before the Core Banking System Adapter.

## Notes

Illustrative decision written for the designPerspectives demo workspace. The underlying idea comes from the container chapter of The C4 Model (Simon Brown); this text is our own.
