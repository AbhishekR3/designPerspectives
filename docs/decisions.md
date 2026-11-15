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
