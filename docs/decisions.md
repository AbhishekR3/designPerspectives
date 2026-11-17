# Decisions

A running list of project decisions and the reasoning behind them. Add new entries at the bottom; do not rewrite old ones. When a decision changes, add a new entry and set the old one's status to "Superseded by <ID>".

Entry format: **ID — title** · date · status · who decided · what was decided · why · trade-off.
"Owner" means the project owner. "Proposal" means the choice was delegated and made by the assistant, as an interpretation rather than a sourced fact.

---

## DEC-001 — Licence, user model and LLM default
- Date: 2026-11-11 · Status: Accepted · Decided by: Owner
- Decision: MIT licence; single user with collaboration through git; LLM features off by default; no LLM access needed during development.
- Why: the project is open source, makes no money and is meant for everyone to use.
- Trade-off: no real-time co-editing. Every stage must work without an LLM.

## DEC-002 — Scope of ambition (from the first design round)
- Date: 2026-11-11 · Status: Accepted, mostly deferred to the backlog (see `backlog.md`) · Decided by: Owner
- Decision: local-first single-user app plus CLI; adopt an existing diagram format instead of inventing a DSL; support both greenfield (planning) and brownfield (existing code); hand code off to external coding agents; personas with permissions; OpenTelemetry support; build one stage at a time with a review document at the end of each.
- Why: the tool should help with planning and understanding code as LLM-written code becomes common.
- Trade-off: the plan is much larger than the first usable version, so the stages deliver the core model and diagrams first.

## DEC-003 — Design decisions state their trade-offs
- Date: 2026-11-11 · Status: Accepted · Decided by: Owner
- Decision: every design decision, in the tool and in these docs, names its trade-offs. Source markers (owner, web, training data, proposal) are used so sourced facts and interpretation stay apart.
- Why: the architecture notes in `notes/` treat trade-off analysis as the core of the work.
- Trade-off: slower writing, easier review.

## DEC-004 — Build for our own system first
- Date: 2026-11-11 · Status: Accepted · Decided by: Owner
- Decision: target this project's own codebase first and optimise for other systems later. No cloud accounts for testing yet. The assistant may propose UI wireframes for the owner to review. Demo models: the Internet Banking example from the C4 book (credited in `NOTICE`) and another example from the book.
- Why: a concrete first target keeps the scope testable.
- Trade-off: integrations that need tokens or live APIs wait.

## DEC-005 — Rethink from scratch toward a usable proof of concept
- Date: 2026-11-13 · Status: Accepted · Decided by: Owner
- Decision: restart planning from the project's purpose: a model-based C4 tool, comparable to existing commercial ones in its core, with different views of the same software for different users, codebase import, and planned-change views. Deliver features in stages, each ending in something the owner can run and test.
- Why: the earlier plan was too large to test.
- Trade-off: part of the earlier plan became backlog items.

## DEC-006 — Local web app started by one command
- Date: 2026-11-13 · Status: Accepted · Decided by: Owner ("local web app for now")
- Decision: a local server reads and writes model files in a folder and serves the UI to the browser. No accounts, no hosted server.
- Why: simplest way to get a usable tool without installers or accounts.
- Trade-off: no installable desktop app for now. The UI could later be wrapped in a desktop shell or published as a static demo.
- Amended by DEC-041.

## DEC-007 — Native model file is a Structurizr workspace plus a sidecar
- Date: 2026-11-13 · Status: Accepted · Decided by: Owner delegated; choice is a Proposal
- Decision: `architecture/workspace.json` is a Structurizr workspace (elements, relationships, views, positions, flows). `architecture/designperspectives.json` holds data Structurizr has no field for (tag groups, lenses, characteristics list, cost settings, styles, layouts). Per-object extras are stored as `dp.*` properties inside the workspace.
- Why: Structurizr's format is open (Apache-2.0), plain JSON and widely understood; adopting it avoids adding another C4 format.
- Options rejected: own JSON files (a new format nobody else reads); LikeC4 DSL and Structurizr DSL (the UI would have to write canvas edits back into DSL source).
- Trade-off: one large file per workspace (more merge conflicts than many small files); Structurizr's numeric IDs are replaced by readable slugs here; opening our files in Structurizr's own tools has not been verified.

## DEC-008 — Engineer is the default lens
- Date: 2026-11-13 · Status: Accepted · Decided by: Owner ("Engineer first starting lense"; "only built-in lens" is the assistant's reading)
- Decision: the Engineer lens is the default; users create further lenses. Business and Security presets are in the backlog.
- Why: the first audience is engineers.
- Trade-off: the lens mechanism is built, but only one preset ships. Lenses are defaults for what a person sees, not access control.

## DEC-009 — Reuse the existing GitHub repository
- Date: 2026-11-13 · Status: Accepted · Decided by: Owner
- Decision: build in `AbhishekR3/designPerspectives`; earlier content could be cleared.
- Trade-off: earlier work stays only in git history.

## DEC-010 — Diagram content is computed from the model
- Date: 2026-11-14 · Status: Accepted (open to revisit) · Decided by: assistant (decision, per `reviews.md`)
- Decision: each diagram shows everything at its level, like `include *` (a container diagram shows all containers of the system plus what they connect to). Lower-level relationships appear on higher-level diagrams as dashed derived lines, which are not written to the file. Positions are stored at twice the UI size in Structurizr units.
- Why: a rename shows everywhere, and relationships are not duplicated in the file.
- Trade-off: an element cannot be hidden from one diagram (per-diagram hiding is in the backlog); in Structurizr, our views show only explicit relationships.

## DEC-011 — Active lens is remembered per browser
- Date: 2026-11-14 · Status: Accepted · Decided by: assistant (per `reviews.md`)
- Decision: the active lens is stored in the browser (localStorage), not in the project files. Lens definitions stay in the sidecar.
- Why: switching lenses should not create git changes.
- Trade-off: the active lens does not follow the user to another browser.

## DEC-012 — All-TypeScript stack
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (asked for the best language; "I know all languages"); supersedes the earlier Python-first plan
- Decision: one TypeScript stack: Node.js server (Hono), `dp` CLI (commander), React UI, and one shared API-types file (`src/shared/types.ts`).
- Why: removes hand-copied API types between server and UI, and keeps model rules reusable in the browser later. This reasoning is the assistant's assessment, not a measurement.
- Options rejected: Python backend with TypeScript UI (two languages, types copied by hand); Rust (Tauri) with TypeScript UI (full rewrite, slower iteration).
- Trade-off: Python import scanning uses a hand-written tokenizer instead of `ast` (a file with a syntax error still shows its imports); numbers are written as JavaScript writes them, so a project saved by 0.2 gets a one-time diff.
- Details: `reviews.md`.

## DEC-013 — Dark theme only, with overlays for characteristics and cost
- Date: 2026-11-14 · Status: Accepted (open question: light/dark switch) · Decided by: owner asked for a closer-to-reference layout and for cost and "-ility" information; specific design choices by the assistant
- Decision: dark theme only; per-object characteristic ratings (1–5, with a "driving" flag) and monthly cost lines; cost rolls up from contained objects; editable cost bands.
- Trade-off: exports have a dark background; ratings and cost live on objects only (not on relationships or flows).
- Details: `reviews.md`.

## DEC-014 — Built UI is committed
- Date: 2026-11-14 · Status: Accepted (owner was asked whether to keep this) · Decided by: assistant
- Decision: the built UI (`static/`) is committed and shipped in the npm package; CI fails if a build changes it.
- Why: installing from git does not require building the UI.
- Trade-off: build output creates large diffs after every UI change.

## DEC-015 — Docs for this repository
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: the repository keeps the two book notes (`notes/`), the backlog (`backlog.md`), this decisions list, and per-stage reviews (`reviews/`). The books themselves and superseded plans are not committed. Other tools are not named or compared in repository files, commit messages or pull requests. Commits and PRs carry no co-author or session-link lines.
- Why: the owner will work from a local folder synced with this repository, using a local editor with Claude Code, so everything a session needs must be in the repository.

## DEC-016 — Drafts are folders with a base copy; applying is a three-way merge
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (merge behaviour, storage, scope); file layout and merge granularity by the assistant (Proposal)
- Decision: a draft is `architecture/drafts/<id>/` holding its own `workspace.json` and `designperspectives.json`, a `draft.json` (title, description, date) and `base/` (the main model's two files when the draft was made). Drafts are meant to be committed. Applying merges object by object (element, relationship, view, position, tag group, lens, style, layout entry): a change on one side wins; the same change on both sides is kept; different changes to the same object are a conflict and nothing is applied. Positions and other layout never conflict (the draft's wins). References are checked after the merge (an element inside a removed element, a relationship to a removed element) and model rules are run, so a merge that breaks one (e.g. two containers with the same name) is refused too. Apply is one undo step on the main model and deletes the draft.
- Why: the base copy is what makes a three-way merge possible, so a draft can live while the main model keeps changing. Object-level units match how the model is edited (one edit touches one object), so unrelated edits merge cleanly.
- Trade-off: five files per draft in git; Structurizr tools ignore the folder. A conflict must be resolved by editing one side (no merge editor yet). Undoing an apply restores the main model but not the draft (git history still has it). New objects from the draft are placed after the object that preceded them in the draft, so sibling order can differ slightly from the draft's.

## DEC-017 — The model version is chosen per request
- Date: 2026-11-14 · Status: Accepted · Decided by: assistant (Proposal)
- Decision: every API request names the model version it works on in the header `X-DP-Model` (`main` or `draft:<id>`) and, optionally, the version it is compared with in `X-DP-Compare` (`base` or `main`). With a compare, diagrams carry `change` and `ghost` marks and `GET /api/changes` lists the changes. The UI keeps both in the URL (`#/d/<diagram>?m=…&c=…`).
- Why: the server holds no "current draft", so two browser tabs can show different versions, links keep the version, and tests stay stateless.
- Options rejected: a server-side "active draft" (tabs would interfere); separate URL prefixes per version (every route and client call would change).
- Trade-off: the header is invisible in the browser's network URL list; clients other than the UI must send it to work on a draft.

## DEC-018 — Git versions are read with the git command line
- Date: 2026-11-14 · Status: Accepted · Decided by: assistant (Proposal)
- Decision: Stage C2 compares the **stored model** at a git ref (branch, tag, commit, `HEAD~n`) with the working model, or two refs with each other, using the same diff and overlay as drafts. The model files are read with `git show <commit>:<path>`; refs are resolved with `git rev-parse --verify`, listed with `git for-each-ref`. Commands run without a shell; refs that start with `-` or contain `:`, spaces, `..` and other characters git forbids are refused. A version at a ref is read-only (`X-DP-Model: ref:<ref>`, `X-DP-Compare: ref:<ref>`).
- Why: no new dependency, works with any repository git can read, and a commit's model can be cached by its hash.
- Interpretation: the backlog says C2 "scans" two refs. Code scanning (Stage B) is not built, so this compares the models stored at the refs; scan results can use the same diff later.
- Trade-off: needs `git` on the PATH (the feature is hidden without it). A commit without the model files shows as an empty model. A repository created after the server started is found on the next request; one that disappears needs a restart.

## DEC-019 — Deployment diagrams come next, on the native Structurizr deployment model
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (order and model choice)
- Decision: the next stage builds deployment diagrams ahead of the other small backlog items. They use Structurizr's own deployment model (deployment nodes, infrastructure nodes, container instances, deployment views) rather than a tag-based substitute. Deployment diagrams are computed from the model like the C4 diagrams (DEC-010): connections are entered once at container level and shown between instances.
- Why: most requested missing view in the backlog review; native data stays readable by Structurizr tools.
- Trade-off: more element kinds to build and test than tags on containers. Deployment nodes are currently kept as one unit in `units.ts`, so they need per-node units before drafts and `dp diff` handle them well. Opening our files in Structurizr's tools is still untested.
- Open: first-cut scope, one or several environments per diagram, per-system or per-environment diagrams (to settle in the stage plan).

## DEC-020 — MCP server moves to a "Future stage"
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: the MCP server (reads the model, proposes edits as drafts) and related agent-facing work are parked in a new stage called Future stage. They are not scoped or scheduled; the owner will review and plan them later.
- Why: needs more thought (relation to Stage D, local authentication, what an agent may write) before it is planned.
- Trade-off: no agent integration soon; drafts and the `X-DP-Model` header (DEC-017) already let any HTTP client write into a draft.

## DEC-021 — Groups are model objects
- Date: 2026-11-14 · Status: Accepted (storage open) · Decided by: Owner
- Decision: groups (layer, bounded context, subsystem, module, org unit) are queryable and taggable model objects, not shapes drawn on a single diagram.
- Why: groups must work with tags, overlays, lenses, checks and diffs.
- Trade-off: more model work than drawn boxes. Open: whether an element can be in several groups, whether groups nest, and how they are stored (Structurizr's `group` string cannot carry tags, so a sidecar list or `dp.*` data is likely).

## DEC-022 — Deployment first cut
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (confirmed the proposed scope)
- Decision: the first deployment stage covers deployment nodes (nested), infrastructure nodes and container instances. One environment per diagram. Software system instances, deployment groups, health checks, side-by-side environment diff and cost per environment come later. Refines DEC-019.
- Why: smallest slice that shows where each container runs.
- Trade-off: no multi-environment view in the first cut; a system that is deployed as a whole (no containers modelled) cannot be shown yet.

## DEC-023 — Shared resources are modelled as their own container or system
- Date: 2026-11-14 · Status: Accepted (revisit if it confuses people) · Decided by: Owner (chose the simpler option from a comparison)
- Decision: a shared library or service is its own container or software system, and each user of it has a relationship to it. No multi-parent elements. A component keeps exactly one parent, as in Structurizr.
- Why: works today, stays standard Structurizr, keeps unique names per scope and cost rollups simple.
- Options rejected for now: multi-parent elements (extra parents stored in `dp.*` data, shown as references) — a medium to large change that breaks the one-parent rule.
- Trade-off: a shared library does not look "inside" the apps that use it; their diagrams show it as an outside box. A "shared" tag with a legend entry is a cheap aid if needed.

## DEC-024 — Sharing: read-only serve now, static export after the deployment stage
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: sharing stays `dp serve --read-only` for now. A static HTML export of the whole model (UI plus a snapshot of the model, no server) is planned after the deployment stage.
- Why: serving is already built; the export needs a static data path in the UI, so it should not delay deployment diagrams. The export fits the `dp check` / `dp diff` CI jobs (publish the model from the pipeline).
- Trade-off: until the export exists, people who cannot run Node cannot view the model. An export is a snapshot and includes everything in the model (notes, costs, links), which must be reviewed before publishing.

## DEC-025 — Groups can nest
- Date: 2026-11-14 · Status: Accepted (storage and multiple groups open) · Decided by: Owner
- Decision: groups nest (for example a layer containing bounded contexts). Refines DEC-021.
- Why: layers, contexts and org units are naturally trees.
- Trade-off: nesting needs cycle checks and a rule for deleting a group that has children. Still open: whether an element can be in several groups, and where groups are stored. Structurizr's own `group` is a plain string on an element [Training], so groups that carry tags need a sidecar list or `dp.*` data.

## DEC-026 — Stage B (codebase to model) moves to the Future stage
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: Stage B, reverse engineering a C4 model from an existing codebase (`dp scan`: proposed containers, components and connections from the code), joins the MCP server in the Future stage. It is not scheduled; the owner will review and plan it later. Refines DEC-020.
- Why: needs more review and planning; deployment diagrams come first (DEC-019).
- Trade-off: the model is entered by hand for now. Already built and kept: mapping components to files and scanning Python/JS/TS imports (`code.ts`), and the code diagram. Items that depend on a scan wait: "unmapped code" in `dp check`, comparing scan results with the model, more scan languages.

## DEC-027 — One group per element; tags for other dimensions
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: an element belongs to at most one group. Groups nest (DEC-025), so an element's group is one path in a tree. A second dimension (for example a compliance scope next to a layer) is a tag, not a second group. Refines DEC-021 and DEC-025.
- Why: maps onto Structurizr's single group per element, and avoids a colouring rule for overlays when an element has several groups.
- Trade-off: an element cannot sit in two trees at once; the tag is a flat label without nesting. Storage (Structurizr's `group` string with a separator, or a sidecar list so groups can carry tags) is still to be decided in the plan.

## DEC-028 — Stage order after Deployment
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner delegated the order; choice is a Proposal
- Decision: Deployment stage first (DEC-019), then a small batch of fixes, then the static HTML export (DEC-024). Whether deployment diagrams are per environment only or also per system is deferred to the deployment stage plan [Owner: "think about environment later"].
- Why: the small batch is quick and low risk (technology labels on connections, inherited owner, tag descriptions, a shortcuts menu, an "in diagrams" list, CSV export). The export is larger, and the export then carries those improvements from the start.
- Trade-off: the export is delayed by one small stage; the batch is not a single theme, so its review file lists items separately.

## DEC-029 — Research on other tools is allowed; naming them is not
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: pulling information from other websites, tools and competitors is allowed as research input. The naming rule from DEC-015 stays: they are not named or compared in repository files, commit messages or pull requests. Ideas are written in our own terms.
- Why: the owner wants to learn from existing products without the repository becoming a comparison document.
- Trade-off: sources for a feature idea cannot be cited in the repository, so the reasoning must stand on its own.

## DEC-030 — Request protection for the local server
- Date: 2026-11-14 · Status: Accepted (built in Stage P1) · Decided by: [Proposal]
- Decision: the server checks every request. When it is bound to loopback, the Host header must be `localhost`, `127.0.0.1` or `[::1]`; `dp serve --allow-host <name>` adds names. Changes to `/api/*` (any method other than GET, HEAD or OPTIONS) are refused with 403 when Origin is not the server's own origin or Sec-Fetch-Site is cross-site. A body must be `application/json` (415 otherwise) and at most 5 MB (413 above). Every response carries a Content-Security-Policy (own origin only, inline styles allowed), `X-Frame-Options: DENY`, `nosniff` and `no-referrer`. Binding a non-loopback host turns the Host check off and prints a warning that there is no login. Unexpected errors return a generic message; the detail goes to the server log only.
- Why: before this, any web page open in the browser could send a plain POST to 127.0.0.1:8765 and change the model or apply a draft. The Host check stops DNS rebinding.
- Trade-off: scripts using curl must send `-H 'Content-Type: application/json'`. The UI cannot be embedded in a frame, so editor preview panes cannot show it. A non-loopback bind has no login; the warning is the only guard.

## DEC-031 — Hidden paths are off limits
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner [Owner, 2026-11-14]
- Decision: files and folders whose name starts with a dot (`.git`, `.env`, `.ssh`, `.github` and others) are never read, written, listed or planned through dp. This covers the code folder, a draft's planned edits and git versions. Symlinks that point to them are refused. Code file writes are capped at 1 MB, the same as reads.
- Why: writing `.git/config` allowed commands to run the next time dp called git. Dot files often hold secrets.
- Trade-off: a component cannot be mapped to `.github/workflows`, and `.eslintrc.json` cannot be shown. Secrets with ordinary names (for example `config/secrets.yaml`) are not covered.

## DEC-032 — Apply writes code first, then the model, with rollback
- Date: 2026-11-14 · Status: Accepted (built in Stage P1) · Decided by: [Proposal]
- Decision: apply with code writes the code files first, keeping a backup of each. Then it writes the model. Then it deletes the draft. If a file write or the model step fails, every file is restored and the draft stays.
- Why: a failed file write used to leave the model applied and the draft in place, so the model and the code could disagree.
- Trade-off: restore is best effort. Content and permissions come back, modification times do not, and a failed restore is logged. A crash between the steps is not covered. Deleting the draft is not rolled back.

## DEC-033 — In-app dialogs replace browser prompt and confirm
- Date: 2026-11-14 · Status: Accepted (built in Stage R) · Decided by: [Proposal]
- Decision: the browser's prompt and confirm boxes are replaced by in-app dialogs. Dialogs take focus, keep Tab inside, give focus back when they close, and close on Escape without clearing the canvas selection. Keyboard shortcuts do nothing while a dialog is open. Destructive confirms name the action (Delete, Discard). Prompts trim the text and refuse an empty value. Failures that used to be silent are shown in an error slot or as a toast.
- Why: native boxes cannot be styled, they block the page while open, and keyboard shortcuts can act behind them.
- Trade-off: more UI code to maintain. Browser tests must click the dialog buttons, and they fail if a native dialog opens.

## DEC-034 — ESLint enforced, Prettier configured but not enforced
- Date: 2026-11-14 · Status: Accepted (built in Stage R) · Decided by: [Proposal]
- Decision: ESLint runs in CI (`npm run lint`) with the recommended rules for JavaScript and TypeScript and the two hook rules. Prettier is configured (print width 200) with `npm run format` and `format:check`, but it is not applied and CI does not check it. The 18 hook-dependency warnings were each reviewed and marked intentional with a reason. No dependency array was changed.
- Why: lint finds real bugs at low cost. Applying Prettier now would re-wrap 58 of 113 source files and bury real changes in the history.
- Trade-off: the code is not formatted to one style until the owner decides. The hook-dependency disables are only correct while callers keep passing state setters and refs.

## DEC-035 — Add-and-connect, readable IDs, several boxes, one lens per project
- Date: 2026-11-15 · Status: Accepted (built in Stage P2) · Decided by: [Proposal]
- Decision: (1) A person or software system added on a context, container or component diagram is created together with a line (one request, one undo step): to the system on a context diagram, else to the selected box inside the boundary, or the only box inside it. With two or more boxes and none selected nothing is created and a short notice says to select one; with none inside, the palette items are disabled with the reason. A line dragged onto empty canvas opens a small menu of the kinds the diagram can add (the usual kind first, Enter takes it, Escape cancels) and creates the box with its line in one request. (2) The first rename of a box added in this session sends `reslug`, so its ID is made from the new name; Escape keeps the generated ID. (3) Shift+click and Shift+drag select several boxes (never lines, ghosts, stages or files): they move and nudge together and are deleted with one question and one undo step (`POST /api/elements/delete`). (4) Move to… is offered for containers and components, built on the server's move rules; a refusal is shown in the dialog. (5) The lens is remembered per project (`dp.lens:<project folder>`), and the lens picked on first load is saved. (6) A software system with nothing inside is one sidebar entry, marked "(empty)", that opens its containers diagram.
- Why: before this, a person added on a container diagram vanished (it had no line), IDs kept names like `new-container-2`, deleting several boxes took one question and one undo each, and a model that began empty changed lens when its first container was added.
- Trade-off: the notice for an unclear target asks one extra click instead of guessing. The first rename after a reload no longer renames the ID (the fresh mark lives only in the open page). Multi-select uses Shift for both click and drag, so Ctrl/Cmd+click is not a second way. The context diagram of an empty system is no longer listed in the sidebar (it stays reachable from the system's panel, the breadcrumb and double-click). A kind menu adds one step to dragging a line to empty canvas for diagrams that offer several kinds.

## DEC-036 — A new project starts empty; the sample model is opt-in
- Date: 2026-11-15 · Status: Accepted (built in Stage P2) · Decided by: [Proposal]
- Decision: `dp serve` and `dp init` create an empty model. `--demo` creates the sample model with its sample code. `--empty` is still accepted. Before this, `dp serve` in a new folder created the sample model and copied `sample_code/` into the user's folder. This changes the default in DEC-006's "one command" flow: one command still starts the app, but the model starts with no elements. The first-run card ("Start your architecture", three steps: add a person, add a software system) and `--demo` cover the first-time experience.
- Why: a new folder should not get sample files that the user did not ask for.
- Trade-off: a first-time user sees an empty canvas rather than a worked example. The first-run card and `--demo` are the answer to that. A user who wants the example has to ask for it.

## DEC-037 — Elements can change parent; drafts treat a move as a change to the element
- Date: 2026-11-15 · Status: Accepted (built in Stage P2) · Decided by: [Proposal]
- Decision: a container can move to another software system, and a component can move to another container (`POST /api/elements/:id/move`). The move keeps the ID, the children and the relationships. It is refused when the name is already taken in the new parent, or when a relationship would then join an element and its own parent. In a draft, a move is one change to the element (Parent before → after). Apply merges it. The merge reports a conflict if main moved, changed or removed the element, or removed the new parent. In the compare overlay the element shows as changed in its new place, and a ghost marks the old place. People and software systems cannot move.
- Why: a box in the wrong parent should be moved, not deleted and added again. Adding it again loses its ID and its relationships.
- Trade-off: a move and any other change to the same element on the other side conflict, even when the two edits do not overlap. The merge does not try to combine them. People and software systems do not move because they are top-level in the C4 model.

## DEC-038 — Architect and Overview built-in lenses; default lens depends on the model
- Date: 2026-11-15 · Status: Accepted (built in Stage P2) · Decided by: [Proposal]
- Decision: two built-in lenses ship next to Engineer. **Architect** shows all levels and all sections. **Overview** shows the landscape and context levels, and hides the cost, notes, trade-offs, sensitive and code sections, and technology. The state response has `defaultLens`: Architect when the model has no containers, otherwise Engineer. The lens a person picks is remembered per project in the browser (the key includes the project folder). The resolved default is saved on the first load. This refines DEC-008: Engineer stays the default once the model has containers.
- Why: a model with no containers has nothing below the landscape for the Engineer lens to show, so the broad lens fits better there. Overview gives a summary for readers who do not need detail.
- Trade-off: the same person can see a different default lens in different projects. The saved default does not change when the model gains containers, so a user who started with Architect stays on it until they switch to Engineer by hand.

## DEC-039 — The UI applies only the newest response and rechecks the model on window focus
- Date: 2026-11-15 · Status: Accepted (built in Stage P3) · Decided by: [Proposal]
- Decision: each request gets a ticket, and the UI applies only the response to the newest one. A slower, older response is dropped. The state response carries a `version`. When the window regains focus, the UI checks it and reloads only if the model changed. There is no timer. The check waits while the user is typing or a dialog is open.
- Why: quick edits and drags could apply responses out of order, so a box jumped back. A focus check picks up git checkouts, other tabs and CLI edits without a push connection.
- Trade-off: there is no live push, so a change made elsewhere shows only when the window regains focus. A superseded response is dropped silently.

## DEC-040 — Drafts record an author and show how far main has moved
- Date: 2026-11-15 · Status: Accepted (built in Stage P3) · Decided by: [Proposal]
- Decision: a draft has an optional `author`. The client sends it; otherwise the server uses `git config user.name`. The author shows in the drafts list and in the `dp plan` Markdown header. A draft shows "main +N": the number of objects main changed since the draft's base. This is a diff of the base against main, cached by main's revision.
- Why: with several drafts, a label shows who started each change. The count shows whether a draft is out of date before apply.
- Trade-off: the author is a plain label, not an identity check, so any name can be written. The count costs one diff per main revision per draft. There is no rebase yet, so the count only reports the gap.

## DEC-041 — Optional sign-in with three roles; edit rights enforced on the server
- Date: 2026-11-15 · Status: Accepted (built in Stage P4) · Decided by: Owner [2026-11-14]
- Decision: dp stays a local tool. Sign-in is optional and off by default. With no `.dp/users.json` in the project, nothing changes. Three roles: **Architect** does everything. **Engineer** reads everything, creates drafts and edits any draft; it cannot change the main model, write real code files or apply a draft, and it can discard only drafts it started. **Viewer** reads everything and changes nothing. The server enforces these rights on every changing route. A route with no rule is Architect-only, and a test fails for a new route with no rule. `dp users` stores passwords as scrypt hashes. Sessions use an HttpOnly, SameSite=Strict cookie, end after 12 hours idle and live in memory. Five failed sign-ins lock a name for 30 seconds. Lenses stay a default view, not data hiding. Git versions stay read-only for everyone. Drafts record the signed-in user as author.
- Why: a shared local model needs a way to stop an engineer from changing the main model by accident. This works without a hosted server or accounts. Checks on the server hold even when the UI is bypassed.
- Amends: DEC-001 and DEC-006. "No accounts" now reads "no accounts unless a users file exists". DEC-008 is unchanged.
- Trade-off: not real-time. Two users editing the same thing: the last write wins, and the other sees it when the window regains focus. Undo history is per model version, not per user. Sessions are lost on restart. Passwords travel in clear text unless the server is behind HTTPS, so a network needs a TLS proxy. Lenses do not hide data: a viewer can read costs and notes through the API. `dp users` commands must not run in parallel. Roles are fixed. Open for the owner: (1) should engineers edit only their own drafts; (2) should a viewer's lens hide sensitive sections on the server (this would change DEC-008); (3) is a 12-hour idle session right.

## DEC-042 — Layout is built from rows that wrap, with measured insets; the canvas keeps a minimum width
- Date: 2026-11-15 · Status: Accepted (built in Stage P5) · Decided by: [Proposal]
- Decision: the top area is two rows that wrap instead of one bar that scrolls. Crumbs truncate, middle first. The search box collapses to an icon. The draft strip and the role banner are one row that wraps, and Apply, Discard and Back to main always stay visible. Bars, the Add palette, the dock and the zoom buttons share measured insets. Fit-to-view fits the area they leave free. A side panel cannot shrink the canvas below 420 px. The right panel collapses to a rail, and it starts collapsed under 1100 px. The app is not supported below 760 px wide.
- Why: at 1024 px and 1280 px, the search and lens bar covered the breadcrumb, and the change counts stacked so the draft strip scrolled sideways. Fixed sizes and pure CSS placement could not keep the bars and the canvas clear of each other as panels opened and closed. Measuring the insets lets fit-to-view and the quick bar use the space that is really free.
- Trade-off: more layout code, and a measured attribute (the insets) that must be kept in step with the CSS. The diagram re-fits when the canvas resizes until the user pans or zooms, and it does not re-fit when only a dock panel opens. Below 760 px the canvas is shown with both panels collapsed, and nothing else is promised.

## DEC-043 — Sample data on relationships and connector stages
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (authored samples), [Proposal] (shape)
- Decision: a relationship has an optional sample payload and format (`dp.example`, `dp.format`). Each connector stage has the same two fields inside `dp.stages`, and a stage's sample is the data **leaving** that stage. Clicking a line shows the samples in order: what enters, then what each stage produces, then where it ends. When two neighbouring samples are JSON objects, the top-level fields the stage added, removed or changed are marked. A sample is at most 8,000 characters. Samples are written by people (or agents); the tool does not read data from running systems. A relationship with no sample shows the examples of flow steps that use it.
- Why: a pipeline's stage names say what happens; a sample shows it ("Mask PII" turning `email` into `user_ref`). Field marks make the change visible without reading two payloads side by side. Keeping samples in the workspace means they are versioned, diffed and reviewed like the rest of the model, and work offline.
- Trade-off: samples are only as current as the last edit; nothing checks that they match the real data. The field comparison only looks at top-level fields of JSON objects (or the first object of an array); CSV, SQL and nested changes show as plain text. Samples live in git, so the person writing one must remove real personal data; the 8,000-character cap keeps them short but does not check content. Flow step examples stay separate (`dp.stepData`), because one relationship can carry different data in different flows.

## DEC-044 — Live UI inspector: the running app framed through a local proxy, calls matched to endpoints on relationships
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (live embedded app), [Proposal] (shape)
- Decision: an element can have a live UI address (`dp.ui.url`, http or https). "Inspect live UI" opens that app inside dp. For each app origin, dp starts a listener on 127.0.0.1 (a free port). It forwards requests to that origin only, removes `X-Frame-Options` and `Content-Security-Policy` from responses, and adds a small script to HTML pages. The script reports clicks and the fetch / XMLHttpRequest calls made in the two seconds after each click to the dp page (`postMessage`, only to the origin that greeted it). Relationships list the HTTP calls they carry as endpoints (`dp.endpoints`: method and path, `:name` for one segment, a final `*` for the rest, or a full URL). `POST /api/inspect` matches the calls to relationships that start at the UI element or its children, then walks on through outgoing relationships (each element once, up to three steps). It also names the flows that contain a matched relationship. The panel shows each call with what was sent and returned next to the documented example, and what follows in the model. A call that matches nothing can be added as an endpoint in one click. Sent or returned data can be saved as the relationship's example (DEC-043).
- Why: the owner wants to click in a real UI and see which calls it makes and which parts of the system they touch. A browser does not let a page read clicks in a frame from another origin, and many apps refuse to be framed. A proxy on its own port fixes both. Absolute paths in the app keep working, and the app stays in another origin than dp, so its scripts cannot read dp's API. Matching through endpoints written on relationships keeps the model the single source: the tool observes calls, but what they mean comes from the model.
- Security: the proxy target comes only from the model, never from a request. Targets must be on this machine unless their host is allowed with `dp serve --allow-ui-host <name>`. The proxy answers only requests addressed to itself (Host check against DNS rebinding). Cookies are shared across ports on one host, so dp's session cookie is removed from every forwarded request. The script replaces JSON fields and form fields whose names look like secrets (password, token, authorization, cookie, card number, IBAN, ...) with "•••", and cuts bodies to 2,000 characters before they leave the page. Observed data is kept in the browser tab only and written to the model only when someone clicks Save. Opening the inspector changes nothing, so every role may use it (`open` in the route rules); adding an endpoint or saving an example is an ordinary edit.
- Trade-off: the inspected app runs without its own framing and content-security headers inside dp, so dp shows a weaker version of the app's protection (fine for a local or test build, wrong for judging those headers). Only fetch and XMLHttpRequest are seen: WebSocket messages, server-sent events, `sendBeacon`, calls from workers, and calls made by the servers behind the API are not. Attribution is by time (two seconds after a click), so a poll that fires in that window is counted, and a slow chain started later is not. Secret masking is by field name, so a secret under an ordinary name is shown. The proxy listens on 127.0.0.1, so it works only in a browser on the machine that runs `dp serve`. An app that pins absolute URLs to its own origin, uses a service worker, or checks the `Host` or `Origin` header strictly may not work through the proxy. The onward walk shows every way on from an element, which is more than one request uses; flows give the precise path.

## DEC-045 — Observed data stays masked, including personal financial data
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] ("give it a mask over the data")
- Decision: everywhere dp shows data observed in a running system (the live UI inspector's sent and returned data, trace span attributes), values of fields whose names look like secrets or personal financial data are replaced with "•••". The list is one pattern (`src/shared/mask.ts`; the inspector script carries the same text): passwords, tokens, keys, authorization, cookies, sessions, card numbers, CVV, PIN, SSN, IBAN. Masking happens in the browser before data leaves the app, and on the server for trace attributes. The two-second window for linking calls to a click stays (owner, same day).
- Why: observed data can be saved into the model, which lives in git; masked by default is the safe choice.
- Trade-off: masking is by field name, so a secret under an ordinary name shows; masked test data (a test IBAN) cannot be seen in dp.

## DEC-046 — Trace files are read from a folder and laid over the model
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (read trace files), [Proposal] (shape)
- Decision: dp reads OpenTelemetry trace files in OTLP JSON (the Collector's file exporter format: one object per line, or a whole JSON file) from one folder (`dp serve --traces <folder>`, default `<project>/traces`), re-reading files when they change and keeping the newest 2,000 traces from the last 20 MB of each file. A span is matched to an element by, in order: the `dp.element` attribute; the file it ran in (`code.filepath` / `code.file.path`) against code paths, a file mapped to several elements going to the one that lists it first; its parent span's element when both run in the same service; `service.name` against the element's trace service name (`dp.otel.service`), ID or name. `peer.service` on a client or producer span names the element called. A change of element from parent to child span is a hop, matched to a relationship directly or between the elements' parents or children. Hops with no relationship and names no element matches are shown as differences between the running system and the model. The live UI inspector puts a W3C `traceparent` header on the app's own (same-origin) calls so it knows each call's trace ID. Routes: `GET /api/traces`, `GET /api/traces/:id?ui=<element>` (read-only, every role).
- Why: the model-only walk shows every way on from an element; a trace shows what one request did. Files keep dp local and offline (backlog principle in section 3): any service that can export OTLP JSON works, with no collector connection, accounts or tokens. Matching by code path reuses the code mapping, so a team that mapped its code needs no extra setup.
- Trade-off: traces are as fresh as the file; nothing is pushed. The `traceparent` header changes the app's requests, which a backend may already set or reject; cross-origin calls are not tagged (a new header would trigger a CORS preflight), so their traces are not found by ID. Matching by file assumes a component's first code path is its main file. A hop matched "between parents or children" names the first relationship found, which can be a sibling's. Large trace folders are read in full on change.

## DEC-047 — Backtracking from a step: data, code, functions and history
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (backtrack a step: where the data came from, how it changed, functions and processes around it, recent changes), [Proposal] (shape)
- Decision: from a connector stage (or the data entering it) or a flow step, `GET /api/backtrack` returns every step up to it. For each: the sample and format; the element that does it; its code (a stage: the implementing element's code paths; a flow step: the relationship's and the receiving element's); the functions in those files (found by pattern for TypeScript/JavaScript and Python); the last 15 commits that touched each file; whether the file has uncommitted edits; and the commits that changed this step in the model (the stage, the relationship, the element), found by comparing each commit of `workspace.json` with the one before. A step is "recent" when any of that falls in the window (7, 14 (default), 30 or 90 days) or is uncommitted. Functions whose lines changed since just before the oldest recent commit are marked. The UI follows one field through every step's sample (same name, ignoring case and `_`), saying where it appears and where it changes, and lists related field names.
- Why: to find where a problem at step 8 came from, a reader needs the data at each step, what code does each step, and what changed lately, in one place. Everything needed is already in the model (samples, stages, code mapping) and in git; nothing new has to be recorded.
- Trade-off: field following matches names only, so a renamed or computed field (amountMinor → amount) breaks the chain, though related names are listed. Function ranges are approximate (until the next function). Model history assumes linear history and reads at most 15 model commits; each read parses that commit's model (cached). History comes from git only; without a repository the view still shows data, files and functions.

## DEC-048 — The demo gets a made-up git history and a running web app
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] ("include a demo for this as well"), [Proposal] (shape)
- Decision: `dp serve --demo` and `dp init --demo` turn a new demo folder into a git repository with four dated commits from `demo/history.json` (made by `npm run make-demo` from the shipped files: older versions are derived, so they cannot drift). The newest commit, two days before now, introduces the demo's bug (currency conversion rounds each amount). This is skipped when the folder is already inside a git repository or git is missing. `traces/` is ignored in that repository. `dp serve --demo` also runs a demo bank web app on 127.0.0.1:4200 (`src/server/demoApp.ts`, page in `demo/web-app/`): sign in, accounts, statements, payments, password reset and exchange rates over a made-up API, writing one OTLP trace per call to `traces/demo-app.jsonl`. The demo model's Single-Page Application points at it. The exchange-rates call reaches a provider the model lacks, and statements show the one-cent difference that backtracking explains.
- Why: backtracking needs recent history and the inspector needs a running app with traces; without them a new user cannot see either feature in the demo.
- Trade-off: the demo folder gets a `.git` folder and commits the user did not make (dates relative to the day the demo is created). Port 4200 may be taken; dp then says so and the rest works. The demo app's page is plain browser JavaScript and HTML (demo content, like the sample code), not TypeScript.

## DEC-049 — Comments, ideas and questions live in their own file, open to every role
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] ("add comments, suggest ideas or ask questions in the diagrams"), [Proposal] (shape)
- Decision: a person can start a thread of one of three kinds (comment, idea, question) about an element, a relationship or a whole diagram, reply to it, and mark it resolved or reopen it. Threads are stored in `architecture/comments.json` (`core/comments.ts`), anchored by element ID, relationship ID or diagram key, in the order they were started, with a stable layout for `git diff`. They are not part of the Structurizr workspace or the sidecar, so they have no undo step, are not diffed, merged or copied by drafts, and do not change the model's version. The new action `comment` is allowed for all three roles on every model version (a viewer included), and refused only on a `--read-only` server. With sign-in the author is always the signed-in name; without it the sender may give a name, otherwise git's `user.name`, otherwise "Anonymous". Only the author or an architect can edit or delete a thread or reply; anyone who may comment can resolve or reopen. Text is at most 4,000 characters, 200 replies per thread and 5,000 threads per project. The server marks a thread `missing` when its target is not in the version shown (deleted, or only in another draft); the UI lists those apart. The UI shows a count pin on boxes and a count badge on lines with open threads, a Discussion block in each object's details panel, and, with nothing selected, a list of the diagram's own threads and those about what it shows, with filters and a jump to each. Routes: `GET/POST /api/comments`, `POST /api/comments/:id/replies`, `PATCH/DELETE /api/comments/:id`, `DELETE /api/comments/:id/replies/:rid`.
- Why: review talk is not part of the model: a viewer must be able to ask a question about a model they cannot change, an engineer must be able to comment on main without starting a draft, and a comment should not be undone with the next Ctrl+Z or lost when a draft is discarded. A separate file keeps `workspace.json` diffs about the architecture only, while still being versioned and shared through git.
- Amends: the working rule "new per-object data goes in `dp.*` properties" (CLAUDE.md): comments are the exception, for the reasons above.
- Trade-off: the file is plain data in git, so two people commenting on different branches get a normal merge, and a conflict is possible when both add at the end of the list. Anyone can read all comments; they are not hidden by lenses. Comments are anchored by ID: when an element is deleted its threads stay in the file and show as "not in this version" until someone deletes them. Moving an element keeps its ID, so threads follow it. A comment made while looking at a draft is shared with main, so a thread about a draft-only element is an orphan on main. Not real time: others' comments show on the next change or when the window regains focus. With sign-in off, anyone can delete anyone's comment (everyone acts as an architect), as with every other edit. Not built: mentions, notifications, free-floating pins at a position on the canvas, turning an idea into a draft, and comment counts in `dp check` or `dp diff`.

## DEC-050 — Decision records: one Markdown file per decision, part of the model
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] ("a section to track decisions … we would have gone for Q, W, E if we had X, Y, Z, but we don't, so we went with A, B, C"; one Markdown file each), [Proposal] (format and shape)
- Decision:
  - **Files.** Each decision is a file `architecture/decisions/NNNN-slug.md` (`core/decisions.ts`). The four-digit number is its ID; the file keeps its name when the title changes. Other files in the folder (a README) are ignored.
  - **Front matter.** A small fixed grammar, not YAML: `key: value` or `key: [a, b]`, with values in double quotes where they need them. Block lists are read too. Keys, in written order: `status`, `kind`, `date`, `deciders`, `affects` (element and relationship IDs), `supersedes`, `superseded-by`, `tags`, `review-by`, `decide-by`, `expires`, `applies-to`.
  - **Body.** `# Title`, then `## Context`, `## Decision`, `## Alternatives` (an `### Option` each, with `- Why not now:` and `- Would choose if:` bullets), `## Consequences`, and `## Revisit triggers` (a `- [ ]` checklist; ` (→ Option)` names the alternative a trigger favours).
  - **What is kept.** Unknown sections, unknown keys and text after the title are kept. A file that does not follow the format is reported as a model error and never rewritten. A decision is written only when it changes, so hand formatting survives until the decision is edited here.
  - **Kinds.** Six, each with its own fields and hints: choice; conditional (the owner's example: the alternatives' "would choose if" conditions become revisit triggers); deferred (`decide-by`); time-boxed (`expires`); policy (`applies-to`); reversal (`supersedes`).
  - **Statuses.** proposed, accepted, rejected, deprecated, superseded. When a decision that replaces others is accepted, the replaced ones become superseded and get `superseded-by` in the same edit.
  - **Part of the model.** Decisions are model units (`dec:<file>` in `units.ts`). They are read and written by `Project` with the workspace and sidecar, so they go into undo, drafts (copied with `base/`), diffs (a "Decisions" group in the change list and in `dp diff`), the three-way merge and git versions (read with one `ls-tree` and one `cat-file --batch`).
  - **Renumbering on apply.** When main and a draft both added a decision with the same number, applying the draft gives the draft's one the next free number and updates its links. Without this, two people writing decisions in parallel would always conflict.
  - **Checks.** Model errors: an unreadable file, two files with one number, a link to a missing decision, a bad date. `dp check` warns about decisions on objects no longer in the model; deleting an element is never blocked.
  - **Roles.** Writing a decision is the `edit` action, so an engineer writes them in a draft.
  - **Routes.** `GET /api/decisions[/:id[/markdown]]`, `POST /api/decisions`, `PUT /api/decisions/:id`, `PATCH /api/decisions/:id/status`, `DELETE /api/decisions/:id`. `AppState.decisions` lists summaries.
  - **UI.** A Decisions page over the diagram: a list with filters, the record, and a form editor with fields for each kind, a "watch the alternatives' conditions" action and a warning on text that looks like a key. Each element and relationship panel has a Decisions section with "Record a decision". The page lives in the URL as `p=decisions[/<id>]` on the diagram hash, so Back closes it and the model version is kept.
- Why:
  - Markdown files read well on GitHub and in pull requests, and the record lives next to the model it explains.
  - Being part of the model means a decision is proposed, reviewed and applied with the change it justifies.
  - A fixed small grammar avoids a YAML dependency, gives byte-stable output and keeps `git diff` clean.
  - Revisit triggers turn "we would choose Q if X" into something that can be watched.
- Trade-off:
  - Hand-written front matter that uses YAML features beyond the grammar becomes a load error, never silent data loss. YAML comments are dropped when a decision is rewritten.
  - A `## ` line typed inside a section is turned into `###`, so it is not read back as a new section.
  - Renumbering on apply changes a draft decision's file name and number; links from outside the model (chat, tickets) to the draft's number go stale.
  - Unknown sections are written after the known ones once a decision is edited.
  - Engineers cannot file a proposed decision on main without a draft (owner question).
  - Each request stats every decision file to notice changes on disk, which is fine for hundreds.
  - Not built yet (owner-approved plan, later stages): the home page, the multi-project hub, the shared catalog and credentials.

## DEC-051 — Stage B import: BMO, a purpose-built import file, one C4 level at a time, no inferred labels
- Date: 2026-11-15 · Status: Accepted, built in 0.5.0 (refines DEC-026; was Future stage, not scheduled) · Decided by: Owner [2026-11-15] (depth, no inferred label, intake, prompt shipping, files at code level, explicit accept of low-confidence items, the agent's name, a deterministic readiness analysis), Owner delegated [2026-11-15] (file format, backend order; "stability and accuracy"), [Proposal] (shape)
- Changed when built [Owner, 2026-11-16]: JSON only (no YAML); direct backends are the Claude API, the OpenAI API and Ollama; MCP and Structurizr DSL input are not built.
- Decision: a codebase is brought in through one import file (YAML or JSON) with a JSON Schema shipped in the package, validated by `dp import --check`, and turned into a draft (Stage C) that a person accepts, edits or rejects object by object. Structurizr DSL is a secondary input, not the main route. The project's agent is called **BMO**. BMO has no model of its own: it reaches a backend LLM through an adapter. Backends in build order: handoff (dp writes `architecture/import/prompt.md` from the deterministic scan, the intake `intake.yaml` and the schema, and the user runs BMO's turn in their own coding agent), then MCP, then direct calls with the user's own key, endpoint or a local model. BMO is off by default and its output is always a proposal. Import goes one C4 level at a time (C1, C2, C3), the user can stop at any level, and C4 (code level, files only) needs no BMO because a file maps to a component by path prefix. A deterministic readiness analysis (`dp scan --plan`, files and git only) counts candidates per level, reports done and left, estimates the user's review effort and BMO's reading, and recommends step by step or one go by fixed rules. Default depth is the whole project, worked core first. Imported objects carry no "inferred", "imported" or confidence label in the model. The review level (verified, partly verified, unverified) is computed by the tool from checkable evidence, not reported by BMO; unverified items need an explicit accept, with ways to verify again, edit, tell BMO in typed text, or reject. Evidence that is a real file path becomes the code mapping. The prompt ships in the package, versioned with it. The design is in `backlog.md`, section 4.
- Why: the dependable part of Structurizr is the workspace format, which dp already stores; the import file is only a transport, and a strict schema (unknown keys rejected, field-level errors, one-to-one with `ops.ts`) is easier to make stable than a DSL whose only reference parser is Java and which the all-TypeScript rule would make dp reimplement. Handoff first keeps dp itself free of any model, so the same import file always gives the same draft and the only variable input is a file that is checked before it is used. Naming one agent and keeping the checks outside it makes results from any backend comparable. A level-by-level order follows the C4 dependency (containers define source roots, components define file mapping) and lets a user stop with a valid model. Computing the review level, not asking BMO for it, keeps confidence from being an argument. No label keeps imported and hand-made objects the same, as the owner asked for a deterministic model.
- Trade-off: one more format to document and version; with the handoff backend the user copies a prompt to their own agent and the result depends on it; the analysis counts only what the scan can see (people, manual steps and unreadable languages are not counted, so "100% decided" is not "complete"), and its thresholds, the 20 s per item and the lookup list of known external services are guesses that need upkeep; with no label, a reader cannot tell later which objects BMO first proposed (git history and the kept import folder are the only record); full depth on a large repository costs many turns, so it may need one draft per container; a DSL file can reach dp only through a conversion or a later parser.

## DEC-052 — Lines use right angles, go around boxes and spread out on each side of a box
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (straight lines that turn at right angles; separate lines into the same box)
- Decision: a line whose shape is "Automatic" (no saved shape) is now drawn with right angles and rounded corners instead of a straight diagonal (or a curve for a second line between the same two boxes). Lines are routed together for the whole diagram, not one at a time. Each end picks a side of its box: the side facing the other box, an L with one bend when the boxes are diagonal, or a straight line when they line up. All line ends on one side are spread along it, ordered by where the other end is, so they do not meet at one point or cross next to the box. Ends set by hand (dragged anchors) and a dragged bend point are kept; a dragged bend point is a point the line passes through. A label with no saved position sits on the middle of the line's longest segment, not on a corner. Automatic lines also go around other boxes. A route keeps 15px clearance from a box; where the gap is tight it uses 5px. If no way exists, the line keeps its old path. When a box blocks the sides a line would use, another pair of sides is chosen. For example, a line leaves from the right side and enters from the top instead of running down through two boxes. Labels are placed where they do not overlap other labels or boxes. Label sizes are estimated from the label text (`ui/src/labelSize.ts`). Routes are computed on every render, including during drags, and are not saved, so the model files and git diffs do not change. The code is a pure module, `ui/src/routing.ts`, with unit tests.
- Why: the owner asked for straight lines that turn at 90 degrees, and for lines into the same box to be separated instead of overlapping [Owner, 2026-11-15]. Spreading the ends is the cheapest fix with the largest effect. Computing all lines in one pass is what makes it possible.
- Trade-off: existing diagrams change look on next open. Lines with no saved shape become right-angled, and a saved bend point on such a line now places the middle segment instead of bending a curve. A saved shape (straight, curved, smooth) still wins, per line. Remaining: lines can still sit on top of each other in a shared gap; labels can still sit on neighbouring lines; straight, curved and smooth lines are not routed around boxes or used in label placement; side switching is skipped for lines with a hand-set end or bend point (their path is still routed around boxes). Moving a box can move the ends of other lines on the same side. Next steps are in the backlog.

## DEC-053 — A home page above the diagrams
- Numbering note: DEC-053 to DEC-060 were numbered DEC-052 to DEC-059 in commits 47042c2, 9cea2f8 and 7ed976a (their messages and earlier reviews say so); they were moved up by one because DEC-052 is the line routing decision (branch `feat/orthogonal-routing`).
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] ("a home page / dashboard to track the project, relevant models … decisions"), [Proposal] (shape)
- Decision:
  - **What it shows.** A home page at `#/home`, outside the diagram workspace:
    - a card per project, with a small picture of its landscape drawn from stored positions (a grid where there are none), counts, drafts, model problems and its last commit
    - "Needs a look": model errors, `dp check` warnings, drafts behind main, decisions that are proposed, past review or decide-by, expired, or have a trigger met, and, in a hub, the catalog findings of DEC-055
    - "Watching": open revisit triggers, and review, decide-by and expiry dates within 120 days
    - the latest decisions of every project
    - in a hub, the shared catalog in numbers
  - **Navigation.** A left rail leads to Home, the shared catalog (Data in a single project), Credentials (architects) and each project. Every item links to where it is: a diagram, a decision, a draft, or an element (`reveal=` in the URL, shown once the model is in).
  - **Views.** Projects show as cards or as a list; the choice is kept in the browser.
  - **Landing.** In a hub an empty URL opens the home page. In a single project it still opens the diagrams; the sidebar's top line links home.
  - **API.** `GET /api/home` (and `GET /api/hub`) answer the same in both modes. A single project is a hub of one, so the UI has one code path.
  - **Caching.** Results are cached by model revision; the git log for 30 seconds.
- Why: the owner asked for one place to track projects, models and decisions. The layout follows the common pattern of diagram tools' start pages: projects as cards with a picture, a list view, and starting a project from a template. It also takes from architecture tools' landscape pages the idea of listing what needs attention.
- Trade-off:
  - Thumbnails are drawn from stored positions; a landscape never laid out shows a grid.
  - Counts and problems come from main only (drafts show as a count).
  - The page is read-only apart from "New project".
  - `dp check` runs per project on the first load after a change, which is slow for large hubs.

## DEC-054 — A hub serves several projects: `dp serve --hub DIR`
- Date: 2026-11-15 · Status: Accepted (amends DEC-007: one workspace per folder still holds, several folders per server) · Decided by: Owner [2026-11-15] (a hub folder, committable to git), [Proposal] (shape)
- Decision:
  - **`hub.json`.** It lists projects (`{id, path, name?}`) and a catalog folder (`catalog`, DEC-055). Each project is an ordinary project folder with its own `architecture/`, code, drafts, comments and git history.
  - **Server.** The server builds one app per project on first use (`buildApp`, the route modules unchanged). The hub's own app answers sign-in, `/api/hub`, `/api/home`, `/api/catalog*`, `/api/credentials*`, `POST /api/hub/projects` and the UI. It passes every other `/api/*` request to the project named by the `X-DP-Project` header: 422 without it, 404 for an unknown project.
  - **UI.** The browser keeps the project in the URL (`pr=`) and sends the header from `api.ts`.
  - **Sign-in.** One sign-in for every project, from `<hub>/.dp/users.json`. Roles are global; a project's own users file is not used in a hub.
  - **Folders.** No project folder may hold the hub folder or another project's folder, so no project's code routes can reach `hub.json`, the catalog or another project's model. In a hub, each project's code folder and traces folder are its own folder.
  - **New projects.** `POST /api/hub/projects` (architects) creates a project folder from a blank model or the demo and adds it to `hub.json`. `hub.json` is read again when it changes on disk.
  - **CLI.** `dp init --hub DIR [--demo]`, `dp serve DIR --hub [--demo]`, `dp check DIR --hub`. The demo hub is generated by `npm run make-demo` into `demo/hub/`.
  - **Single project.** `dp serve PATH` without `--hub` is unchanged.
- Why:
  - A hub folder can be committed and shared, so a team sees the same list.
  - One app per project keeps every project rule and route exactly as it is, and a header matches how the model version is already chosen (`X-DP-Model`).
- Trade-off:
  - **Shared roles.** A person has one role in every project; per-project roles are an owner question.
  - **Memory.** Every project loaded stays in memory.
  - **Request bodies.** Requests are passed on in-process, and their bodies are read twice.
  - **Logs.** The project is not in the path, so server logs do not show it.
  - **Paths outside the hub.** A project path outside the hub folder (`../x`) is allowed, as long as it does not hold the hub.

## DEC-055 — Shared elements live once in a catalog; projects keep linked copies; data is listed with who reads and writes it
- Date: 2026-11-15 · Status: Accepted (refines DEC-023: still no element with several parents) · Decided by: Owner [2026-11-15] (catalog + linked copies; "different projects sharing the same database but different tables or sometimes shared tables"), [Proposal] (shape)
- Decision:
  - **The catalog.** A hub's catalog is a normal project folder (`<hub>/catalog/`). Its elements are the shared definitions: people, systems, databases, brokers. It is edited, drafted and undone like any project.
  - **Linked copies.** A project keeps a copy of each shared element it uses, marked `dp.catalog = <catalog element ID>`, so its workspace stays a complete Structurizr file.
    - A linked copy's name, description and technology come from the catalog; changing them in the project is refused. Everything else (owner, notes, cost, its own data) is the project's.
    - "Update from catalog" takes the catalog's fields again. It is an explicit edit, never done automatically across projects, so role rules, drafts and undo apply.
    - "Add from the catalog" adds a linked copy, inside a linked copy of its catalog parent (made too when missing).
    - An element can be linked to, or unlinked from, a catalog element of the same kind.
  - **Data.** `dp.data` on an element lists the data it holds: tables, views, topics, queues, buckets, collections, files and indexes, each with an owner and a sensitive flag.
    - On a catalog element the data is shared; on a project's copy it is private to that project. This covers "the same database, different tables".
    - `dp.data.access` on a relationship says which of the data at either end it reads or writes (destination first).
  - **Usage.** `GET /api/catalog/usage` computes, across projects:
    - each catalog element and the projects that use it
    - copies that differ from the catalog (name, description, technology), and copies of elements no longer in the catalog
    - each data asset with its readers and writers by project and element, flagged "used by several projects" and "written by several projects"
    - access to data the other end does not list
  - **Where it shows.** The home page lists the findings. The Shared catalog page (Data in a single project) shows the tables, with update and add-to-project actions. The panels have Shared catalog, Data and Data access sections; derived lines show the data access of each relationship behind them.
- Why:
  - Linked copies keep each project a self-contained Structurizr file for export, history and `git diff`, as the owner chose.
  - Data at the level of tables answers the owner's question (shared or private tables) without turning every table into a C4 component.
  - Several writers to one table is the coupling worth flagging.
- Trade-off:
  - **Duplication.** A copy duplicates the shared fields. When the catalog changes, every copy shows drift until each project updates it.
  - **Tables are not boxes.** They do not show on component diagrams.
  - **Access needs a pair of elements.** Data access is recorded per relationship, so a service that reaches a database without a modelled relationship is not counted.
  - **Single project.** Without a hub there is no catalog; the Data page shows one project's data.
  - **No visible marker on the canvas** for a linked copy yet.

## DEC-056 — Integration credentials: kept by the server, outside git, write-only, optionally encrypted
- Date: 2026-11-15 · Status: Accepted (updates the backlog rule "integrations that need tokens wait": the store exists; nothing uses it yet) · Decided by: Owner [2026-11-15] ("add API keys storing": integration credentials for dp itself), [Proposal] (shape)
- Decision:
  - **Where.** Credentials (name, provider, scopes, a note, dates, the value) are kept in `<hub or project>/.dp/credentials.json`.
    - The file is written atomically with mode 0600, in a folder created with mode 0700, and `.dp/` is added to `.gitignore`.
    - The code routes never open dot folders (DEC-031).
  - **Encryption.** With `DP_SECRET_KEY` set, values are encrypted with AES-256-GCM.
    - The key is derived by scrypt from the variable and a fresh salt per value. The credential's name and provider are associated data, so a sealed value cannot be moved to another entry.
    - Without the variable, the file's permissions are the only protection, and the page says so.
    - A value sealed with another key shows as "locked".
  - **Write-only values.** The API lists names, providers, scopes, dates and a masked hint (the last four characters, for values of 12 or more), never the value. Only server code reads it (`get`, which stamps "last used").
  - **Who.** Architects only (new action `admin`, also used for adding projects); refused on a `--read-only` server.
  - **Interfaces.**
    - Routes: `GET/POST /api/credentials`, `PUT` (rotate), `PATCH` (provider, scopes, note) and `DELETE /api/credentials/:name`.
    - CLI: `dp credentials list|add|rotate|remove [folder]`, with values read from standard input, never from arguments.
- Why:
  - Credentials belong to the server and the hub, not to one person's machine; this mirrors `users.json`.
  - Write-only values and an opt-in key cover the local-first case without a keychain dependency.
- Trade-off:
  - Without `DP_SECRET_KEY` the values are plain text on disk (mode 0600).
  - A lost key makes sealed values unusable (by design).
  - The hint shows four characters.
  - There is no "test connection" (it would need network calls, and nothing uses the credentials yet).
  - No per-project credentials inside a hub.

## DEC-057 — In a hub, roles are per project, and catalog copies follow the catalog automatically
- Date: 2026-11-15 · Status: Accepted (amends DEC-054 and DEC-055) · Decided by: Owner [2026-11-15] ("project roles should be in a hub"; "every copy should update automatically once a user commits the changes", meaning once saved to the catalog), [Proposal] (shape)
- Decision:
  - **Roles per project.**
    - Each user keeps a role everywhere and may have another role in some projects: `projects: {"<id>": "<role>"}` in `<hub>/.dp/users.json`.
    - A project's app gives the request the user's role in that project, so every rule (drafts only for engineers, nothing for viewers) applies per project. The catalog is a project like the others.
    - Adding projects and managing credentials (`admin`) follow the role everywhere.
    - `dp users role NAME ROLE [--project ID]`; `default` with `--project` removes the project's own role.
    - A project role is read live, so a change applies on the next request. A change of the role everywhere still signs the user out.
    - `GET /api/hub` gives the user's role per project. The home page shows it on each card and in the rail.
  - **Catalog copies follow the catalog.**
    - As soon as a change is saved to the catalog's main model (an edit, an applied catalog draft, or files changed on disk), every project's linked copies take its name, description and technology.
    - It runs before each project request and after each catalog request, and is checked by the revisions of the catalog and the project, so nothing is done when nothing changed. A project with nothing to update is not written.
    - The copy is not an undo step of the project. An undo of the project's own edit is followed by the copy again, so a copy never stays behind.
    - A copy that cannot take the catalog's name (another element there has it) is left as it is and listed as drift, with "Update from catalog" once the clash is resolved.
    - Drafts get the change when they are applied, like any change on main.
    - Not on a read-only server.
    - The home page lists recent copies ("Catalog changes copied": element, fields, projects).
- Why:
  - The owner wants per-project access in one hub, and copies that never lag behind the shared definition.
  - Doing it in the hub, on save, needs no git hook and works outside a repository.
- Trade-off:
  - **Writes on a read.** A project's files can change on a request that only reads (its first request after a catalog change); the change shows as uncommitted in git, and in History.
  - **Memory.** The list of copies made is kept in memory and lost on restart; git history keeps the changes themselves.
  - **No role can hide a project:** there is no "no access" role. Amended by DEC-060, which adds one.
- Owner answer [2026-11-15, delegated: "do what you think is best"]: dp does **not** commit the copies it makes.
  - They show as "not committed yet" on the History page and in git, and are committed with the rest of the work, with the team's own tools and messages.
  - Why: a tool that commits on its own surprises people, can land on whatever branch is checked out, and would turn DEC-018's read-only git into read-write for one case.

## DEC-058 — History: what each commit changed in the models (git read-only)
- Date: 2026-11-15 · Status: Accepted (keeps DEC-018: git is only read) · Decided by: Owner [2026-11-15] ("have a Git for this project to understand changes"; a read-only history view), [Proposal] (shape)
- Decision:
  - **The page.** A History page (`#/history`, in the home page's rail) lists the commits that touched the model folders, newest first, for one project or across a hub.
  - **Each commit** shows its author, date and subject, and what it changed per project: added, changed and removed counts and up to 12 objects. Elements, relationships, flows, decisions and settings are compared with the commit's parent model.
  - **Opening a version.** "Open this version" shows the model at that commit compared with its parent, in the usual compare view.
  - **Uncommitted changes.** Above the list, each project's not-yet-committed changes (main model compared with HEAD) link to the compare view against HEAD.
  - **API.** `GET /api/history[?project=&limit=]`. Results per commit are cached (commits never change).
- Why:
  - It answers "what changed, when, by whom" in model terms rather than JSON lines.
  - It reuses the existing git reading and diff without dp ever writing to git.
- Trade-off:
  - The first load of a long history runs a model diff per commit (20 by default, 100 at most).
  - Commits that only change drafts or layout show as such.
  - Commits made outside the model folders are not listed.

## DEC-059 — First use of the credentials: linked work status from GitHub
- Date: 2026-11-15 · Status: Accepted (first use of DEC-056) · Decided by: Owner delegated [2026-11-15] ("keep it simple, go with whatever you think"), [Proposal]
- Decision:
  - **What it does.** "Refresh status from GitHub" under Linked work (`POST /api/work/refresh`, action `edit`) reads every work item of the shown version whose link is a GitHub issue or pull request, and asks api.github.com for its state.
    - A closed issue or a closed or merged pull request becomes "done".
    - An open one keeps "in-progress" or "blocked", and is otherwise "open"; a "done" one that is open again becomes "open".
  - **How.** It runs only on request, with at most 100 links, 4 at a time and 10 seconds each.
    - It uses the first stored credential with provider `github`; without one it reads public repositories only, at GitHub's lower rate.
    - The changes are one undo step; nothing is written when nothing changed.
    - The answer lists what changed and which links could not be read (not found, refused token, rate limit), never the token.
- Owner [2026-11-15]: on demand only. No schedule, no background polling.
- Why: linked work already holds GitHub links; keeping their status current is the smallest useful integration, it shows the credentials working end to end, and it needs no new model data.
- Trade-off:
  - It reaches out to the network (only to api.github.com, only when asked).
  - Statuses are a snapshot, not live.
  - GitHub Enterprise hosts and other trackers are not covered yet.

## DEC-060 — "No access" to a hub project
- Date: 2026-11-15 · Status: Accepted (amends DEC-057) · Decided by: Owner [2026-11-15] ("a role should have no access to an entire project too"), [Proposal] (shape)
- Decision:
  - **The role.** A user's role in one hub project can be `none`: `"projects": {"payments": "none"}` in `<hub>/.dp/users.json`, set with `dp users role NAME none HUB --project payments`.
  - **Refused.** Every request to that project is refused with 403, reading included and on a read-only server too: model, diagrams, drafts, comments, code, history.
  - **Hidden.** The project is left out of everything the hub shows that user: the project list and rail, the home page (cards, attention, decisions, catalog changes copied), the shared catalog usage (its copies, readers and writers), and History. A link to it opens the home page.
  - **What still shows.** The catalog's own definitions stay visible, since they are shared by design.
  - **Scope.** `none` exists only per project. A user's role everywhere stays architect, engineer or viewer, so a hub cannot have a signed-in user who sees nothing.
  - **Changes apply live**, on the next request.
- Why: the owner asked for it. Hiding rather than only refusing keeps a project's names, tables and decisions out of the other projects' views, where usage would otherwise reveal them.
- Trade-off:
  - **Sign-in off.** With sign-in off there are no users, so nothing is hidden; this is a sign-in feature.
  - **Not a security boundary for the files.** Someone with access to the hub folder or its git repository still sees every project.
  - **Architects too.** An architect everywhere can still be given `none` in a project; hub administration (adding projects, credentials) follows the role everywhere.
## DEC-061 — Default line shape per diagram, lanes, and Make room / Spread out
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (90° lines by default unless the path is straight; a per-diagram default; a way to make room in a crowded diagram)
- Decision:
  - **Default line shape.** Each diagram has a default line shape, stored as `layouts[<diagram>].lineShape` in the sidecar. When absent, the shape is rounded right angles, the owner's choice. It is set from the diagram details panel ("Line shape"). Choosing "Rounded right angles (default)" removes the key, so the diagram follows the default again. An explicit "rounded" from older files is still accepted. A value this version does not know (for example, one written by a newer version) is kept on disk and treated as the default. [Decided by the main session; the owner said "do whatever you think is best".] A line's own saved shape wins. The "Automatic" option of a line names the diagram default. A change shows in drafts and `dp diff` as a layout change.
  - **Lanes and labels.** Lines that run on the same coordinate through a gap are spread into lanes 10px apart (8px or 6px when tight). Lanes are ordered so the lines do not cross at the ends of the shared part. Line ends at boxes never move. A near-straight line whose two ends differ by under 12px is made straight by aligning the two ends. Labels also avoid lying on other lines: weight 8 for a line, against 10 for another label and 4 for a box.
  - **Make room and Spread out.** Two canvas actions, in the toolbar next to Auto-layout and in the empty-canvas right-click menu.
    - Make room adds space only where two boxes are closer than the base gap (50px) plus 12px for each line running between them, plus the size of any label there. When one box is inside the system boundary and the other is outside, the boundary padding is added too.
    - Spread out does the same and makes every gap about 20% larger.
    - Both stretch each axis without changing which box is left, right, above or below another. Boxes in one row or column stay lined up. Sizes do not change. The drawing's top-left corner stays put.
    - Each is one undo step. Make room on a diagram with nothing too close says so and saves nothing.
    - With two or more boxes selected, both act on the selected boxes only, spreading around the centre of the selection. Unselected boxes move only if a selected box would end up closer than the base gap, and then only as far as needed. With fewer than two boxes selected, both act on the whole diagram [Owner, 2026-11-15]. The labels say "(selected boxes)". Boxes hidden by a filter take part and keep their order. Boxes shown only in compare mode never move. Lines and labels of every shape (not only right angles) count in the room needed. Boxes almost on top of each other (centres within 8px) are separated along x.
    - Code: `ui/src/spread.ts`.
  - **Drag performance.** While a box is being dragged, only the lines touching it are re-routed. Lanes and label placement run once on release. This keeps large diagrams responsive.
- Why: the owner asked for 90° lines by default unless the path is straight, a per-diagram default, and a way to expand a crowded diagram, such as the Internet Banking System containers diagram, so that boxes which are too close get space naturally [Owner, 2026-11-15]. Stretching only where needed keeps the picture people already know. A full auto-layout would rearrange it.
- Trade-off: on the demo containers diagram, labels crossed by another line went from 19 to 11, not to 0. Some labels now sit up to about 400px along their line from its middle. Total line crossings rose slightly (21 → 23), because separating lines that lie on top of each other sometimes needs a crossing. Make room uses the routes and labels of the current drawing, so a second press right after can still find a little to do in rare cases. During a drag, lanes and labels update only on release. The sidecar gains one optional key.

## DEC-062 — Files are grouped by area with plain names
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("keep it easy for users to navigate around this project so straightforward names and combine files that can be combined"), [Proposal] (the layout)
- Decision:
  - **Backend.** `src/core/` keeps the model modules, with plain names: `project.ts` (was `store.ts`), `uiInspector.ts` (was `inspect.ts`), `codeFiles.ts` (was `codefs.ts`), `codeMap.ts` (was `code.ts`, with `functions.ts` folded in), `util.ts` (was `fsutil.ts` and `json.ts`), and `diff.ts` (with `compare.ts` folded in). The demo code moves to `src/demo/` (`demoApp.ts`, `demoHistory.ts`).
  - **Routes.** `src/server/routes/` has one module per area: `read.ts` (with history and backtracking), `drafts.ts`, `model.ts` (with flows, work status and catalog copies), `sidecar.ts`, `code.ts`, `decisions.ts`, `inspect.ts`, `comments.ts`, `hub.ts` (with credentials) and `ui.ts`.
  - **UI.** `ui/src/` is split into folders: `canvas/` (diagram drawing, line routing, the palette and the dock), `hooks/`, `panels/` (the right-hand property panels), `pages/` (home, catalog, credentials, history, decisions and sign-in), `drafts/` (the draft list, change list and apply dialog), `inspect/` (live UI inspector and backtracking), and `common/` (shared dialogs, icons and widgets). Files that stay at the root are `main.tsx`, `Root.tsx`, `App.tsx`, `api.ts`, `types.ts`, `storage.ts`, `menus.ts`, `actions.ts`, `overlays.ts`, and `styles/`.
  - **Rule going forward.** A new file goes in the folder for its area. A file under about 50 lines with one user is folded into that user. A file is named after the main thing it holds.
- Why: the flat `ui/src` had about 60 files, and several route modules were 10 to 40 lines long. A newcomer could not tell where to look for a feature.
- Trade-off: `git blame` and older review notes name the old paths. `git log --follow` follows the renames, and reviews are history, so they are not rewritten. Larger route files (`model.ts`, `hub.ts`, `read.ts`) now hold several areas each.

## DEC-063 — Owner answers to the open review questions (release 0.4.0)
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (answers written in `open-questions.md`; "go with your decision" or no note means the recommended answer, marked [Delegated])
- Decision:
  - **Network bind.** `dp serve` with a non-loopback `--host` refuses to start unless users exist, or `--read-only` or `--insecure` is given [Delegated]. Replaces the warning of DEC-030.
  - **Hidden code paths.** Mapping an object to a path with a segment that starts with a dot is refused when it is entered; a path a model already has still loads and `dp check` warns [Delegated]. Refines DEC-031.
  - **Own drafts.** With sign-in, an engineer changes and discards only drafts they started and reads all others; architects change any [Owner: "the second engineer should start another draft"]. Drafts made before sign-in, with no author, can be changed by architects only. Amends DEC-041.
  - **Accepted decisions stay editable** [Owner]. No lock is built (DEC-050 unchanged).
  - **Selection.** Ctrl/Cmd+click adds to the selection, as Shift+click does [Owner].
  - **Draft compare.** A draft can be compared with where it started or with main as it is now [Delegated].
  - **Demo.** The demo ships a sample draft [Delegated] and keeps its made-up git history, with no opt-out flag [Owner]. It already has tag groups.
  - **This repository's CI** runs `dp check --strict` on the demo [Delegated]. The test runner gets its major upgrade [Delegated].
  - **Apply dialog.** "Also write the planned code edits" starts unticked when the draft has a branch [Delegated].
  - **Version.** This release is 0.4.0, not 1.0.0: the owner wants to change more before 1.0.0 [Owner]. Earlier commit messages and review sections that say "1.0.0" mean the state before this release.
  - **Install.** From GitHub only; no npm publish for now [Owner]. So the built UI stays committed (closes the question on DEC-014).
  - **Kept as they are** [Delegated]: no framing in editor preview panes; decisions are written inside a draft by engineers; the fixed front matter grammar; an empty start with `--demo` for the sample; an empty system's context diagram is not listed in the sidebar; `git config user.name` as the author without sign-in; a 12-hour idle session; a lens is a default view and hides no data on the server (DEC-008); the Add palette starts collapsed at 1280 px; layout never conflicts in a draft; stored models are compared at git refs; planned code edits have no undo history of their own; the encryption key for credentials is optional; tables are a list; dialog wording.
  - **Left in the backlog** [Delegated]: rebase of a draft and a merge editor; a light theme; rating targets, one-off and per-environment cost, a Status tab; per-diagram hiding; a connector from the palette; backtracking from traces, explicit field lineage, a live trace collector; integrations from report files; trackers other than GitHub; GitLab CI as the first sample.
  - **Git process** [Delegated]: branch from `main` for each change; one pull request per change, no stacks; a change to the UI rebuilds `static/` in the same commit and a change to model or demo code regenerates `demo/` in the same commit; the owner merges; a release is a `vX.Y.Z` tag on `main` with a GitHub release.
  - **Security review findings fixed in this release** [Proposal, from an internal review]: hub project folders added in the browser must be inside the hub and not hidden, and `hub.json` entries are checked on load; project IDs cannot be built-in object keys; GitHub links are checked before the stored token is used; `comments.json` has a 10 MB cap.
- Why: the questions had collected in 17 review sections over many stages; answering them once lets the release go out with known behaviour.
- Trade-off: two engineers cannot share one draft. A network demo needs one more step (`dp users init` or `--insecure`). Hand-written `hub.json` entries may still point outside the hub folder (DEC-054), so that file must be trusted. A person who is architect on the catalog changes names and descriptions in the linked copies of projects where they have a lower role or none, because copies follow the catalog (DEC-057); this is accepted for now. Not checked for this release: Structurizr's own tools reading the files, Windows, and CI on GitHub (owner's steps).

## DEC-064 — What an import file cannot vouch for itself, and what the import and BMO code will not read or keep
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (confirmed; the extra review time is accepted as long as the review UI makes it clear), [Proposal] from a security review of the import and BMO code (the rules), [Proposal] (the `scope.include` rule, which the owner left to us)
- Decision:
  - **Review levels are computed from what a person typed, not from what the file says.** A `user` note verifies an item only when its words (at least 12 characters, letter case and spacing ignored) are found in the intake, in the feedback stored for that item or draft, or in the description a person typed for describe-to-model (the server keeps it next to the import file as `files/<draft>.source.txt`, outside the file the model wrote). A cited scan fact verifies only when it is about the item (its name or system is the item's name or ID, or its path is under one of the item's code paths). Anything else is a failed check, and the item stays unverified unless other evidence verifies it. The failed check quotes the note and says why it did not count (not found, too short, empty), and the review tells the reviewer what they can do.
  - **Links do not open what rules close.** The must-not-open globs, the scope, the deny-list and the hidden-path rule apply to where a symlink really points, in BMO's file selection and in the scan.
  - **Redaction.** One detection (`redactText`) is used before anything is sent, for the files next to a handoff, and to refuse an import file or a decision that holds a secret. Names of secrets are widened (`*_KEY`, `passphrase`, `pwd`, `credential`, `private`) with a list of plain keys that stay (`PRIMARY_KEY`, `partition_key`, a bare `key`). Every pattern is linear in the text; the PEM scan and the glob matcher no longer backtrack.
  - **Git.** `architecture/import/.gitignore` lists the handoff folder and the typed descriptions (`handoff-description.txt`, `files/*.source.txt`); the import files and reviews stay committable.
  - **Fail closed.** An import draft whose review file is missing or unreadable is not applied; "Check again" makes the review again with every item pending. With no accepted item nothing is applied, whatever else the draft changed. A code edit cannot be planned or saved under `architecture/` or `.dp/`.
  - **Who loosens limits.** An engineer may edit the intake and add to what is closed or lower a cap; only an architect removes or narrows an entry of `mustNotOpen` or `scope.exclude`, makes `scope.include` read more, or raises a size or file cap. An empty `scope.include` means the whole code root, so emptying it, or adding or changing an entry while it has entries, reads more; removing some entries while one stays, or giving the first entry to an empty list, reads less and is open to anyone who may edit the intake.
  - **A run is confirmed for its destination too.** The hash a run is confirmed with covers the provider, host and model as well as the prompt. The Ollama endpoint refuses link-local and cloud-metadata addresses, the reply is read with a size cap as a stream, and a reply in the wrong shape is not repeated.
  - **BMO settings in a hub** are read and written by the hub itself (no project header), by an architect of the hub.
- Why: a model's answer, a pasted file and a repository are all untrusted input; each of the rules above closed a way for them to make output look checked, to leave the machine, or to land in git.
- Trade-off: notes that only paraphrase the description come out unverified and need an explicit accept, which costs review time (the owner accepted this on condition that the review UI is clear). A name list for secrets over-masks some constants. A lost review loses its accept decisions. With the typed description git-ignored, "Verify again" on another clone cannot use it, so a note it verified there comes out unverified. Making every `scope.include` removal architect-only was not chosen: removing an entry while others stay only narrows what is read.

## DEC-065 — BMO: where it runs, who may run it, and how an import draft is applied
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (one round; JSON only; three direct providers; all the uses in the plan, seven tasks; apply accepted items and keep the rest; settings on the server outside git; any role may run BMO unless the settings restrict it, confirmed again on 2026-11-16 for viewers and text tasks; `via` as two relationships through the broker), [Proposal] (details; the size cut-off, which the owner left to us)
- Decision:
  - **Where BMO runs.** Off by default. Two backends: handoff (dp writes the prompt and files and calls no model) and direct (dp calls the Claude API, the OpenAI API or Ollama, with plain `fetch` and no SDK). The two cloud providers are pinned to their hosts; another address for them needs an explicit allow.
  - **Who may run it.** Any signed-in role may run BMO, viewers included, unless the settings' `allowedRoles` list restricts it (per project in a hub). Text tasks (explain, challenge, draft summary) need only that role. A task that makes a draft also needs the right to create one, so a viewer cannot run it.
  - **Settings.** `.dp/bmo.json` on the server (in a hub, the hub's own file), mode 0600, outside git, changed by architects only. It is not in the sidecar, so an engineer's draft cannot redirect the key or the code to another host.
  - **Preview and confirmation.** The server builds every prompt. A run needs the hash of the preview it follows, and the hash covers the provider, host and model as well as the prompt. Each direct run is logged in `.dp/bmo/runs/`.
  - **Size of a run.** The settings' `passBudgetTokens` caps the code digest (with the intake's budget: the lower one wins). A prompt larger than the budget plus room for the rest (half the budget, at least 32,000 tokens; `runTokenLimit` in `src/bmo/settings.ts`) is refused before anything is sent. At the default budget of 100,000 this is 150,000, the same as the first cut-off of 1.5 × the budget. Measured on 2026-11-16 (estimated tokens outside the digest): 3,000–10,000 for the demo, 21,000–30,000 with 300 more containers and 600 relationships.
  - **Import drafts.** Applying an import draft applies the accepted items and keeps the rest in the draft (partial apply, then a rebase of the draft onto main). An item that is not accepted is held back, and a draft whose review file is missing is not applied.
  - **`via` relationships.** A relationship through a broker is written as two relationships, source to broker and broker to target. The broker is an ordinary object.
  - **Not built.** The MCP backend, Structurizr DSL input, YAML and multi-pass summarising.
- Why: the owner asked for one round in which BMO covers the whole project, with the two kinds of backend and three direct providers named above, and with a team able to limit who runs it. Partial apply lets verified work reach the model without waiting for unverified items. Keeping the settings out of the sidecar and out of git means a draft cannot change where the code goes.
- Trade-off: partial apply adds merge code on the data path, where a bug could lose work; the fallback (block apply until every item is decided) is smaller but stalls verified items behind unverified ones. Settings are per machine or per hub and are not shared through git, so each person who wants direct runs sets them up again. Viewers can run text tasks, which cost money on direct runs, unless the settings restrict them. The fixed 32,000-token room lets a run with a small budget be larger than its budget; with a plain 1.5 × the budget, the demo's runs are refused under a budget of 6,000 to 20,000 (by task), because the fixed text and the model alone are larger than half of it. Each brokered connection carries two labels to write. Three small request shapes are ours to maintain, instead of vendor SDKs; a provider change breaks one shape, not a dependency. Redaction cannot catch a secret written as a plain word.

## DEC-066 — Repository layout: a short root, one demo folder, one tests folder, readable names
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("the only file in the root that is not in a folder is README.md"; merge the conduct, contributing and security files; delete NOTICE; demo and sample material in one folder; one tests folder with a spreadsheet of every test; readable names, source files included; keep package.json, package-lock.json, LICENSE and .gitignore at the root because the tools require them; a generated CSV for the test list), [Proposal] (details)
- Decision:
  - **Root.** Only `README.md`, `LICENSE`, `package.json`, `package-lock.json` and `.gitignore` stay at the root, with the folders. Tool settings move to `config/` (`tsconfig.base.json` plus a small `tsconfig.json` in `src/`, `tests/` and `scripts/`; `tsconfig.json` there for the one-pass typecheck; ESLint, Prettier, Vitest, Playwright). The npm scripts pass the paths; `.vscode/settings.json` points the editor extensions at them. `CHANGELOG.md` moves to `docs/`, `CLAUDE.md` to `.claude/`. The owner's own files (reference books, notes) live in the git-ignored `local/`.
  - **One policy file.** `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` and `SECURITY.md` become `docs/CONTRIBUTING.md` (contributing, code of conduct, reporting a security problem, security model).
  - **NOTICE removed; the credit kept.** The demo model's Apache-2.0 attribution moves to `demo/README.md` (Credits), with a pointer in `README.md`.
  - **One demo folder.** `demo/` holds the model, sample code, sample draft, demo hub, example import file, example CI jobs (`ci-examples/`, from `docs/examples/ci/`) and the guided tour (`README.md`, from `docs/demo-tour.md`).
  - **One tests folder.** `tests/unit/` (Vitest: logic, API, CLI; no browser) and `tests/browser/` (Playwright, from `e2e/`). They stay two folders because they need two runners. `tests/TESTS.csv`, generated by `scripts/list-tests.ts` from the test files, lists every test (one row per written test) with its purpose, the source files it covers, what it needs and the command to run it alone; CI fails when it is stale. Each test file starts with a one-line doc comment. `npm run test:e2e` is now `npm run test:browser`.
  - **Readable names.** The built UI is `static/assets/app.js`, `app.css` and `diagram-layout.js`, with no content hash; the server sends them with `Cache-Control: no-cache` and an `ETag` (304 when unchanged) instead of a year-long immutable cache. Unclear source files are renamed (for example `ops.ts` → `modelEdits.ts`, `units.ts` → `modelUnits.ts`, `sidecar.ts` → `designPerspectivesFile.ts`, `src/bmo/` → `src/assistant/`, `Dock.tsx` → `OverlayDock.tsx`, `canvasParts.tsx` → `BoxesAndLines.tsx`); `sectionEditors.tsx` and `valueEditors.tsx` are merged into `listEditors.tsx`. Product terms and on-disk names stay: BMO, `/api/bmo/*`, `.dp/bmo.json`, `designperspectives.json`.
- Why: the owner found the root and the file names hard to read, and wanted one place each for the demo and the tests, and a list of what each test checks.
- Trade-off: npm, git and GitHub only read their files at the root, so five files stay there. Tools run from `config/` need explicit paths, and an editor without the `.vscode` settings will not find the ESLint and Prettier settings. GitHub's Security tab no longer links a policy file (private vulnerability reporting still works; the issue template links the new section). Without content hashes the browser asks the server whether each asset changed on every load (cheap on a local server; one round trip per file). The renames touch most files once and make older commits and reviews name the old paths (DEC-062 and earlier reviews are left as written). The CSV has one row per written test, so a test in a loop is one row although it runs once per item.

## DEC-067 — A change by hand moves only what it touches
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("if the user manually moves things around it should modify only that object, don't automatically rearrange everything; only if the user manually requests it or selects a specific bunch to move around"), [Proposal] (how)
- Decision: after a change by hand (a box dragged or nudged, a line added, removed or changed, a label that changes size) the canvas plans again only the lines that changed or touch a box that moved (`updateLines` in `ui/src/canvas/lineLayout.ts`). Every other line keeps its ends, route and label exactly. Every line is planned together only when a diagram or another model version opens, and when a person asks for Auto-layout, or Make room or Spread out on the whole diagram. Make room and Spread out on a selection plan only the lines of the boxes they moved. A box dropped on top of another still goes to the nearest free spot; that moves only the dropped box.
- Why: before, the end of a drag planned every line again (ends, lanes, labels), so lines and labels far from the moved box jumped.
- Trade-off: the line plan is not saved. Opening the diagram again plans every line together, so lines can look different from the picture just before (the boxes are where they were). A line planned again keeps clear of the lines and labels that stay, but those are not moved to make room for it, so a crowded spot can get tighter until the person runs Make room or Auto-layout.

## DEC-068 — A diagram's cost is the cost of what it is about
- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] ("monthly costs should reflect the actual cost of what you are viewing now; it really should be $8690 for C2"), [Proposal] (the second row)
- Decision: a context, container or component diagram shows the monthly cost of its scope (the system or container, with everything inside it). Boxes drawn around it that carry a cost (external systems, neighbouring containers) are added up in a second row, "Outside this system" or "Outside this container". The landscape has no scope and adds up the boxes it shows. The Cost overlay uses the same figures (`ui/src/diagramCost.ts`).
- Why: adding up every box on a container diagram counted the neighbouring systems (for example the Mainframe at $9,500) as part of the system's own cost.
- Trade-off: the scope's figure includes objects the diagram does not draw (for example containers hidden by a lens), so it is not always the sum of the boxes seen. The second row keeps the rest visible.

## DEC-069 — The code level shows where a connection enters and leaves the code
- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] (show which file the input goes into and where the output comes out; both set by hand and guessed), [Proposal] (how)
- Decision: the C4 code diagram of an element also shows each relationship between the element and something outside it. The other end is a faded element box; the line runs from the file where the call leaves, or to the file where the input arrives. The file is set on the relationship (`dp.code.from` in the source's code, `dp.code.to` in the destination's code; "Files at the ends" in the relationship panel) and then drawn solid. Otherwise it is guessed from imports between the two elements' files (dashed). When neither is known the line ends at the element's own box (dotted). A file both elements map counts for a guess only when nothing else decides it.
- Why: the files behind a component were drawn alone, so a code diagram could not show how calls from other parts reach them. Plain `dp.*` properties need no new machinery in drafts, compare and merge.
- Trade-off: a guess can be wrong where components share files; guessed lines are marked so. The element's own box is used instead of the boundary because lines cannot end on a boundary. Each neighbour adds its files to the scan of the diagram.

## DEC-070 — Notes placed on a diagram
- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] ("add/attach comments in the UI to a diagram and move that comment around"), [Proposal] (how)
- Decision: a comment, idea or question about a diagram may carry `position: {x, y}` (canvas units, in `comments.json`). It is drawn on that diagram as a note in the colour of its kind, above the lines and outside the diagram's own objects, so layout, line routing and Make room never see it. Right-click on empty canvas: "Add note here…". Drag a note to move it, click it to open the thread. Anyone who may comment may move a note; moving keeps the author and the time. Resolved notes are hidden from the canvas, and notes are left out of image exports.
- Why: comments about a diagram had no place on it (left open in DEC-049), and a note is a remark about the model, not part of it (no undo step, no draft).
- Trade-off: a note does not follow a box that moves and is not re-targeted when dropped on one. After a new layout a note can point at the wrong place.

## DEC-071 — Lines can be shaped by hand, and near-straight lines are straight
- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] ("when a line is a few pixels from being straight it should auto-adjust straight"; "modify lines by selecting the line anywhere to adjust that specific part"), [Proposal] (how)
- Decision: a jog shorter than 12 px in a planned right-angle line is removed, by moving an inner piece or sliding an end along its box side; it is never removed by undoing a lane or cutting a box. Hand drags snap within 8 px, and straight lines within 2° of level. On a selected right-angle line any piece can be dragged sideways; on a straight line dragging anywhere adds a corner; on curved lines dragging anywhere moves the bend. The corners are saved as `points` on the line's layout (canvas units, at most 50). They win over the bend point and the planner; a change of line shape, "Reset line shape" and Auto-layout clear them. When both boxes of a line move together (or with Make room / Spread out) the corners move with them; when one box moves, that end re-attaches.
- Why: a line a few pixels off straight looked broken, and only the single bend grip could change a line's path.
- Trade-off: lines shaped by hand are not put into lanes or routed around boxes, and other lines do not route around them; only their ends are respected. Moving boxes saves positions and corners as two requests.

## DEC-072 — Changing several objects at once is one edit
- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] ("if I select multiple objects and edit, it should modify all of them"), [Proposal] (how)
- Decision: with two or more boxes selected the panel shows the fields every selected kind has (owner, symbol, technology, tag groups), with the shared value or "Mixed". A change applies to all of them through `POST /api/elements/update` (`{updates: [{id, patch}]}`), one undo step; an error on one element changes none. Technology chips on only some of the boxes are shown faded ("on 2 of 3"); a click adds them to all. The Incoming and Outgoing lists in the element panel can be edited the same way: description and technology in place, delete, and add a connection.
- Why: editing a selection one box at a time was slow and left several undo steps.
- Trade-off: a mixed selection (a person and a container) shows only the fields both have. Box colours are not in the multi-selection panel yet: styles are saved per object and would take several undo steps.

## DEC-073 — BMO chat: questions about named objects, every message previewed
- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] (an open chat where `[Name]` refers to an object; each message is previewed before it is sent), [Proposal] (how)
- Decision: a text task `ask` takes the question, up to 10 referenced object IDs, an optional diagram and lens, and up to 6 earlier turns as selectors. Typing `[` in the chat suggests objects by name; the one picked is kept by ID. The server builds the prompt: each referenced object's details for the lens, its parents, contents and relationships, and redacted code excerpts through the same file gate as the import digest (at most 24,000 tokens of code). Without a reference it sends the viewed diagram, or else a short overview. Earlier turns go in a data block marked as earlier conversation. Every message shows a short preview card and is sent with its hash, as DEC-064 requires. The answer is shown and not stored; the conversation lives only in the browser tab.
- Why: the owner wanted to ask questions about specific objects. Keeping "what was shown is what goes" means the chat adds no new way for text or files to leave unseen.
- Trade-off: one extra keypress per message. The earlier turns come from the client, so they can be altered; they carry the same trust as the question. The conversation is lost on reload, the code cap can leave out code that would help, and the chat has no handoff mode yet.

## DEC-074 — The live UI inspector and the demo web app are removed
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("instead of a side by side C4-UI (which can be removed)"; "remove all of it"; "we can remove the demo web app, since we don't have a UI viewer"), [Proposal] (what stays)
- Decision: the live UI inspector is gone: the full-screen page that framed a running app, its local proxy, the script it added to pages, `POST /api/ui-proxy`, `POST /api/inspect`, `--allow-ui-host`, and the frame exception in the Content-Security-Policy. The demo web app (`dp serve --demo` on port 4200) and `demo/web-app/` are gone with it. Kept: API endpoints on relationships (`dp.endpoints`, now matched by System Testing mode, DEC-075), the service name for trace files (`dp.otel.service`), the trace file reader and `GET /api/traces*` (DEC-046), sample data (DEC-043), backtracking (DEC-047) and the demo's made-up git history (DEC-048). The demo ships one made-up trace file (`demo/traces/sample.jsonl`), copied to `traces/` of a demo project.
- Supersedes DEC-044 and the web-app half of DEC-048. Amends DEC-046: dp no longer adds a `traceparent` header to anything.
- Why: the inspector only watched, saw only the calls a browser makes, and covered the diagram it was meant to explain. The owner wants testing on the diagrams themselves.
- Trade-off: the view of which click caused which call is lost. Nothing in the demo runs, so pausing a live call can only be tried against a system of your own. Facts: the files and routes named above were deleted. Interpretation: that the click view is not worth keeping beside the new mode.

## DEC-075 — System Testing mode: pause and change live calls on the diagram
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (a testing and debugging mode like a code editor's, on the architecture diagrams; change the data about to be sent to an object; intercept live traffic; an intercept point per line; keep traces as watched-only; flows and pipelines; on for local targets, architects and engineers), [Proposal] (everything else below)
- Decision: **Test** in the toolbar turns the mode on (`t=1` in the URL, main model only). Model editing is off while it is on.
  - **Intercept points.** dp opens a port on 127.0.0.1 that forwards to the address a relationship's destination runs at (DEC-076). A person sets the calling service's base URL to that port. A calling service has one base URL per target, so one point covers every relationship from that caller to that target address; each call is put down to the relationship whose endpoint (`dp.endpoints`) matches, and a call that matches none is flagged with an endpoint to add. Ports are remembered in `.dp/testing.json`, so a caller's setting stays valid; after a restart a person starts the saved points.
  - **Pausing.** A breakpoint on a line, an object, a flow step or a pipeline stage (with optional method, path and conditions on `body.<field>`, `header.<name>`, `query.<name>`, `status`) pauses a call at its request, its reply or both. **Pause next** and **Step** pause the next thing that happens. A paused request can be changed (method, path, headers, body), dropped, or answered by the person (status, body, delay) without reaching the target; a paused reply can be changed or dropped. A logged call can be sent again, changed.
  - **The run log** lists the newest 200 calls with status and time; watched fields are shown across calls; an observed body can be saved as the relationship's example.
  - **Traces.** A trace file picked in the mode is drawn on the diagram: its hops are marked on the lines as watched, hops the model lacks on the boxes.
  - **Flows and pipelines.** On a flow the player follows the paused call, and each step is marked live, watched or not live. A step can be stepped into: its pipeline opens, and a stage linked to an element with an address can have its own point. Other stages show their hand-written sample, labelled as not live.
- Security (facts):
  - A point forwards only to the address in the **main** model, never to one from a request or a draft. The address must be this machine unless its host was named with `--allow-target-host`; link-local and metadata addresses are always refused.
  - Points listen on 127.0.0.1 and answer only requests addressed to themselves (another name that resolves here gets 403). dp's session cookie is never forwarded.
  - New action `testing`: architects and engineers, on any version; refused for viewers and on a `--read-only` server. The GET routes check it themselves, so a viewer sees no live data. Every testing route refuses a browser that is not on this machine.
  - Real values stay in server memory. The browser gets secret-looking values as "•••" (field names of DEC-045, at every depth, plus `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` and the query). An edit that leaves "•••" in place keeps the real value; "•••" anywhere else is refused, so a hidden value cannot be moved into a field that is shown. Conditions and watches read the shown values.
  - Nothing of a call is written to disk. `.dp/testing.json` (mode 0600, outside git) holds ports, breakpoints, watches and the hold time only.
  - A paused call is released unchanged after 120 seconds (10 to 600), at most 20 calls are paused at once, and all are released when no testing page has asked for the state for 10 seconds or dp stops.
- Amends DEC-043 (samples stay hand-written; the mode shows live data beside them and writes one only on **Save as the example**), DEC-045 (masking is done on the server, at every depth, and masked values pass through unchanged unless edited), DEC-041 (the action `testing`), DEC-030 (more listeners on loopback; the frame exception is gone).
- Why: the owner wants to test and debug flows and pipelines where the architecture is drawn, with real data, and to change that data before an object receives it.
- Trade-off (facts unless marked):
  - dp can now change live requests. An edit, a reply written by hand or a resend has real effects in the target.
  - Points speak plain HTTP/1.1. A caller that needs HTTPS, HTTP/2 or gRPC to its target cannot go through one. A caller in a container cannot reach 127.0.0.1 on the host.
  - Bodies over 1 MB, compressed request bodies, event streams, WebSocket upgrades and browser preflight requests are passed through and cannot be paused. dp removes `Accept-Encoding` from forwarded requests so replies can be read.
  - A signed request fails at the target once it is edited. A call held longer than the caller's own timeout fails at the caller, and a caller that retries creates a second paused call.
  - A relationship used by two steps of one flow cannot be told apart, so a step breakpoint stops both.
  - Masking is by field name. A secret inside a plain-text body, or under a field name that does not look secret, is shown.
  - One session per project is shared by everyone who may test: the first release of a paused call wins (confirmed by the owner, 2026-11-16).
  - Not against a draft. In a hub each project has its own session and its own `.dp/testing.json`; the shared catalog has none (owner, 2026-11-16: "whatever you think is best").
  - Interpretation: that one port per (caller, target) is what "an intercept point per line" must mean where several lines share a base URL; that viewers should see traces but no live calls.
- Later: saved test cases with expected results and a `dp test` runner. `core/testing.ts` has no server imports and a logged call (`TestCallDetail`) is the shape such a case would save.

## DEC-076 — Where something runs: `dp.run.url`
- Date: 2026-11-16 · Status: Accepted · Decided by: [Proposal], within the owner's choice of an intercept point per line [2026-11-16]
- Decision: an element may carry the address it runs at (`dp.run.url`, "Address it runs at" in the Running system section; API field `runUrl`): http or https, a host and a port, no path. A relationship's target is the address of its destination, or of the nearest parent that has one, because endpoints sit on relationships into components and the address belongs to the container that hosts them. The older `dp.ui.url` is read when the new key is absent; saving the field writes the new key and removes the old one.
- Why: an intercept point needs to know where to forward. One address per running thing avoids repeating it on every line.
- Trade-off: the address is saved with the model, so it goes into git and is the same for everyone: use a local or test address. There is one address per element, with no per-environment or per-person value, and a service reached through two addresses (directly and through a gateway) cannot be described. Because the address is in the model, whoever may change the main model decides where a point forwards; the target check of DEC-075 bounds that.

## DEC-077 — The demo gets a small runnable system
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (asked whether a made-up trace is enough for the demo: "small runnable system as well"), [Proposal] (how)
- Decision: `dp serve --demo` starts five small services on 127.0.0.1, ports 4200 to 4204: the page of the web app, the API application, the payments service, and stand-ins for the mainframe and the fraud detection system. Every hop between them is a real HTTP call, and the demo model carries their addresses (`dp.run.url`) and endpoints, so System Testing mode can pause a real call between two services. Before each call a demo service asks dp whether an intercept point is open between it and its target and uses that port; otherwise it calls the target directly. The made-up trace file of DEC-074 stays.
- Amends DEC-074: the demo has something running again. The removed single-process demo web app, whose services were made up, does not come back.
- Why: without a running system the mode's main feature, pausing and changing a live call, could not be tried in the demo.
- Trade-off: the demo services follow open points by themselves, which a real system does not: there a person sets the caller's base URL to the port shown, and the tour says so. The services write no trace files, so a demo run is not drawn as a trace. Five fixed ports can clash with something else on the machine; dp then says so and runs without the demo system. The hop from the payment orchestrator to the mainframe is a message queue in the model and stays not live. More demo code to keep working. Facts: what starts and on which ports. Interpretation: that following points automatically is the right ease for a demo.

## DEC-078 — Only a missing diagram opens the landscape
- Date: 2026-11-16 · Status: Accepted · Decided by: [Proposal], in the interaction fixes the owner asked for [2026-11-16]
- Decision: when a diagram cannot be loaded, only the answer "not found" (404) means the diagram is gone. The landscape then takes its place, also in the browser history (the entry is replaced, not added), and a short notice says so. Any other failure (the server, the network) shows an error and leaves the view as it is.
- Why: every failure used to open the landscape without a word, and as a new history entry, so Back returned to the missing diagram and was sent forward again each time.
- Trade-off: the Back list no longer holds the address of a deleted diagram, so it cannot be reached again by Back after an undo brings it back; the sidebar still opens it. After a failure that is not "not found" the diagram on screen can be the one opened before, under the new address, until the next load works.

## DEC-079 — "Needs a look" is one rule, and a proposed decision is part of it
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner approved the plan [2026-11-16]; the rule itself is a [Proposal]
- Decision: a decision needs a look when `decisionFlags` reports anything for it: a review or a deadline that has come, a trigger that is met, a record that cannot be read, or the status "proposed". `decisionNeedsLook` in `src/shared/decisionAlerts.ts` is the one place for it; the top bar badge, the filter on the Decisions page and the list on its first screen all use it.
- Why: the three places counted differently (the filter counted proposed decisions, the badge and the list did not), so the same page could say "2" and show none.
- Trade-off: the top bar badge now also counts proposed decisions, so it is rarely empty in a project that discusses decisions; it says less about urgency than before. The home page's "needs a look" list is built by the server from the warning flags only and was not changed, so it can show fewer decisions than the badge.

## DEC-080 — A bell with what waits now and what was shown earlier
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("include notification symbol in the top right that has log warning/errors and relevant notifications"), [Proposal] (what it holds)
- Decision: a bell at the top right, in a project's top bar and on the hub pages. Its list has two parts. "Now" is computed from the state: load errors of the model, drafts that are behind the main model, and the number of decisions that need a look (DEC-079); each item opens what it names. "Earlier in this tab" is a log of the errors and notices the page showed, newest first, at most 50, with a count of the ones not seen yet. Successes are not logged. The log lives in memory (`ui/src/common/notify.tsx`), is the same list in a project and on the hub pages, and is gone when the tab is reloaded.
- Why: an error stays only until it is dismissed or replaced (there is one error slot) and a notice is gone in three seconds, so what went wrong could not be read again.
- Trade-off: nothing is stored or shared, so the bell says nothing about what happened before the reload, in another tab or to another person; a stored, per-user list would need a file and a rule for who sees what. The hub pages have no "Now" part: what waits there is already on the home page. The yellow dot for waiting items is shown only when nothing is new, so it can be missed behind a count.

## DEC-081 — New project asks before it uses a model that is already in the folder
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("You can give warning pop ups in this")
- Decision: `Hub.addProject` on a folder that already holds `architecture/workspace.json` throws `ExistingModel` unless it is called with `adopt`; the route answers 409 with `existing: true`, the folder and the name of the workspace found. The New project dialog then asks, and on yes sends the request again with `adopt: true`. The model is kept as it is (its own name included) and the chosen template is not used.
- Why: the folder's model used to become the project without a word, so "Blank model" could open a model with systems in it.
- Trade-off: one more question for the person who adds an existing folder on purpose. A script that relied on the silent take-over now gets 409 and must send `adopt: true`.

## DEC-082 — A new hub starts with the demo project
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("Include the demo as a project in all home screens when the user sets up the app"), [Proposal] (which setup and what it adds)
- Decision: `dp init --hub` and `dp serve --hub` on a folder with no hub create `hub.json` with two projects: the empty shared catalog and a project `demo` ("Demo bank"), a copy of the sample model with its sample code, decisions and made-up git history (as `dp init --demo` makes one). `dp init --hub --demo` still copies the demo hub (its two bank projects) unchanged.
- Why: a new hub's home screen was empty, so the first thing a person saw was nothing to open.
- Trade-off: a new hub holds a sample model the person must delete or leave alone (the project can be removed by hand from `hub.json`). A single-project `dp serve` has no project list, so it does not gain the demo; the demo is added only where a hub is created.

## DEC-083 — A diagram has colour of its own: lines by connection kind, a hue per pipeline, a tint per kind of box
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("add more colour and make the UI more appealing", "colour can represent data, like pipelines in different colours", "go with what you think is best"), [Proposal] (the rules below)
- Decision: besides overlays, a diagram is coloured by what the model already says, with nothing stored. (1) A line takes the colour of its connection kind (synchronous API, message, stream, data pipeline, batch, database connection, file transfer, cloud service); a line with no kind takes one from its technology when that names a well-known one (HTTPS, SQL, Redis, Kafka, MQ, SFTP). Kinds that are easy to confuse also have a pattern (dashes, dots). (2) A connection with stages is a pipeline and has its own hue, chosen from eight by a hash of the relationship ID; inside it, the line and the stages take that hue and the stages get stronger along the pipeline. (3) A summary line (derived from lower-level relationships) takes a colour only when every relationship behind it has the same kind, and stays dashed. (4) Boxes get a quiet tint of their kind (person, system, container, component). **Order of precedence:** a fill or line colour set by hand, then an overlay, then these. A legend (**Colour**, bottom left) lists what is on the diagram and holds the switch; the switch is kept in the browser (`dp.colour`) and turns all of it off.
- Why: the canvas was grey apart from overlays, so a diagram said nothing until someone chose an overlay, and the connection kind, the technology and the pipelines the model holds were not visible at all. Colour from the ID (not from how often a value occurs, as technology overlay colours are) keeps a pipeline's colour when others are added.
- Trade-off: a busier canvas by default (hence the switch). The kind taken from a technology is a guess made from words (a message queue that is described as "JSON over MQ" is a message, but an unusual product name gets no colour); it is used for colour only and is never written to the model. Eight pipeline hues repeat in a model with more pipelines on one diagram. The switch is per browser, not per diagram or per project, and the model's own colours (tag groups, characteristics) are not changed.

## DEC-084 — A checklist next to the model: starter lists, checks dp makes itself, and BMO's questions
- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("Create a checklist of things when importing a codebase or starting a project"; "a way to quickly check the checklist and CRUD processes on the checklist when you're modelling a diagram"), [Proposal] (shape, storage, roles, the rules, how answers reach BMO)
- Decision:
  - **Where it is kept.** `architecture/checklist.json`, next to the model and not part of it, like the comments (DEC-049): no undo step, not diffed or merged with drafts, one list per project whatever version is shown, committed with the model so a team shares it. Plain JSON in a fixed key order. Items: a task, a question or an assumption; a section; open, done or skipped; an optional answer or note (who and when); an optional target (element, relationship or diagram); where it came from (a person, a starter list, BMO).
  - **Starter lists.** Two lists ship with dp (`src/core/checklist.ts`): *Starting a project* (15 items, scope and people to the last label) and *Importing a codebase* (14 items, intake to unmapped files). An item both lists hold has one key, so adding both does not repeat it; adding a list again adds only what is missing.
  - **Checks dp makes itself.** A starter item can carry one of 16 rules (`src/core/checklistRules.ts`): people, containers per own system, descriptions, technology, labels ("Uses" or none), code paths, a decision, a flow, model problems, intake answered, code scanned, C1/C2/C3 final, unverified import items, unmapped files. The model rules read the version shown (a draft's change shows only in the draft); the import rules read `architecture/import/`. Such an item shows as done while its rule passes and open when it fails, with the count, a sentence and up to 50 failing IDs to step through. It cannot be ticked by hand, only skipped.
  - **Who changes it.** Architects and engineers, on any version (new action `checklist`); viewers and a `--read-only` server read it.
  - **BMO's questions.** An import puts the file's `questions` and `assumptions` on the checklist under "Questions from BMO", linked to the draft; a text already there (same words, ignoring case, spacing and a closing full stop) is not added again. A full checklist never fails an import.
  - **Answers go back.** An answer, correction or note typed on the checklist, and the text of an item a person added, is typed text for the import review: a `user` note that quotes it is found (extends DEC-064's list). The text of a BMO item never counts, even after a person edits it. Answers also go into BMO's next import turn as feedback, labelled with the item they answer, and stay after the draft that asked is applied or discarded. A confirmed assumption with no typed words and a skipped question ("don't know") are told to BMO, but are not evidence.
  - **While modelling.** A Checklist button with the open count in the top bar and the key L open a card docked over the canvas: filter (open, all, the selection), tick, skip, edit in place, answer, link to the selection, move to a section, delete, clear done items, and add with Enter. "Add to checklist…" on the right-click menu of a box, a line or the canvas adds an item about it. The bell lists open BMO questions; the Import code page offers the import list and says how many questions an import added.
- Why: the import already asked BMO for questions and assumptions, but dp dropped them, so a person never saw them; and the typed feedback that verifies notes lived in the review of one draft and was lost with it. A list beside the diagram, which ticks itself where the model can answer, turns "is the model done?" into something a person can see and work through.
- Trade-off: not versioned with drafts, so a draft cannot carry its own checklist and ticks have no undo (git history is the record). The rules are fixed and a person cannot override one except by skipping it. Matching BMO's questions by exact words keeps re-worded repeats; a person deletes them. A viewer who knows an answer has to comment instead. Confirming an assumption by a click does not verify notes: the words must be typed (the same rule as DEC-064), which costs typing. Storing it in the sidecar was not chosen: ticks would need edit rights and every draft would fork the list.
