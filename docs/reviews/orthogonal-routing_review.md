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
2. Should a per-diagram default line shape be added to the sidecar?
3. What should the next routing stage cover? The options are: separating lines in a shared gap, label-versus-line avoidance, ELK label sizes, and optional hops. Which comes first?

## Owner feedback

<!-- Please add feedback here. -->
