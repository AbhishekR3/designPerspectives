# Review: Stage C4 — planned code changes and the coding plan

Date: 2026-11-14. Branch: `stage-c4-code-changes`. Baseline: Stage C3 (commit 1e6638a). Guide: [planned-change.md](../planned-change.md).

## What was built

| # | Item | Where |
|---|---|---|
| C4 | **Code edits in a draft**: saving a mapped file while in a draft stores it in the draft (`code.json` with the sha1 of the original as base, and `code/<path>`). The code folder is not changed until apply. Planned new files, planned deletions and revert. Routes: `GET/PUT/POST/DELETE /api/code/file`, `POST /api/code/revert`. Saves are refused (403) in a git version. | `src/core/codefs.ts`, `src/core/code.ts`, `src/server/app.ts` |
| C4 | **One code reader** for three sources: the code folder, the code folder plus a draft's planned edits, and the code at a git commit. | `src/core/codefs.ts` |
| C4 | **Coding plan**: the draft's changes as steps (build, remove, change, connect, disconnect, flow, file), checked automatically where possible. UI dialog on the draft strip: set the branch, check against the code folder or a branch, copy Markdown. | `src/core/plan.ts`, `ui/src/ChangesPanel.tsx` |
| C4 | **`dp plan <draft> [PATH]`**, with `--check` (exit 1 while steps are open), `--against <ref>` (exit 2 when there is no code to check against), `--format md\|json`, `--out <file>`, `--code-root`. | `src/cli.ts`, `src/core/plan.ts` |
| C4 | **Apply with code**: "Also write the planned code edits" in the apply dialog. Conflicts are reported when a file changed, was removed or was created in the code folder since it was planned. | `src/core/drafts.ts`, `ui/src/ChangesPanel.tsx` |
| C4 | **`draft.json`** gains optional `branch` and `link`. | `src/core/drafts.ts` |
| C4 | **`dp diff`** gains `--no-code` and `--code-root`. Changed code files behind mapped objects are listed and count toward `--exit-code`. | `src/core/report.ts`, `src/cli.ts` |
| C4 | **Right-click menus** on boxes, lines and the canvas, with copy and paste style and keyboard navigation. | `ui/src/ContextMenu.tsx` |
| C4 | Tests: 5 unit/API tests, one browser spec for the coding plan and planned code, one browser spec for the context menu. | `tests/planned-code.test.ts`, `e2e/planned-code.spec.ts`, `e2e/context-menu.spec.ts` |

## How it works (one paragraph)

Reads of code go through one reader (`src/core/codefs.ts`) that takes one of three sources: the code folder, the code folder with a draft's planned edits on top, or the code at a git commit. A draft keeps its planned edits in `code.json` (a manifest that records the sha1 of each original file) and in `code/`, so nothing touches the code folder until apply. Git versions are read-only, so saves there are refused. The coding plan (`src/core/plan.ts`) turns the draft's model and code changes into steps and checks each one against the chosen source: paths exist or are gone, imports are present or absent, and planned files are written. Apply writes the model first and then the code files, so the same check that drives the plan also finds conflicts with files changed since planning.

## How it was checked

- Tests: 138 vitest tests pass; 32 browser tests pass.
- `npm run typecheck` (server and UI) and the UI build.

## Limits

- The check sees files and imports only. HTTP, queue and dependency-injection calls are not imports, so they are checked by hand.
- Planned edits are compared with the code folder as it is now, not as it was when the draft started.
- Undoing an apply restores neither the code files it wrote nor the deleted draft.
- Apply writes the model first and then the code. A failed file write leaves the model applied and the draft in place. To be fixed in the next stage.
- Planned code edits are not part of the draft's undo history.
- A step for a changed technology is always checked by hand.

## Questions for the owner

1. Should "Also write the planned code edits" default to off when the draft has a branch?
2. When a file write fails during apply, should the model change be rolled back (the next stage's fix), or is a clear message with the draft kept enough?
3. Should planned code edits get their own undo history, or is it enough that they are saved on every edit?

## Owner feedback

<!-- Please add feedback here. -->
