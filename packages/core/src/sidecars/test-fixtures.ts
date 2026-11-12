/** Inline canonical sample of every sidecar file type (shared by the sidecar tests). */
import type { SourceFile } from "@designperspectives/contracts";

const HASH = `sha256:${"ab".repeat(32)}`;

export const CANONICAL_FILES: Record<string, string> = {
  "approvals/ADR-0001.sig.yaml": `subject: ADR-0001
approver: carol
at: 2026-11-12T09:00:00Z
contentHash: ${HASH}
role: architect
`,
  "decisions/2026/ADR-0001-use-postgres.md": `---
id: ADR-0001
characteristics:
  - availability
elements:
  - orders.db
  - orders.api.auth
status: accepted
title: "Use PostgreSQL: orders"
---
# Context

Orders need ACID transactions.
`,
  "designperspectives.yaml": `description: Sample workspace
name: Orders Platform
plugins:
  - dp-plugin-aws
schemaVersion: 1
thresholds:
  decisionCostUsd: 7500
`,
  "permissions.yaml": `profiles:
  architect:
    capabilities:
      - view
      - edit
    members:
      - carol
    title: Architect
`,
  "sidecars/characteristics.yaml": `composites:
  agility:
    - deployability
    - testability
driving:
  - id: availability
    explicit: true
    measures:
      - uptime 99.9%
    scope:
      - orders.api
  - id: scalability
    explicit: false
    structural: true
    trigger: Black Friday peaks
leastImportant: portability
top3:
  - availability
  - scalability
`,
  "sidecars/codemapping.yaml": `rules:
  - element: orders.api
    exclude:
      - "**/*.test.ts"
    include:
      - services/orders/src/api/**
    language: typescript
    pinned: true
  - element: orders.api.auth
    include:
      - services/orders/src/auth/**
`,
  "sidecars/elements/orders.api.yaml": `id: orders.api
characteristics:
  - availability
cost:
  currency: USD
  monthlyEstimate: 420
owners:
  - team-orders
provenance:
  - at: 2026-11-11T10:00:00Z
    confidence: 0.9
    evidence:
      - services/orders/src/api/**
    source: parser-tier1
risk:
  availability:
    direction: same
    impact: 3
    likelihood: 1
    score: 3
status: accepted
teamType: stream-aligned
`,
  "sidecars/elements/orders.api.auth.yaml": `id: orders.api.auth
tags:
  - security
`,
  "sidecars/elements/orders.apix.yaml": `id: orders.apix
owners:
  - team-x
`,
  "sidecars/layout/orders-containers.yaml": `view: orders-containers
nodes:
  orders.api:
    x: 100
    y: 200
  orders.api.auth:
    x: 100
    y: 400
  orders.apix:
    x: 0
    y: 0
`,
  "sidecars/notes/note-1.md": `---
id: note-1
anchor: orders.api
author: alice
created: 2026-11-11T10:00:00Z
status: open
type: question
---
Should the API be split?

  - indented line kept as-is
`,
  "sidecars/notes/note-2.md": `---
id: note-2
anchor: orders.ui->orders.api#calls
author: bob
created: 2026-11-11T11:00:00+01:00
status: resolved
type: risk
---
`,
  "sidecars/relationships.yaml": `- id: orders.api->orders.db#writesTo
  mode: sync
  protocol: SQL
- id: orders.api.auth->orders.apix#calls:token
  mode: async
- id: orders.ui->orders.api#calls
  crossesTrustBoundary: true
  latencyBudgetMs:
    "200": 5
    p99: 200
  mode: sync
  payload:
    approxBytes: 2048
    type: data-based
`,
  "sidecars/risk/rs-1.yaml": `id: rs-1
criterion: availability
mitigations:
  - element: orders.api
    proposal: Add a replica
participants:
  - alice
  - bob
scores:
  - element: orders.api
    impact: 3
    likelihood: 2
    participant: alice
  - element: orders.api.auth
    impact: 1
    likelihood: 1
    participant: bob
status: scoring
view: orders-containers
`,
};

export function canonicalFiles(): SourceFile[] {
  return Object.entries(CANONICAL_FILES).map(([path, content]) => ({ path, content }));
}
