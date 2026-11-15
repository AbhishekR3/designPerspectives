# Review: Stage R — refactor and dialogs

Date: 2026-11-14. Branch: `prod-r-refactor`. Baseline: Stage P1 (commit 789869c). Decisions: [DEC-033](../decisions.md), [DEC-034](../decisions.md).

## What was built

| # | Item | Where |
|---|---|---|
| R1 | **UI shell split**: `App.tsx` went from 1231 to 434 lines. Logic moved to hooks and modules with no behaviour change. | `ui/src/App.tsx`, `ui/src/useModel.ts`, `ui/src/useNavigation.ts`, `ui/src/useShortcuts.ts`, `ui/src/useClipboard.ts`, `ui/src/useLens.ts`, `ui/src/useSelection.ts`, `ui/src/usePanels.ts`, `ui/src/useFlowPlayer.ts`, `ui/src/menus.ts`, `ui/src/actions.ts`, `ui/src/storage.ts`, `ui/src/SearchBox.tsx` |
| R2 | **Server split**: `src/server/app.ts` went from 910 to 58 lines. Request context, request protection and the routes are in their own modules. Route order is unchanged. One `atomicWrite` replaces two identical copies. | `src/server/app.ts`, `src/server/context.ts`, `src/server/protect.ts`, `src/server/routes/`, `src/core/fsutil.ts` |
| R3 | **Object panel and stylesheet split**: `ObjectPanel.tsx` (1003 lines) became a folder of panels and editors. `styles.css` (1859 lines) became files by area. Every z-index is a `--z-*` variable with its old value. | `ui/src/panels/`, `ui/src/styles/` |
| R4 | **In-app dialogs and toasts**: the browser's prompt and confirm boxes are replaced in 19 places. Failures that used to be silent are now shown. | `ui/src/dialogs.tsx`, `ui/src/notify.tsx` |
| R5 | **ESLint in CI**: recommended rules for JavaScript and TypeScript, plus the two hook rules. Prettier is configured but not applied. | `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.github/workflows/ci.yml`, `package.json` |
| R6 | **Test teardown fix**: the browser-test server closes open connections before it stops. Before, a test sometimes hung for 60 s at teardown. | `e2e/fixtures.ts` |

## How it works (one paragraph)

Shared UI state lives in hooks. `App.tsx` only combines them. `useModel.ts` holds server state, refresh, mutate and version switching; `useNavigation.ts` holds the current diagram, history and URL hash. Each keyboard listener keeps its own target check, so the four listeners were not merged. The server builds its app from a request context (`context.ts`), a protection middleware (`protect.ts`) and route modules under `routes/`, in the same order as before. Dialogs come from `dialogs.tsx`: `confirmDialog` and `promptDialog` return a promise, take focus, and return focus when closed. While a dialog is open, keyboard shortcuts do nothing. `notify.tsx` holds one error slot and shows success toasts.

## How it was checked

- `npm run lint` is clean. Typecheck passes for the server and the UI.
- 160 unit and API tests pass with no test edits.
- 40 browser tests pass (32 before, plus 8 new dialog tests), three runs in a row.
- The UI build is committed. `npm run make-demo` leaves `demo/` unchanged.
- 13 screenshots were compared with the previous build: landscape, help, element panel, menus, dock, flow, code diagram, file editor, draft changes and the apply dialog. They are identical apart from one line that shows the temporary folder name.
- Behaviour change: only R4. The other items have no behaviour change. Twelve existing quirks were found and kept on purpose. They will be fixed in later stages, with tests. Examples: Cut deletes the element, so Paste does nothing; the Delete key ignores read-only mode; an edit is reported as failed when the edit worked but the reload after it failed.

## Limits

- The four keyboard listeners are separate, not one.
- `mutate` was not restructured.
- SearchBox is not a modal dialog. It has no focus trap.
- Prettier is not applied, so 58 of 113 source files would be re-wrapped.
- The hook-dependency disables are only correct while callers keep passing state setters and refs.
- The 12 quirks above remain until the later stages fix them.

## Questions for the owner

1. Should Prettier be applied in one separate commit (58 files re-wrapped) and enforced in CI, or left as it is?
2. Are the new dialog button labels and wording right?

## Owner feedback

<!-- Please add feedback here. -->
