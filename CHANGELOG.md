# Changelog

## Unreleased

## 0.4.0 — 2026-11-16

First release meant for other people. Earlier notes and commit messages that say 1.0.0 refer to this line of work.

### Added
- Draft compare toggle: the draft strip compares a draft **Since it started** (only what the draft changed) or **Against main now** (also what main changed since the draft started) (DEC-063).
- A sample draft in the demo: *Tell customers when a payment is held* adds a container, changes a description, adds a line and proposes a decision.
- Ctrl/Cmd+click adds a box to the selection, as Shift+click does.
- Search (Ctrl/Cmd+K) is a modal dialog with a focus trap.
- Right-angle lines: automatic lines use rounded right angles, go around other boxes and spread their ends along each side of a box. Lines that share a gap are kept apart, and labels avoid other lines (DEC-052, DEC-061).
- Per-diagram default line shape, set in the diagram details panel (`layouts[<diagram>].lineShape`), and a shape for each line (DEC-061).
- Make room and Spread out: move boxes that are too close. They act on the selected boxes when two or more are selected, otherwise on the whole diagram. Each is one undo step (DEC-061).
- "No access" to a hub project: role `none` per project hides the project from that user (projects,
  home page, catalog usage, history) and refuses every request to it (DEC-060).
- Hub roles per project: a user's role can differ per project (`projects` in the users file,
  `dp users role NAME ROLE --project ID`); shown on the home page (DEC-057).
- Catalog copies follow the catalog: a change saved to the catalog reaches every project's linked
  copies at once; the home page lists what was copied where (DEC-057).
- History page (`#/history`): commits that changed the models, with what each changed per project,
  links to each version compared with its parent, and what is not committed yet. `GET /api/history`.
  Git stays read-only (DEC-058).
- Linked work status from GitHub: **Refresh status from GitHub** under Linked work, using a stored
  `github` credential. `POST /api/work/refresh` (DEC-059).
- Home page (`#/home`, linked from the top of the sidebar): a card per project with a picture of its
  landscape, counts, drafts, problems and last commit (cards or a list); "Needs a look" (model
  problems, drafts behind main, decisions proposed, due, expired or with a trigger met, and the
  shared catalog's findings); "Watching" (open revisit triggers and dates within 120 days); the latest
  decisions. Every item links to its diagram, decision, draft or element. `GET /api/home`, `GET /api/hub`
  (DEC-053).
- Hubs: `dp serve DIR --hub` serves several project folders listed in `DIR/hub.json`, with one
  sign-in for all. Requests name the project with the `X-DP-Project` header; the URL keeps it as
  `pr=`. Architects add a project from the home page (blank or the demo). `dp init --hub [--demo]`,
  `dp check --hub`. The demo hub (`demo/hub/`) has two projects sharing a customer database (DEC-054).
- Shared catalog: shared people, systems and databases live once in the hub's catalog; projects keep
  linked copies (`dp.catalog`) whose name, description and technology come from the catalog (Update
  from catalog, Add from catalog, Link, Unlink). Data: `dp.data` lists an element's tables, topics or
  buckets (shared on a catalog element, private on a project's copy); `dp.data.access` says which a
  relationship reads or writes. The Shared catalog page (Data in a single project) shows who uses each
  shared element, copies that drifted, and readers and writers of each table, flagging tables used or
  written by several projects. `GET /api/catalog`, `GET /api/catalog/usage`, `POST /api/elements/from-catalog`,
  `POST/DELETE /api/elements/:id/catalog`, `POST /api/elements/:id/catalog/sync` (DEC-055).
- Integration credentials (architects): kept in `.dp/credentials.json` (mode 0600, ignored by git),
  encrypted with AES-256-GCM when `DP_SECRET_KEY` is set; values are write-only (a masked hint is
  shown). Credentials page under the home page; `dp credentials list|add|rotate|remove` with values
  from standard input; `/api/credentials` routes (DEC-056).
- Decision records. **Decisions** in the navigation bar opens a page listing the model's decisions
  with filters (status, kind, "needs a look", search), each decision's record, and a form to write
  one. Six kinds: choice, conditional ("we would choose Q if X held; it does not, so A": the
  alternatives' conditions can be watched as revisit triggers), deferred (decide by a date),
  time-boxed (expires), policy (applies to) and reversal (accepting it marks the decisions it
  replaces as superseded). Each decision is a Markdown file `architecture/decisions/NNNN-title.md`
  and part of the model: undo, drafts, the change list, `dp diff`, git versions and apply include
  them; a number used on both sides is renumbered on apply. Element and relationship panels list
  the decisions about them, with **Record a decision**. `dp check` warns about decisions on objects
  that are gone. The demo has seven decisions, one of each kind. Routes `GET/POST /api/decisions`,
  `PUT/DELETE /api/decisions/:id`, `PATCH /api/decisions/:id/status` (DEC-050).
- Comments, ideas and questions on diagrams. Right-click a box, a line or empty space and choose
  **Comment…** (or use the speech-bubble button in the tools bar): write a comment, suggest an idea
  or ask a question about an element, a relationship or a whole diagram, reply in a thread, and mark
  it resolved. Boxes with open threads show a pin with the count; lines show it on their label; the
  details panel shows each object's discussion, and with nothing selected it lists every thread about
  what the diagram shows, filterable by open, questions, ideas and resolved. Every role can comment,
  a viewer too; only the author or an architect can edit or delete a note. Comments are stored in
  `architecture/comments.json` (separate from the model: no undo step, not part of drafts) and are
  routes `GET/POST /api/comments` and friends (DEC-049).
- Sample data on relationships and connector stages (`dp.example`, `dp.format`, and `example`/`format`
  on each stage in `dp.stages`). Clicking a line shows what it carries; a pipeline shows the sample
  entering it and leaving each stage, with added, removed and changed fields marked. Up to 8,000
  characters per sample. The demo's usage-event pipeline has samples. Flow step examples are
  pretty-printed when they are JSON, and stand in for a relationship that has no sample of its own.
- Live UI inspector. Give an element the address its UI runs at (`dp.ui.url`), click **Inspect live
  UI**, and click in the running app: each click lists the HTTP calls it made, the relationships they
  match (`dp.endpoints` on relationships, e.g. `GET /api/accounts/:id`), what was sent and returned
  (secret-looking fields masked), the documented example, what follows in the model, and the flows
  involved. Unmatched calls can be added as endpoints in one click; observed data can be saved as
  the example. The app is shown through a proxy on a local port; apps on other hosts need
  `dp serve --allow-ui-host <name>`. The demo's web-app relationships list their endpoints.
- OpenTelemetry trace files (OTLP JSON lines or files, `dp serve --traces <folder>`, default
  `traces/`). The inspector adds a `traceparent` header to the app's own calls, finds each call's
  trace and shows the path it took through the model, marking steps with no relationship and
  services no element matches. Spans match elements by `code.filepath` (code mapping), by
  `dp.element`, or by `service.name` (an element's ID, name or its new "service name in trace files",
  `dp.otel.service`); `peer.service` names what a client span calls. Recent traces are listed too.
- Backtrack (`GET /api/backtrack`): from a pipeline stage or flow step back to the first step, with
  each step's data, one field followed through every step, the code behind each step and its
  functions, and the git commits that changed that code or that step in the model. Steps changed in
  the last 7/14/30/90 days or not committed are marked; functions touched by a recent change are
  highlighted.
- Demo: a ten-stage month-end statement pipeline (a Statement Job container with one component and
  one TypeScript file per stage, samples at every stage, and a known issue to backtrack). A new demo
  folder becomes a git repository with four made-up commits (`demo/history.json`; skipped inside an
  existing repository). `dp serve --demo` runs a demo bank web app on 127.0.0.1:4200 that writes
  traces, and the demo model points the Single-Page Application at it.
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
- Optional sign-in. A project with a `.dp/users.json` file shows a sign-in page. Three roles: Architect, Engineer and Viewer (DEC-041). Without the file nothing changes.
- Role rules enforced on the server for every changing route. Engineers create drafts and change or discard only the drafts they started (see Changed). Engineers cannot change the main model, write code files or apply drafts. Viewers change nothing.
- User chip with role and Sign out. Default lens by role (Architect, Engineer, Overview for viewers), remembered per user and project; anyone can still switch lens. "View only" badge for viewers and a "Start a draft" banner for engineers on the main model.
- `dp users init`, `add`, `passwd`, `remove` and `list`, and `dp serve --users <file>`.
- Side panels have a real read-only mode, and controls a role cannot use are hidden.
- Open-source project files: CONTRIBUTING.md, CODE_OF_CONDUCT.md and SECURITY.md (how to report a problem, and the threat model).
- Issue templates for bugs, features and configuration, and a pull request template, under `.github/`.
- README front page rewritten: what it is, two screenshots (`docs/images/`, made from the demo model), a three-command quick start from an empty folder, then the features.

### Changed
- Engineers change and discard only the drafts they started. They can read every draft, and a draft from another person opens read-only for them. Architects change any draft. A draft with no author (made before sign-in was turned on) can be changed by architects only (DEC-063, amends DEC-041).
- Install from GitHub only (`npm install -g github:AbhishekR3/designPerspectives`). There is no npm registry package for now (DEC-063).
- The apply dialog's "Also write the planned code edits" starts unticked when the draft has a branch (DEC-063).
- Files are grouped by area with plain names: `project.ts`, `codeMap.ts`, `util.ts`, `diff.ts` in `src/core/`; the demo code in `src/demo/`; one route module per area; UI folders `canvas/`, `panels/`, `pages/`, `drafts/`, `inspect/`, `hooks/` and `common/`. No behaviour change (DEC-062).
- The stage reviews are combined in one file, `docs/reviews.md`.
- Prettier is enforced in CI (`npm run format:check`). CI also runs `dp check --strict` on a fresh demo model, and the test runner is upgraded to a new major version.
- The demo model now looks like a bank in production: a Payments Service with fraud checks, a
  Notification Service, a Payment Events topic, a Session Cache, a Statement Store, external payment,
  SMS, push and monitoring services, and Fraud Analyst and Site Reliability Engineer people. It has
  owners and runbook links, details tables (SLOs, endpoints, topic and cache settings, alert rules),
  Tier and Hosting tag groups, Operations and Finance lenses, three more flows with example data, a
  second pipeline connector, and TypeScript sample code behind the new components.
- `docs/demo-tour.md`: a guided tour of the demo for new users.
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
- Top area is two rows that wrap. The breadcrumb truncates (middle first), the search collapses to an icon and the lens label truncates. Nothing overlaps down to a 420 px canvas column.
- Draft strip and role banner are one row that wraps. Apply, Discard and Back to main always stay visible.
- Add palette collapses to a button (remembered; starts collapsed on a narrow canvas) and scrolls inside itself. Palette and dock share one column.
- Fit-to-view fits the area not covered by bars, palette, dock and zoom buttons. The diagram re-fits when the canvas size changes, until the user pans or zooms.
- Side panels cannot shrink the canvas below 420 px. The right panel collapses to a slim rail (starts collapsed under 1100 px).
- Feedback: a loading bar on diagram and version switches; busy state on Apply, Create, Save and Move; one focus ring; labels on every icon-only button; the help card lists all shortcuts; reduced-motion support.
- An empty flow no longer gets a step.

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
- Side panels looked editable on git versions and in read-only views. They now have a real read-only mode.
- Boxes could be dragged or resized in read-only views. They can no longer be there.
- Long names (120 characters) and long unbroken tokens (80 characters) wrap or truncate in boxes, boundary labels, edge labels, panels, change lists, the breadcrumb, menus, toasts, dialogs and the sidebar tree. Panels have no horizontal scrollbar.
- Dialogs fit the window, with scrolling content and visible buttons.
- The quick bar above a selected box stays inside the canvas.

### Security
- A network bind needs sign-in, `--read-only` or `--insecure`. `dp serve --host` with an address other than loopback (127.x, `::1`, `localhost`) refuses to start unless a users file has at least one user, `--read-only` is given, or `--insecure` is given to say an open server is meant. This replaces the earlier warning (DEC-063, replaces DEC-030).
- Hidden code paths are refused when entered: mapping an object to a path with a segment that starts with a dot is refused. A path a model already has still loads, and `dp check` warns about it (DEC-063, refines DEC-031).
- Hub folders: a project folder added in the browser must be a folder inside the hub and must not be hidden. No project folder may hold the hub folder or another project. `hub.json` entries are checked when the hub loads (DEC-063).
- Project IDs cannot be built-in object keys (such as `constructor`) (DEC-063).
- GitHub links are checked before the stored `github` token is used.
- `comments.json` is capped at 10 MB.
- The HTTP server package is updated to its current major version; the runtime dependencies have no known advisories.
- Requests must be addressed to a loopback host (`localhost`, `127.0.0.1`, `[::1]`) when the server
  is bound to loopback. This stops DNS rebinding. Any other host name is refused unless the server is started with `--allow-host`.
- Changes to `/api/*` are refused (403) when the request comes from another origin or site.
- Request bodies must be JSON (415 otherwise) and at most 5 MB (413 otherwise).
- Every response carries a Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff` and
  `no-referrer`. The UI cannot be embedded in a frame.
- Unexpected errors return a generic message; the detail is written to the server log only.
- Hidden files and folders (names starting with a dot, such as `.git` and `.env`) are never read,
  written, listed or planned through dp, in the code folder, in drafts or in git versions. Symlinks to
  them are refused. Code file writes are capped at 1 MB.
- Sign-in lockout (5 failed sign-ins lock a name for 30 seconds) cannot be bypassed with parallel requests.
- A locked name cannot be kept locked by repeated attempts, and failures on other names cannot reset it.
- A users file made invalid while the server runs no longer switches sign-in off.
- A half-saved users file no longer signs everyone out for good.
- One user signing in repeatedly no longer evicts other users' sessions.
- Unknown API paths return 404 instead of 403.
- The check that the users file is outside the code folder cannot be bypassed with a symlink.
- Oversized password-hash parameters are refused, so they cannot exhaust memory.
- Users file: scrypt hashes, owner-only file permissions, and `.dp/` is added to `.gitignore`. It must not be committed. A malformed file stops `dp serve`.

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
