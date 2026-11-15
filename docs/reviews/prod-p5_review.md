# Review: Stage P5 — layout, overflow and polish

Date: 2026-11-15. Branch: `prod-p5-layout-polish`. Baseline: Stage P4 (commit ba70bb7). Decisions: [DEC-042](../decisions.md).

## What was built

| # | Item | Where (main files) |
|---|---|---|
| P5-1 | **Top area in two rows**: breadcrumb crumbs truncate (middle first), search collapses to an icon, lens label truncates. Nothing overlaps down to a 420 px canvas column. Before, the search and lens bar covered the breadcrumb at 1280 px and most of the top-left bar at 1024 px. | `ui/src/App.tsx`, `ui/src/SearchBox.tsx`, `ui/src/styles/layout.css` |
| P5-2 | **Draft strip and role banner** are one row that wraps. Apply, Discard and Back to main always stay visible. Before, the change counts stacked and the strip scrolled sideways. | `ui/src/ChangesPanel.tsx`, `ui/src/App.tsx`, `ui/src/styles/layout.css` |
| P5-3 | **Add palette** collapses to a button (remembered; starts collapsed on a narrow canvas) and scrolls inside itself. Palette and dock share one column, so they cannot cover each other. | `ui/src/Palette.tsx`, `ui/src/Dock.tsx`, `ui/src/usePanels.ts`, `ui/src/styles/canvas.css` |
| P5-4 | **Fit to view** fits the diagram into the area not covered by bars, palette, dock and zoom buttons. The diagram re-fits when the canvas size changes, until the user pans or zooms. | `ui/src/Canvas.tsx`, `ui/src/insets.ts` |
| P5-5 | **Quick bar** above a selected box stays inside the canvas. | `ui/src/canvasParts.tsx`, `ui/src/Canvas.tsx` |
| P5-6 | **Side panels**: resizing cannot shrink the canvas below 420 px. The right panel collapses to a slim rail (starts collapsed under 1100 px). | `ui/src/usePanels.ts`, `ui/src/App.tsx`, `ui/src/styles/panels.css` |
| P5-7 | **Long names and tokens**: 120-character names and 80-character unbroken tokens wrap or truncate in boxes, boundary labels, edge labels, panels, change lists, the breadcrumb, menus, toasts, dialogs and the sidebar tree. No horizontal scrollbars in the panels. | `ui/src/styles/base.css`, `ui/src/styles/dialogs.css`, `ui/src/styles/panels.css`, `ui/src/editors.tsx`, `ui/src/fields.tsx` |
| P5-8 | **Dialogs** fit the window, with scrolling content and visible buttons. | `ui/src/styles/dialogs.css`, `ui/src/notify.tsx` |
| P5-9 | **Feedback**: loading bar on diagram and version switches; busy state on Apply, Create, Save and Move; one focus ring; labels on every icon-only button; help card lists all shortcuts; reduced-motion support; an empty flow no longer gets a step. | `ui/src/HelpCard.tsx`, `ui/src/useFlowPlayer.ts`, `ui/src/styles/tokens.css`, `ui/src/styles/base.css` |
| P5-10 | **Layout tests**: 24 geometry-based browser tests at 1024×640, 1280×760 and 1440×900. | `e2e/layout.spec.ts`, `e2e/roles.spec.ts` |

## How it works (one paragraph)

The top area is two rows that wrap instead of one bar that scrolls. Bars, the Add palette, the dock and the zoom buttons read measured insets, and fit-to-view uses only the space they leave free. The right panel and the palette can be collapsed, and both remember the choice. A side panel cannot shrink the canvas below 420 px. Long text wraps or truncates everywhere it appears. The design choice is in [DEC-042](../decisions.md).

## How it was checked

- 112 browser tests pass (88 before). 24 of them are in the new layout spec, which checks geometry at three window sizes.
- 229 vitest tests pass.
- Lint and typecheck are clean.
- Screenshots at 1024, 1280 and 1440 px wide were reviewed by eye.
- Two defects were found in that review and fixed, each with a check: the dock panel was squeezed when the palette was open on a short window; the collapsed palette showed as an empty box.
- Labels, focus and keyboard reach were checked by hand and by tests only in part.

## Limits

- Below 760 px wide is out of scope. The app shows the canvas with both panels collapsed.
- The diagram does not re-fit when only a dock panel opens.
- A toast can cover the second row of the top area on a narrow canvas.
- Dark theme only.
- No automated accessibility audit was run.

## Questions for the owner

1. Should the Add palette start collapsed at 1280 px? It does now.
2. Is a light theme wanted?

## Owner feedback

<!-- Please add feedback here. -->
