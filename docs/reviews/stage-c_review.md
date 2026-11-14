# Review: Stage C — planned change (drafts, git compare, `dp check` / `dp diff`)

Date: 2026-11-14. Baseline: 0.3.0 (`main`, commit 01d917f). Branches: `stage-c1-drafts` → `stage-c2-git-compare` → `stage-c3-cli` (each builds on the one before).

Owner decisions for this stage (2026-11-14): applying a draft is an object-level **three-way merge** that refuses on conflicts; drafts live in **`architecture/drafts/<id>/` and are committed**; scope is **C1 + C2 + C3** as three pull requests with this one review.

## What was built

| # | Item | Where |
|---|---|---|
| C1 | **Drafts**: Drafts → + New draft copies the model to `architecture/drafts/<id>/` (plus `base/`, the main model at that moment). The draft is edited like the main model, with its own undo history. | `src/core/drafts.ts`, `ui/src/ChangesPanel.tsx` |
| C1 | **Changes overlay**: boxes and lines coloured Added / Changed / Changed inside / Removed. Removed objects stay as faded, struck-through, read-only **ghosts** at their old place. Clicking a changed object shows each field before → after; the panel lists all changes (click → open where it is drawn). Focus/Hide filters work on it like other overlays. | `src/core/compare.ts`, `src/core/diff.ts`, `ui/src/overlays.ts`, `ui/src/Dock.tsx` |
| C1 | **Apply / Discard**: Apply shows what the main model will get, then merges as **one undo step** and deletes the draft. Changes made to main since the draft started are kept; an object changed on both sides (or a merge that breaks a model rule, e.g. two containers named the same) is listed as a conflict and nothing is applied. | `src/core/merge.ts`, `src/core/units.ts` |
| C2 | **Compare with git**: Drafts → Git: pick a branch, tag or commit (or type one) → **Compare** (same overlay, working model vs that version) or **Open** (that version, read-only). Two refs can be compared through the API (`X-DP-Model: ref:A`, `X-DP-Compare: ref:B`). | `src/core/git.ts` |
| C3 | **`dp check`** (`dp validate` still works): model rules for the main model and every draft; warnings for mapped code paths that do not exist; `--strict` fails on warnings; exit 0 / 1 / 2 (no model). | `src/core/report.ts`, `src/cli.ts` |
| C3 | **`dp diff --base <ref> [--head <ref>] [--format md\|json] [--out f] [--exit-code]`**: Markdown summary for a pull request comment (counts, tables of elements, relationships, flows, settings, collapsed before/after). | same |
| C3 | Sample CI jobs: GitHub Actions (check + comment via `gh`) and GitLab CI (check + note via the REST API). | `docs/examples/ci/` |

Screenshots: [draft with the Changes overlay and a changed object selected](stage-c/draft-changes.png), [apply dialog](stage-c/apply-dialog.png).

## How it works (one paragraph)

A model version is flattened into **units**, one per object (element, relationship, view, stored position, tag group, lens, style, layout entry; `src/core/units.ts`). Diff, merge and the overlay all compare units by key; IDs do not change on rename and elements cannot change parent, so matching by ID is exact. View element lists are left out of units because `syncViews`/`syncFlows` rebuild them from the model. Every API request names the version it works on and the one it is compared with in two headers (`X-DP-Model`, `X-DP-Compare`), so the server keeps no "current draft" and two tabs can show different versions. Decisions: DEC-016 (drafts and merge), DEC-017 (headers), DEC-018 (git CLI).

## How it was checked

- **Round trip**: flattening and rebuilding the demo model gives the same two files byte for byte; also for a hand-made workspace with fields we do not model (deployment nodes, configuration, custom views, unknown properties). This is the guard against apply rewriting files that only one side changed.
- **Tests**: 130 vitest tests pass (102 before this stage): units, diff, merge (fast-forward, disjoint edits, same-object conflict, same change on both sides, delete vs change, child of a removed element, positions never conflict), draft API (create, edit leaves main untouched, compare diagram with ghosts and "changed inside", diagram that only exists in the base, apply + undo, 409 conflicts, model-rule conflict, rename, discard, bad IDs incl. `../..`, read-only server), git (temporary repositories: ref listing, read-only versions, compare working tree vs ref and ref vs ref, a commit without the model, refs like `--help` and `a:b` refused), CLI (`check` warnings/strict/drafts/exit 2, `diff` Markdown/JSON/`--head`/`--exit-code`/bad refs).
- **Browser tests**: 25 pass (22 before + drafts ×2 + git compare), run 3 times each in parallel (75 runs), no failures.
- `npm run typecheck` (server and UI), the UI build is reproducible (same hashed files on rebuild), `npm run make-demo` leaves `demo/` unchanged, the compiled CLI (`dist/`) runs `check` and `diff`.
- **Bug found and fixed while testing**: the first version of the draft banner floated over the top of the canvas and covered boxes (found because a browser test could not click a box under it). It is now a strip above the canvas that takes its own space; the model picker moved from the crowded top bar into a Drafts section in the sidebar.

## Limits

- Conflicts are reported, not resolved: to apply, change one side so the objects agree (or discard and redo). There is no "rebase draft onto main" yet.
- Undoing an apply restores the main model but not the deleted draft (git history still has it, if committed).
- New objects from a draft are inserted after the object that preceded them in the draft, so sibling order can differ slightly from the draft's.
- Layout (positions, sizes, line shapes) never conflicts: the draft's layout wins. Styles do conflict.
- C2 compares the **stored model** at a ref, not a code scan (Stage B is not built). It needs the `git` command; without it the Git row is hidden.
- A repository created after the server started is picked up on the next request; one that disappears needs a restart.
- `dp check` cannot report "unmapped code" (code no object points to) until Stage B; it warns about mapped paths that are missing instead.
- **Not run**: the GitLab CI sample (no GitLab instance). The GitHub Actions sample was not run in a real repository either; it uses `gh pr comment --edit-last` with a fallback to a new comment [Training: `--edit-last` exists in recent `gh` versions]. Both install `dp` from GitHub, which was not tested before merge (backlog §5).
- Changed from the plan: the GitLab sample posts the note with `curl` and GitLab's merge-request notes API instead of installing `glab`, to avoid an unverified download URL.

## Questions for the owner

1. Should a draft also be comparable with the **current** main model (what applying would change now), not only with its base? The apply dialog already shows this; a toggle on the strip would be small.
2. Keep "layout never conflicts, draft wins", or should layout conflicts be reported too?
3. Ship a sample draft in the demo model so the feature is visible on first run?
4. For C2, is comparing stored models enough for now, or should C2 wait for Stage B scans to compare code with the model?
5. Should `dp check --strict` run in this repository's own CI (on `demo/`)?

## Owner feedback

<!-- Please add feedback here. -->
