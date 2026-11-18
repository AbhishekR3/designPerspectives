# Future tasks

Last updated: 2026-11-17, after release 0.5.0, the repository clean-up (DEC-066, DEC-067), linked work (DEC-085 to DEC-088) and the owner's list of 2026-11-17 (planned as waves in [waves/README.md](waves/README.md); the parked ideas are in section 2).

This file is the short, ordered list of what is left to do. It is built from [backlog.md](backlog.md) (the full list, with sources and reasoning) and from the limits at the end of [planned-change.md](planned-change.md). It has two parts:

1. **Planned backlog**: work with a clear scope that is meant to be built soon.
2. **Ideas to think through**: work whose scope, shape or value is still open. None of it is scheduled.

Source markers are the same as in the backlog: **[Owner]** stated by the project owner · **[Proposal]** our interpretation, not yet confirmed · **[Review]** raised in a stage review · **[Notes]** from the book notes in `docs/notes/` · **[Training]** from model training data, not re-verified. Size is a rough guess [Proposal].

Nothing here is a promise. Items are re-ordered after owner feedback on each release.

**Most important open item [Owner, 2026-11-17]: the product vision.** What is this tool for, who is it for, and what does it leave out? See 2.0.

## 1. Planned backlog (to implement soon)

### 1.0 The owner's list of 2026-11-17, planned as waves

The owner's list of 22 things to build is planned as 14 waves in [waves/](waves/README.md). Each wave has a brief for one agent and questions for the owner ([waves/questions.md](waves/questions.md)). The wave files are removed as each wave ships. Where the waves go relative to 1.1 is open question ★A2 there.

| Wave | What it builds | Size |
|---|---|---|
| 1 | Grounded BMO answers: fixed prompt templates, context packs, citations dp checks, labels, an evaluation set | L |
| 2 | Notes, context and help: diagram notes, a Notes page, `dp context`, help about dp | M |
| 3 | Reference library (patterns, anti-patterns) and ADRs with links | M |
| 4 | Roles, data and variants: CRUD per modelled role, conditions, A/B variant flows | M |
| 5 | Code facts: language modules, Java, file roles (config, shared helpers), config facts | L |
| 6 | Drift and findings: model ↔ code drift, one Finding shape, acknowledgements | M–L |
| 7 | Metrics: coupling, instability, cycles, abstractness, distance; approximate complexity and LCOM | M |
| 8 | Rules and presets, and anti-patterns dp detects itself | L |
| 9 | Characteristics table: needed vs current, compared across drafts and decisions | M |
| 10 | Risk and risk storming | M |
| 11 | BMO reviews: the anti-pattern button, proposed ratings, suggested risks | M |
| 12 | Runtime: telemetry anti-patterns, runtime drift, A/B split | M |
| 13 | Contracts: tell consumers when a producer's output changes | M–L |
| 14 | Local runtimes and the word index: OpenAI-compatible local servers, GPU status, bounded settings, BM25 for choosing context (no embeddings) | M |
| 15 | Guided import interview: deterministic scan first, then "question x of y" cards the user approves or answers, then a draft | L |

### 1.1 Order already decided by the owner

| # | Task | What it covers | Source | Size |
|---|---|---|---|---|
| 1 | **Deployment diagrams** | Structurizr's own deployment model: nested deployment nodes, infrastructure nodes and container instances, one environment per diagram. Diagrams are computed from container relationships, like the C4 diagrams. Needs per-node units in `modelUnits.ts` so drafts, `dp diff` and merge handle nodes (today a deployment node is kept whole as one unit), and `dp check` rules. Not built: the code only keeps deployment data it does not model. | [Owner, DEC-019, DEC-022] | Large |
| 2 | **Small batch** (after 1) | Technology shown on connections (a toggle); owner inherited from the parent; descriptions on tag groups; an "appears in diagrams" list per object; CSV export of model objects (name, type, technology, owner, tags). Already done: the `?` help card lists every keyboard shortcut. | [Proposal, DEC-028] | Small each |
| 3 | **Static HTML export** (after 2) | `dp export html`: the built UI plus a snapshot of the model, opened without a server, publishable from CI. Needs a static data path in the UI. The export includes everything in the model (notes, costs, links), so it needs a review step before publishing. | [Owner, DEC-024, DEC-028] | Medium–large |

Later on the deployment track (not part of the first cut, DEC-022): software system instances, deployment groups, health checks, a side-by-side environment diff, cost per environment.

### 1.2 Planned-change workflow (from the limits in planned-change.md)

| Task | Why | Source | Size |
|---|---|---|---|
| **Rebase a draft onto the current main** and a merge editor for conflicts | Today a conflict is only reported when the draft is applied, and "main +N" is shown but cannot be resolved in place. A partial apply of an import draft already rebases what it keeps (DEC-065); the general case is not built. Also open in the sign-in notes. | [Review, stage-c, prod-p4] | Medium |
| **Undoing an apply also restores the draft** | Undo restores the model only, not the code files the apply wrote and not the deleted draft. | [Review, stage-c] | Small–medium |
| **Compare a draft's planned code edits with the code as it was when the draft started** | Today they are compared with the code folder as it is now, so a file changed since then is a conflict. | [planned-change.md limits] | Medium |
| **Deeper code check in the coding plan** | The plan sees files and Python/JS/TS relative imports only. Calls through HTTP, queues or dependency injection are checked by hand. The import scan (0.5.0) already reads more (manifests, compose, hostnames); feeding it into the plan check is not done. | [planned-change.md limits; Proposal] | Medium |
| **Compare a fresh scan with the model** using the same diff | Drift between modelled and coded structure. Re-scan keeps hand edits (the ledger); a diff view of "what the code now shows that the model lacks" is not built. → Planned in Wave 6 (drift and findings). | [Review, stage-c] | Medium |

### 1.3 Finish the code import and BMO round (0.5.0)

Built in 0.5.0: `dp scan`, `dp import`, the import file (JSON, schema v1), review levels, the Import page, and BMO with handoff and direct backends (Claude API, OpenAI API, Ollama). What is left, from DEC-065:

| Task | Note | Source | Size |
|---|---|---|---|
| **Check the thresholds on real repositories** | The 300-file, 5-container and 2-pass rules, the depth-2 and 2-file rule for components, and 20 seconds per review item are guesses. No real LLM run has been made yet; prompt quality is for the owner to judge. | [Proposal, DEC-051; Owner to run] | — |
| **A per-level URL on the Import page** | So a level can be linked to or reloaded directly. | [Proposal, listed as not built in the backlog] | Small |
| **Scan languages beyond Python and JS/TS** (Java, Go, C#) | Files in other languages are counted as "not analysable" and their imports are unknown. → Java and Kotlin imports planned in Wave 5; Go and C# after (waves question Q5.2). | [Proposal; Owner, 2026-11-17 (Java)] | Medium each |
| **Multi-pass summarising for very large repositories** | A run over the token limit is refused today; the user narrows the scope instead. | [DEC-065] | Large |

### 1.4 Small, well-defined additions

| Task | What it covers | Source | Size |
|---|---|---|---|
| **Business and Security lens presets** | The lens mechanism is built; only Engineer, Architect and Overview ship. | [Owner, 2026-11-13] | Small |
| **CODEOWNERS → owner proposals** | The scan already reads `CODEOWNERS` as evidence; turning it into proposed `owner` values on mapped objects is not done. | [Proposal] | Small |
| **SARIF import → linked work** (built, not yet released, DEC-085) | `dp work import <file> --format sarif` reads SARIF 2.1.0 (also GitLab Code Quality JSON, SonarQube issues and a dp JSON format). Findings go to the element whose code paths hold their file, and arrive as linked work, so the existing Work overlay shows them. A separate "Security findings" overlay with counts by severity is not built. | [Proposal] | — |
| **Coverage overlay** | Cobertura XML → percent per object, in bands. | [Proposal] | Small |
| **Line routing, stage 2** | Route straight, curved and smooth lines in the same pass; give ELK the label sizes; optional hops where lines cross; an itemised "Line shape" row in the change list; Make room / Spread out for selected boxes only. Stage 1, lanes, label avoidance (DEC-052, DEC-061) and "a change by hand moves only what it touches" (DEC-067) are done. | [Proposal, DEC-052, DEC-061] | Medium–large |
| **Light theme** | The app is dark only (`color-scheme: dark` in `ui/src/styles/tokens.css`). | [Review, prod-p5] | Medium |
| **Automated accessibility audit** | Labels, focus and keyboard reach were checked by hand and only partly by tests. | [Review, prod-p5] | Small–medium |
| **Characteristic rating targets**, one-off costs and cost per environment | So overlays can show gaps against a target. → Targets ("needed" stars) planned in Wave 9; costs stay here. | [Review, stage-a3; Owner, 2026-11-17 (targets)] | Medium |
| **Ratings on relationships and whole flows** | Today objects only. | [Review, stage-a3] | Medium |
| **Add a pipeline as a connector from the palette** by picking two ends | | [Review, release-0.2] | Small |
| **Per-diagram hiding of elements** | Today a diagram shows everything at its level. | [Review, stage-a] | Medium |

### 1.4a Left from the interaction fixes (2026-11-16)

| Task | What it covers | Source | Size |
|---|---|---|---|
| **Slow double-click on a selected box's name** | A second click after about 350 ms starts a rename where a double-click to open was meant. Not reproduced in a test (timing). | [Review] | Small |
| **Arrow keys in the Move dialog** | The list has `role="option"` rows but no arrow-key movement; Enter in the filter works. | [Review] | Small |
| **Hub pages while a deleted draft is open (single project)** | Catalog, history and credentials calls still carry the open draft's version; if that draft was deleted elsewhere they fail. Home and the project list no longer do. | [Review] | Small |
| **Home page "needs a look" and proposed decisions** | The server's list uses warning flags only; the top bar badge counts proposed decisions too (DEC-079). Align them once the owner has answered. | [Review] | Small |

### 1.5 Checks that only the owner can run

These are not code work; they are steps the release notes say were not run.

- Install from the GitHub URL (`npm install -g github:AbhishekR3/designPerspectives`).
- Run on Windows (the CLI's browser opening and path handling were written for it, not run).
- Open the written files in Structurizr's own tools (including the `dp.*` properties and the `dp.level` view property).
- Run the sample CI jobs in `demo/ci-examples/` in a real repository.
- Try BMO with a real model, handoff and direct, on a real repository, and judge the prompts.

## 2. Ideas to think through

None of these has an agreed scope. Each line says what is open.

### 2.0 Product direction (most important first)

| Idea | What is open | Source |
|---|---|---|
| **Product vision** | The owner calls this the most important open item: "What is this tool for? Who is it for? When developing a product, what do you think about? This can't be for everyone, it needs a product vision." Open: the users dp is for, the few jobs it must do well, what it will not do, and how success is seen. Several planned waves depend on the answer (waves question ★A1). | [Owner, 2026-11-17] |
| **A checklist for release 1.0.0** | What must be true before 1.0.0: features, docs, a security review, the checks only the owner can run (1.5), installing on Windows. It could be a third starter list in the in-app checklist (DEC-084). | [Owner, 2026-11-17] |
| **Is creating C4 from a codebase a job only an LLM can do?** | Facts (waves questions, 0.3): containers, technology, known external services, import lines and the code level come from files without an LLM. People, the system boundary, component boundaries and all names and labels need judgment, from a person or an LLM. Owner's answer [2026-11-18]: make all deterministic calls first, then ask the user, in a UI with "question x of y" (Wave 15). The skeleton import without BMO is that path. Wave 6 builds the mechanism for fixing drift. | [Owner, 2026-11-17] |
| **TOGAF** | The owner does not expect to need it ("I don't think so") but wants it kept for a later analysis. Open: whether any part of it fits dp (an architecture repository, building blocks, the phases of its development method), or whether it stays out of scope. | [Owner, 2026-11-17] |

### 2.1 Model and diagrams

| Idea | What is open | Source |
|---|---|---|
| **Groups** as a first-class object (layer, bounded context, subsystem, org unit) | Decided: groups are queryable, taggable and nest; one group per element, other dimensions as tags (DEC-021, DEC-025, DEC-027). Open: where they are stored (Structurizr's `group` is a plain string). | [Owner; Notes] |
| **Sketch (low-fidelity) mode**, "what-if" branches, semantic layers | Drafts cover part of what-if. How a sketch differs from a draft is not defined. | [Notes] |
| **Technology catalog with search and icons** | Today generic symbols, no product logos. Licensing of logos is unsettled. | [Review, stage-a3] |
| **Dynamic views** (sequence ↔ collaboration), **system landscape as home screen**, side-by-side environment diff | Flows already map to Structurizr dynamic views; what a sequence view adds is open. | [Notes] |
| **Export and import formats**: Mermaid, PlantUML, LikeC4, Structurizr DSL, DDD context maps, Backstage `catalog-info.yaml` | The import file is the main route for bringing a model in (DEC-051). A DSL parser must be written in TypeScript (the reference parser is Java). Which export is worth the upkeep is unknown. DSL, YAML and MCP input were not built in 0.5.0. | [Proposal; Training] |
| **Docs embedding** (MkDocs or Docusaurus plugin) | Static SVG export exists; a plugin depends on the static export (1.1, task 3). | [Proposal] |
| **Versions and history of a single object**, desktop packaging | History of commits exists (`#/history`); per-object history and a desktop wrapper are not shaped. | [Proposal] |
| **Import draw.io and Lucidchart diagrams** | A drawing has shapes and labels, not a model. Open: how shapes map to C4 kinds and lines to relationships; what happens to free drawing that maps to nothing; whether an import becomes a draft to review, as the import file does (DEC-051). | [Owner, 2026-11-17] |

### 2.2 Checks and lints computed from the model [Notes]

- A C4 diagram checklist as automated checks: title, legend, element name, type, technology and description, labelled directional relationships, no "uses", no mixed levels, unexplained acronyms. (`dp check` covers model problems and missing code paths. The checklist, DEC-084, checks descriptions, technology and lines with no label or "Uses" as items that tick themselves; the rest is not covered.)
- Container views that mention deployment terms; container without technology; edge without protocol; UI → database edge; a technology that combines runtimes that cannot share a process.
- Distributed-design warnings: many services on one database, many tiny services with high fan-out, cross-service transactions, business logic on a gateway. → Planned as rules and presets in Wave 8, with the C4 checklist checks above as the "C4 basics" preset.
- Brownfield metrics: afferent and efferent coupling, instability, abstractness, distance from the main sequence, cycles, cyclomatic complexity, coverage per component. → Planned in Wave 7 (coverage stays in 1.4).
- **Data drift** [Owner, 2026-11-17]. Open: which kind is meant. It could be a schema that changes under its readers (Wave 13 covers contracts), values whose distribution changes over time (statistical drift, which needs data dp doesn't read), or data that moves somewhere the model doesn't show.

Open: which rules are right for most teams, which are warnings and which errors, and how a team switches one off without a way to hide real problems.

### 2.3 Guided design process [Notes]

- Characteristics → logical components → style → decisions, as gated stages: kata-format intake, a characteristics catalog, a cap of about seven driving characteristics, scoping to quanta, a style picker.
- Decision cards with weighted trade-off tables, ADR sections from the book, "deferred until a trigger" (decision records, DEC-050, already cover the kinds and triggers).
- Style and pattern catalogs; trade-off calculators (availability nines → downtime, payload and coupling estimates).
- Risk: an impact × likelihood matrix, an assessment grid, a risk-storming session mode with hidden scores. → First cut planned in Wave 10 [Owner, 2026-11-17]. Still open after it: tracking risk continuously, with direction arrows from measurements.
- **Trade-offs that change over time** [Owner, 2026-11-17]. A trade-off is made in the moment, and the things it rests on change: cost, the team's skills, security, code complexity. Open: how to record a trade-off together with the conditions it depends on, and how to notice when they change. It would build on `dp.tradeoffs` per object and on decision triggers and review dates (DEC-050).
- **Qualities no diagram shows** [Owner, 2026-11-17]: extensibility, and architecture vitality (whether the structure is decaying; notes `fundamentals-of-software-architecture-richards-ford.md:24`). Open: what to measure (churn, the Wave 7 metrics over time) and where to show it.
- A final checklist before hand-off, and an optional learning mode. (The checklist, DEC-084, has two starter lists; a hand-off list would be a third, with its own rules.)

Open: whether this belongs in the tool at all, or in a guide; how much process to impose on teams that already have one.

### 2.4 Governance and hand-off

| Idea | What is open | Source |
|---|---|---|
| **Fitness-function generation** from model rules (layer access, cycles, dependency caps) for ArchUnit, NetArchTest, PyTestArch, TSArch, dependency-cruiser and import-linter | Which tools; how a generated rule stays in step with the model; a pass/fail overlay. | [Notes] |
| **Hand-off to coding agents**: task packages with constraints at the right granularity | `dp plan` and the BMO handoff cover part of this. What a package holds beyond the coding plan is undefined. | [Notes] |
| **MCP server** that reads the model and proposes edits as drafts, with diagram write tools | A third BMO backend (DEC-020). Needs an MCP-capable agent; validation feedback inside the loop. Meanwhile, `dp context` (Wave 2) prints the same context for any coding agent. | [Owner, DEC-020] |
| **Drift detection** between modelled and coded structure | Could use a content hash of the evidence. Overlaps with the scan-compare task in 1.2. → Planned in Wave 6 [Owner, 2026-11-17]. | [Notes; Proposal] |
| **Approval rules** (cost threshold, cross-team, security), a decision-rights matrix per role, signed approvals, encrypted files | Roles are fixed at three (DEC-041). What approvals mean without real-time collaboration is open. | [Notes] |
| **How system design reviews are done** | Who takes part; what is checked (the checklist, rules, risks, decisions); what comes out (decisions, risks, work); whether dp should run a review session the way Wave 10 runs risk storming. | [Owner, 2026-11-17] |
| **Code reviews and test coverage through the tool** | What a code review looks like in dp: a pull request's changes shown on the model, as `dp diff` shows model changes and the coding plan shows code. Which tests the team plans and has, and how tests cover each part of the system (coverage per object; see the Coverage overlay in 1.4). | [Owner, 2026-11-17] |
| **Where to put people** | Showing where effort and skills are needed. Examples: the mix of languages per part of the system ("most of this is Python, hire for it"; Wave 5 adds language mix per object), and where compliance-heavy parts cluster ("sensitive data here: work closely with the compliance team"). | [Owner, 2026-11-17] |

### 2.5 Integrations

Principle [Proposal]: read standard report files, map file paths to model objects, show results as overlays, and run `dp` in CI instead of building hosted apps. Integrations stay in the backlog; any tracker, GitHub first; GitHub CI first, GitLab CI as a later sample [Owner, DEC-063].

- Git hotspots: churn per mapped object as an overlay.
- SBOM and dependency vulnerabilities (CycloneDX or SPDX [Training]) on containers.
- Built (DEC-085): GitLab Code Quality JSON and SonarQube issues as linked work; live status from GitHub, GitLab, SonarQube and SonarCloud, and Jira (DEC-059, DEC-085). Not built: SonarQube coverage and other metrics, complexity per module.
- Built (DEC-087, DEC-088): an editable severity mapping, and work across projects on the hub pages.
- Open (DEC-085): create issues from a draft; webhooks and unattended pushes with API keys; GitHub security alerts (Dependabot, code scanning) as a source; a status refresh across every project from the hub's Work page.
- Infrastructure-as-code import (Terraform, compose, Kubernetes), isometric rendering, live cloud inventory. The scan already reads compose and Dockerfiles.

Open: tokens and network access, which the tool does not use today except for the optional status refresh of linked work (on request, GitHub, GitLab, SonarQube and Jira) and BMO direct calls.

### 2.6 Collaboration and permissions

| Idea | What is open | Source |
|---|---|---|
| **Real-time collaboration** | Deferred by the owner. Today the last write wins and the other person sees it on focus. | [Owner, 2026-11-14] |
| **Per-user undo** | Undo is per model version, so one architect can undo another's edit. | [Review, prod-p4] |
| **Two engineers on one draft** | Engineers change only their own drafts (DEC-063). Sharing needs a rule for who can apply. | [DEC-063] |
| **Custom roles** | Roles are Architect, Engineer, Viewer (DEC-041). | [Review, prod-p4] |
| **Server-side lens filtering** so a viewer never receives hidden sections | Kept as it is: a lens is a default view and hides no data (DEC-008, DEC-063). Would change that decision. | [Review, prod-p4] |
| **Narrow windows** (under 760 px) | Below that the app shows the canvas with both panels collapsed; nothing more is promised. | [Review, prod-p5] |

### 2.7 System Testing and live data [Review, live-data]

- Import a sample from a file in the code folder (JSON fixture, CSV row, recorded message); show its schema.
- Compare nested JSON fields, not only top-level ones, when marking what a stage changed; follow a field across renames (`amountMinor` → `amount`).
- Traces from a collector over the network (OTLP over HTTP), traces in the backtrack view, and trace files from other exporters (Jaeger, Zipkin).
- Suggest endpoints from route definitions in the API's mapped files.
- A secret-name list the project can edit, and masking by the model's sensitive items.
- **Next:** saved test cases with expected results, and a `dp test` runner for CI. Open: where a test gets the hidden values of a saved call from, and whether test cases belong to the model or sit beside it.
- After that: HTTPS, HTTP/2 and gRPC intercept points (HTTPS needs a decision on certificates first).
- A per-person address override outside git, so developers can run a service on different local ports.
- System Testing against a draft. Demo services that write trace files.
- Pausing message queues and other non-HTTP pipeline stages.
- **Debugging through dp compared with an editor's debugger (for example VS Code)** [Owner, 2026-11-17]. Open: what each is better at (calls between services, shown on the diagram, against stepping through one process); whether a paused call should link to the file and line in the editor; a proper test plan against a real running system.
- **Anti-patterns from telemetry** [Owner, 2026-11-17]. First cut planned in Wave 12: chatty and repeated calls, cycles and deep chains, from trace files. Open after it: live collectors, logs and metrics as well as traces, and trends over time.

Open: how much of this is worth the code, since each needs a real running system to check against.

### 2.8 UI

| Idea | What is open | Source |
|---|---|---|
| **A UI redesign, drawn by hand** | The owner asks to look at the UI very closely and think of a redesign drawn by hand. Open: whether this means designing the new UI on paper first (hand-drawn wireframes, then building), or giving the app a hand-drawn look (sketch-style boxes and lines). Either way, it starts with what each screen is for, what people use most, and what can go. `docs/notes/ui-ux-research.md` holds earlier research. | [Owner, 2026-11-17] |

## Where the detail is

- [waves/README.md](waves/README.md): the owner's list of 2026-11-17 as 14 waves, with a brief per wave and the questions for the owner.
- [backlog.md](backlog.md): the full backlog, with the design notes for the code import and BMO that were built in 0.5.0.
- [planned-change.md](planned-change.md): how the planned-change workflow works today, including its limits.
- [decisions.md](decisions.md): the decisions behind the items marked DEC-nnn.
- [reviews.md](reviews.md): the stage reviews that raised the [Review] items.