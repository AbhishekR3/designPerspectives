# Wave 06: Findings and acknowledgements

| | |
|---|---|
| **Status** | Rewritten 2026-11-20: the owner moved architecture drift to ideas list (I2.2). This wave keeps the part that Waves 8, 11 and 13 need: one Finding shape and acknowledgements. Ready to run |
| **Branch** | `feat/w06-findings`, from `main` |
| **Size** | M (was M–L) |
| **Release** | 0.10.0 (with Waves 7, 8; Wave 27 moved to 0.8.0 on 2026-11-20) |
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

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in PRO-20.*

### ★A5. One Finding and one way to acknowledge it, for every check?

**Analysis.** Drift (Wave 6), rules (8), runtime (12), contracts (13) and BMO reviews (11) all say the same kind of thing: "something about object X needs a look". Built separately, each would bring its own overlay, bell item and way to silence it.

**Proposed**
- **One Finding shape** in `src/shared/types.ts`: rule, target, severity, class, outcome, evidence, and what could not be checked. Built in Wave 6.
- **Acknowledgements are model data.** "Seen, and here is why it's fine" is stored on the target as a `dp.*` property. Project-wide findings are stored on the workspace, the way `dp.work` is (`src/core/work.ts:48-75`).
- **So acknowledgements behave like any edit:**
  - they go through drafts, undo and `dp diff`;
  - only people who may edit the model can silence a finding.

  ideas list I2.2 warns against "a way to hide real problems"; this keeps silencing reviewable.
- **The cost:** acknowledgements show up in model diffs, which is the point.

**The alternative** is a side file like `checklist.json`. Anyone with checklist rights could then silence drift on main without a review.

**Recommended.** Yes.

**Owner's thinking:** Go with whatever you think is best.

**Applied [2026-11-19].** Yes. One Finding shape, and acknowledgements stored as model data (`dp.acks`). Wave 6 builds it and records the decision entry. Waves 8, 11 and 13 reuse it. The parked runtime work (ideas list I2.7) would have too.

### ★Q6.1 Acknowledgements as model data

**Analysis.** See ★A5.

**Recommended.** Yes: `dp.acks` on the object the finding is about.

**Owner's thinking:** (Answered by A5: yes.) Wave 6: Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** Kept: `dp.acks` stay model data. [Wave 6](wave-06-findings.md) is now 'Findings and acknowledgements'.

### ★Q6.2 Three outcomes: found, not found, not checkable

**Analysis** [Fact]
- Imports show the lines between components that run in one process.
- Most lines between containers (HTTP, queues) don't appear in imports.
- dp reads hosts only from env samples and compose (`scan.ts:919-925`).

**Proposed.** Every drift check answers found, not found or not checkable, and says why. For example, an HTTP line between containers with no host in config is "not checkable", never "missing".

**Recommended.** Yes.

**Owner's thinking:** Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** The three outcomes (found, not found, not checkable) stay in the Finding shape for the later waves. Wave 6's own checks are the warnings dp already makes, so they are always 'found'.

### Q6.3 What drift compares against

**Recommended.** A fresh scan of the working tree by default. `--ref <git ref>` compares against a branch instead, using the existing git reader.

**Owner's thinking:** Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** Not built. Kept in ideas list I2.2 for your review.

### ★Q6.4 How drift is fixed

**Proposed**
- **"Update the model from code"** writes an ordinary import file from the findings you pick.
- **It reuses the import path.** The file goes through the existing checks, importer and review, so scan facts make those items "verified" by themselves (COD-02, COD-03). There is no second way into a draft.
- **Names come from the code** (service and folder names). Placeholders are flagged.
- **BMO can be asked to name and describe** the new objects, labelled as proposed.

**Recommended.** Yes.

**Owner's thinking:** Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** Not built. 'Update the model from code' is kept in ideas list I2.2 as part of the drift design.

### Q6.5 Drift in CI

**Recommended.** `dp drift --fail-on new` exits 1 only for findings that aren't acknowledged. A CI example goes in `demo/ci-examples/`.

**Owner's thinking:** Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** Not built. `dp drift` and its CI example are in ideas list I2.2.

## Added by the 2026-11-20 split

- **Home page "needs a look" and proposed decisions (PRO-16, D15).** Owner, 2026-11-20: build the alignment with the next change that touches `src/core/homeSummary.ts` or the home page, and this wave does (findings feed "needs a look"). The server's list also includes proposed decisions, so the page and the top-bar badge (CAN-10) use one rule. Test: on the demo (which ships proposed decisions) the page's list and the badge give the same count. Source: the former backlog B6 (now in the wave files).
## Carried from the backlog (moved from planned_features.md, 2026-11-21)

- **Home page "needs a look" and proposed decisions** (was B6; small). The server's list uses warning flags only; the top bar badge counts proposed decisions too (CAN-10). Decided (PRO-16, 2026-11-20): align them, so the server's list also includes proposed decisions and the page and the badge use one rule. Owner, 2026-11-20 (PRO-17, D15): build it with the next code change that touches `src/core/homeSummary.ts` or the home page, which this wave does. Add a test that the page's list and the badge give the same count on the demo (which ships proposed decisions). [Source: review.]

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
| 6 | Docs | general-purpose · Haiku | decisions.md, the review file (notes for the release entry, not the CHANGELOG), README, CLAUDE.md | All docs updated |
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

- **New decision entry:** the Finding shape; acknowledgements as model data (A5); the existing warnings as the first findings; drift parked (COD-07).
- **README:** findings and acknowledgements. **CLAUDE.md:** `findings.ts`, `FindingsPage.tsx`, `Findings.tsx`.
- **The review file** (not the CHANGELOG, which the release change writes) and **`docs/determinism.md`** rows.

## Decided (PRO-19, 2026-11-20; assistant's reasoning, the owner may overrule)

- **N8.** A pinned key-code entry (Wave 5) that no longer matches (file gone, or the name gone) is a finding the person can acknowledge. It is never silent and never removed by dp; when only the name is gone and the file exists, the finding says so.

## Out of scope

- Drift of any kind (ideas list I2.2).
- Rules, presets and detectors (Wave 8).
- Contract changes (Wave 13). Runtime findings (parked, ideas list I2.7).
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
