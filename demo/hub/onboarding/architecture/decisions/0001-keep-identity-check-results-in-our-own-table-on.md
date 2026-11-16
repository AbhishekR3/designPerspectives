---
status: accepted
kind: conditional
date: 2026-05-20
deciders: [Onboarding team]
affects: [customer-db, kyc-service]
tags: [data]
---

# Keep identity check results in our own table on the shared Customer DB

## Context

Identity check results belong to onboarding, but they are read with the customer record.

## Decision

A private table, kyc_checks, on the shared Customer DB, written only by the KYC Service.

## Alternatives

### Separate KYC database

- Why not now: One more database to run and back up, for one table.
- Would choose if:
  - KYC data had to be stored in another region
  - the shared database's retention did not meet the KYC rules

## Revisit triggers

- [ ] KYC data had to be stored in another region (→ Separate KYC database)
- [ ] The shared database's retention did not meet the KYC rules (→ Separate KYC database)
