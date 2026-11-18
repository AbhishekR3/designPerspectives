# Wave 07: Metrics

| | |
|---|---|
| **Status** | Waiting for owner answers: ★Q7.1, Q7.2, Q7.3, Q7.4 ([questions.md](questions.md)) |
| **Branch** | `feat/w07-metrics`, from `main` after Wave 6 is merged |
| **Size** | M |
| **Depends on** | Wave 5 (language modules, the uncapped walker, the cache); Wave 6 (Findings for threshold warnings) |
| **Owner items** | 6 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Show numbers for coupling and complexity, per component and per container. Each number says what it can and cannot see. The numbers are computed where the import graph allows, and approximate (and labelled) where only a tokenizer is available. The work never stalls the server.

## Owner requests covered

> - Consider metrics sucha s LCOM, Instability, etc

## What exists today [Fact]

**Metrics**
- No metric is computed anywhere.

**Raw material**
- The file import graph (`src/core/codeMap.ts:235-249`).
- The folder graph in the evidence (`src/import/scan.ts:966-975`).
- Line counts (`codeMap.ts:251-256`).
- Rough function ranges (`codeMap.ts:484-523`).
- Wave 5 adds `types()`, `tokens()`, the uncapped walker and the file cache.

**File ownership and limits**
- A file belongs to the component with the longest matching code path (`src/import/checks.ts:374-385`).
- `expandPaths` stops at 60 files (`codeMap.ts:35`, `:92`).
- The scan runs synchronously inside a request (`src/server/routes/import.ts:101-104`).

**Where numbers can show in the UI**
- Overlays (`ui/src/colourOverlays.ts:8-14`, `:128-196`).
- The badge row on boxes (`ui/src/canvas/BoxesAndLines.tsx:461-503`).
- `ElementSummary` (`src/shared/types.ts:264-300`).

**What the book says** (notes `fundamentals-of-software-architecture-richards-ford.md`)
- Instability I = Ce ÷ (Ca + Ce); distance D = |A + I − 1|; the zone of pain and the zone of uselessness (`:51`).
- LCOM finds structural lack of cohesion, not logical (`:50`).
- Cyclomatic complexity: the industry norm is below 10, and the authors prefer below 5 (`:102`).
- The ideas for dp are at `:55-56`.

## Design [Proposal; rewritten after the owner answers]

1. **Ownership.** Every file belongs to one component, by the longest code path. Shared helpers (Wave 5) are counted separately.
2. **Metrics per component and per container:**
   - files, lines and language mix (from Wave 5);
   - **Ca** (afferent coupling: who depends on it) and **Ce** (efferent coupling: what it depends on), from imports between components;
   - **I** = Ce ÷ (Ca + Ce);
   - **cycles:** strongly connected components (Tarjan), at both levels;
   - **A**: the share of abstract types (Java interfaces and abstract classes; TypeScript interfaces and abstract classes; Python ABC and Protocol classes, approximate);
   - **D** = |A + I − 1|;
   - **complexity** per function: decision points counted from tokens. The panel shows the maximum, the average and how many functions are over the threshold;
   - **LCOM4** per class: groups of methods linked by the fields and methods they share, from tokens. The panel shows the average and the maximum.

   Each metric carries a coverage note (for example "JS/TS: relative imports only") and a class: computed or approximate (★Q7.1).
3. **Where it runs** (Q7.3).
   - `dp metrics [--json|--csv]` in the CLI.
   - On the server, a worker thread (`node:worker_threads`) with a cache keyed by the evidence hash and the file hashes.
   - The UI shows the last result, with "Compute again".
   - Nothing heavy runs inside a request.
4. **UI** (Q7.2).
   - A "Code metrics" section in the element panel, with the coverage note.
   - An overlay, `@metric:<name>`, in bands, with a legend.
5. **Thresholds** (Q7.4). Sidecar `metrics.thresholds`: complexity 10, D 0.7, LCOM4 above 1 reported. Crossing a threshold makes a Finding (Wave 6 shape) with class computed or approximate.
6. **Report import** is for later, if teams have reports.

## Determinism

| Output | Class |
|---|---|
| Ca, Ce, I, cycles, and A and D for Java and TypeScript (over what the import graph sees) | computed |
| Complexity, LCOM4, and A for Python | approximate |

## Owner answers

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q7.1 asks for exact complexity or LCOM. That needs a parser decision (★Q5.1).
- ★Q7.1 asks to import the metrics only.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Algorithms: ownership, Ca/Ce/I, Tarjan, A/D, token complexity, LCOM4 | general-purpose · Opus | `src/core/metrics.ts` (new), `src/core/languages/*` | Values are correct on hand-made fixtures |
| 3 | Worker, cache, CLI, route | general-purpose · Sonnet | `src/core/metricsWorker.ts` (new), `src/cli.ts`, `src/server/routes/metrics.ts` (new), `src/server/auth.ts` | The UI stays responsive on a large fixture; the cache is invalidated on change |
| 4 | Panel section, overlay, thresholds, Findings | general-purpose · Sonnet | `ui/src/panels/ElementPanel.tsx`, `colourOverlays.ts`, `designPerspectivesFile.ts`, `src/core/findings.ts` | Works by keyboard; the legend shows coverage |
| 5 | Fixture tests with known values (not the step 2 author) | general-purpose · Sonnet | `tests/unit/metrics*.test.ts`, `tests/fixtures/metrics/` | Tests as listed below |
| 6 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md | All docs updated |
| 7 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** `POST /api/metrics/compute` (if added) needs a `ROUTE_RULES` entry. Computing is read-only, so it should be open to any signed-in role. Decide this and record it in the DEC.
- **Hub.** One worker queue per project.
- **Read-only mode.** Computing is allowed. The cache lives in `.dp/`, and if `.dp/` can't be written the result is computed without a cache.
- **Model data.** None: metrics are not stored in the model. Thresholds in the sidecar need units and diff labels.
- **Static export.** It doesn't include metrics, unless the owner asks.
- **Performance.** A test on a generated repository of 20,000 files, with a time budget written down in reviews.md.

## Tests

- **Coupling.** Hand-computed Ca, Ce, I, A and D on small fixtures in each language.
- **Cycles.** At component and container level.
- **Complexity.** Functions with known decision counts, in each language.
- **LCOM4.** Classes with known method groups, including the documented miss (Java fields used without `this.`).
- **Determinism.** The same output twice.
- **Cache.** Invalidated when a file changes.
- **Worker.** Doesn't block requests.
- **Browser.** The overlay and the panel section.

## Docs

- **New DEC:** which metrics, their classes and coverage notes; computing off the request path; thresholds as Findings.
- **README:** metrics.
- **CLAUDE.md:** `metrics.ts` and `metricsWorker.ts`.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **future_tasks:** brownfield metrics in 2.2 done; the main-sequence chart left.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- A chart of abstractness against instability.
- Trends over time (future_tasks: architecture vitality).
- Importing metric reports.
- Coverage (future_tasks 1.4).

## Start prompt

```
Run Wave 07 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-07-metrics.md, and follow them: branch from main as the header says, run
the steps with the agents and models in the table, brief each subagent with files and line
ranges and the words "never run git stash, never push", run the checks, update the docs,
and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an answer
this wave needs is missing.
```
