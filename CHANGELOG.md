# Changelog

## 0.3.0 — 2026-11-14

### Changed
- Rewritten in TypeScript: the server (Hono on Node.js), the `dp` command and the browser UI are one
  language and share their API types (`src/shared/types.ts`). Install with npm; Python is no longer used.
  The API the UI uses is unchanged (routes, responses, validation messages); model files written by 0.2
  open as before.
- The Python import scanner for the code level is now a small tokenizer instead of Python's `ast`:
  it ignores imports in comments and strings, and a file with a syntax error still shows its imports.
- Numbers in the model files are written without a trailing `.0` (`"monthly": 40`, not `40.0`).
- Stage and file boxes carry empty cost, characteristics and work fields, so overlays never meet a
  missing field.
- Requests with a missing or malformed body get a 422 with a readable message.

### Fixed
- Typing in a row (cost, usage, links, …) right after the previous row was saved could lose the
  typed value when the save's refresh arrived mid-edit.

### Removed
- The interactive API docs page (`/api/docs`), which FastAPI generated.

## 0.2.0 — 2026-11-14

### Added
- Canvas-first dark layout: floating navigation, breadcrumb, search (Ctrl/Cmd+K), lens switcher,
  help, tools; Flows menu with a step card (Introduction, steps, Conclusion).
- Overlay dock: Tags, Technology, Characteristics, Cost, Work; counts per value; Focus and Hide.
- Architecture characteristics: ratings 1-5 per object, driving flag, note; editable list.
- Cost: monthly cost lines per object, roll-up to parents, editable currency and bands.
- Linked work on objects and lines: security issues, pull requests, issues, backlog items,
  required updates, with link, status and severity; Work overlay and badges.
- Add palette with typed objects (database, queue, pipeline, cache, storage, web, mobile, …):
  drag and drop or click; connect a line to empty space to add a connected object.
- Rename on the canvas; quick bar above a selected object (symbol, open, duplicate, delete).
- Line shapes (smooth S-curve, rounded right angles), line patterns (dash-dot, long dash),
  arrowheads (open, diamond, open diamond, circle, bar).
- `dp --version`; `GET /api/health`; recovery screen on unexpected UI errors.

### Changed
- Line labels slide only along their line (earlier sideways offsets are ignored).
- Default box height 120 px.
- The page is served with `Cache-Control: no-cache`, so an upgrade is never hidden by a cached page.
- Code files edited in the browser are saved atomically and keep their permissions and line endings.

### Fixed
- Browser Back/Forward cleared nothing, so the panel could show an object from another diagram.
