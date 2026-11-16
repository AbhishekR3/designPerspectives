---
status: proposed
kind: choice
date: 2026-11-09
deciders: [Payments team]
affects: [held-payment-notifier, payments-service, notification-service]
---

# Tell customers by message when a payment is held

## Context

A payment held for fraud review stays pending for up to a day. Customers call support to ask where it is.

## Decision

The Payments Service reports each hold, release and block to a new Held Payment Notifier, which sends the customer one message through the Notification Service.

## Alternatives

### Show the status in the app only

- Why not now: Customers who do not open the app still call support.

## Consequences

One more container to run. Messages follow each customer's channel preferences.
