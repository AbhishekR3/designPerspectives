---
status: accepted
kind: policy
date: 2026-01-15
deciders: [Security review]
affects: [pipeline-worker, data-warehouse]
tags: [security]
applies-to: Every pipeline, export and event stream that sends data to analytics or to a third party
---

# Mask personal data before it leaves the bank's own systems

## Context

Analytics and third parties do not need names, account numbers or addresses.

## Decision

Personal data is masked or removed in the pipeline before it is loaded or sent. Unmasked data stays in the core banking systems.
