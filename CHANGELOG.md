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

- Move to…: a container can move to another software system, and a component to another container
  (`POST /api/elements/:id/move`). The ID, children and relationships are kept. Works in drafts: the
  change list shows Parent before → after. See DEC-037.
- Readable IDs: the first rename of a box added in this session also renames its ID and every
  reference to it (relationships, views, flows, stages, styles, layouts). The rename request takes
  `reslug`. In a draft, the box is not shown as removed and added.
- Add and connect: a person or software system added on a context, container or component diagram is
  created together with its line, in one undo step. Dragging a line onto empty canvas offers a menu of
  the kinds the diagram can add.
- Multi-select: Shift+click and Shift+drag select several boxes. Drag and arrow keys move them
  together. Delete asks once and is one undo step (`POST /api/elements/delete`).
- Built-in lenses **Architect** (all levels and sections) and **Overview** (landscape and context
  only, fewer sections). The chosen lens is remembered per project folder. See DEC-038.
- First-run card "Start your architecture" on an empty landscape; other empty diagrams show a hint.
- `dp serve --demo` and `dp init --demo` create the sample model with its sample code.
- New draft dialog: a title and an optional description. A duplicate title is refused in the dialog.
- Drafts record an optional `author`. The client sends it; otherwise it comes from `git config user.name`. The author shows in the drafts list and in the `dp plan` Markdown header.
- Drafts list: rows show the author and date. A row menu has Rename, Edit description and Discard.
- "main +N" badge on a draft: how many objects main changed since the draft started.
- "+ New planned file" in the element panel for a component or container in a draft. It creates the file and maps the path in one request (`POST /api/code/file` with `mapTo`); both happen or neither.
- Success toasts for apply and discard.
- The state response carries a `version`. When the window regains focus, the UI reloads only if the model changed (git checkout, another tab, the CLI).

### Changed
- API clients must send `Content-Type: application/json` with a request body (415 otherwise).
- In-app dialogs and toasts replace the browser's prompt and confirm boxes. Destructive confirms name the action (Delete, Discard).
- Internal: the UI shell, the server routes, the object panel and the stylesheet are split into smaller files; ESLint runs in CI.

- **Behaviour change:** `dp serve` and `dp init` create an empty model. Before, a new folder got the
  sample model, and `sample_code/` was copied into it. Use `--demo` for the sample. `--empty` is still
  accepted. See DEC-036.
- The default lens is Architect when the model has no containers, otherwise Engineer (DEC-038).
- The sidebar lists every software system. A system with no containers is one entry marked "(empty)".
- Boxes that can be opened show a muted open mark on hover.
- The toolbar hides Undo, Redo and Auto-layout in read-only views.
- Apply dialog: a draft with only planned code edits is no longer shown as "changes nothing". Stale conflicts clear when the code option is toggled. The undo text says that undo restores the model only, not written code files or the draft.
- Coding plan dialog: "Checking…" while loading, a failed check is shown in the dialog, the branch is saved once, and Copy Markdown confirms.
- File editor: Ctrl/Cmd+S saves only when Save is enabled. Tab no longer edits a read-only file. A Loading… state is shown, and long paths wrap.
- Right-click menu: scrolling inside it no longer closes it. Shift+F10 or the menu key opens it for the selection.
- A removed (ghost) file box no longer shows an editable file panel.

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
- Errors from layout, auto-layout, image export and lens refetch are now shown. They used to fail silently.
- Escape in a dialog no longer clears the canvas selection.
- Keyboard shortcuts no longer act on the canvas while a dialog is open.

- Cut is removed from the canvas. It deleted the element, so Paste did nothing.
- A person or software system added on a context, container or component diagram is no longer lost
  because it has no line. Such a diagram only draws outside elements that are connected to something
  inside it.
- A double click on a palette item adds one box.
- The Delete key respects read-only and compare-only views, and uses the same confirm wording as the menu.
- One rename request is sent per Enter.
- Shortcuts do not fire while you type in a field. `?` toggles the help.
- A draft or git version that cannot load no longer locks the UI. The previous version, overlay and URL are restored, and the error names what failed.
- A bad version in the URL on first load falls back to main with a notice. A main model that cannot load shows a Retry button.
- Only the newest response is applied, so a box no longer jumps back after quick edits or drags.
- An edit that saved but whose reload failed says "Saved, but the view could not be refreshed", with Retry. Follow-ups (select, rename) still run.
- Back and Forward across a version switch land on the right diagram and add no stray history entries.
- Ctrl/Cmd+S on a file planned for deletion no longer drops the planned deletion silently.

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
