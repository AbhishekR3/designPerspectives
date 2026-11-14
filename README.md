# designPerspectives

An open-source (MIT), model-based architecture tool using the [C4 model](https://c4model.com).
Every diagram is a view of one model, so a change made once shows everywhere. **Lenses** show
the same model differently for different audiences.

Status: **Stage A Proof of Concept** (see `docs/reviews/stage-a_review.md`).

## Run it

Requires Python 3.11+. Node is not needed to use it; the browser UI ships inside the package.

```bash
pipx install git+https://github.com/AbhishekR3/designPerspectives@stage-a-poc
# or, from a clone:  pip install .

mkdir my-architecture && cd my-architecture
dp serve            # creates architecture/ with the demo model if none exists, opens the browser
```

Other commands:

```bash
dp init --empty     # start an empty model instead of the demo
dp serve PATH       # serve a model in another folder (PATH/architecture/)
dp validate         # check the model files; exit code 1 on problems
```

The server listens on `127.0.0.1:8765` only. Stop it with Ctrl+C.

## Files

| File | What it holds |
|---|---|
| `architecture/workspace.json` | A [Structurizr](https://github.com/structurizr/structurizr) workspace: elements, relationships, views, positions, flows. Readable IDs (`api-application`), stable formatting for `git diff`. |
| `architecture/designperspectives.json` | Tag groups and lenses (data Structurizr has no place for). |

designPerspectives data stored inside the workspace as Structurizr element properties:
`dp.owner`, `dp.links`, and `dp.tag.<Group>` (e.g. `dp.tag.Risk = High`).

## What you can do (Stage A)

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

## Develop

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest                          # model, validation, diagrams, flows, API

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
