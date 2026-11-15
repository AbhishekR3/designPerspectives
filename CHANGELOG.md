# Changelog

## Unreleased

### Added
- Drafts: a planned change in `architecture/drafts/<id>/`, with a changes overlay (added, changed,
  removed) against the main model. Apply merges it as one undo step (three-way merge, conflicts
  refused); Discard deletes it.
- Compare with git: pick a branch, tag or commit and compare the stored model with it, or open it
  read-only. Needs the `git` command.
- `dp check` (model rules for the main model and drafts, warnings for mapped paths that do not exist,
  `--strict`) and `dp diff --base <ref>` (Markdown or JSON summary for pull requests). Sample GitHub
  Actions and GitLab CI jobs in `docs/examples/ci/`.
- Planned code edits in a draft: edit mapped files, add planned files or plan deletions. The code
  folder is untouched until apply.
- Coding plan: steps from a draft, checked against the code folder or a git branch; copy as Markdown.
  `dp plan <draft>` with `--check`, `--against <ref>`, `--format md|json` and `--out`.
- Apply with code: "Also write the planned code edits" in the apply dialog. A file changed, removed or
  created in the code folder since it was planned is reported as a conflict.
- `draft.json` gains optional `branch` and `link`.
- `dp diff --no-code` and `--code-root`. Changed code files behind mapped objects are listed and count
  toward `--exit-code`.
- Right-click menus on boxes, lines and the empty canvas, with copy and paste style and keyboard
  navigation.
- `dp serve --allow-host <name>` lets the server answer to another host name (a tunnel or proxy in
  front of it).

### Changed
- API clients must send `Content-Type: application/json` with a request body (415 otherwise).

### Fixed
- `dp plan --against <ref>` exits 2 when there is no code to check against (for example, the code
  folder is not in a git repository). It used to pass.
- A model that already has a duplicate (for example two systems with the same name, from a
  hand-edited file) no longer refuses edits that do not add another one. Duplicates can be repaired
  one at a time.
- Copying an element no longer copies its code paths or work items. Cost and the other fields are kept.
- Styles and layout entries for code files are removed when no object maps that path any more.
- Validation reports a relationship between an element and its own parent or child (hand-edited files).
- Apply with code is all or nothing: if a file write or the model step fails, every file is restored
  and the draft stays.
- A mapped path such as `./src/api` keeps its code-diagram layout.

### Security
- Requests must be addressed to a loopback host (`localhost`, `127.0.0.1`, `[::1]`) when the server
  is bound to loopback. This stops DNS rebinding. Binding another `--host` turns the check off and
  prints a warning that there is no login.
- Changes to `/api/*` are refused (403) when the request comes from another origin or site.
- Request bodies must be JSON (415 otherwise) and at most 5 MB (413 otherwise).
- Every response carries a Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff` and
  `no-referrer`. The UI cannot be embedded in a frame.
- Unexpected errors return a generic message; the detail is written to the server log only.
- Hidden files and folders (names starting with a dot, such as `.git` and `.env`) are never read,
  written, listed or planned through dp, in the code folder, in drafts or in git versions. Symlinks to
  them are refused. Code file writes are capped at 1 MB.

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
