# designPerspectives

An open-source (MIT), model-based architecture tool using the [C4 model](https://c4model.com).
Every diagram is a view of one model, so a change made once shows everywhere. **Lenses** show
the same model differently for different audiences.

Version **0.2.0**. Stage reviews are in `docs/reviews/`; changes per version are in `CHANGELOG.md`.

## Run it

Requires Python 3.11+. Node is not needed to use it; the browser UI ships inside the package.

```bash
pipx install git+https://github.com/AbhishekR3/designPerspectives
# or, from a clone:  pip install .

mkdir my-architecture && cd my-architecture
dp serve            # creates architecture/ with the demo model if none exists, opens the browser
```

Other commands:

```bash
dp init --empty     # start an empty model instead of the demo
dp serve PATH       # serve a model in another folder (PATH/architecture/)
dp serve --code-root SRC   # folder holding the source code components point to (default: the project folder)
dp validate         # check the model files; exit code 1 on problems
```

The server listens on `127.0.0.1:8765` only. Stop it with Ctrl+C.

## Files

| File | What it holds |
|---|---|
| `architecture/workspace.json` | A [Structurizr](https://github.com/structurizr/structurizr) workspace: elements, relationships, views, positions, flows. Readable IDs (`api-application`), stable formatting for `git diff`. |
| `architecture/designperspectives.json` | Tag groups, lenses, the list of characteristics and cost settings (data Structurizr has no place for). |

designPerspectives data stored inside the workspace as Structurizr element properties:
`dp.owner`, `dp.links`, `dp.tag.<Group>` (e.g. `dp.tag.Risk = High`), `dp.archType` (symbol),
`dp.notes`, `dp.tradeoffs`, `dp.usage`, `dp.sensitive`, `dp.code.paths`, `dp.characteristics`, `dp.cost`,
`dp.work`, and on relationships `dp.kind`, `dp.stages` (the steps inside a pipeline or protocol) and `dp.work`.

The sidecar also holds per-object `styles` (colours, line style, text size) and per-diagram
`layouts` (box sizes, line anchors/bends/label positions; box positions for connector and code
diagrams).

## What you can do

- Model people, software systems, containers, components and relationships.
- Landscape, context, container and component diagrams; double-click to go down a level,
  breadcrumb to go back. Connections between elements inside boxes show at higher levels as
  dashed *derived* lines.
- Add, move, connect, edit and delete on the canvas; auto-layout; positions saved per diagram.
- Object panel: name, description, technology, owner, links, tags, incoming/outgoing connections.
- Tag groups (e.g. Risk: High/Medium/Low) as overlays with a legend; every coloured box also
  carries a text badge.
- Flows: ordered steps over relationships with a step-through player.
- Lenses: the built-in **Engineer** lens plus your own (visible levels, default overlay,
  hidden tag groups, what each box shows).
- Export a diagram as SVG or PNG.

Stage A2 additions:

- **No overlap**: auto-layout is layered (ELK) with room for labels; new boxes are placed in the
  nearest free spot; a box dropped onto another moves to the nearest free spot.
- **Levels in the sidebar**: C1 (landscape, context), C2 (containers), C3 (components, connector
  detail), C4 (code), each indented under its parent. The breadcrumb shows the same tags.
- **Connectors have an inside**: double-click a line to open its connector detail: the stages of a
  pipeline or protocol (e.g. consume, mask, load), each optionally linked to the component that
  implements it. A line drawn between higher-level boxes opens where its relationship is drawn.
- **Code level**: map a component or connector to files or folders; the C4 code diagram shows the
  files as boxes and the imports between them (Python and JS/TS scanned). Double-click a file to
  edit it in the browser; it saves to the file on disk (only inside the code folder).
- **Technology as tags** (suggestions from the model), **symbols** per architecture type (database,
  queue, pipeline, web, mobile, cache, storage, cloud, document, service), **notes**, **tradeoffs**,
  **usage** (who, how often), and **sensitive** labels (public to restricted) on objects; lenses
  choose which of these sections and badges show.
- **Editing like draw.io / Lucidchart**: resize boxes, connect from any side, drag line ends to any
  point on a box, bend lines, straight/curved/right-angle lines, slide a line's label, colours,
  line style/width, text size, arrows, duplicate, undo/redo (Ctrl/Cmd+Z), copy/paste (Ctrl/Cmd+C/V/D), arrow-key nudge, Back/Forward between diagrams, a Download menu (PNG/SVG), details tables on objects, example data per flow step, drag the sidebar edges.
- `dp serve --read-only` gives a viewer role: nothing can be changed.

Stage A3 additions:

- **Canvas-first layout**: dark canvas with floating controls. Top left: home, back/forward,
  Diagrams (shows/hides the diagram list), breadcrumb; below it the **Flows** menu and the flow
  step card (Introduction, Step n of N, Conclusion; Restart/Back/Next; message direction, from/to).
  Top right: search (Ctrl/Cmd+K), lens switcher, help, and the add/undo/redo/auto-layout/download
  tools. Boxes are dark cards with an icon, name, description and type.
- **Overlay dock** (bottom left): Tags, Technology, Characteristics and Cost. Pick one to colour the
  boxes; each value shows how many boxes have it. Click a value to **Focus** on those boxes (the rest
  dim) or **Hide** them. Overlays stay on while a flow plays.
- **Architecture characteristics** ("-ilities"): rate an object 1–5 on scalability, deployability,
  testability and others (the 1–5 star scale Richards & Ford use for architecture styles), mark
  the *driving* ones, and note why. The list is editable.
- **Cost**: monthly cost lines per object; systems and containers show the total of everything
  inside them. Cost bands (Free to Very high) and the currency are editable.
- A lens's default overlay can now also be a characteristic, cost or technology.

0.2.0 additions:

- **Add palette** (left of the canvas): Container, Service / API, Web app, Mobile app, Database,
  Cache, Queue / stream, Pipeline / job, File storage, Cloud service, Document, and, where they fit,
  Component, Software system, External system, Person, Stage. Drag one onto the diagram to place it
  there, or click it to add it in the nearest free spot; its name is ready to type on the canvas.
- **Connect to empty space**: drag from a box's dot to an empty part of the diagram to add a new
  box there, already connected.
- **Edit on the canvas**: select a box, then click its name (or press F2) to rename it. The bar above
  a selected box changes its symbol, opens what is inside, duplicates or deletes it.
- **Line labels slide along their line** only; they can no longer be pulled off it.
- **Line shapes**: straight, curved through a bend point, smooth S-curve, right angles, rounded right
  angles. **Line patterns**: solid, dashed, dotted, dash-dot, long dash. **Arrowheads**: filled,
  open, diamond, open diamond, circle, bar.
- **Linked work**: link boxes and lines to security issues, pull requests, issues, backlog items and
  required updates (title, link, status, severity). Boxes show open items; the **Work** overlay
  colours boxes by their most severe open item.
- `dp --version`, `GET /api/health`, a recovery screen if the page hits an error, code-file saves
  that keep permissions and never leave half-written files.

## Develop

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest                          # model, validation, diagrams, flows, connectors, code, API

cd ui && npm ci && npm run dev  # UI dev server on :5173, proxies /api to dp serve on :8765
npm run build                   # writes the UI into src/designperspectives/static/

python -m playwright install chromium
pytest e2e                      # browser smoke test (needs the built UI)
python scripts/make_demo.py     # regenerate the bundled demo model
```

Layout: `src/designperspectives/` (Python: `workspace.py` file format, `ops.py` edits and rules,
`diagrams.py` what each level shows, `flows.py`, `validate.py`, `store.py` files, `server.py` API,
`cli.py`), `ui/` (TypeScript/React with xyflow and elkjs), `tests/`, `e2e/`.

See `NOTICE` for the demo model's source.
