# Stage A3 review: canvas-first layout, characteristics and cost

Date: 2026-11-14. Branch: `stage-a3-ui`, based on `stage-a2-features`.

Request (owner, 2026-11-14), with eight reference screenshots of another architecture tool:
"Have a format closer to this when designing. Have a better UI design and ability to include
additional info as well such as cost or info about the -ilities such as scalability,
deployability, testability, and such."

Markers: **[Screenshot]** = seen in the owner's reference screenshots. **[FoSA]** = Richards & Ford,
*Fundamentals of Software Architecture*, 2nd ed. (project copy). *(interpretation)* = my choice,
not sourced.

## What changed

| # | Area | What was built | Source | Where |
|---|---|---|---|---|
| 1 | Theme | Dark canvas, dark panels, dotted background | [Screenshot] | `styles.css` |
| 2 | Top-left bar | Home, back, forward, **Diagrams** (shows/hides the diagram list), breadcrumb with C1-C4 tags | [Screenshot] | `App.tsx` |
| 3 | Flows | **Flows** menu; step card with View (Introduction / Step n of N / Conclusion), Restart, Back, Next, step title, Message/Response, "From To To" with icons, Play | [Screenshot] | `FlowCard.tsx` |
| 4 | Top-right bar | Search (Ctrl/Cmd+K, objects and diagrams), lens switcher, help; below it the add/undo/redo/auto-layout/download tools | Search, help: [Screenshot]. Lens switcher and tool placement *(interpretation)* | `App.tsx` |
| 5 | Boxes | Dark cards: icon + name, description, type label (e.g. "Container · Java, Spring MVC"); person badge above people; magnifier + count when a box has a diagram inside; stores keep their cylinder outline | [Screenshot] | `canvasParts.tsx`, `icons.tsx` |
| 6 | Overlay dock | Bottom left: **Tags**, **Technology**, **Characteristics**, **Cost**. Each shows its groups with counts and its values with counts; a value's menu offers **Focus** (others dim) and **Hide** (removed from the canvas). Active filters show as pills with Clear | Tags/Technology tabs, counts, Focus/Hide: [Screenshot]. Characteristics and Cost tabs *(interpretation of the request)* | `Dock.tsx`, `overlays.ts` |
| 7 | Overlay colour | Coloured box: tinted fill, coloured border, value chip on the top edge; boxes without a value are faded and say so ("No value", "Not rated", "No cost") | Tinted boxes: [Screenshot]. Text chip: kept from Stage A (colour is never the only signal) | `canvasParts.tsx` |
| 8 | Characteristics | Per object: rating 1-5, **Driving** flag, note. List of characteristics editable (rename keeps ratings; remove deletes them). Default list of 12 | 1-5 scale and its meaning: [FoSA] ("one-star ... isn't well supported ... five-star ... one of the strongest features", style chapters). Names: [FoSA] ch. 4 tables and style scorecards. Rating individual objects, "Driving" flag and the default list *(interpretation)* | `ObjectPanel.tsx`, `ops.py`, `sidecar.py` |
| 9 | Cost | Per object: monthly cost lines (item, amount, note). Systems and containers show their own cost plus everything inside. Currency and bands (Free / Low / Medium / High / Very high) editable. Dock shows the diagram total | Cost tag group with Very high…Free: [Screenshot]. Numeric lines, roll-up and default band limits (0 / 100 / 1,000 / 5,000 per month) *(interpretation)* | `ObjectPanel.tsx`, `ops.py`, `editors.tsx` |
| 10 | Lenses | Default overlay may be a tag group, a characteristic (`@char:Name`), `@cost` or `@tech`. New sections "Characteristics" and "Cost" | *(interpretation)* | `editors.tsx`, `validate.py` |
| 11 | Fix | Browser Back/Forward now clears the selection, so the panel no longer shows an object from the previous diagram | found while testing | `App.tsx` |

Default box height is 120 px (was 150) to suit the compact cards.

## Stored data

| Data | Stored as | File |
|---|---|---|
| Ratings | `dp.characteristics` element property, JSON `[{"name","rating","driving","note"}]` | `workspace.json` |
| Cost lines | `dp.cost` element property, JSON `[{"item","monthly","note"}]` | `workspace.json` |
| Characteristic list | `characteristics: [{"name","description"}]` | `designperspectives.json` |
| Currency, bands | `cost: {"currency","bands":[{"name","max","color"}]}` | `designperspectives.json` |

The list and cost settings are written only when they differ from the defaults, so projects that
do not use them get no new keys.

## Demo data

The Internet Banking demo now has ratings on 15 objects and cost lines on 10. **The values are
made up for the demo; they are not measurements or estimates of a real system.** The two demo
lenses show the new sections (Security review: Characteristics; Product owner: Cost). The demo's
ATM fill colour changed from light grey to a dark purple to suit the dark theme.

## Verification

- `pytest`: 79 tests (7 new in `tests/test_characteristics_cost.py`: validation, roll-up,
  rename/remove of characteristics, cost settings, defaults not written, lens default overlay).
- `pytest e2e`: 16 browser tests (5 new in `e2e/test_overlays.py`: tag overlay with Focus/Hide,
  rating then characteristic overlay, cost line then cost overlay, flow card Introduction →
  steps → Conclusion, search). Three existing tests clicked the canvas at (30, 30) to deselect;
  that spot is now under the floating bar, so they click the left edge at mid-height instead.
- Screenshots: `stage-a3/before.png` (Stage A2), `stage-a3/tag-overlay.png`,
  `stage-a3/characteristics.png`, `stage-a3/flow-cost.png`.
- Not verified: Structurizr's own tools with the new `dp.*` properties (Docker/Maven not
  available here, as in A2); CI on GitHub.

## Limits to know about

- There is no light theme now; PNG/SVG exports have the dark background.
- Lenses saved before this stage list their sections explicitly, so they do not show the new
  Characteristics and Cost sections until those are ticked in the lens editor. The built-in
  Engineer lens shows them.
- Cost totals add the roll-ups of the boxes shown. On the diagrams the app draws, no box is
  drawn inside another box, so nothing is counted twice *(checked against `diagrams.py`; the
  boundary is not a box)*.
- Technology icons are generic symbols; no product logos are bundled.
- Ratings live on objects only, not on relationships or whole flows.

## Questions for the owner

1. Should a characteristic rating also have a **target** (the rating the object should reach), so
   the overlay can show gaps?
2. Cost: is a monthly amount enough, or do you want one-off costs and a cost per environment?
3. Keep the dark theme only, or add a light/dark switch?
4. Should a separate "Status" tab exist, or is the Lifecycle tag group enough?

## Owner feedback

(empty)
