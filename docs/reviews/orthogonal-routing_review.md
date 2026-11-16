# Review: Orthogonal line routing (stage 1 and routing around boxes)

Date: 2026-11-15. Branch: `feat/orthogonal-routing`. Baseline: `feat/decision-records` (9e602dd), because `main` is behind the stacked branches. Decision: [DEC-052](../decisions.md#dec-052--lines-use-right-angles-go-around-boxes-and-spread-out-on-each-side-of-a-box).

## What was built

| # | Item | Where |
|---|---|---|
| R1 | **Right-angle lines.** A line with no saved shape is drawn with rounded right angles. The menu and panel label is "Automatic (rounded right angles)". | `ui/src/routing.ts`, `ui/src/Canvas.tsx` |
| R1 | **Sides and spread ends.** `planPorts` picks a side for each end and spreads all line ends on one side along it, ordered by where the other end is. It avoids boxes when it chooses sides. It works on all lines of a diagram at once. | `ui/src/routing.ts` |
| R2 | **Routing around boxes.** `orthoRoute` is a right-angle path search with a cost per turn. Lines go around other boxes, with 15px clearance (5px when the gap is tight). If no way exists, the line keeps its old path. | `ui/src/routing.ts` |
| R2 | **Side switching.** When a box blocks the preferred sides, another pair of sides is chosen. | `ui/src/routing.ts` |
| R2 | **Label placement.** `defaultLabelT` and `placeLabels` put labels where they do not overlap other labels or boxes. `ui/src/labelSize.ts` estimates label sizes from the text. | `ui/src/routing.ts`, `ui/src/labelSize.ts` |
| R2 | **One pass per render.** `Canvas.tsx` routes all automatic lines in one pass on every render, including during drags. `C4Edge` only draws. | `ui/src/Canvas.tsx`, `ui/src/canvasParts.tsx` |
| R2 | **Bend points.** A dragged bend point is now a point the line passes through. | `ui/src/routing.ts` |
| R | Saved shapes, dragged ends, dragged bend points and dragged label positions still win. Nothing new is stored in the model. Routes are not saved, so model files and git diffs do not change. | |
| R | Tests: 29 unit tests, including a seeded random test over 200 diagrams, a determinism test and a check of the demo containers diagram geometry. Browser spec for routing. | `tests/routing.test.ts`, `e2e/routing.spec.ts` |

## How it works (one paragraph)

`ui/src/routing.ts` is a pure module with no imports. It takes the boxes and lines of one diagram and returns the route of each automatic line. `planPorts` first chooses a side and a slot on that side for each line end, so that line ends on one side do not meet at one point. `orthoRoute` then searches for a right-angle path between the two ends. The search adds a cost for each turn and treats other boxes as obstacles with clearance. `placeLabels` puts each label on a free spot near the middle of the line. `Canvas.tsx` calls these once per render for all automatic lines. Saved shapes and dragged parts win over the computed route, as before.

## How it was checked

- Unit tests: 29 in `tests/routing.test.ts`, including the seeded random test over 200 diagrams, determinism, and the demo containers diagram geometry.
- Full vitest: 312 tests pass.
- Browser tests: 124 pass. New tests in `e2e/routing.spec.ts` check that:
  - all segments are right angles;
  - line ends on the same box are at least 15px apart;
  - side-by-side labels do not overlap;
  - no line crosses a box other than its own two.
- `npm run typecheck`, `npm run lint` and the UI build pass.
- `npm run make-demo` leaves `demo/` unchanged.
- Measured on the demo containers diagram (19 boxes, 27 lines):
  - overlapping label pairs: 14 before, 0 after;
  - lines crossing boxes: 26 before, 0 after;
  - one full routing pass: about 1.7 ms median.

## Limits

- Lines can still sit on top of each other in a shared gap.
- Labels can still sit on neighbouring lines.
- Straight, curved and smooth lines are not routed around boxes or used in label placement.
- Side switching is skipped for lines with a hand-set end or bend point. Their path is still routed around boxes.
- Label size is an estimate. Fonts on another machine can differ slightly. The browser test allows up to 2 overlapping labels for this reason.
- A diagonal pair of boxes prefers an L shape. In crowded rows this can look busier than a Z shape.
- Existing diagrams change look on next open.
- A bend point saved earlier from a curved line can add turns, because it now sets a point the line passes through.
- Moving a box can move the ends of other lines on the same side.

## Questions for the owner

1. Should "Automatic" keep rounded corners, or should it use sharp right angles?
   - Answer [Owner]: Automatic = rounded corners.
2. Should a per-diagram default line shape be added to the sidecar?
   - Answer [Owner]: per-diagram default added (DEC-061, `layouts[<diagram>].lineShape`).
3. What should the next routing stage cover? The options are: separating lines in a shared gap, label-versus-line avoidance, ELK label sizes, and optional hops. Which comes first?
   - Answer [main session, not the owner]: stage-2 order chosen by the main session (lanes and label-vs-line first, in DEC-061). ELK label sizes, straight/curved/smooth routing and optional hops remain in the backlog.

## Follow-up (DEC-061)

Date: 2026-11-15. Decision: [DEC-061](../decisions.md#dec-061--default-line-shape-per-diagram-lanes-and-make-room--spread-out).

### What was built

| # | Item | Where |
|---|---|---|
| F1 | **Default line shape per diagram.** Stored as `layouts[<diagram>].lineShape` in the sidecar; absent means rounded right angles. Set from the diagram details panel ("Line shape"). "Automatic" names the diagram default. A change is a layout change in drafts and `dp diff`. | `src/core/sidecar.ts`, `src/server/routes/sidecar.ts`, `src/core/diagrams.ts`, `src/shared/types.ts`, `ui/src/lineShapes.ts`, `ui/src/App.tsx` |
| F2 | **Lanes and label avoidance.** Lines on the same coordinate through a gap are spread 10px apart (8px or 6px when tight), ordered so they do not cross at the ends. Near-straight lines (ends under 12px apart) are aligned. Labels avoid other lines (weight 8). | `ui/src/routing.ts` (`separateRoutes` and the `planPorts` jog pass) |
| F3 | **Make room and Spread out.** Toolbar and empty-canvas menu actions. Each is one undo step. | `ui/src/spread.ts`, `ui/src/Canvas.tsx` (`spread()`), `ui/src/menus.ts`, `ui/src/icons.tsx` |

### How it was checked

- Unit tests: vitest 350 pass, including `tests/routing.test.ts` (42), `tests/line-shape.test.ts` (8) and `tests/spread.test.ts` (17).
- Browser tests: 132 pass, including routing (5), line-shape (2) and spread (4).
- `npm run typecheck`, `npm run lint` and the UI build pass. `npm run make-demo` leaves `demo/` unchanged.
- Demo containers diagram:
  - lines sharing a gap (overlaps): 6 before, 1 after;
  - labels crossed by another line: 19 before, 11 after;
  - line crossings: 21 before, 23 after;
  - one full routing pass: about 2.6 ms (1.7 ms in stage 1);
  - Make room moved 14 of 19 boxes.
- Spread out on 50 boxes: about 0.8 ms.

### Limits

- Some labels now sit up to about 400px along their line from its middle.
- Labels crossed by a line are reduced, not removed (19 → 11, not 0).
- Total line crossings rose slightly (21 → 23), because separating lines on top of each other sometimes needs a crossing.
- Make room uses the routes and labels of the current drawing, so a second press right after can still find a little to do in rare cases.
- Boxes with exactly the same centre cannot be separated.

### Questions for the owner

1. Should the explicit "Rounded right angles (default)" choice clear the `lineShape` key instead of storing `"rounded"`?
2. Should Make room / Spread out apply only to the selected boxes when several are selected?

## Owner feedback

<!-- Please add feedback here. -->
