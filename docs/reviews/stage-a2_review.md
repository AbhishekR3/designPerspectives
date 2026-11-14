# Stage A2 review: feature round of 14 November

Scope: the 11 requested updates and the owner's answers to the review questions.
Facts about the code are from this repository; statements marked *(interpretation)* are judgement.

## Requested updates

| # | Request | What was built | Where |
|---|---|---|---|
| 1 | No overlap or crowding | ELK layered layout with larger spacing for line labels; new boxes go to the nearest free spot (ring search, 50 px clear gap); a dropped box that overlaps moves to the nearest free spot | `ui/src/layout.ts`, `Canvas.tsx` |
| 2 | Connectors link to the next level | Double-click a line: connector detail (stages, optional implementing component per stage, kind, code). Derived lines open where their relationship is drawn. Stage linked to a component opens that component's diagram | `connectors.py`, `diagrams.py` |
| 3 | Adjustable sidebars | Drag handles, widths remembered, double-click resets | `App.tsx` |
| 4 | C1-C4 next to diagrams, indented | Tree built from parent links; connector detail is shown as C3 *(interpretation of "component level")* | `diagrams.diagram_list` |
| 5 | Notes, tradeoffs, usage, sensitive | Panel sections, canvas badges, lens control of which sections show | `ops.py`, `ObjectPanel.tsx` |
| 6 | Technology as tags | List of tags; suggestions from the model plus a built-in list | `fields.tsx`, `ops.technology_catalog` |
| 7 | Move label along a line, resize, editor features | Label drag along the line and off it, resize handles, bend grip, line shapes, duplicate, undo/redo | `canvasParts.tsx`, `store.py` |
| 8 | Connect anywhere | Connection points on all four sides; line ends can be dragged to any point on a box border | `canvasParts.tsx` |
| 9 | Symbols | Plan v0.4 had none. Added 10 types (box, service, web, mobile, database, cache, queue, pipeline, storage, cloud, document) | `shapes.tsx` |
| 10 | Component to code | Plan v0.4 only had code-path mapping (B3). Now: C4 code diagram (files as boxes, scanned imports), file editor with safe save | `code.py` |
| 11 | Colours and styling | Fill, border, text, line style/width, font size, arrows per object | `StylePanel.tsx`, `sidecar.py` |

Answers applied: example tag groups (Risk, Lifecycle) and a showcase demo (two extra lenses, a
pipeline connector with stages, code mapped to components, sensitive/usage/tradeoff examples);
the built UI stays committed.

## Verification

- `pytest`: 68 tests. `pytest e2e`: 8 browser tests covering no-overlap, connect from any side,
  bending and resetting a line, resizing and styling a box, tags/notes/sensitive/symbol,
  connector detail to code to file edit, sidebar resizing and level indentation, undo/redo.
- Not verified: Structurizr compatibility of the new `dp.*` properties and the `dp.level` view
  property in Structurizr's own tools (Docker/Maven were not available here); CI has not run on GitHub.

## Limits to know about

- Auto-saved positions after an automatic layout count as an undo step.
- Line routing is drawn by the app; Structurizr ignores the sidecar `layouts`.
- Import scanning handles Python and JS/TS relative imports only; other languages show files without lines.
- Connector stages are not model elements, so they do not appear in Structurizr views.
