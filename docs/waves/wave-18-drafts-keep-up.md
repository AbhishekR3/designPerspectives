# Wave 18: Drafts that keep up with main

| | |
|---|---|
| **Status** | Owner answer applied (questions C2: "go with your best decision", 2026-11-19 → rebase and merge editor, and undo that restores the draft; the code comparison stays later). Ready to run |
| **Branch** | `feat/w18-drafts-keep-up`, from `main` |
| **Size** | M–L. Split point: 18a is rebase and the merge editor (steps 2 to 4); 18b is undo that restores the draft (step 5) |
| **Release** | 0.11.0 (with Waves 9, 11, 17, 19) |
| **Depends on** | Nothing in this plan. **Run before [Wave 17](wave-17-architecture-commits.md)** (architecture commits), which adds a commit-on-apply hook to the same `Drafts.apply` and an undo notice that describes what 18b makes undo do. Leave `Drafts.apply` with one clearly named place after a successful apply where a later step can run (for example a list of after-apply callbacks), so Wave 17 adds its hook there and does not edit the merge itself |
| **Owner items** | Feature C of [../product-vision.md](../product-vision.md): architecture change proposals. [../planned_features.md](../planned_features.md) B3 |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

With several accounts proposing changes in drafts, main moves while a draft is open. Today a conflict shows up only at apply time, and nothing can resolve it. After this wave a draft can be brought up to the current main, conflicts are resolved one object at a time in the UI, and undoing an apply brings the draft back.

## Owner request covered

> C. Architecture change proposals
> C2: Go with your best decision. [(a) rebase and merge editor, (b) undo restores the draft; (c) compare against the code at the start of the draft is left for later]

## What exists today [Fact]

- **Drafts** are folders `architecture/drafts/<id>/` with their own two files, `draft.json` and `base/`, a copy of main when the draft was made (DEC-016). The change list compares the draft with its base ("Since it started") or with main now ("Against main now"), and shows "main +N" (DEC-040).
- **Apply is a three-way merge** (`src/core/merge.ts`): base, main now, the draft, object by object (units from `modelUnits.ts`). A change on one side wins; the same on both is kept; different changes to the same object are a conflict and nothing is applied (`Drafts.apply`, `src/core/drafts.ts:336`; `planApply`). Reference checks follow the merge (an element inside a removed element, a line to a removed element, a flow step over a removed line).
- **A partial apply of an import draft already rebases what it keeps** (`hold.rebased`, DEC-065). The general rebase is not built.
- **Apply is one undo step on main** (`Project.undo`, `src/core/project.ts:184`), and **deletes the draft**. Undo restores the model only: not the draft, and not the code files the apply wrote (DEC-032: code first, then model, with rollback).
- **UI:** `ui/src/drafts/` (`DraftList.tsx`, `ChangeList.tsx`, `ApplyDialog.tsx`). The apply dialog lists conflicts as text.
- **Roles.** Engineers edit any draft and discard only their own; only architects apply (DEC-063).

## Design [Proposal]

1. **Rebase** (`Drafts.rebase(id, resolutions?)`). Run the same three-way merge with the draft's base, main now and the draft. The result becomes the draft's new content and main-now becomes its new `base/`. The change list afterwards shows only the draft's own changes against the new main.
   - With no conflicts it is one step, and one undo step for that draft (the draft keeps its own undo stack, as now).
   - With conflicts nothing changes until each is resolved.
2. **Merge editor.** A dialog listing each conflict by object: what main changed, what the draft changed, and a choice: **keep the draft's version**, **take main's version** or **keep both where possible** (for list-like fields such as tags and notes, shown only where the merge can do it without guessing). Positions and layout never conflict (DEC-016).
   - After every choice dp re-runs the merge; the dialog shows what is left. A resolution is never guessed.
   - The choices are applied in one rebase.
3. **Rebase before apply is offered, not forced.** The apply dialog, when it finds conflicts, offers "Rebase this draft first".
4. **Who.** Engineers rebase their own drafts and architects any draft (editing a draft is their right today); a new `rebaseDraft` action carries the rule. Read-only and a draft not owned: refused.
5. **Undo restores the draft.** Before an apply, dp keeps a recovery copy of the draft folder, and the pre-apply contents of any code file the apply is about to write, under `.dp/trash/apply-<n>/` (outside git).
   - Undoing that apply restores the model, brings the draft back, and restores a code file **only if it still holds what the apply wrote**; if someone changed it since, dp leaves it and says which file.
   - Redo applies again and removes the recovery copy again.
   - The recovery copy is dropped after a limit (the last 5 applies) and on `dp` start if older than 30 days.
6. **Not in this wave:** comparing a draft's planned code edits with the code as it was when the draft started (planned_features B3, later).

## Determinism

| Output | Class |
|---|---|
| The merge, the conflict list, the rebased draft | computed |
| Nothing here uses BMO | — |

## Owner answers

- **C2:** best decision, as recommended: (a) and (b) in this wave; (c) later.

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in DEC-104.*

### ★C2. Which gaps in the change-proposal feature (C) go into 1.0.0?

**Analysis** [Fact]. [planned_features.md](../planned_features.md) B3 lists what drafts cannot do yet:
- rebase a draft onto a main that has moved, and a merge editor for conflicts (today a conflict is reported only when the draft is applied) [Medium];
- undo of an apply restores the model but not the code files it wrote nor the deleted draft [Small–medium];
- compare a draft's planned code edits with the code as it was when the draft started [Medium].

With several accounts working in drafts (feature E), the first is the one people meet.

**Options.** Pick any: (a) rebase and merge editor, (b) undo restores the draft, (c) compare against the code at the start of the draft.

**Recommended.** (a) and (b) in 1.0.0, as a new wave after Wave 4. (c) later.

**Owner's thinking:** Go with your best decision.

**Applied [2026-11-19].** (a) rebase and merge editor and (b) undo that restores the draft, as recommended, in new [Wave 18](wave-18-drafts-keep-up.md). (c) stays later.

## Added by the 2026-11-20 split

- **Optional 18c, compare a draft's planned code edits with the code as it was when the draft started** (planned_features B3). Today they are compared with the code folder as it is now, so a file changed since the draft began shows as a conflict. It is the same stale-draft problem as the rebase; build it here if 18a leaves room, otherwise leave it in planned_features B3 (it is not needed for 1.0.0).
## Stop and ask if

- A resolution would need dp to combine two different edits of one field (for example two different descriptions). dp offers a choice, never a blend.
- The recovery copy would have to hold secrets: code files may contain them. Check `.dp/` is mode 0700 and git-ignored before storing any.
- Rebase would have to change a draft's base for an import draft whose review data refers to the old base (`lastImport`, `review.ts`).

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files in "What exists today" | Anchors confirmed or corrected |
| 2 | Rebase and resolutions in the core | general-purpose · Opus | `src/core/drafts.ts`, `merge.ts` (resolutions), `project.ts` | Rebase is atomic; no half-written folder; conflicts never written |
| 3 | Routes and permission | general-purpose · Sonnet | `src/server/routes/drafts.ts`, `src/server/auth.ts`, `src/shared/types.ts` | `ROUTE_RULES` entries; engineers limited as above |
| 4 | Merge editor and the apply dialog offer | general-purpose · Sonnet | `ui/src/drafts/` (a `MergeEditor.tsx`, `ApplyDialog.tsx`, `DraftList.tsx`) | Each conflict resolvable by keyboard; "main +N" returns to 0 after a rebase |
| 5 | Undo that restores the draft and code files | general-purpose · Opus | `src/core/drafts.ts` (apply), `project.ts`, a recovery store | A changed code file is left alone and named; limits hold |
| 6 | Tests (not the authors of 2 to 5) | general-purpose · Sonnet | `tests/unit/drafts-rebase*.test.ts`, `tests/browser/merge-editor.spec.ts` | As listed below |
| 7 | Docs | general-purpose · Haiku | `docs/planned-change.md`, decisions.md, the review file (notes for the release entry, not the CHANGELOG), CLAUDE.md, README | The limits list in planned-change.md shrinks |
| 8 | Review | main session | — | `/code-review` (high) and `/security-review` findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` for rebase and for the resolution routes.
- **Hub and read-only.** Per-project roles; read-only refuses.
- **Model data.** No new model data. The draft's base changes; diff and merge keep working on it.
- **Security model.** The recovery store: outside git, mode 0700, confined paths, dropped on a limit.
- **Windows.** Folder moves and paths.
- **Static export.** Not affected.

## Tests

- Rebase with no conflict gives a draft whose changes against main equal its old changes.
- Each conflict kind in `merge.ts` (both changed, element removed under a change, line to a removed element, flow step over a removed line) can be resolved each way, and a wrong choice is rejected.
- A failed rebase leaves the draft byte-identical.
- An import draft rebased keeps its accepted and held items.
- Undo of an apply restores the draft and the model; a code file changed after the apply is left and named.
- The recovery limits (5 applies, 30 days).
- An engineer cannot rebase another's draft if the rule says so.
- Browser: create a conflict by editing main and a draft, resolve it in the editor, apply.

## Docs

- **New DEC:** rebase and the merge editor; the recovery copy for undo; limits.
- **`docs/planned-change.md`:** update "what it cannot do yet".
- **The review file** (not the CHANGELOG, which the release change writes), **CLAUDE.md** (`MergeEditor.tsx`), **README**.
- **planned_features.md:** mark the rebase and undo rows built; keep the code comparison.

## Out of scope

- Two people editing one draft at once, and real-time collaboration (ideas list I2.6).
- Comparing planned code edits with the code at the draft's start.

## Start prompt

```
Run Wave 18 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-18-drafts-keep-up.md, and follow them: branch from main as the header says,
run the steps with the agents and models in the table, brief each subagent with files and
line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
