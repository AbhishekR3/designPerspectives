# Stage A review — Model and diagrams (Proof of Concept)

Date: 2026-11-14. Plan: `designPerspectives/poc-plan-v0.4.md` (project doc). Branch: `stage-a-poc`.

Source markers as in the plan: **[Verified]** = checked in this stage (method given), **[Not verified]** = could not be checked here, **[Decision]** = a choice I made that the plan did not settle.

## 1. What was built

| ID | Feature | Where |
|---|---|---|
| A0 | Python package `designperspectives` (command `dp`), React UI built into the package, pytest + Playwright, GitHub Actions (Linux + macOS, Python 3.11 and 3.13). Repo had only a README, so nothing needed clearing (D5). | `pyproject.toml`, `ui/`, `.github/workflows/ci.yml` |
| A1 | One model: person, software system, container, component, relationship (description + technology). Name/ID rules enforced on every edit. | `ops.py`, `validate.py` |
| A2 | Landscape, context, container, component diagrams; double-click to drill down; breadcrumb back. | `diagrams.py`, `App.tsx` |
| A3 | Add / move / connect / edit / delete; auto-layout (elkjs); positions saved per diagram. | `Canvas.tsx`, `layout.ts` |
| A4 | Object panel: name, type, description, technology, owner, main link + extra links, tags, incoming/outgoing connections (clickable). | `ObjectPanel.tsx` |
| A5 | Tag groups with coloured values; overlay colours boxes **and** adds a text badge; legend with counts. | `editors.tsx`, `canvasParts.tsx` |
| A6 | Flows as Structurizr dynamic views: ordered steps, step text, response steps, prev/next/play; overlays stay on while playing. | `flows.py`, `FlowPanel.tsx` |
| A7 | Lenses: built-in Engineer (container + component levels, technology shown) plus user lenses (levels, default overlay, hidden tag groups, show technology/descriptions). | `sidecar.py`, `editors.tsx` |
| A8 | Demo: Internet Banking System (with the "Sign in" flow); SVG/PNG export of the current diagram. | `scripts/make_demo.py`, `src/designperspectives/demo/` |

## 2. How to run

```bash
pipx install git+https://github.com/AbhishekR3/designPerspectives@stage-a-poc
mkdir try-dp && cd try-dp
dp serve          # creates architecture/ with the demo, opens http://127.0.0.1:8765/
```

Development setup is in `README.md`.

## 3. Owner's checklist — results from this session

Run on Linux (cloud workspace), Chrome headless. Not run on macOS.

| # | Step | Result | How checked |
|---|---|---|---|
| 1 | Install, `dp serve` opens the demo | Pass | Wheel built and installed into a fresh venv; `dp init` + `dp validate` OK. `dp serve` on an empty folder created the demo and served the UI. `pipx` itself was not tried. |
| 2 | New system with three containers and connections | Pass | Playwright smoke test (`e2e/test_smoke.py`) |
| 3 | Drill context → container → component and back | Pass | Playwright smoke test |
| 4 | Rename shows in every diagram | Pass | Playwright smoke test + `tests/test_api.py` |
| 5 | Panel lists incoming/outgoing connections | Pass | Scripted browser walkthrough + API test. A container also lists its components' connections, marked "via …" (changed after the first walkthrough showed API Application with 0/0). |
| 6 | Risk tag group, three tagged objects, overlay, legend | Pass | Scripted browser walkthrough + API test |
| 7 | Five-step flow played with Risk overlay on | Pass | Scripted browser walkthrough (flow created in the UI) + API test |
| 8 | Second lens; switching changes levels and default overlay | Pass | Scripted browser walkthrough + API test |
| 9 | Close and reopen; `git diff architecture/` readable | Pass (reopen); diff readability is your call | API test reopens the files with a new server. Files use 2-space JSON and slug IDs; please judge the diff yourself. |
| 10 | Open `workspace.json` in Structurizr local | **[Not verified]** | No Docker daemon in this workspace, and Maven Central is blocked by its network allowlist, so the Structurizr Java library could not be run either. See §5. |

Automated: 50 pytest tests (model I/O, validation, edits, diagrams, flows, API for steps 2–9) and 1 Playwright test (steps 1–4). CI has not run yet; it will run on the pull request.

## 4. Deviations and decisions

| # | What | Why / trade-off |
|---|---|---|
| 1 | **[Decision]** Diagram content is computed from the model (like `include *`): a container diagram always shows all containers of the system plus whatever they connect to. You cannot hide one element from one diagram. | Keeps "rename shows everywhere" and connection roll-up simple. Per-diagram hiding is a backlog candidate. |
| 2 | **[Decision]** Lower-level relationships appear on higher-level diagrams as dashed *derived* lines (e.g. API Application → Database comes from Security Component → Database). Derived lines are not written to the model. | IcePanel-like roll-up without duplicating relationships in the file. Consequence: in Structurizr, our views show only the explicit relationships. |
| 3 | **[Decision]** Positions are stored ×2 (UI box 225×150, Structurizr box 450×300). | So a layout made here should look the same in Structurizr. Unverified until step 10. |
| 4 | **[Decision]** Context/container views are created only for systems that have containers, or once a diagram is opened. | Avoids empty views for every existing system. Systems without containers can still be drilled into; the object panel has "Open context". |
| 5 | **[Decision]** The active lens is remembered per browser (localStorage), not written to the files. | Switching lenses does not create git changes. Lens *definitions* are in `designperspectives.json`. |
| 6 | **[Decision]** Flow scope (`elementId`) is inferred from the steps; the flow panel warns when a flow breaks Structurizr's dynamic-view rules. | Flows mixing components of two containers still work here but may not open in Structurizr. |
| 7 | **[Decision]** Engineer is read-only; "duplicate" makes an editable copy. | Keeps one known default. |
| 8 | **[Decision]** The built UI is committed under `src/designperspectives/static/`. | `pip install` from git works without Node. Cost: UI changes produce large diffs in that folder. Alternative: build in a release step only. |
| 9 | **[Decision]** Views already in a workspace made by Structurizr are kept unchanged; designPerspectives adds its own views (keys `landscape`, `containers-<id>`, …) and lays them out fresh. | No data loss on import; imported layouts are not reused. |
| 10 | Not built: undo, multi-select, per-relationship routing/vertices, clicking the system boundary. | Not in the plan's Stage A list. |

Known issues: edge labels can overlap on dense diagrams; the selected box's outline is included in exports; the JS bundle is ~1.9 MB (elkjs, ~1.5 MB of it, loads only when a layout is needed).

## 5. A0 verification results

Checked against the source of `github.com/structurizr/structurizr` (cloned 2026-11-14, latest commit dated 2026-11-07, version 6.2.4). Reading source only; nothing of Structurizr was executed (building the downloaded source was blocked in this workspace, and Maven Central is not reachable).

| Plan item (was [Training]) | Finding | Source |
|---|---|---|
| Field names | Confirmed: `people`, `softwareSystems`, `containers`, `components`, `relationships` (nested in the source element, with `sourceId`/`destinationId`), `technology`, `description`, `url`, `tags` (comma-separated string), `properties` (string map), `location` (`External`/`Internal`/`Unspecified`). | `structurizr-json/structurizr.yaml` |
| View format and positions | Confirmed: `systemLandscapeViews`, `systemContextViews` (`softwareSystemId`), `containerViews` (`softwareSystemId`), `componentViews` (`containerId`); each has `key`, `elements[{id,x,y}]`, `relationships[{id}]`. | same |
| ID rules | IDs are strings. The default ID generator's comment: "any non-numeric IDs are ignored". The loader only checks uniqueness. So readable slug IDs (`api-application`) are used — this is better than the plan expected (numeric IDs were listed as a drawback). | `structurizr-core/.../SequentialIntegerIdGeneratorStrategy.java`, `Model.java` |
| Loader rules | Unique view keys; unique names among people + software systems, among containers of a system, among components of a container; unique relationship description per source/destination pair; views must reference existing elements/relationships. All mirrored in `validate.py`. | `structurizr-client/src/test/java/com/structurizr/api/WorkspaceRulesValidationTests.java` |
| Dynamic view format | Confirmed: relationship entries with `id`, `order` ("1", "2", …), `description`, `response`; optional `elementId` scope. Scope limits which elements may be added (no scope: people + systems only; system scope: containers; container scope: components). | `structurizr.yaml`; `structurizr-core/.../view/DynamicView.java`; example `structurizr-export/src/test/resources/big-bank-plc.json` |
| DSL → JSON export | The application's `export` command lists `json` among its formats (`-w <workspace> -f json`). How it is invoked through the Docker image was not checked. | `structurizr-application/.../command/ExportCommand.java` |
| Our file opens in Structurizr local | **[Not verified]** — needs Docker on your machine (checklist step 10). | — |

Conclusion: the format fits; no reason to stop before A1.

## 6. Questions for you

1. Step 10: please run Structurizr local on the demo's `architecture/` folder and tell me whether the elements, relationships and layout appear. If the layout looks wrong, deviation 3 is the first suspect.
2. Deviation 1: is "every diagram shows everything at its level" acceptable for now, or do you want per-diagram hiding before Stage B?
3. Deviation 8: keep committing the built UI, or build it only for releases (then installing from git needs Node)?
4. The demo has no tag groups, so checklist step 6 starts from scratch. Should the demo ship with an example group?

## 7. Owner feedback

_(to be filled in by the owner)_
