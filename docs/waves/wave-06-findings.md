# Wave 06: Findings and acknowledgements

| | |
|---|---|
| **Status** | Rewritten 2026-11-20: the owner moved architecture drift to ideas list (I2.2). This wave keeps the part that Waves 8, 11 and 13 need: one Finding shape and acknowledgements. Ready to run |
| **Branch** | `feat/w06-findings`, from `main` |
| **Size** | M (was M–L) |
| **Release** | 0.5.2 |
| **Depends on** | Nothing required. If Wave 5 is merged first, its key-code checks become Findings too |
| **Owner items** | None of the list directly. It is the base of items 18, 19 and 22 ([README.md](README.md#where-each-item-went)); item 1 (drift) is parked |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Every check in dp says "something about object X needs a look" in the same shape, and a person can answer "seen, and here is why it's fine" in the same way, stored as model data. The first findings are the warnings dp already makes, so the wave is useful on its own. Rules (Wave 8), BMO reviews (Wave 11) and contracts (Wave 13) reuse it.

## Owner request covered

> Wave 6: Push architecture drift to future_tasks.md for me to review later [2026-11-20]

The drift design (model ↔ code in both directions, found / not found / not checkable, "update the model from code", `dp drift`, a CI example) is written up in ideas list I2.2 for review. It is not built here. With dp no longer reading code by language (Wave 5), the comparisons that remain possible are listed there too.

The Finding shape and acknowledgements come from answer A5 (2026-11-19) and stay.

## What exists today [Fact]

- **Warnings dp makes:** `dp check` reports errors and warnings (`src/core/cliReports.ts:25-62`): model problems from `validate.ts`, missing or hidden code paths, and unmapped code (`src/import/unmappedCode.ts:20-47`). `--strict` fails on warnings (`src/cli.ts:393-405`).
- **Where findings could show:** `AttentionItem` kinds (`src/shared/types.ts:1166-1172`); the home page's "needs a look" list (`src/core/homeSummary.ts:168-240`); the bell's "Now" list, built in the browser (`ui/src/App.tsx:591-610`); overlays (`ui/src/colourOverlays.ts:8-14`, `:143-196`).
- **Project-level data on the workspace:** `dp.work` shows the pattern (`src/core/work.ts:48-75`).
- **Element ids do not change on rename** (`src/core/modelEdits.ts` header), so finding ids keyed on elements stay stable.
- Catalog drift is model-to-model only (`src/core/catalog.ts:46-55`) and stays as it is.

## Design [Proposal; rewritten after the owner answers]

1. **The Finding shape** in `src/shared/types.ts`:

   | Field | Meaning |
   |---|---|
   | `id` | A stable hash of the rule, the target and the key facts |
   | `rule` | Which check made it |
   | `target` | `{type, id}`, or the project |
   | `severity` | info, warning, or error (for CI) |
   | `class` | computed, approximate, heuristic, or proposed |
   | `outcome` | found, not found, or not checkable. Later waves use all three; the checks of this wave are always "found" |
   | `title`, `detail` | Text for people |
   | `evidence` | `[{path?, lines?, element?, fact?}]`: a file and lines, or a model object |
   | `couldNotCheck` | What the check could not see |
   | `acknowledged` | Optional |

2. **Acknowledgements as model data** (★A5, ★Q6.1).
   - Stored as `dp.acks` `[{finding, reason, by, date}]` on the target element, relationship or view. Project-wide findings are stored on the workspace.
   - Edits go through `modelEdits.ts` (`acknowledgeFinding`, `clearAcknowledgement`), so they show in diffs and drafts. Only people who may edit the model can acknowledge: architects on main, engineers in a draft.
   - `dp check` reports stale acknowledgements, whose finding no longer appears.
3. **First producers: the warnings dp already makes.** Each `dp check` warning becomes a Finding with a rule id (`model/missing-description`, `code/path-missing`, `code/path-hidden`, `code/unmapped`, and Wave 5's `key-code/file-missing`, `key-code/name-missing`), a target and evidence. The text and exit codes of `dp check` stay as they are, except that **an acknowledged warning no longer counts under `--strict`** and the summary says "N acknowledged".
4. **Interfaces.**
   - `GET /api/findings` computes the findings of the version shown (main, a draft or a git ref, by the usual headers).
   - `POST /api/findings/acknowledge` and `.../clear`: action `edit`.
   - CLI: `dp check` prints the acknowledged count and stale acknowledgements. `dp check --json` carries Findings.
5. **UI.**
   - **`ui/src/common/Findings.tsx`**: the shared list (grouped by severity then target, an element chip that reveals the object, the evidence, Acknowledge with a reason). Wave 8 reuses it.
   - **A Findings page** (`p=findings`).
   - A **"findings" overlay**: boxes coloured by their highest unacknowledged severity.
   - A "needs a look" item kind `finding` on the home page, and a count in the bell's "Now".

## Determinism

| Output | Class |
|---|---|
| The findings of this wave (the existing warnings) | computed |
| Acknowledgements | the person's own text, kept as typed |
| Stale-acknowledgement report | computed |

## Owner answers

- **A5 (2026-11-19):** yes. One Finding shape; acknowledgements are model data, stored as `dp.acks`.
- **Q6.1:** `dp.acks` on the object the finding is about. **Q6.2:** the three outcomes stay in the shape for the later waves.
- **Drift (2026-11-20):** pushed to the ideas list. Q6.3 (what drift compares against), Q6.4 (fixing drift through the import review) and Q6.5 (drift in CI) are not built; their designs are kept there.
- **Vision:** feature L (the base for BMO's checks) and the single source of truth (B).

## Stop and ask if

- ★Q6.1 or ★A5 prefers a side file for acknowledgements.
- Anyone asks to bring drift back into this wave.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Finding shape, ids, acknowledgements, units, diff, merge | general-purpose · Opus | `src/shared/types.ts`, `src/core/findings.ts` (new), `modelEdits.ts`, `modelUnits.ts`, `diff.ts`, `merge.ts` | Ids stable across runs; acknowledgements survive draft, apply and undo |
| 3 | Producers from `dp check`, routes, CLI, home and bell | general-purpose · Sonnet | `cliReports.ts`, `validate.ts`, `src/cli.ts`, `src/server/routes/findings.ts` (new), `src/server/auth.ts`, `homeSummary.ts`, `App.tsx` | Exit codes unchanged except for acknowledged warnings; ROUTE_RULES added |
| 4 | Findings page, shared list, overlay | general-purpose · Sonnet | `ui/src/pages/FindingsPage.tsx` (new), `ui/src/common/Findings.tsx` (new), `colourOverlays.ts`, `useNavigation.ts` | Works by keyboard; acknowledge from the page |
| 5 | Tests by another agent | general-purpose · Sonnet | `tests/unit/findings*.test.ts`, `tests/browser/findings.spec.ts` | Tests as listed below |
| 6 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md | All docs updated |
| 7 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` for acknowledge and clear (action `edit`; engineers use drafts). GET routes need none.
- **Hub.** Home-page items per project; per-project roles for acknowledgements.
- **Read-only mode.** No acknowledgements.
- **Model data.** `dp.acks` on elements, relationships, views and the workspace needs units, a diff label ("Acknowledgements"), merge, the change list and `dp diff`.
- **Static export.** Includes acknowledgements.
- **Demo.** Acknowledge one warning in the demo, run `npm run make-demo`, commit `demo/`.

## Tests

- **Stable ids.** The same ids on two runs. Renaming an element keeps its finding id.
- **Acknowledgements.** Round trip; in a draft, then applied; undo; a stale acknowledgement is reported.
- **`dp check`.** The same output as before for unacknowledged warnings; an acknowledged warning does not fail `--strict`; the summary counts it.
- **Producers.** Each existing warning appears once as a Finding with the right target.
- **Roles.** An engineer's acknowledgement goes into a draft; a viewer cannot acknowledge.
- **Browser.** The Findings page: acknowledge, then the item leaves the count and the overlay.

## Docs

- **New DEC:** the Finding shape; acknowledgements as model data (A5); the existing warnings as the first findings; drift parked (DEC-097).
- **README:** findings and acknowledgements. **CLAUDE.md:** `findings.ts`, `FindingsPage.tsx`, `Findings.tsx`.
- **CHANGELOG**, **reviews.md**, and **`docs/determinism.md`** rows.

## Out of scope

- Drift of any kind (ideas list I2.2).
- Rules, presets and detectors (Wave 8).
- Contract changes (Wave 13). Runtime findings (Wave 12, parked).
- Watching files for changes.

## Start prompt

```
Run Wave 06 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-06-findings.md, and follow them: branch from main as the header says, run
the steps with the agents and models in the table, brief each subagent with files and line
ranges and the words "never run git stash, never push", run the checks, update the docs,
and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an answer
this wave needs is missing.
```
