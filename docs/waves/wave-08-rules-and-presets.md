# Wave 08: Rules and presets

| | |
|---|---|
| **Status** | Owner answers applied (2026-11-19; reshaped 2026-11-20: detectors run on the model, not on code). Ready to run after Waves 3, 6 and 7 |
| **Branch** | `feat/w08-rules-and-presets`, from `main` after Wave 7 is merged |
| **Size** | L. **Split point added in the second look at the waves (2026-11-20):** 8a is the registry, the checklist migration, presets, settings and the Rules page (steps 2, 3 and 5); 8b is the detectors with their fixtures and the overlay rows (steps 4 and 6). 8a leaves dp with the same checks as before in one place; 8b adds what is new. Write "8a built" in the README table in between |
| **Release** | 0.10.0 (with Waves 6, 7; Wave 27 moved to 0.8.0 on 2026-11-20) |
| **Depends on** | Wave 3 (reference entries to link), Wave 6 (Findings, acknowledgements), Wave 7 (coupling numbers and cycles from the model) |
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

This wave covers "other ways": the model and the code. Telemetry work is parked (ideas list I2.7).

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
  - coupling numbers and cycles, computed from the model (Wave 7);
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

   `ctx` gives the rule the model index, the sidecar, the coupling numbers, the scan evidence and data usage. **No rule reads source code**: they run on the model, so they work for any language (owner, 2026-11-20). Checking the code against an anti-pattern is BMO's job (Wave 11), with the LLM on.
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
     - cycles between containers or components (Wave 7's cycles; the limits for Ca and Ce also live here, as rule parameters);
     - a shared database (two or more containers write the same store or asset);
     - a god component (fan-in and fan-out both above their thresholds);
     - a chatty pair (N or more relationships between two containers);
     - a long synchronous chain in a flow;
     - a UI → database line;
     - too many services in one system;
     - an event loop (topic writes and reads that form a cycle);
     - a topic nobody reads.
   - **heuristic, shown as hints** (Q8.5):
     - an Entity Trap name (ends in Manager, Supervisor, Controller, Handler, Engine or Processor);
     - architecture by implication (containers with no decision).
   - **More candidates from the old backlog (2026-11-20), each a [Proposal] for this wave to take or leave:**
     - *Into `c4-basics`:* a container with no technology; a line with no protocol or technology; a label that ends in a preposition (heuristic); an acronym with no explanation (heuristic); a container diagram that uses deployment words (heuristic).
     - *Into `structure`:* a container whose technology names runtimes that cannot share a process (heuristic).
     - *Into `microservices`:* synchronous lines between containers whose scalability characteristics differ a lot (computed from Wave 9's ratings, when present). The backlog's "about 12 services sharing one database" is a starting value for the shared-database parameter, not a measured figure.
     - *Not computable from the model, so not built here:* cross-service transactions and business logic on a gateway. They need code or a person, so they stay with BMO's review (Wave 11) and ideas list I2.2.
5. **Silencing** (★Q8.4). A finding is silenced by acknowledging it (Wave 6), and `dp check` counts the acknowledged ones. Nothing blocks a save (★Q8.1).
6. **Surfaces.**
   - A Rules page (`p=rules`): preset switches; rules with their counts and severities; the Findings list, each linked to its reference entry.
   - A "findings" overlay.
   - `dp check --preset <name> --fail-on warn|error`.
   - A CI example.
7. **Fitness-function export** (generating architecture tests for other tools) stays in ideas list I2.4.

## Determinism

Each rule states its class: computed or heuristic. Heuristic findings are shown as hints.

## Owner answers

Applied 2026-11-19: the owner answered Part A and left Part B blank, so every Q below uses its recommendation ([the questions section below](#questions-options-and-answers-moved-from-questionsmd)).

- **Q8.1:** no. Rules make findings for the UI and `dp check`; they never block a save.
- **Q8.2:** yes. The checklist's 16 rules move into one registry with the same ids; a new DEC amends DEC-084.
- **Q8.3:** C4 basics on by default; the other presets opt-in.
- **Q8.4:** silencing is acknowledging with a reason; `dp check` counts acknowledged findings.
- **Q8.5:** heuristic detectors shown as hints only.
- **Q8.6:** style templates later (the ideas list).
- **2026-11-20 (best thinking, after the code-reading answers):** Q8.1 to Q8.6 hold as recommended. Two changes follow from the other answers: the "zone of pain or uselessness" detector is gone (it needs abstractness, which needs a per-language parser), and the thresholds for coupling that Wave 7 no longer carries become parameters of rules here.
- **Vision:** feature L (anti-pattern detection). The Security basics and Data presets touch data and infrastructure. They stay: the data catalog and data access are kept in 1.0.0 (DEC-104, B1 and P4), and a preset reads only the model, which has no deployment diagrams until after 1.0.0 (P1). [Proposal: read from the scope decisions, not asked separately.]

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in DEC-104.*

### ★Q8.1 Can a rule ever block a save?

**Analysis** [Fact]. Model errors block any save that adds an error (`src/core/validate.ts:28-39`, `src/core/project.ts:169-170`).

**Recommended.** No. Rules make findings for the UI and `dp check` only. CI fails through `dp check --strict` or `--fail-on`.

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: rules never block a save.

### ★Q8.2 Move the checklist's rules into the registry?

**Analysis** [Fact]
- 16 checklist rules exist as code (`src/core/checklistRules.ts:65-168`).
- DEC-084 says those rules are fixed and can only be skipped.

**Recommended.** Yes. One registry with the same ids, so checklist items keep working. This amends DEC-084 in a new DEC.

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: the checklist's 16 rules move into one registry with the same ids, and a new DEC amends DEC-084.

### ★Q8.3 Presets, and which are on by default

**Proposed.** Rule packs, written in code:

| Preset | Rules |
|---|---|
| **C4 basics** | Descriptions, technology, labels that aren't "Uses", no mixed levels (from the C4 checklist ideas, ideas list I2.2) |
| **Structure** | Cycles, layers by tag group, caps on dependencies |
| **Data** | Several writers, a shared database, paths to sensitive data |
| **Microservices** | A shared database, chatty pairs, long synchronous chains, too many services |
| **Event-driven** | Event loops, topics nobody reads |
| **Security basics** | External-facing containers, sensitive data on technology tagged unencrypted |

The sidecar holds which presets are on, plus the severity and settings of each rule.

**Recommended.** C4 basics on by default; the others opt-in.

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: C4 basics on by default, the others opt-in. The 'zone of pain or uselessness' detector is gone (it needs abstractness). The Data and Security basics presets touch data and infrastructure, which the scope review might have moved out; it did not (DEC-104: data stays, B1 and P4).

### ★Q8.4 Silencing a finding

**Recommended.** Silencing means acknowledging the finding with a reason (★A5).
- Anyone who may edit the model can do it. Engineers do it in drafts.
- `dp check` output counts acknowledged findings, for example "3 acknowledged".

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: silencing is acknowledging with a reason; `dp check` counts acknowledged findings.

### Q8.5 Heuristic detectors

**Recommended.** Shown as hints only, for example:
- names that look like the Entity Trap;
- "architecture by implication": containers with no decision.

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: heuristic detectors show as hints only.

### Q8.6 Style templates

**Analysis.** Style templates would be starter models for a style, such as "layered" or "microservices".

**Recommended.** Later (the ideas list).

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: style templates later (the ideas list).

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
| 7 | Docs and CI example | general-purpose · Haiku | decisions.md, the review file (notes for the release entry, not the CHANGELOG), README, CLAUDE.md, `demo/ci-examples/` | All docs updated |
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
- **The review file** (not the CHANGELOG, which the release change writes): this wave's entries.
- **ideas list:** I2.2 (checks and lints) done in part; fitness functions stay.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- BMO's anti-pattern review (Wave 11).
- Telemetry rules (parked; ideas list I2.7).
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
