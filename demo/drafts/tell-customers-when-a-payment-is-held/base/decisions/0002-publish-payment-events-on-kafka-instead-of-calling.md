---
status: accepted
kind: choice
date: 2026-02-04
deciders: [Payments team, Ana Lima]
affects: [payment-events, payments-service, notification-service]
tags: [integration]
---

# Publish payment events on Kafka instead of calling services directly

## Context

A payment must reach notifications, fraud checks and analytics. Calling each one directly made a slow consumer hold up the payment.

## Decision

The Payments Service publishes one event per payment state change to Payment Events (Kafka). Consumers read at their own pace.

## Alternatives

### Direct HTTP calls

- Why not now: A slow or failing consumer holds up or fails the payment.

### RabbitMQ

- Why not now: The analytics platform already runs Kafka (Event Stream); a second broker means a second set of skills on call.

## Consequences

Consumers must handle repeated events. Event order is kept per payment only.
