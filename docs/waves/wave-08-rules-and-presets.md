# Wave 08: Rules and presets

| | |
|---|---|
| **Status** | Waiting for owner answers: ★Q8.1, ★Q8.2, ★Q8.3, ★Q8.4, Q8.5, Q8.6 ([questions.md](questions.md)) |
| **Branch** | `feat/w08-rules-and-presets`, from `main` after Wave 7 is merged |
| **Size** | L |
| **Depends on** | Wave 3 (reference entries to link), Wave 6 (Findings, acknowledgements), Wave 7 (metrics) |
| **Owner items** | 18, and 21 for anti-patterns found from the model and the code ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

This wave gives dp one set of named checks:
- grouped into presets that a team switches on;
- including anti-patterns that dp detects by itself;
- each linked to its reference entry and saying what it could not check.

No rule ever blocks a save.

## Owner requests covered

> - Any implementations of architecture validation and pre-sets.
> - Think if you can think through ways to track if any anti-patterns is occuring with telemetry or other ways?

This wave covers "other ways": the model and the code. Telemetry is Wave 12.

## What exists today [Fact]

**Checklist rules (DEC-084)**
- 16 rules, written as code (`src/core/checklistRules.ts:65-168`, `checkRules` up to `:189`; ids in `CHECKLIST_RULES`, `src/shared/types.ts:705-722`).
- Two starter lists (`src/core/checklist.ts:85-134`).
- DEC-084 says these rules are fixed and can only be skipped.

**Model errors and `dp check`**
- Model errors block any save that adds an error (`src/core/validate.ts:28-39`, `:42-150`; `src/core/project.ts:169-170`).
- `dp check` reports errors and warnings (`src/core/cliReports.ts:25-62`), and `--strict` fails on warnings (`src/cli.ts:393-405`).
- There are no presets, and no way to switch one rule off.

**Pieces the detectors can use**
- `diagramLints` feeds only BMO's challenge task (`src/assistant/runTask.ts:225-241`).
- The settings pattern to copy: `work.severity` in the sidecar (`src/core/designPerspectivesFile.ts:80-117`).
- The several-writers flag (`src/core/catalog.ts:139-144`).
- From earlier waves:
  - the Finding shape, acknowledgements and the Findings UI (Wave 6);
  - metrics (Wave 7);
  - CRUD letters (Wave 4);
  - the reference library (Wave 3).

**Book material** (notes `fundamentals-of-software-architecture-richards-ford.md`)

| Lines | Material |
|---|---|
| :138, :151 | Entity Trap |
| :158 | Big Ball of Mud |
| :188, :221 | Sinkhole |
| :202-203 | Inter-module caps |
| :253 | Shared entity library |
| :269-293 | Event loops, swarm, unconsumed events |
| :104-110 | Fitness functions |

## Design [Proposal; rewritten after the owner answers]

1. **The registry** (`src/core/rules/`). Each rule has:
   - an `id` and a `title`;
   - a `category`: c4, structure, data, security, cost or runtime;
   - a `defaultSeverity`, a `params` schema and a `class`;
   - an `explain` text, and a `referenceSlug` linking to its library entry;
   - a `check(ctx)` that returns Findings.

   `ctx` gives the rule the model index, the sidecar, the metrics (if computed), the evidence and data usage.
2. **Migration** (★Q8.2). The 16 checklist rules move into the registry under the same ids, so checklist items keep working. This amends DEC-084 in a new DEC.
3. **Presets** (★Q8.3), written in code:

   | Preset | Checks |
   |---|---|
   | `c4-basics` | Descriptions, technology, labels other than "Uses", no mixed levels |
   | `structure` | Cycles, layers by tag group, dependency caps |
   | `data` | Several writers, a shared database, paths to sensitive data |
   | `microservices` | A shared database, chatty pairs, long synchronous chains, too many services |
   | `event-driven` | Event loops, topics nobody reads |
   | `security-basics` | External-facing containers, sensitive data on technology tagged unencrypted |

   - The sidecar holds `rules: {presets: [...], overrides: {id: {severity?, params?, off?}}}`, cleaned like `work.severity`.
   - Turning a rule off is an edit, so it shows in diffs. `c4-basics` is on by default.
4. **Detectors**, each with its class. Every detector reports what it could not check.
   - **computed:**
     - cycles between containers or components;
     - a shared database (two or more containers write the same store or asset);
     - a god component (fan-in and fan-out both above their thresholds);
     - a chatty pair (N or more relationships between two containers);
     - a long synchronous chain in a flow;
     - a UI → database line;
     - too many services in one system;
     - the zone of pain or of uselessness (D above the threshold);
     - an event loop (topic writes and reads that form a cycle);
     - a topic nobody reads.
   - **heuristic, shown as hints** (Q8.5):
     - an Entity Trap name (ends in Manager, Supervisor, Controller, Handler, Engine or Processor);
     - architecture by implication (containers with no decision).
5. **Silencing** (★Q8.4). A finding is silenced by acknowledging it (Wave 6), and `dp check` counts the acknowledged ones. Nothing blocks a save (★Q8.1).
6. **Surfaces.**
   - A Rules page (`p=rules`): preset switches; rules with their counts and severities; the Findings list, each linked to its reference entry.
   - A "findings" overlay.
   - `dp check --preset <name> --fail-on warn|error`.
   - A CI example.
7. **Fitness-function export** (generating architecture tests for other tools) stays in future_tasks 2.4.

## Determinism

Each rule states its class: computed or heuristic. Heuristic findings are shown as hints.

## Owner answers

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q8.1 wants rules that block saves.
- ★Q8.2 wants the checklist kept separate.
- A migration step would change what an existing checklist item shows.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Registry design and checklist migration | general-purpose · Opus | `src/core/rules/` (new), `checklistRules.ts`, `checklist.ts`, `cliReports.ts`, `types.ts` | Every checklist item gives the same result before and after |
| 3 | Presets, sidecar settings, CLI flags | general-purpose · Sonnet | `rules/presets.ts`, `designPerspectivesFile.ts`, `src/server/routes/sidecar.ts`, `src/cli.ts`, `auth.ts` | Overrides validated; ROUTE_RULES added |
| 4 | Detectors | general-purpose · Sonnet | `src/core/rules/*.ts` | Each passes its fixtures; `couldNotCheck` filled in |
| 5 | Rules page and overlay | general-purpose · Sonnet | `ui/src/pages/RulesPage.tsx` (new), `ui/src/common/Findings.tsx`, `colourOverlays.ts` | Works by keyboard; links to reference entries |
| 6 | Fixture tests (not the step 4 author) | general-purpose · Sonnet | `tests/unit/rules*.test.ts`, `tests/browser/rules.spec.ts` | Tests as listed below |
| 7 | Docs and CI example | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md, `demo/ci-examples/` | All docs updated |
| 8 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** `PUT /api/rules-settings`, or the sidecar route it extends, needs a `ROUTE_RULES` entry: the edit action, with engineers using drafts.
- **Hub.** Settings per project.
- **Read-only mode.** No changes to settings.
- **Model data.** The sidecar's `rules` settings need units, diff labels with field detail (not only "setting changed"), merge and `dp diff`.
- **Static export.** It includes the findings list, read-only.

## Tests

- **Detectors.** Each one on a fixture where it should find something and one where it shouldn't, including what it reports it could not check.
- **Settings.** Presets on and off; overrides of severity, params and off.
- **Checklist migration.** The checklist results are identical before and after.
- **`dp check`.** Exit codes with `--preset` and `--fail-on`.
- **Acknowledgements.** Acknowledging a finding silences it.
- **Browser.** The Rules page.

## Docs

- **New DEC:** the registry; presets; rules never block a save; amends DEC-084.
- **README:** rules and presets.
- **CLAUDE.md:** `src/core/rules/`.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **future_tasks:** 2.2 (checks and lints) done in part; fitness functions stay.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- BMO's anti-pattern review (Wave 11).
- Telemetry rules (Wave 12).
- Starter models per architecture style (Q8.6).
- Exporting fitness functions.

## Start prompt

```
Run Wave 08 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-08-rules-and-presets.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
