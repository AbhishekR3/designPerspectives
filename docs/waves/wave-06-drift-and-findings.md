# Wave 06: Drift and findings

| | |
|---|---|
| **Status** | Waiting for owner answers: ★A5, ★Q6.1, ★Q6.2, Q6.3, ★Q6.4, Q6.5 ([questions.md](questions.md)) |
| **Branch** | `feat/w06-drift-and-findings`, from `main` after Wave 5 is merged |
| **Size** | M–L |
| **Depends on** | Wave 5 (file roles, config facts, the uncapped walker) |
| **Owner items** | 1 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

dp shows where the model and the code disagree, in both directions. Each disagreement can be fixed through a reviewed draft, or acknowledged with a reason, locally and in CI.

This wave also builds the **Finding** shape and its acknowledgements. Rules (Wave 8), runtime (Wave 12), contracts (Wave 13) and BMO reviews (Wave 11) reuse both.

## Owner requests covered

> - Architecture drift detection

## What exists today [Fact]

**Partial drift checks that exist**
- The readiness analysis marks "left" candidates: things the scan found that no model object matches. This covers C1–C3 and unmapped C4 files, one direction only (`src/import/analysis.ts:223-331`, `matchedBy`).
- `checks.importEdges` warns both ways at C3, but only on an import file (`src/import/checks.ts:349-409`). `missingContainers` is at `:435-462`.
- `dp check` warns about missing or hidden code paths and about unmapped code (`src/core/cliReports.ts:43-59`, `src/import/unmappedCode.ts:20-47`).
- Catalog drift is model-to-model only (`src/core/catalog.ts:46-55`).

**Building blocks**
- `scanRepo` works on any code source: disk, draft or git commit (`src/import/scan.ts:673`).
- `applyImport` is a pure function on a copy (`src/import/importer.ts:150`).
- The import review computes "verified" from scan facts (`src/import/review.ts:174-300`).
- `diffModels` and `ChangeSet` (`src/core/diff.ts:117`; `src/shared/types.ts:877-890`).

**Where findings could show**
- `AttentionItem` kinds (`types.ts:1166-1172`).
- The home page's "needs a look" list (`src/core/homeSummary.ts:168-240`).
- The bell's "Now" list, built in the browser (`ui/src/App.tsx:591-610`).
- Overlays (`ui/src/colourOverlays.ts:8-14`, `:143-196`).

**Model facts this wave relies on**
- Project-level data can sit on the workspace's properties, as `dp.work` does (`src/core/work.ts:48-75`).
- Element ids don't change on rename (`src/core/modelEdits.ts` header). So drift ids keyed on elements stay stable.
- Imports show only in-process edges. Hosts come only from env samples and compose (`scan.ts:919-925`), plus config facts from Wave 5. Most HTTP and queue lines can't be checked from imports.

## Design [Proposal; rewritten after the owner answers]

1. **The Finding shape** in `src/shared/types.ts`:

   | Field | Meaning |
   |---|---|
   | `id` | A stable hash of the rule, the target and the key facts |
   | `rule` | Which check made it |
   | `target` | `{type, id}`, or the project |
   | `severity` | info, warning, or error (for CI) |
   | `class` | computed, approximate, heuristic, or proposed |
   | `outcome` | found, not found, or not checkable |
   | `title`, `detail` | Text for people |
   | `evidence` | `[{path, lines?, fact?}]` |
   | `couldNotCheck` | What the check could not see |
   | `acknowledged` | Optional |

2. **Acknowledgements as model data** (★A5, ★Q6.1).
   - Stored as `dp.acks` `[{finding, reason, by, date}]` on the target element, relationship or view. Project-wide findings are stored on the workspace.
   - Edits go through `modelEdits.ts` (`acknowledgeFinding`, `clearAcknowledgement`), so they show in diffs and drafts.
   - `dp check` reports stale acknowledgements, whose finding no longer appears.
3. **Drift checks.** Every check answers found, not found, or not checkable (★Q6.2).
   - **In code, not in the model:**
     - container candidates;
     - known external services and hosts;
     - component folders with no model object;
     - unmapped files, as today.
   - **In the model, not in code:**
     - missing code paths;
     - containers whose evidence is gone (Dockerfile, compose service or manifest removed);
     - components with no files left.

     External systems with no evidence are **not checkable**, never "missing": they may be called through a plain HTTP client.
   - **Lines:**
     - an import between components with no relationship is "found in code, not in the model";
     - a relationship between two in-process components with no import is "not found";
     - a container-to-container relationship is found when a config host points at the other container's service name, and is otherwise not checkable.
   - **Technology:** manifest technologies against the element's technologies, compared after normalising the names.
   - **Shared helpers** (Wave 5): newly shared code is reported as information.
4. **Interfaces.**
   - CLI: `dp drift [PATH] [--ref REF] [--json] [--fail-on new|any]` (Q6.3, Q6.5).
   - `GET /api/drift` computes from the stored evidence. The existing "Scan again" (`POST /api/import/scan`) refreshes it. Large repositories run in the CLI.
5. **UI.**
   - A Drift page (`p=drift`) showing the shared Findings list, grouped by outcome.
   - A "drift" overlay.
   - A "needs a look" item kind `drift` on the home page, and a count in the bell's "Now".
6. **Fixing drift** (★Q6.4). "Update the model from code" turns the chosen findings into an ordinary import file (schema v1), then runs `checks.ts` → `importer.ts` → `review.ts`.
   - Scan facts make those items "verified" by themselves.
   - Names come from the code; placeholders are flagged.
   - BMO can be asked to name and describe the new objects (labelled "proposed").
7. **CI.** `demo/ci-examples/drift.yml`, in the same style as the existing examples.

## Determinism

| Output | Class |
|---|---|
| All drift checks | computed |
| Outcome "not checkable" | always stated, never guessed |
| Optional BMO naming in the fix draft | proposed |

## Owner answers

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q6.1 or ★A5 prefers a side file for acknowledgements.
- ★Q6.4 asks for a report only, with no draft.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Finding shape, acknowledgements, matching and id rules | general-purpose · Opus | `src/shared/types.ts`, `src/core/findings.ts` (new), `src/core/drift.ts` (new), `modelEdits.ts`, `modelUnits.ts`, `diff.ts` | Ids stay stable across runs; acknowledgements survive draft, apply and undo |
| 3 | CLI, route, home and bell items | general-purpose · Sonnet | `src/cli.ts`, `src/server/routes/drift.ts` (new), `src/server/auth.ts`, `homeSummary.ts`, `App.tsx` | Exit codes correct; ROUTE_RULES added |
| 4 | Drift page and overlay | general-purpose · Sonnet | `ui/src/pages/DriftPage.tsx` (new), `ui/src/common/Findings.tsx` (new, shared), `colourOverlays.ts`, `useNavigation.ts` | Works by keyboard; acknowledge from the page |
| 5 | Import-file generator for fixes | general-purpose · Sonnet | `src/import/fromFindings.ts` (new), `importer.ts`, `review.ts` | The generated file passes checks; items come out verified |
| 6 | Tests by another agent | general-purpose · Sonnet | `tests/unit/drift*.test.ts`, `tests/browser/drift.spec.ts` | Tests as listed below |
| 7 | Docs and CI example | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md, `docs/planned-change.md`, `demo/ci-examples/` | All docs updated |
| 8 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` for the acknowledge and clear routes (action `edit`; engineers use drafts). GET routes need none.
- **Hub.** Home-page items per project, and per-project roles for acknowledgements.
- **Read-only mode.** No acknowledgements.
- **Model data.** `dp.acks` on elements, relationships, views and the workspace needs units, a diff label ("Acknowledgements"), merge, the change list and `dp diff`.
- **Static export.** It includes acknowledgements.

## Tests

- **The demo.** The demo's sample code against the demo model gives a known list of findings.
- **Stable ids.** The same ids on two runs. A renamed folder gives a new id, which is documented.
- **Acknowledgements.** Round trip; in a draft, then applied; undo; stale acknowledgements reported.
- **Outcomes.** HTTP lines are not checkable. A deleted Dockerfile gives "not found". An import with no relationship gives "found in code".
- **`dp drift`.** Exit codes with `--fail-on`, and with `--ref`.
- **Fixing.** The fix import file passes checks, and its items are verified.
- **Browser.** The Drift page: acknowledge, then the item is hidden from the count.

## Docs

- **New DEC:** the Finding shape and acknowledgements as model data; drift outcomes; fixing through the import review.
- **README:** drift and `dp drift`.
- **CLAUDE.md:** `findings.ts`, `drift.ts`, `fromFindings.ts`, `DriftPage.tsx`.
- **`docs/planned-change.md`:** drift as a way to keep the model in step with the code.
- **future_tasks:** 1.2 (scan compare) and 2.4 (drift) done.
- **CHANGELOG**, **reviews.md**, and **`docs/determinism.md`** rows.

## Out of scope

- Runtime drift (Wave 12).
- Contract changes (Wave 13).
- Drift per environment (needs deployment diagrams).
- Watching files for changes; drift is computed on demand and in CI.

## Start prompt

```
Run Wave 06 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-06-drift-and-findings.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
