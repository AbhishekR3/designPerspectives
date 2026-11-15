# Review: Stage P3 — plan changes with drafts

Date: 2026-11-15. Branch: `prod-p3-drafts`. Baseline: Stage P2 (commit da7d97b). Decisions: [DEC-039](../decisions.md), [DEC-040](../decisions.md).

## What was built

| # | Item | Where |
|---|---|---|
| P3-1 | **Model sync**: a draft or git version that cannot load leaves the previous version, overlay and URL on screen, with the error named. A bad version in the URL on first load falls back to main with a notice. A main model that cannot load shows Retry. | `ui/src/App.tsx`, `ui/src/api.ts`, `src/core/git.ts`, `src/server/routes/drafts.ts` |
| P3-2 | **Newest response only**: request tickets drop superseded responses, so a box does not jump back after quick edits or drags. | `ui/src/App.tsx`, `ui/src/api.ts` |
| P3-3 | **Save then refresh**: an edit that saved but whose reload failed says "Saved, but the view could not be refreshed", with Retry. Follow-up actions still run. | `ui/src/actions.ts`, `ui/src/App.tsx` |
| P3-4 | **Back and Forward**: across a version switch they land on the right diagram and add no stray history entries. | `ui/src/App.tsx` |
| P3-5 | **Focus check**: the state response carries `version`. On window focus the UI reloads only if the model changed. No timer. It waits while the user types or a dialog is open. | `src/shared/types.ts`, `ui/src/App.tsx` |
| P3-6 | **New draft dialog**: title and description. A duplicate title is refused in the dialog. | `ui/src/ChangesPanel.tsx`, `src/core/drafts.ts` |
| P3-7 | **Author**: drafts record an optional `author` (from the client, else `git config user.name`). Shown in the list and in the `dp plan` Markdown header. | `src/core/drafts.ts`, `src/core/plan.ts`, `ui/src/ChangesPanel.tsx` |
| P3-8 | **Drafts list menu and rows**: rows show author and date. Menu: Rename, Edit description, Discard. | `ui/src/ChangesPanel.tsx` |
| P3-9 | **"main +N" badge**: how many objects main changed since the draft started. Cached by main's revision. | `src/core/drafts.ts`, `src/server/routes/drafts.ts`, `ui/src/ChangesPanel.tsx` |
| P3-10 | **Apply dialog**: code-only drafts are no longer "changes nothing". Stale conflicts clear when the code option is toggled. The undo text is truthful. Success toasts for apply and discard. | `ui/src/ChangesPanel.tsx`, `ui/src/actions.ts` |
| P3-11 | **Coding plan dialog**: "Checking…" while loading, a failed check is shown in the dialog, the branch is saved once, Copy Markdown confirms. | `ui/src/ChangesPanel.tsx` |
| P3-12 | **File editor**: Ctrl/Cmd+S saves only when Save is enabled. Tab does not edit a read-only file. Loading… state. Long paths wrap. | `ui/src/CodeParts.tsx`, `ui/src/useShortcuts.ts` |
| P3-13 | **New planned file from the element panel**: one request creates the file and maps the path, both or neither (`POST /api/code/file` with `mapTo`). | `src/server/routes/code.ts`, `src/core/ops.ts`, `ui/src/panels/ElementPanel.tsx`, `ui/src/panels/CodeDiagramPanel.tsx` |
| P3-14 | **Right-click menu**: scrolling inside it no longer closes it. Shift+F10 or the menu key opens it for the selection. | `ui/src/ContextMenu.tsx`, `ui/src/menus.ts` |
| P3-15 | **Ghost file boxes**: a removed file box no longer shows an editable file panel. | `ui/src/panels/CodeDiagramPanel.tsx` |

## How it works (one paragraph)

Each request gets a ticket, and the UI applies only the response to the newest ticket, so an older response that arrives late is dropped. A version switch that fails restores the last good version, overlay and URL, and the error is shown. The state response carries a `version`; on window focus the UI compares it and reloads only when it changed, so changes from git, another tab or the CLI appear without a timer. A draft's author is a plain label stored in `draft.json`. The "main +N" count is a diff of the draft's base against main, cached by main's revision, so it is computed once per main change. The new file action is one server call, so the file and its mapping are both made or neither is.

## How it was checked

- `npm run lint` and the typecheck are clean.
- 194 vitest tests pass (190 before).
- 78 browser tests pass (62 before), run twice. Seven model-sync tests were each confirmed to fail on the old code. Nine drafts-ui tests drive drafts only through the UI: create, rename, edit, changes overlay, main +N, apply, undo, discard, conflict, code-only draft, file editor, plan dialog. The new specs are in `e2e/drafts-ui.spec.ts`.
- The demo model is unchanged by `npm run make-demo`.
- The UI build is committed. The old hashed bundles are removed.

## Limits

- There is no rebase of a draft onto a newer main. The "main +N" badge only reports the gap (DEC-040).
- Conflicts are reported, not resolved.
- Undo of an apply restores the model only. Written code files and the draft are not restored.
- The author comes from `git config user.name` until login exists (next stage). It is a label, not an identity check.
- A Retry button exists only for refresh failures, not for every error.
- The author is not shown inside the coding plan dialog.
- A change made elsewhere shows only when the window regains focus (DEC-039).

## Questions for the owner

1. Should a draft with "main +N" offer "update from main" (rebase) next?
2. Is `git config user.name` acceptable as the default author when there is no login?

## Owner feedback

<!-- Please add feedback here. -->
