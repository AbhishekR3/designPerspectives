# Review: Stage P2 — diagram from scratch

Date: 2026-11-15. Branch: `prod-p2-from-scratch`. Baseline: Stage R (commit 16bd203). Decisions: [DEC-035](../decisions.md), [DEC-036](../decisions.md), [DEC-037](../decisions.md), [DEC-038](../decisions.md).

## What was built

| # | Item | Where |
|---|---|---|
| P2-1 | **Blank by default**: `dp serve` and `dp init` create an empty model. `--demo` gives the sample model with its sample code. `--empty` is still accepted. This reverses the earlier default. | `src/cli.ts`, `src/core/store.ts`, `tests/from-scratch.test.ts`, `e2e/from-scratch.spec.ts` |
| P2-2 | **Built-in lenses**: Architect (all levels, all sections) and Overview (landscape and context; no cost, notes, trade-offs, sensitive or code sections; technology hidden), next to Engineer. The state response has `defaultLens`. The chosen lens is remembered per project. | `src/core/sidecar.ts`, `src/server/routes/model.ts`, `ui/src/useLens.ts` |
| P2-3 | **First-run card**: an empty landscape shows "Start your architecture" with three steps. Other empty diagrams show a hint for their level. | `ui/src/EmptyState.tsx` |
| P2-4 | **Move**: a container moves to another software system, a component to another container. Keeps the ID, children and relationships. Works in drafts and in the compare overlay. | `src/core/ops.ts`, `src/server/routes/model.ts`, `src/core/merge.ts`, `src/core/diff.ts`, `ui/src/MoveDialog.tsx`, `tests/ops.test.ts`, `tests/drafts.test.ts` |
| P2-5 | **Readable IDs**: the first rename of a box added in this session also renames its ID and every reference. Opt-in with `reslug` on the rename request. | `src/core/ops.ts`, `ui/src/actions.ts`, `tests/ops.test.ts` |
| P2-6 | **Add and connect**: a person or software system added on a context, container or component diagram is created with its line, in one undo step. A line dragged onto empty canvas opens a menu of kinds. | `src/core/diagrams.ts`, `ui/src/connectRequired.ts`, `ui/src/Palette.tsx`, `ui/src/menus.ts`, `tests/diagrams.test.ts` |
| P2-7 | **Multi-select**: Shift+click and Shift+drag select several boxes. Drag and arrow keys move them together. Delete asks once and is one undo step (`POST /api/elements/delete`). | `ui/src/useSelection.ts`, `ui/src/panels/MultiPanel.tsx`, `ui/src/useShortcuts.ts`, `e2e/move-multi.spec.ts` |
| P2-8 | **Sidebar**: every software system is listed. A system with no containers is one entry marked "(empty)". Boxes that can be opened show a muted open mark on hover. | `ui/src/Sidebar.tsx` |
| P2-9 | **Canvas fixes**: Cut is removed. A double click on a palette item adds one box. The Delete key respects read-only and compare-only views. One rename request per Enter. Shortcuts do not fire while typing. `?` toggles help. The toolbar hides Undo, Redo and Auto-layout in read-only views. | `ui/src/useShortcuts.ts`, `ui/src/useClipboard.ts`, `ui/src/Canvas.tsx`, `ui/src/canvasParts.tsx`, `e2e/canvas-fixes.spec.ts` |

## How it works (one paragraph)

A new project has an empty model, and `--demo` copies the sample in. The lens default is computed by the server from the model (Architect with no containers, else Engineer). The browser keeps the lens a person picks, keyed by the project folder, and saves the resolved default on first load. A move is a server operation in `ops.ts` that checks the name and the parent rule before it changes the model. In a draft, the move is stored as one change to the element (Parent before → after), and the three-way merge treats any change on both sides to the same element as a conflict. Multi-select is a set of IDs in the UI. Moving, nudging and deleting act on the whole set, and the server deletes the set in one request, so the undo stack gets one step. Add-and-connect is one request that creates the box and its line, so it is one undo step.

## How it was checked

- `npm run lint` and the typecheck are clean.
- 190 vitest tests pass (160 before), including new tests for the from-scratch flow, move, re-slug, add-and-connect and the drafts merge of a move.
- 62 browser tests pass (40 before), run twice. New specs: a from-scratch run on an empty project (add, rename, connect, drill in, add a container, reload), move, multi-select and canvas fixes.
- The demo model is unchanged by `npm run make-demo`.
- The UI build is committed.
- Behaviour changes: the default for `dp serve` and `dp init` (DEC-036), the default lens (DEC-038), and the sidebar listing of empty systems. Everything else is an addition or a fix.

## Limits

- Only containers and components can move. People and software systems cannot (DEC-037).
- The fresh-ID mark lives only in the open page. After a reload, the first rename no longer renames the ID.
- Multi-select uses Shift only, for both click and drag. It does not select lines.
- A plain API client can still create a person that no lower diagram shows, because it has no line.
- At 1280 px width the first-run card sits close to the Add palette. This is for the layout stage.
- Two edits to the same element on both sides of a draft conflict, even when they do not overlap.

## Questions for the owner

1. Is blank-by-default right for `dp serve`, or should the first run ask "empty or sample"?
2. Should Ctrl/Cmd+click also add to the selection?
3. Should an empty system's context diagram be listed in the sidebar? (It is not listed now. It is reached from the system's panel, the breadcrumb and double-click.)

## Owner feedback

<!-- Please add feedback here. -->
