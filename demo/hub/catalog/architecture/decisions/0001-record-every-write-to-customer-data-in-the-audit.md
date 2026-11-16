---
status: accepted
kind: policy
date: 2026-03-02
deciders: [Platform team, Security review]
affects: [customer-db]
tags: [security, data]
applies-to: Every service that writes to the Customer DB
---

# Record every write to customer data in the audit log

## Context

Regulators ask who changed a customer's data and when.

## Decision

A service that writes to customers or accounts also writes one row to audit_log in the same transaction.

## Consequences

Several projects write the audit log; its shape is owned by the platform team and changes need their review.
