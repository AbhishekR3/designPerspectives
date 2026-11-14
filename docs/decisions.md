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
