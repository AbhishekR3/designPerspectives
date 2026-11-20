# Wave 12: Runtime

| | |
|---|---|
| **Status** | **Parked** (owner, answer A7, 2026-11-19): anti-patterns through telemetry moved to ideas list I2.7. Runtime is outside the software-architecture line (scope review P5) and not among the twelve features. Kept for when it returns |
| **Branch** | `feat/w12-runtime-telemetry`, from `main` (when the wave returns) |
| **Size** | M |
| **Release** | — |
| **Depends on** | Wave 4 (variants), Wave 6 (Findings; drift is parked in the ideas list), Wave 8 (rule registry) |
| **Owner items** | 21, from telemetry ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Use trace files and System Testing runs to see how the system really behaves:
- lines that are busy, slow or failing;
- chatty and repeated calls (N+1);
- call cycles and deep synchronous chains;
- calls the model doesn't have, and modelled lines that were never used.

Where telemetry records feature flags, also show how traffic split between A/B variants.

## Owner requests covered

> - Think if you can think through ways to track if any anti-patterns is occuring with telemetry or other ways?

Wave 8 covers the model and code side of this.

## What exists today [Fact]

**Trace files** (`src/core/traces.ts`)
- dp reads OTLP JSON trace files from `<project>/traces`, or a folder given with `--traces` (`src/server/routeContext.ts:362`, `src/cli.ts:149`).
- It reads at most the last 20 MB of each file and keeps the newest 2,000 traces in memory (`:31-32`, `:156-232`).
- Span shape (`:37-48`). Attributes are masked and cut short (`:257-264`).
- `TraceStore` has `list()` and `spans(id)` only (`:206-218`).
- `observe()` lays one trace over the model (`:336-404`):
  - spans are matched to elements at `:354-366`;
  - "hops" are recorded at `:370-388`.
- Output type: `ObservedTrace` (`src/shared/types.ts:1045-1093`).
- Routes: `GET /api/traces` and `GET /api/traces/:id`, read-only, open to every role (`src/server/routes/traces.ts:10-22`).
- Nothing adds traces up: there are no counts or latencies across traces.

**System Testing run log** (`src/server/testSession.ts`)
- 200 calls, in memory only (`:44-50`, `:491-508`).
- Each `TestCall` has a relationship id, duration, status and trace id (`types.ts:2016-2044`; trace id at `testSession.ts:456`).

**Canvas marks** (`ui/src/testing/testingDecor.ts`)
- Calls per line, counted only in the UI from the run log (`:82-85`).
- The time of the first hop per line (`:131`).
- A "not in the model" badge (`:133-141`).

**Feature flags in telemetry** [Fact; opentelemetry.io, semantic conventions for feature flags, checked 2026-11-17]
- OpenTelemetry's conventions (Release Candidate) record each flag evaluation as a `feature_flag.evaluation` event through the logs API.
- The event carries `feature_flag.key` and `feature_flag.result.variant`.
- dp reads trace files only, so it sees these only when an app also puts them on its spans, as attributes or span events.

**From earlier waves:** the Finding shape (Wave 6), the rule registry (Wave 8), and variant flows (Wave 4).

## Design [Proposal; rewritten after the owner answers]

1. **Adding up** (`src/core/runtime.ts`). Over the loaded traces, plus the run log when testing is on:
   - **Per relationship:** calls, errors, and p50 and p95 duration.
   - **Per trace:**
     - depth of synchronous chains;
     - fan-out (calls made by one step);
     - repeated identical calls (the same caller, callee and endpoint N times: a possible N+1);
     - cycles (A → B → A).
   - **Runtime drift:**
     - hops with no relationship ("observed, not modelled");
     - modelled relationships with no call in the window ("not seen in these traces", information only).

   Every result says which traces and which time window it covers.
2. **Telemetry rules** in the Wave 8 registry, category `runtime`, class computed. Thresholds are rule parameters (Q12.2).
   - Chatty interface.
   - Possible N+1.
   - Call cycle at runtime.
   - Deep synchronous chain.
   - Fan-out.
   - Error hotspot.
   - Unmodelled call.
3. **Overlays.** Calls, p95 and error rate on lines, in bands. Built from trace files, so they work outside testing mode.
4. **Variant split** (Q12.3). When spans carry `feature_flag.key` and `feature_flag.result.variant` (as attributes or span events), count traces per variant and show the split on the variant flows (Wave 4). Reading OTLP log files comes later.
5. **CLI.** `dp traces report [--json]`.

## Determinism

| Output | Class |
|---|---|
| Counts, percentiles, depth, fan-out, cycles, unmodelled calls | computed, for the traces given |
| "Possible N+1" | heuristic: a repeated call is a sign, not proof |

## Owner answers

Applied 2026-11-19: the owner answered Part A and left Part B blank, so every Q below uses its recommendation ([questions.md](questions.md)).

- **A7:** "Push these to future_tasks.md". This wave is parked, not deleted (owner, A10).
- **Q12.1 to Q12.3:** their recommendations stand for when the wave returns (trace files and System Testing runs only; settings in the rule registry; flag attributes on span events).
- **Effect on other waves:** none depend on it. Wave 4's observed A/B split and Wave 6's runtime drift note point here and stay unbuilt.
- **Confirmed** by the owner on 2026-11-19 ([questions.md](questions.md) C6b): do not build either for 1.0.

## Stop and ask if

- ★Q12.1 asks for a live collector (OTLP over HTTP).
- ★Q12.1 asks for log files now.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Adding up and telemetry rules | general-purpose · Sonnet | `src/core/runtime.ts` (new), `traces.ts`, `src/core/rules/runtime.ts` (new) | Known values on fixtures; deterministic |
| 3 | Overlays, report UI, variant split, CLI | general-purpose · Sonnet | `colourOverlays.ts`, `ui/src/pages/RulesPage.tsx` (a runtime section), `FlowPanel.tsx`, `src/cli.ts`, `src/server/routes/traces.ts` | Works by keyboard; shows the window |
| 4 | Trace fixtures and tests (another agent) | general-purpose · Sonnet | `tests/fixtures/traces/`, `tests/unit/runtime*.test.ts`, `tests/browser/` | Tests as listed below |
| 5 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md | All docs updated |
| 6 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** GET routes only. Acknowledgements use the Wave 6 routes.
- **Hub.** Traces per project.
- **Read-only mode.** Everything works.
- **Model data.** None, apart from acknowledgements.
- **Static export.** Not included.
- **Performance.** Adding up 2,000 traces must stay off the request path or under a time budget; write the number down in reviews.md.

## Tests

- **Adding up.** Fixture traces with known counts and p95, a known N+1, a cycle and a known depth.
- **Runtime drift.** Unmodelled hops become Findings, and lines with no calls are reported.
- **Variants.** Spans with flag attributes give the right split; spans without them give no split, and nothing crashes.
- **Determinism.** The same report twice.
- **Browser.** The overlays and the report section.

## Docs

- **New DEC:** what is added up and over which window; the telemetry rules; flag attributes read from spans.
- **README:** runtime views.
- **CLAUDE.md:** `runtime.ts`.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **planned_features.md:**
  - 2.7: telemetry anti-patterns, first cut done.
  - What stays: live collectors, logs and metrics, trends.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- A live collector.
- Reading OTLP log files.
- Metrics such as CPU and memory.
- Canary analysis (needs deployment diagrams).
- Trends over time.

## Start prompt

```
Run Wave 12 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-12-runtime-telemetry.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
