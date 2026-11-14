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
npm run dp -- serve [PATH]                  # dp from source: serves PATH/architecture/ on 127.0.0.1:8765 (creates demo model if none)
npm run dp -- serve --read-only | --code-root SRC
npm run dp -- validate                      # exit 1 on model problems

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

No linter is configured. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) typechecks, runs vitest, builds the UI, fails if the build changes `static/`, runs e2e, and fails if `npm run make-demo` changes `demo/` — so after changing model/ops/demo-related code, regenerate the demo and commit the result.

## Architecture

**Built UI is committed.** `npm run build` (in `ui/`) writes hashed bundles into `static/` (tracked in git, shipped in the npm package). After UI changes, rebuild and commit the new assets (and the removal of old hashed files), otherwise the served app and e2e tests will be stale. `dist/` (compiled server/CLI) is not committed; `npm ci`/`npm install` builds it.

**Shared API types.** `src/shared/types.ts` is the API contract: the server functions return these types and `ui/src/types.ts` re-exports them (plus UI-only helpers). It must stay free of Node and DOM imports. Change a response shape there and both sides are checked by `tsc`.

**Data on disk** (per project, in `architecture/`):
- `workspace.json` — a Structurizr workspace (elements, relationships, views, positions, flows). Written with stable key order and formatting for clean `git diff`; IDs are readable slugs. Unknown fields are kept.
- `designperspectives.json` — the "sidecar": tag groups, lenses, characteristics list, cost settings, plus per-object `styles` and per-diagram `layouts`.
- Anything Structurizr has no field for is stored as `dp.*` element/relationship **properties** inside the workspace (full list in the [ops.ts](src/core/ops.ts) header). Add new per-object data the same way rather than inventing new files.

**Backend** (`src/core/`, `src/server/`, `src/cli.ts`):
- `workspace.ts` — read/check/write the Structurizr file format (`toWorkspace` normalises; `dumpWorkspace` writes known keys in a fixed order, drops empty defaults). `sidecar.ts` — the sidecar model. `json.ts` — small helpers (`inlineJson` for `dp.*` property values, `roundHalfEven`).
- `ops.ts` — **all edits go through here**; it is the single home of model rules (unique names per scope, unique relationship descriptions per pair, technology as a tag list). Errors are `ModelError` (shown to the user as-is, HTTP 422). New edit features belong here, with `server/app.ts` exposing them as thin routes.
- `diagrams.ts` — computes what each diagram shows *from the model* (like `include *`); diagram keys (`landscape`, `context-<id>`, `containers-<id>`, `components-<id>`, `code-<id>`, `connector-<relId>`, `flow-<name>`) are documented at the top. Higher levels show *derived* edges for lower-level relationships. Positions are stored in Structurizr units (UI value × 2). Also `syncViews` and `prune`.
- Planned change (Stage C): `units.ts` flattens a model into per-object units (element, relationship, view, position, tag group, lens, style, layout entry); `diff.ts` compares two versions (`ChangeSet`); `merge.ts` is the three-way merge used to apply a draft; `compare.ts` marks a diagram's nodes/edges with `change` and adds removed objects as `ghost`s; `drafts.ts` manages `architecture/drafts/<id>/` (copy + `base/`). Requests choose the version with headers `X-DP-Model` / `X-DP-Compare` (DEC-017); `Project` takes an optional folder so each draft is a `Project` with its own undo history.
- `connectors.ts` (stages inside a relationship), `code.ts` (maps components to files, scans Python/JS/TS imports, file read/write confined to the code root, symlinks resolved), `flows.ts` (ordered steps over relationships ↔ Structurizr dynamic views), `validate.ts`.
- `store.ts` — `Project` (load, reload when files change on disk, `edit()` runs a change on a copy, syncs views/flows, validates, writes atomically; undo/redo stacks), `initProject`, package paths (`demo/`, `static/`).
- `server/app.ts` — `createApp(projectDir, {codeRoot, readOnly})` returns a Hono app; read-only middleware; serves the built UI. `cli.ts` — commander, entrypoint `dp`, binds 127.0.0.1 by default.

**Frontend** (`ui/src/`, React 19 + @xyflow/react + elkjs): `App.tsx` holds app state and navigation (back/forward, undo/redo); `Canvas.tsx` plus `canvasParts.tsx`/`shapes.tsx` render and edit diagrams; `layout.ts` runs ELK auto-layout with no-overlap placement; `overlays.ts` + `Dock.tsx` implement colour overlays (tags, technology, characteristics, cost, work) with focus/hide; `FlowCard.tsx`/`FlowPanel.tsx` the flow player; `ObjectPanel.tsx`/`editors.tsx`/`fields.tsx` the property editors; `ChangesPanel.tsx` the drafts list, draft strip, apply dialog and change list; `Palette.tsx` the add palette; `api.ts` the HTTP client.

**Tests**: `tests/` use `createApp(...).request()` (no network) via `tests/helpers.ts` (`demoDir`, `demoWs`, `client`, `ok`). `e2e/` starts a real server on a free port per test and drives it with Playwright (`e2e/fixtures.ts`: `server`, `page`, `openDiagram`, `waitUntil`).

## Repo notes

- `docs/README.md` indexes the docs. `docs/decisions.md` is the running list of decisions and their rationale: read it before changing a design choice, and add an entry (at the bottom) when a new decision is made. `docs/backlog.md` lists planned and unbuilt work. `docs/notes/` holds chapter notes on the two reference books (C4 model; Fundamentals of Software Architecture) with `→ designPerspectives` implications.
- `docs/reviews/` holds per-stage review notes (`rewrite-ts_review.md` covers the move to TypeScript). Each stage ends with a review file: what was built, how it was checked, limits, questions, and an empty owner-feedback section.
- The demo model's source is credited in `NOTICE`.

## Working rules

- Everything is TypeScript. Do not add Python or other-language code.
- State trade-offs for design decisions. Separate sourced facts from interpretation, and say which is which.
- Do not name or compare other commercial architecture tools in repository files, commit messages or pull requests.
- Do not add `Co-Authored-By` lines or session links to commit messages or pull request descriptions.
- Do not commit the reference books (PDFs) or superseded plans.
- Branch from `main` for changes; do not commit directly to `main`.
