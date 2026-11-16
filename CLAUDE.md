# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

designPerspectives is an MIT-licensed, model-based C4 architecture tool. One model (a Structurizr workspace on disk) feeds every diagram, and "lenses" present the same model differently per audience. Everything is TypeScript: a Node.js server (Hono) and the `dp` CLI in `src/`, and a React UI in `ui/` that is built into `static/` and shipped in the npm package. See [README.md](README.md) for the feature list and file formats.

## Commands

```bash
# Node 20.11+
npm ci                                      # installs and builds dist/ (prepare script)
npm test                                    # vitest: unit + API + CLI tests (tests/)
npx vitest run tests/ops.test.ts -t "name"  # single test
npm run typecheck                           # tsc --noEmit over src, tests, e2e, scripts
npm run lint                                # ESLint (flat config, eslint.config.js) over src, tests, e2e, scripts, ui/src; lint:fix applies safe fixes
npm run format:check                        # Prettier (printWidth 200); not enforced yet, the code has not been reformatted (npm run format writes)
npm run dp -- serve [PATH]                  # dp from source: serves PATH/architecture/ on 127.0.0.1:8765 (creates an empty model if none; --demo creates the sample model)
npm run dp -- serve --read-only | --code-root SRC
npm run dp -- check                         # exit 1 on model problems (also drafts; warnings for missing code paths)
npm run dp -- diff --base main              # Markdown summary of model changes since a git ref

# UI (cd ui)
npm ci
npm run dev        # Vite on :5173, proxies /api to dp serve on :8765 (run dp serve alongside)
npm run typecheck
npm run build      # typecheck + vite build -> ../static/

# Browser tests (need the built UI; skip themselves if static/ is missing)
npx playwright install chromium             # or set DP_E2E_CHROME to a Chrome binary
npm run test:e2e

npm run make-demo                           # regenerate bundled demo model (demo/)
```

ESLint (typescript-eslint recommended + react-hooks) is configured; Prettier is configured but not yet enforced. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) typechecks, lints, runs vitest, builds the UI, fails if the build changes `static/`, runs e2e, and fails if `npm run make-demo` changes `demo/` — so after changing model/ops/demo-related code, regenerate the demo and commit the result.

## Architecture

**Built UI is committed.** `npm run build` (in `ui/`) writes hashed bundles into `static/` (tracked in git, shipped in the npm package). After UI changes, rebuild and commit the new assets (and the removal of old hashed files), otherwise the served app and e2e tests will be stale. `dist/` (compiled server/CLI) is not committed; `npm ci`/`npm install` builds it.

**Shared API types.** `src/shared/types.ts` is the API contract: the server functions return these types and `ui/src/types.ts` re-exports them (plus UI-only helpers). It must stay free of Node and DOM imports. Change a response shape there and both sides are checked by `tsc`.

**Data on disk** (per project, in `architecture/`):
- `workspace.json` — a Structurizr workspace (elements, relationships, views, positions, flows). Written with stable key order and formatting for clean `git diff`; IDs are readable slugs. Unknown fields are kept.
- `designperspectives.json` — the "sidecar": tag groups, lenses, characteristics list, cost settings, plus per-object `styles` and per-diagram `layouts`.
- Anything Structurizr has no field for is stored as `dp.*` element/relationship **properties** inside the workspace (full list in the [ops.ts](src/core/ops.ts) header). Add new per-object data the same way rather than inventing new files. The exception is `comments.json` (conversation about the model, not part of it: DEC-049), handled by `core/comments.ts` and `server/routes/comments.ts`, with `ui/src/common/comments.tsx` on the UI side.

**Backend** (`src/core/`, `src/server/`, `src/demo/`, `src/cli.ts`):
- `workspace.ts` — read/check/write the Structurizr file format (`toWorkspace` normalises; `dumpWorkspace` writes known keys in a fixed order, drops empty defaults). `sidecar.ts` — the sidecar model. `util.ts` — small shared helpers: atomic file writes and JSON helpers (`inlineJson` for `dp.*` property values, `roundHalfEven`).
- `ops.ts` — **all edits go through here**; it is the single home of model rules (unique names per scope, unique relationship descriptions per pair, technology as a tag list). Errors are `ModelError` (shown to the user as-is, HTTP 422). New edit features belong here, with `server/app.ts` exposing them as thin routes.
- `diagrams.ts` — computes what each diagram shows *from the model* (like `include *`); diagram keys (`landscape`, `context-<id>`, `containers-<id>`, `components-<id>`, `code-<id>`, `connector-<relId>`, `flow-<name>`) are documented at the top. Higher levels show *derived* edges for lower-level relationships. Positions are stored in Structurizr units (UI value × 2). Also `syncViews` and `prune`.
- Planned change (Stage C): `units.ts` flattens a model into per-object units (element, relationship, view, position, tag group, lens, style, layout entry); `diff.ts` compares two versions (`ChangeSet`) and, for a diagram, marks its nodes/edges with `change` and adds removed objects as `ghost`s; `merge.ts` is the three-way merge used to apply a draft; `drafts.ts` manages `architecture/drafts/<id>/` (copy + `base/`); `git.ts` reads the model at a git ref (read-only, via the git CLI, DEC-018); `report.ts` builds `dp check` results and the `dp diff` Markdown. Requests choose the version with headers `X-DP-Model` (`main`, `draft:<id>`, `ref:<git ref>`) / `X-DP-Compare` (`base`, `main`, `ref:<git ref>`) (DEC-017); `Project` takes an optional folder so each draft is a `Project` with its own undo history.
- `decisions.ts` — decision records (DEC-050): `architecture/decisions/NNNN-slug.md`, a small fixed front-matter grammar (not YAML), parse/serialize that round-trips byte for byte, edit ops, checks and the renumbering used on apply. Decisions are part of the model: `Project.edit(fn(ws, sc, decisions))`, `dec:<file>` units, a `decisions` group in `ChangeSet`.
- `home.ts` (home page summary, DEC-053), `catalog.ts` (shared catalog usage: linked copies, drift, data readers/writers, DEC-055), `credentials.ts` (integration credentials store, write-only values, optional AES-256-GCM with `DP_SECRET_KEY`, DEC-056), `history.ts` (git commits with model diffs per project, DEC-058), `workStatus.ts` (GitHub issue/PR status for linked work, DEC-059). `catalog.ts`'s `syncCopies` is run by `Hub.syncCatalog` so linked copies follow the catalog (DEC-057); per-project roles are `Auth.projectRole` (users file `projects`). Catalog/data edit ops (`addFromCatalog`, `linkCatalog`, `syncFromCatalog`, `cleanData`, `cleanAccess`) live in `ops.ts`.
- `connectors.ts` (stages inside a relationship), `codeMap.ts` (the code level: maps components to files, scans Python/JS/TS imports, functions in a file), `codeFiles.ts` (where code is read from: the code root on disk, a draft's planned code edits, or a git commit; file paths confined to the code root, symlinks resolved), `flows.ts` (ordered steps over relationships ↔ Structurizr dynamic views), `backtrack.ts` (from a pipeline step or flow step back to its data source), `traces.ts` (OpenTelemetry trace files), `uiInspector.ts` (live UI inspector: what HTTP calls seen in a running UI mean in the model), `validate.ts`.
- `project.ts` — `Project` (load, reload when files change on disk, `edit()` runs a change on a copy, syncs views/flows, validates, writes atomically; undo/redo stacks), `initProject`, package paths (`demo/`, `static/`).
- `src/demo/` — `demoApp.ts` (the demo web app that `dp serve --demo` runs) and `demoHistory.ts` (the demo's git history).
- `server/hub.ts` — a hub of projects (DEC-054): `createHubApp(dir)` reads `hub.json`, builds each project's app lazily with `buildApp(root, {hub: true, auth, catalog})` and passes `/api/*` requests to the project named by `X-DP-Project`; it answers sign-in, the UI and the hub-level routes itself (`routes/hub.ts`: `/api/hub`, `/api/home`, `/api/catalog*`, and the integration credentials routes). A single-project `createApp` answers the same hub-level routes as a hub of one. Route modules capture `ctx` fields at registration, which is why each project gets its own app rather than a shared context.
- `server/app.ts` — `createApp(projectDir, {codeRoot, readOnly})` (= `buildApp(...).app`) only builds the shared context, installs the middleware, mounts the route modules in a fixed order (Hono matches in order) and maps errors to responses. `server/context.ts` holds the shared `Ctx` (project, drafts, git readers, the per-request model version via `AsyncLocalStorage`, `writable()`/`edit()`) and the request-parsing helpers; `server/protect.ts` the request protection (security headers, Host/cross-site checks, body limit, JSON-only, viewer role); `server/routes/` one `register<Area>(app, ctx)` per area: `read.ts` (state, diagrams, changes, undo/redo, history, backtracking), `drafts.ts`, `model.ts` (diagram positions, elements and relationships, flows, linked catalog copies, linked work status), `sidecar.ts`, `code.ts`, `decisions.ts`, `inspect.ts` (live UI inspector), `comments.ts`, `hub.ts`, and `ui.ts`, which serves the built UI. `cli.ts` — commander, entrypoint `dp`, binds 127.0.0.1 by default.

**Frontend** (`ui/src/`, React 19 + @xyflow/react + elkjs). Files are grouped by area; the root holds the entry point, the top-level screen and shared helpers:
- **Root** (`main.tsx`, `Root.tsx`, `App.tsx`, `api.ts`, `types.ts`, `storage.ts`, `menus.ts`, `actions.ts`, `overlays.ts`): `main.tsx` is the entry point and imports the styles. `Root.tsx` routes `#/home`, `#/catalog`, `#/settings/credentials` to `pages/` (`Shell.tsx`, `HomePage.tsx`, `CatalogPage.tsx`, `CredentialsPage.tsx`, `HistoryPage.tsx` at `#/history`) and everything else to `App` (in a hub, for the project in `pr=`; `api.setProject` sends `X-DP-Project`). `App.tsx` composes the screen from hooks. `api.ts` the HTTP client; `types.ts` re-exports the shared API types plus UI-only helpers; `menus.ts` builds the right-click menus, `actions.ts` the quick-bar and delete actions, `storage.ts` the localStorage preferences; `overlays.ts` holds the colour overlays (tags, technology, characteristics, cost, work) with focus/hide, shown by `canvas/Dock.tsx`.
- **`canvas/`** (diagram rendering and editing): `Canvas.tsx` plus `canvasParts.tsx`/`shapes.tsx` render and edit diagrams; `layout.ts` runs ELK auto-layout with no-overlap placement; `insets.ts` how much of each canvas edge floating controls cover; `connectRequired.ts` the rule for adding a person or system to a context, container or component diagram (it appears only when connected to a box inside); `Palette.tsx` the add palette; `Dock.tsx` the overlay dock; `ContextMenu.tsx` one row of a right-click menu; `FlowCard.tsx` the flow player card.
  - Line routing: `routing.ts` routes automatic lines with right angles around boxes (ends spread over the sides of boxes); `lineLayout.ts` plans the right-angle lines of a diagram together (line ends, routes, label positions, lanes); `labelSize.ts` estimates a label's box so labels can be placed before they are drawn.
  - `lineShapes.ts` the line shape choices (names shown in the diagram panel and line menus); the per-diagram default is the sidecar `layouts[diagram].lineShape` (DEC-052, DEC-061).
  - `spread.ts` Make room and Spread out (DEC-061): widen only the gaps that are too tight, or widen every gap about 20%.
- **`hooks/`**: `useModel.ts` (server state, `mutate` reloads after every edit, model version headers), `useNavigation.ts` (URL hash, back/forward, `usePage` for `p=decisions[/<id>]`), `useSelection.ts`, `useLens.ts`, `usePanels.ts` (sidebar and panel widths), `useFlowPlayer.ts`, `useClipboard.ts` (copy/cut/paste/duplicate), `useShortcuts.ts` (the global keys, registered in a fixed order), `useCatalog.ts` (catalog entries).
- **`panels/`** (right-hand property panels; `index.ts` re-exports them, and `ObjectPanel` in `ElementPanel.tsx` is the element panel): `StagePanel.tsx`, `EdgePanel.tsx`, `ConnectorPanel.tsx`, `FlowPanel.tsx`, `StylePanel.tsx`, `CodeParts.tsx`; `SmallPanels.tsx` holds `MultiPanel`, `CodeDiagramPanel` and `FilePanel`; `DecisionSection.tsx` in the element and relationship panels; `DataSections.tsx` the Shared catalog, Data and Data access sections. `sectionEditors.tsx` and `valueEditors.tsx` are the shared list editors (`valueEditors.tsx` also holds `ExampleFields` and `WorkRefreshButton`), `common.ts` the shared props, and `editors.tsx`/`fields.tsx` the field-level editors.
- **`pages/`**: `Shell.tsx`, `HomePage.tsx`, `CatalogPage.tsx`, `CredentialsPage.tsx`, `HistoryPage.tsx` (the pages `Root.tsx` routes to); `DecisionsPage.tsx`/`DecisionEditor.tsx` the decision records page (a page over the diagram); `SignIn.tsx` (`AuthGate`) the sign-in gate that comes before `Root.tsx`.
- **`drafts/`**: `DraftList.tsx` (drafts list, draft strip, new-draft dialog), `ChangeList.tsx` (change list, change details, ghost panel), `ApplyDialog.tsx` (apply dialog, coding plan dialog).
- **`inspect/`**: `LiveUiInspector.tsx`, `ObservedTrace.tsx`, `Backtrack.tsx`, `SamplePayload.tsx`.
- **`common/`** (shared widgets): `dialogs.tsx`, `notify.tsx`, `icons.tsx`, `ErrorBoundary.tsx`, `HelpCard.tsx`, `EmptyState.tsx`, `SearchBox.tsx` (the Ctrl/Cmd+K search), `UserChip.tsx`, `MoveDialog.tsx`, `comments.tsx` (DEC-049), `Sidebar.tsx`.
- **`styles/`**: `tokens.css` colours and the z-index scale, then `base`, `layout`, `overlays`, `canvas`, `panels`, `dialogs`, `pages`, `home`, imported in that order by `main.tsx`. The order is the cascade, so keep rules in place and use the `--z-*` tokens instead of literal z-index numbers.

**Tests**: `tests/` use `createApp(...).request()` (no network) via `tests/helpers.ts` (`demoDir`, `demoWs`, `client`, `ok`). `e2e/` starts a real server on a free port per test and drives it with Playwright (`e2e/fixtures.ts`: `server`, `page`, `openDiagram`, `waitUntil`).

## Repo notes

- `docs/README.md` indexes the docs. `docs/decisions.md` is the running list of decisions and their rationale: read it before changing a design choice, and add an entry (at the bottom) when a new decision is made. `docs/backlog.md` lists planned and unbuilt work. `docs/notes/` holds chapter notes on the two reference books (C4 model; Fundamentals of Software Architecture) with `→ designPerspectives` implications.
- `docs/reviews.md` holds the per-stage reviews in one file, newest first. Each stage adds a section at the top: what was built, how it was checked, limits, questions, and an empty owner-feedback part.
- The demo model's source is credited in `NOTICE`.

## Working rules

- Everything is TypeScript. Do not add Python or other-language code.
- State trade-offs for design decisions. Separate sourced facts from interpretation, and say which is which.
- You may research other websites, tools and competitors (read their docs, pages and features) to inform design. Do not name or compare them in repository files, commit messages or pull requests; write the resulting ideas in our own terms.
- Do not add `Co-Authored-By` lines or session links to commit messages or pull request descriptions.
- Do not commit the reference books (PDFs) or superseded plans.
- Branch from `main` for changes; do not commit directly to `main`.
