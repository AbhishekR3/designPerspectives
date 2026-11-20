# 1.0.0 scope review: what is outside software architecture

For the owner to review by hand. The vision ([../product-vision.md](../product-vision.md)) limits 1.0.0 to **software architecture**: data architecture and infrastructure come later, and dp is not an IDE. This file lists every built or planned item that falls outside that line, or sits on it, so you can decide item by item.

**How to answer.** Type one word in the "Your decision" column: **keep** (in 1.0.0), **later** (after 1.0.0, moves to [../future_tasks.md](../future_tasks.md)), or **remove** (take it out of the product). A blank means "later" for the planned items and "keep" for the built ones, because removing built code is a bigger step than not building. Then tell Claude "apply my decisions in docs/waves/v1-scope-review.md".

Sources: a DEC in [../decisions.md](../decisions.md), a file, a wave, or a line of [../future_tasks.md](../future_tasks.md). The "Why it is on this list" column is our reading [Proposal]; you decide.

## 1. Built today, and outside or on the edge of software architecture

| # | What | Where it lives | Why it is on this list [Proposal] | Your decision |
|---|---|---|---|---|
| B1 | **Data catalog and data access.** Data items with a sensitive flag, who reads and who writes each, and a hub check for data several projects write | DEC-055; `src/core/catalog.ts`; `ui/src/panels/DataSections.tsx`; `modelEdits.ts` (`cleanData`, `cleanAccess`) | Data architecture, which you put after 1.0.0. Feature K (shared catalog) is about **shared elements**, and that part stays; the data half is separable | |
| B2 | **Data pipelines and connector stages.** A pipeline is a relationship with ordered stages; sample data on lines and stages; backtracking a step to its data source | DEC-043, DEC-047; `src/core/connectors.ts`, `backtrack.ts`; `ui/src/inspect/` | Data flow design is data architecture. Connectors are also how the demo shows a Kafka pipeline | |
| B3 | **System Testing mode.** Intercept points that pause, change and forward live HTTP calls between services; run log, breakpoints, watches | DEC-075, DEC-076; `src/core/testing.ts`, `src/server/interceptProxy.ts`, `testSession.ts` | A debugging and testing tool for a running system. The non-goal says dp is not a coding environment, and this is close to a debugger. It is a runtime and DevOps tool, not a model | |
| B4 | **Observed traces over the model.** Trace files (OTLP JSON) laid over lines; observed data masked | DEC-045, DEC-046; `src/core/traces.ts` | Runtime observability. Wave 12 (parked) would extend it | |
| B5 | **Cost overlay.** Cost per element and per diagram, with settings | DEC-013, DEC-068; sidecar cost settings; `ui/src/panels/SettingsDialogs.tsx` | Cost is a business and FinOps concern. In the book it is an architecture characteristic, so it may be on the line rather than outside | |
| B6 | **Deployment data kept, not modelled.** The code keeps Structurizr deployment nodes whole as one unit, with no diagram | DEC-019, DEC-022 | Infrastructure. Nothing to remove; the question is only whether to build it (item P1) | |
| B7 | **The demo system.** Five small real services on ports 4200 to 4204 that System Testing pauses | DEC-077; `src/demo/demoSystem.ts` | Not a product feature. It exists to run B3. If B3 is later, the demo system goes with it | |

## 2. Planned, and outside or on the edge

| # | What | Where it is planned | Why it is on this list [Proposal] | Your decision |
|---|---|---|---|---|
| P1 | **Deployment diagrams**: deployment nodes, infrastructure nodes, container instances, per environment; later canary and blue/green, side-by-side environment diff, cost per environment | DEC-019, DEC-022; future_tasks 1.1 task 1; waves Q4.6 | Infrastructure. This also affects the old order in DEC-028 (deployment, small batch, static export). **Recommended: later** | |
| P2 | **Small batch** (technology on connections, inherited owner, tag descriptions, "in diagrams" list, CSV export) | DEC-028; future_tasks 1.1 task 2 | Software architecture. Listed only because it follows P1 in the old order. **Recommended: keep, no longer behind P1** | |
| P3 | **Static HTML export** | DEC-024; future_tasks 1.1 task 3 | Software architecture (sharing), but it is not among the twelve features and it depends on what notes, attachments and decisions hold. **Recommended: later** | |
| P4 | **The data half of Wave 4**: CRUD letters on data access, a role × data matrix, "what a person can reach", checks on sensitive data | [wave-04](wave-04-roles-data-variants.md); owner item 20 | Data architecture, by B1's reasoning. The other half of Wave 4 (conditions on lines, A/B variants as grouped flows) is C4 modelling and stays. **Recommended: later** | **keep** (the owner answered Q4.1 to Q4.3 on 2026-11-20; reading that as keep. Overrule here if wrong) |
| P5 | **Wave 12, runtime** (parked by answer A7): telemetry anti-patterns, runtime drift, busy and slow lines, the A/B split from flag events | [wave-12](wave-12-runtime-telemetry.md) | Runtime and DevOps. Not among the twelve features | **later** (A7) |
| P6 | **Wave 10, risk storming** (parked by answer A7) | [wave-10](wave-10-risk-storming.md) | Software architecture, but not among the twelve features | **later** (A7) |
| P7 | **Wave 14, local runtimes and the word index**: OpenAI-compatible local servers, GPU share as Ollama reports it, BM25 | [wave-14](wave-14-retrieval-local-models.md) | Supports feature L. It is plumbing for BMO, not architecture. **Recommended: keep** (it makes BMO usable without a cloud call) | |
| P8 | **Wave 5, language mix per object** ("where to put people") | [wave-05](wave-05-code-search.md); future_tasks 2.4 | Staffing, not architecture. It came from the language modules | **dropped** (2026-11-20: Wave 5 has no per-language code; the language mix came from the language modules) |
| P9 | **Wave 7, coverage and `dp metrics` CSV**. Coverage itself stays in future_tasks 1.4 | [wave-07](wave-07-metrics.md) | Metrics are in scope (feature L). Test coverage is a testing concern | CSV **keep** (Wave 7 is now model coupling); coverage stays later |

## 3. In future_tasks.md and outside the line (stay ideas)

These are already parked. They are listed so you can see that nothing outside the line is scheduled by accident.

| # | Idea | future_tasks | Why it is outside |
|---|---|---|---|
| F1 | Infrastructure-as-code import (Terraform, compose, Kubernetes), isometric rendering, live cloud inventory | 2.5 | Infrastructure. (The scan already reads compose and Dockerfiles as **evidence for containers**; that is feature H and stays) |
| F2 | SBOM and dependency vulnerabilities on containers | 2.5 | Supply-chain security |
| F3 | Data drift | 2.2 | Data architecture |
| F4 | Logs and metrics as bottleneck input; bottlenecks after the system runs | 2.9 | Runtime and DevOps |
| F5 | Debugging through dp compared with an editor's debugger | 2.7 | Conflicts with the non-goal (not an IDE) |
| F6 | Saved System Testing cases, `dp test`, HTTPS and gRPC intercept points | 2.7 | Testing tool (B3's extension) |
| F7 | Code reviews and test coverage through the tool | 2.4 | Code review is outside the non-goal's line |
| F8 | TOGAF | 2.0 | Enterprise architecture |
| F9 | Where to put people (compliance clusters) | 2.4 | Staffing and compliance |
| F10 | Fitness-function generation for ArchUnit, NetArchTest and similar | 2.4 | Generates code for another tool; on the edge |
| F11 | Import draw.io and Lucidchart diagrams | 2.1 | Software architecture; not among the twelve features |

## 4. On the line but kept in scope

Not outside software architecture, so no decision is needed. Listed so you know they were checked.

| What | Why it stays | Feature |
|---|---|---|
| Waves 1, 2, 3, 6, 7, 8, 9, 11, 13, 15, 16, 17, 18, 19, 20 | Each maps to one of the twelve features (see [README.md](README.md#where-each-item-went)) | A to L |
| The scan reading Dockerfiles, compose, Kubernetes, manifests | Evidence for containers and technology at C2 | H |
| Linked work (GitHub, GitLab, SonarQube, Jira) | A tool connection, not infrastructure design | J |
| The checklist (DEC-084) | Guides starting and importing a project | H |
| Hubs and the shared catalog of elements (DEC-054 to DEC-057) | Feature K | K |
| `dp context` and the help about dp | How BMO and coding agents learn the model | L |

## What changes when you answer

- **later or remove** on a built item (B1 to B7): we list the code to take out or hide, in a new plan. Nothing is deleted without your say.
- **keep** on a planned item: it joins the waves and the 0.5.x release it fits.
- **later** on a planned item: it moves to [../future_tasks.md](../future_tasks.md), and its wave file is marked parked.
