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
- Date: 2026-11-14 · Status: Accepted (open to revisit) · Decided by: assistant (decision, per `reviews/stage-a_review.md`)
- Decision: each diagram shows everything at its level, like `include *` (a container diagram shows all containers of the system plus what they connect to). Lower-level relationships appear on higher-level diagrams as dashed derived lines, which are not written to the file. Positions are stored at twice the UI size in Structurizr units.
- Why: a rename shows everywhere, and relationships are not duplicated in the file.
- Trade-off: an element cannot be hidden from one diagram (per-diagram hiding is in the backlog); in Structurizr, our views show only explicit relationships.

## DEC-011 — Active lens is remembered per browser
- Date: 2026-11-14 · Status: Accepted · Decided by: assistant (per `reviews/stage-a_review.md`)
- Decision: the active lens is stored in the browser (localStorage), not in the project files. Lens definitions stay in the sidecar.
- Why: switching lenses should not create git changes.
- Trade-off: the active lens does not follow the user to another browser.

## DEC-012 — All-TypeScript stack
- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (asked for the best language; "I know all languages"); supersedes the earlier Python-first plan
- Decision: one TypeScript stack: Node.js server (Hono), `dp` CLI (commander), React UI, and one shared API-types file (`src/shared/types.ts`).
- Why: removes hand-copied API types between server and UI, and keeps model rules reusable in the browser later. This reasoning is the assistant's assessment, not a measurement.
- Options rejected: Python backend with TypeScript UI (two languages, types copied by hand); Rust (Tauri) with TypeScript UI (full rewrite, slower iteration).
- Trade-off: Python import scanning uses a hand-written tokenizer instead of `ast` (a file with a syntax error still shows its imports); numbers are written as JavaScript writes them, so a project saved by 0.2 gets a one-time diff.
- Details: `reviews/rewrite-ts_review.md`.

## DEC-013 — Dark theme only, with overlays for characteristics and cost
- Date: 2026-11-14 · Status: Accepted (open question: light/dark switch) · Decided by: owner asked for a closer-to-reference layout and for cost and "-ility" information; specific design choices by the assistant
- Decision: dark theme only; per-object characteristic ratings (1–5, with a "driving" flag) and monthly cost lines; cost rolls up from contained objects; editable cost bands.
- Trade-off: exports have a dark background; ratings and cost live on objects only (not on relationships or flows).
- Details: `reviews/stage-a3_review.md`.

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
- Date: 2026-11-15 · Status: Proposal (built in Stage P3) · Decided by: [Proposal]
- Decision: each request gets a ticket, and the UI applies only the response to the newest one. A slower, older response is dropped. The state response carries a `version`. When the window regains focus, the UI checks it and reloads only if the model changed. There is no timer. The check waits while the user is typing or a dialog is open.
- Why: quick edits and drags could apply responses out of order, so a box jumped back. A focus check picks up git checkouts, other tabs and CLI edits without a push connection.
- Trade-off: there is no live push, so a change made elsewhere shows only when the window regains focus. A superseded response is dropped silently.

## DEC-040 — Drafts record an author and show how far main has moved
- Date: 2026-11-15 · Status: Proposal (built in Stage P3) · Decided by: [Proposal]
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
- Date: 2026-11-15 · Status: Proposal (built in Stage P5) · Decided by: [Proposal]
- Decision: the top area is two rows that wrap instead of one bar that scrolls. Crumbs truncate, middle first. The search box collapses to an icon. The draft strip and the role banner are one row that wraps, and Apply, Discard and Back to main always stay visible. Bars, the Add palette, the dock and the zoom buttons share measured insets. Fit-to-view fits the area they leave free. A side panel cannot shrink the canvas below 420 px. The right panel collapses to a rail, and it starts collapsed under 1100 px. The app is not supported below 760 px wide.
- Why: at 1024 px and 1280 px, the search and lens bar covered the breadcrumb, and the change counts stacked so the draft strip scrolled sideways. Fixed sizes and pure CSS placement could not keep the bars and the canvas clear of each other as panels opened and closed. Measuring the insets lets fit-to-view and the quick bar use the space that is really free.
- Trade-off: more layout code, and a measured attribute (the insets) that must be kept in step with the CSS. The diagram re-fits when the canvas resizes until the user pans or zooms, and it does not re-fit when only a dock panel opens. Below 760 px the canvas is shown with both panels collapsed, and nothing else is promised.

## DEC-043 — Sample data on relationships and connector stages
- Date: 2026-11-15 · Status: Proposal · Decided by: Owner [2026-11-15] (authored samples), [Proposal] (shape)
- Decision: a relationship has an optional sample payload and format (`dp.example`, `dp.format`). Each connector stage has the same two fields inside `dp.stages`, and a stage's sample is the data **leaving** that stage. Clicking a line shows the samples in order: what enters, then what each stage produces, then where it ends. When two neighbouring samples are JSON objects, the top-level fields the stage added, removed or changed are marked. A sample is at most 8,000 characters. Samples are written by people (or agents); the tool does not read data from running systems. A relationship with no sample shows the examples of flow steps that use it.
- Why: a pipeline's stage names say what happens; a sample shows it ("Mask PII" turning `email` into `user_ref`). Field marks make the change visible without reading two payloads side by side. Keeping samples in the workspace means they are versioned, diffed and reviewed like the rest of the model, and work offline.
- Trade-off: samples are only as current as the last edit; nothing checks that they match the real data. The field comparison only looks at top-level fields of JSON objects (or the first object of an array); CSV, SQL and nested changes show as plain text. Samples live in git, so the person writing one must remove real personal data; the 8,000-character cap keeps them short but does not check content. Flow step examples stay separate (`dp.stepData`), because one relationship can carry different data in different flows.

## DEC-044 — Live UI inspector: the running app framed through a local proxy, calls matched to endpoints on relationships
- Date: 2026-11-15 · Status: Proposal · Decided by: Owner [2026-11-15] (live embedded app), [Proposal] (shape)
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
- Date: 2026-11-15 · Status: Proposal · Decided by: Owner [2026-11-15] (read trace files), [Proposal] (shape)
- Decision: dp reads OpenTelemetry trace files in OTLP JSON (the Collector's file exporter format: one object per line, or a whole JSON file) from one folder (`dp serve --traces <folder>`, default `<project>/traces`), re-reading files when they change and keeping the newest 2,000 traces from the last 20 MB of each file. A span is matched to an element by, in order: the `dp.element` attribute; the file it ran in (`code.filepath` / `code.file.path`) against code paths, a file mapped to several elements going to the one that lists it first; its parent span's element when both run in the same service; `service.name` against the element's trace service name (`dp.otel.service`), ID or name. `peer.service` on a client or producer span names the element called. A change of element from parent to child span is a hop, matched to a relationship directly or between the elements' parents or children. Hops with no relationship and names no element matches are shown as differences between the running system and the model. The live UI inspector puts a W3C `traceparent` header on the app's own (same-origin) calls so it knows each call's trace ID. Routes: `GET /api/traces`, `GET /api/traces/:id?ui=<element>` (read-only, every role).
- Why: the model-only walk shows every way on from an element; a trace shows what one request did. Files keep dp local and offline (backlog principle in section 3): any service that can export OTLP JSON works, with no collector connection, accounts or tokens. Matching by code path reuses the code mapping, so a team that mapped its code needs no extra setup.
- Trade-off: traces are as fresh as the file; nothing is pushed. The `traceparent` header changes the app's requests, which a backend may already set or reject; cross-origin calls are not tagged (a new header would trigger a CORS preflight), so their traces are not found by ID. Matching by file assumes a component's first code path is its main file. A hop matched "between parents or children" names the first relationship found, which can be a sibling's. Large trace folders are read in full on change.

## DEC-047 — Backtracking from a step: data, code, functions and history
- Date: 2026-11-15 · Status: Proposal · Decided by: Owner [2026-11-15] (backtrack a step: where the data came from, how it changed, functions and processes around it, recent changes), [Proposal] (shape)
- Decision: from a connector stage (or the data entering it) or a flow step, `GET /api/backtrack` returns every step up to it. For each: the sample and format; the element that does it; its code (a stage: the implementing element's code paths; a flow step: the relationship's and the receiving element's); the functions in those files (found by pattern for TypeScript/JavaScript and Python); the last 15 commits that touched each file; whether the file has uncommitted edits; and the commits that changed this step in the model (the stage, the relationship, the element), found by comparing each commit of `workspace.json` with the one before. A step is "recent" when any of that falls in the window (7, 14 (default), 30 or 90 days) or is uncommitted. Functions whose lines changed since just before the oldest recent commit are marked. The UI follows one field through every step's sample (same name, ignoring case and `_`), saying where it appears and where it changes, and lists related field names.
- Why: to find where a problem at step 8 came from, a reader needs the data at each step, what code does each step, and what changed lately, in one place. Everything needed is already in the model (samples, stages, code mapping) and in git; nothing new has to be recorded.
- Trade-off: field following matches names only, so a renamed or computed field (amountMinor → amount) breaks the chain, though related names are listed. Function ranges are approximate (until the next function). Model history assumes linear history and reads at most 15 model commits; each read parses that commit's model (cached). History comes from git only; without a repository the view still shows data, files and functions.

## DEC-048 — The demo gets a made-up git history and a running web app
- Date: 2026-11-15 · Status: Proposal · Decided by: Owner [2026-11-15] ("include a demo for this as well"), [Proposal] (shape)
- Decision: `dp serve --demo` and `dp init --demo` turn a new demo folder into a git repository with four dated commits from `demo/history.json` (made by `npm run make-demo` from the shipped files: older versions are derived, so they cannot drift). The newest commit, two days before now, introduces the demo's bug (currency conversion rounds each amount). This is skipped when the folder is already inside a git repository or git is missing. `traces/` is ignored in that repository. `dp serve --demo` also runs a demo bank web app on 127.0.0.1:4200 (`src/server/demoApp.ts`, page in `demo/web-app/`): sign in, accounts, statements, payments, password reset and exchange rates over a made-up API, writing one OTLP trace per call to `traces/demo-app.jsonl`. The demo model's Single-Page Application points at it. The exchange-rates call reaches a provider the model lacks, and statements show the one-cent difference that backtracking explains.
- Why: backtracking needs recent history and the inspector needs a running app with traces; without them a new user cannot see either feature in the demo.
- Trade-off: the demo folder gets a `.git` folder and commits the user did not make (dates relative to the day the demo is created). Port 4200 may be taken; dp then says so and the rest works. The demo app's page is plain browser JavaScript and HTML (demo content, like the sample code), not TypeScript.

## DEC-049 — Comments, ideas and questions live in their own file, open to every role
- Date: 2026-11-15 · Status: Proposal · Decided by: Owner [2026-11-15] ("add comments, suggest ideas or ask questions in the diagrams"), [Proposal] (shape)
- Decision: a person can start a thread of one of three kinds (comment, idea, question) about an element, a relationship or a whole diagram, reply to it, and mark it resolved or reopen it. Threads are stored in `architecture/comments.json` (`core/comments.ts`), anchored by element ID, relationship ID or diagram key, in the order they were started, with a stable layout for `git diff`. They are not part of the Structurizr workspace or the sidecar, so they have no undo step, are not diffed, merged or copied by drafts, and do not change the model's version. The new action `comment` is allowed for all three roles on every model version (a viewer included), and refused only on a `--read-only` server. With sign-in the author is always the signed-in name; without it the sender may give a name, otherwise git's `user.name`, otherwise "Anonymous". Only the author or an architect can edit or delete a thread or reply; anyone who may comment can resolve or reopen. Text is at most 4,000 characters, 200 replies per thread and 5,000 threads per project. The server marks a thread `missing` when its target is not in the version shown (deleted, or only in another draft); the UI lists those apart. The UI shows a count pin on boxes and a count badge on lines with open threads, a Discussion block in each object's details panel, and, with nothing selected, a list of the diagram's own threads and those about what it shows, with filters and a jump to each. Routes: `GET/POST /api/comments`, `POST /api/comments/:id/replies`, `PATCH/DELETE /api/comments/:id`, `DELETE /api/comments/:id/replies/:rid`.
- Why: review talk is not part of the model: a viewer must be able to ask a question about a model they cannot change, an engineer must be able to comment on main without starting a draft, and a comment should not be undone with the next Ctrl+Z or lost when a draft is discarded. A separate file keeps `workspace.json` diffs about the architecture only, while still being versioned and shared through git.
- Amends: the working rule "new per-object data goes in `dp.*` properties" (CLAUDE.md): comments are the exception, for the reasons above.
- Trade-off: the file is plain data in git, so two people commenting on different branches get a normal merge, and a conflict is possible when both add at the end of the list. Anyone can read all comments; they are not hidden by lenses. Comments are anchored by ID: when an element is deleted its threads stay in the file and show as "not in this version" until someone deletes them. Moving an element keeps its ID, so threads follow it. A comment made while looking at a draft is shared with main, so a thread about a draft-only element is an orphan on main. Not real time: others' comments show on the next change or when the window regains focus. With sign-in off, anyone can delete anyone's comment (everyone acts as an architect), as with every other edit. Not built: mentions, notifications, free-floating pins at a position on the canvas, turning an idea into a draft, and comment counts in `dp check` or `dp diff`.

## DEC-050 — Decision records: one Markdown file per decision, part of the model
- Date: 2026-11-15 · Status: Proposal · Decided by: Owner [2026-11-15] ("a section to track decisions … we would have gone for Q, W, E if we had X, Y, Z, but we don't, so we went with A, B, C"; one Markdown file each), [Proposal] (format and shape)
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

## DEC-052 — Lines use right angles, go around boxes and spread out on each side of a box
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (straight lines that turn at right angles; separate lines into the same box)
- Decision: a line whose shape is "Automatic" (no saved shape) is now drawn with right angles and rounded corners instead of a straight diagonal (or a curve for a second line between the same two boxes). Lines are routed together for the whole diagram, not one at a time. Each end picks a side of its box: the side facing the other box, an L with one bend when the boxes are diagonal, or a straight line when they line up. All line ends on one side are spread along it, ordered by where the other end is, so they do not meet at one point or cross next to the box. Ends set by hand (dragged anchors) and a dragged bend point are kept; a dragged bend point is a point the line passes through. A label with no saved position sits on the middle of the line's longest segment, not on a corner. Automatic lines also go around other boxes. A route keeps 15px clearance from a box; where the gap is tight it uses 5px. If no way exists, the line keeps its old path. When a box blocks the sides a line would use, another pair of sides is chosen. For example, a line leaves from the right side and enters from the top instead of running down through two boxes. Labels are placed where they do not overlap other labels or boxes. Label sizes are estimated from the label text (`ui/src/labelSize.ts`). Routes are computed on every render, including during drags, and are not saved, so the model files and git diffs do not change. The code is a pure module, `ui/src/routing.ts`, with unit tests.
- Why: the owner asked for straight lines that turn at 90 degrees, and for lines into the same box to be separated instead of overlapping [Owner, 2026-11-15]. Spreading the ends is the cheapest fix with the largest effect. Computing all lines in one pass is what makes it possible.
- Trade-off: existing diagrams change look on next open. Lines with no saved shape become right-angled, and a saved bend point on such a line now places the middle segment instead of bending a curve. A saved shape (straight, curved, smooth) still wins, per line. Remaining: lines can still sit on top of each other in a shared gap; labels can still sit on neighbouring lines; straight, curved and smooth lines are not routed around boxes or used in label placement; side switching is skipped for lines with a hand-set end or bend point (their path is still routed around boxes). Moving a box can move the ends of other lines on the same side. Next steps are in the backlog.

## DEC-061 — Default line shape per diagram, lanes, and Make room / Spread out
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (90° lines by default unless the path is straight; a per-diagram default; a way to make room in a crowded diagram)
- Decision:
  - **Default line shape.** Each diagram has a default line shape, stored as `layouts[<diagram>].lineShape` in the sidecar. When absent, the shape is rounded right angles, the owner's choice. It is set from the diagram details panel ("Line shape"). A line's own saved shape wins. The "Automatic" option of a line names the diagram default. A change shows in drafts and `dp diff` as a layout change.
  - **Lanes and labels.** Lines that run on the same coordinate through a gap are spread into lanes 10px apart (8px or 6px when tight). Lanes are ordered so the lines do not cross at the ends of the shared part. Line ends at boxes never move. A near-straight line whose two ends differ by under 12px is made straight by aligning the two ends. Labels also avoid lying on other lines: weight 8 for a line, against 10 for another label and 4 for a box.
  - **Make room and Spread out.** Two canvas actions, in the toolbar next to Auto-layout and in the empty-canvas right-click menu.
    - Make room adds space only where two boxes are closer than the base gap (50px) plus 12px for each line running between them, plus the size of any label there. When one box is inside the system boundary and the other is outside, the boundary padding is added too.
    - Spread out does the same and makes every gap about 20% larger.
    - Both stretch each axis without changing which box is left, right, above or below another. Boxes in one row or column stay lined up. Sizes do not change. The drawing's top-left corner stays put.
    - Each is one undo step. Make room on a diagram with nothing too close says so and saves nothing.
    - Code: `ui/src/spread.ts`.
- Why: the owner asked for 90° lines by default unless the path is straight, a per-diagram default, and a way to expand a crowded diagram, such as the Internet Banking System containers diagram, so that boxes which are too close get space naturally [Owner, 2026-11-15]. Stretching only where needed keeps the picture people already know. A full auto-layout would rearrange it.
- Trade-off: on the demo containers diagram, labels crossed by another line went from 19 to 11, not to 0. Some labels now sit up to about 400px along their line from its middle. Total line crossings rose slightly (21 → 23), because separating lines that lie on top of each other sometimes needs a crossing. Make room uses the routes and labels of the current drawing, so a second press right after can still find a little to do in rare cases. Boxes with exactly the same centre cannot be separated. The sidecar gains one optional key.
