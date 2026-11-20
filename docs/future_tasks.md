# Future tasks

Last updated: 2026-11-20, after release 0.5.0, the repository clean-up (DEC-066, DEC-067), linked work (DEC-085 to DEC-088) and the owner's list of 2026-11-17 (planned as waves in [waves/README.md](waves/README.md); the parked ideas are in section 2) and the product vision of 2026-11-19 ([product-vision.md](product-vision.md)).

This file is the short, ordered list of what is left to do. It is built from [backlog.md](backlog.md) (the full list, with sources and reasoning) and from the limits at the end of [planned-change.md](planned-change.md). It has two parts:

1. **Planned backlog**: work with a clear scope that is meant to be built soon.
2. **Ideas to think through**: work whose scope, shape or value is still open. None of it is scheduled.

Source markers are the same as in the backlog: **[Owner]** stated by the project owner · **[Proposal]** our interpretation, not yet confirmed · **[Review]** raised in a stage review · **[Notes]** from the book notes in `docs/notes/` · **[Training]** from model training data, not re-verified. Size is a rough guess [Proposal].

Nothing here is a promise. Items are re-ordered after owner feedback on each release.

**Product vision [Owner, 2026-11-19]: answered.** dp is for software architects. Version 1.0.0 is software architecture only (data architecture and infrastructure come later), has twelve features, and is not an IDE. See [product-vision.md](product-vision.md). What is built or planned outside that line is in [waves/v1-scope-review.md](waves/v1-scope-review.md), for the owner's review.

## 1. Planned backlog (to implement soon)

### 1.0 The owner's list of 2026-11-17, planned as waves

The owner's list of 22 things to build is planned as 14 waves, plus Waves 15 to 20 (guided import interview; images and files, architecture commits, drafts that keep up, lenses for roles, and the back-and-forth about an existing system, the last five from the vision), in [waves/](waves/README.md). Each wave has a brief for one agent and questions for the owner ([waves/questions.md](waves/questions.md)). The wave files stay until the owner deletes them before 1.0.0. Releases stay inside 0.5.x: 0.5.1 (Waves 1, 2, 3, 16, 4), 0.5.2 (5, 15, 6, 7, 8), 0.5.3 (9, 11, 17, 18, 19), 0.5.4 (13, 14, 20), then 1.0.0. Deployment diagrams (1.1) are infrastructure, so they are not scheduled before 1.0.0 unless the owner says so.

| Wave | What it builds | Size |
|---|---|---|
| 1 | Grounded BMO answers: fixed prompt templates, context packs, citations dp checks, labels (the evaluation set was deferred, see 2.0) | M–L |
| 2 | Notes, context and help: sticky notes stored in the model, BMO reads notes and comments, a Notes page, BMO without an LLM, `dp context`, help about dp | M–L |
| 3 | Reference notes (patterns, anti-patterns) and links on Decisions, including references to local files | M |
| 4 | Roles, data and variants: CRUD per modelled role, conditions, A/B variant flows | M |
| 5 | Code search, key code and one generic regex reader: find a name in the code with no LLM, a component's main files and functions, imports and definitions for the major languages from one pattern table (owner, 2026-11-20) | M–L |
| 6 | Findings and acknowledgements: one Finding shape, acknowledgements in the model, the existing warnings as findings. **Drift moved to 2.2 (owner, 2026-11-20)** | M |
| 7 | Model metrics: coupling, instability and cycles computed from the model; no code-based metrics | S–M |
| 8 | Rules and presets, and anti-patterns dp detects itself | L |
| 9 | Characteristics table: needed vs current, compared across drafts and decisions | M |
| 10 | Risk and risk storming. **Parked by the owner (2026-11-19, answer A7); see 2.3** | M |
| 11 | BMO reviews: the anti-pattern button, a check of decisions ("ADR broken or violated"), proposed ratings. Suggested risks wait for Wave 10 | M |
| 12 | Runtime: telemetry anti-patterns, runtime drift, A/B split. **Parked by the owner (2026-11-19, answer A7); see 2.7** | M |
| 13 | Contracts: tell consumers when a producer's output changes | M–L |
| 14 | Local runtimes and the word index: OpenAI-compatible local servers, GPU status, bounded settings, BM25 for choosing context (no embeddings) | M |
| 15 | Guided import interview: deterministic scan first, then "question x of y" cards the user approves or answers, then a draft | L |
| 16 | Images and files on notes, comments, decisions and diagrams: up to 10 MB each, anyone can attach, stored in the project or referenced on the user's own computer and opened in its default app; BMO gets a list and redacted text files | M–L |
| 17 | Architecture commits: a Commit button, `dp commit`, an opt-in commit when a draft is applied (amends DEC-018) | M |
| 18 | Drafts that keep up: rebase onto main, a merge editor, undo that restores the draft | M–L |
| 19 | Lenses for roles: DevOps, Security and Business | S–M |
| 20 | A real back-and-forth about an existing system: rounds planned from the system's size, more questions as it grows | L |
### 1.1 Order already decided by the owner

| # | Task | What it covers | Source | Size |
|---|---|---|---|---|
| 1 | **Deployment diagrams** (infrastructure: after 1.0.0 unless the owner says otherwise, scope review P1) | Structurizr's own deployment model: nested deployment nodes, infrastructure nodes and container instances, one environment per diagram. Diagrams are computed from container relationships, like the C4 diagrams. Needs per-node units in `modelUnits.ts` so drafts, `dp diff` and merge handle nodes (today a deployment node is kept whole as one unit), and `dp check` rules. Not built: the code only keeps deployment data it does not model. | [Owner, DEC-019, DEC-022] | Large |
| 2 | **Small batch** (no longer after 1: the vision puts deployment after 1.0.0) | Technology shown on connections (a toggle); owner inherited from the parent; descriptions on tag groups; an "appears in diagrams" list per object; CSV export of model objects (name, type, technology, owner, tags). Already done: the `?` help card lists every keyboard shortcut. | [Proposal, DEC-028] | Small each |
| 3 | **Static HTML export** (after 2) | `dp export html`: the built UI plus a snapshot of the model, opened without a server, publishable from CI. Needs a static data path in the UI. The export includes everything in the model (notes, costs, links), so it needs a review step before publishing. | [Owner, DEC-024, DEC-028] | Medium–large |

Later on the deployment track (not part of the first cut, DEC-022): software system instances, deployment groups, health checks, a side-by-side environment diff, cost per environment.

### 1.2 Planned-change workflow (from the limits in planned-change.md)

| Task | Why | Source | Size |
|---|---|---|---|
| **Rebase a draft onto the current main** and a merge editor for conflicts (feature C of the vision; planned in Wave 18) | Today a conflict is only reported when the draft is applied, and "main +N" is shown but cannot be resolved in place. A partial apply of an import draft already rebases what it keeps (DEC-065); the general case is not built. Also open in the sign-in notes. | [Review, stage-c, prod-p4] | Medium |
| **Undoing an apply also restores the draft** (planned in Wave 18) | Undo restores the model only, not the code files the apply wrote and not the deleted draft. | [Review, stage-c] | Small–medium |
| **Compare a draft's planned code edits with the code as it was when the draft started** | Today they are compared with the code folder as it is now, so a file changed since then is a conflict. | [planned-change.md limits] | Medium |
| **Deeper code check in the coding plan** | The plan sees files and Python/JS/TS relative imports only. Calls through HTTP, queues or dependency injection are checked by hand. The import scan (0.5.0) already reads more (manifests, compose, hostnames); feeding it into the plan check is not done. | [planned-change.md limits; Proposal] | Medium |
| **Compare a fresh scan with the model** using the same diff | Drift between modelled and coded structure. Re-scan keeps hand edits (the ledger); a diff view of "what the code now shows that the model lacks" is not built. → **Parked with architecture drift (2.2), owner 2026-11-20.** | [Review, stage-c] | Medium |

### 1.3 Finish the code import and BMO round (0.5.0)

Built in 0.5.0: `dp scan`, `dp import`, the import file (JSON, schema v1), review levels, the Import page, and BMO with handoff and direct backends (Claude API, OpenAI API, Ollama). What is left, from DEC-065:

| Task | Note | Source | Size |
|---|---|---|---|
| **Check the thresholds on real repositories** | The 300-file, 5-container and 2-pass rules, the depth-2 and 2-file rule for components, and 20 seconds per review item are guesses. No real LLM run has been made yet; prompt quality is for the owner to judge. | [Proposal, DEC-051; Owner to run] | — |
| **A per-level URL on the Import page** | So a level can be linked to or reloaded directly. | [Proposal, listed as not built in the backlog] | Small |
| **Scan languages beyond Python and JS/TS** (Java, Go, C#) | **Planned differently (owner, 2026-11-20): no code per language.** Wave 5 part C replaces the Python and JS/TS readers with one generic regex reader, a pattern table for the major languages, approximate and labelled; Java is covered that way. Reading `pom.xml` and Gradle files (build manifests) is not planned; say if you want it. | [Owner, 2026-11-17 (Java); 2026-11-20 (answer)] | — |
| **Multi-pass summarising for very large repositories** | A run over the token limit is refused today; the user narrows the scope instead. → Wave 20 plans rounds, each small enough to fit, with the person in the loop; a single-run whole-repository summary stays here. | [DEC-065] | Large |

### 1.4 Small, well-defined additions

| Task | What it covers | Source | Size |
|---|---|---|---|
| **Business, Security and DevOps lens presets** | The lens mechanism is built; only Engineer, Architect and Overview ship. The vision names a DevOps lens (feature D). → Planned in Wave 19 (DevOps, Security, Business). | [Owner, 2026-11-13; 2026-11-19] | Small |
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
- **Review the interview's standing questions** [Owner, 2026-11-20]. Wave 15 asks at least 6 questions per level and fills up from a fixed bank of at least 8 standing questions per level, worded in code. Check the wording, and that each question is one you would want asked of a codebase you do not know.
- **Review the starter reference entries** [Owner, 2026-11-19]. Wave 3 ships an opt-in set of about 10 anti-patterns and 5 patterns, in our own words, with book and page references. Edit, delete and add: check the wording is yours, the page references are right and the "signs to look for" are the ones you would use. Wave 8 and Wave 11 build on those entries.

## 2. Ideas to think through

None of these has an agreed scope. Each line says what is open.

### 2.0 Product direction (most important first)

| Idea | What is open | Source |
|---|---|---|
| **Product vision** | **Answered 2026-11-19**: [product-vision.md](product-vision.md), DEC-090. Software architects; software architecture only for 1.0.0; twelve features; not an IDE. Open now: the owner's decisions on [waves/v1-scope-review.md](waves/v1-scope-review.md) and Part C of the waves questions. | [Owner, 2026-11-19] |
| **Data architecture and infrastructure (after 1.0.0)** | Postponed by the vision. Built today and affected: the data catalog and access (DEC-055), pipelines and sample data (DEC-043, DEC-047), cost, System Testing and traces. Planned and affected: the data half of Wave 4, deployment diagrams, infrastructure-as-code import. Each is a row in the scope review for the owner to keep or move. | [Owner, 2026-11-19] |
| **A checklist for release 1.0.0** | What must be true before 1.0.0: the twelve features of the vision built, docs, a security review, the checks only the owner can run (1.5), installing on Windows, a real BMO run per supported provider (none has been made), and the back-and-forth with BMO about an existing system working on a real repository, with more questions as the code grows (Wave 20). It could be a third starter list in the in-app checklist (DEC-084). The owner also deletes the planning files in `docs/waves/` before 1.0.0. | [Owner, 2026-11-17; 2026-11-19] |
| **Is creating C4 from a codebase a job only an LLM can do?** | Facts (waves questions, 0.3): containers, technology, known external services, import lines and the code level come from files without an LLM. People, the system boundary, component boundaries and all names and labels need judgment, from a person or an LLM. Owner's answer [2026-11-18]: make all deterministic calls first, then ask the user, in a UI with "question x of y" (Wave 15). The skeleton import without BMO is that path. | [Owner, 2026-11-17] |
| **Testing and evaluating BMO** | **Deferred by the owner on 2026-11-19 (Q1.3): "I need to think through testing and evaluation much more deeply."** Wave 1 first planned an evaluation set; it is not built. What Wave 1 keeps is ordinary unit tests of dp's own code with canned answers. What is open: what "good" means for each task (a right C4 level, valid citations, no invented objects); fixtures with known right answers, written by hand (the demo and two small repositories were proposed); a scorer (precision and recall per C4 level for import tasks, the share of valid citations for text tasks); which parts CI can check without a model and which need real runs by the owner (`dp bmo eval --yes-send`, each costing money); which providers to compare; how to compare prompt versions as `id@version`; how to measure Wave 14's word index with and without it; and a real run per provider on the 1.0.0 checklist. Facts: no real LLM run has been made yet; the fake backend gives canned answers (`src/assistant/fakeBackend.ts`); no LLM is used in development or CI. | [Owner, 2026-11-19] |
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
| **Read contracts written in YAML** | Wave 13 reads OpenAPI and JSON Schema as JSON only, so a team exports its YAML spec to JSON in CI. Reading YAML directly needs a new runtime dependency (the server has three) or a reader written for the subset specs use. Open: whether your specs are YAML; whether AsyncAPI and protobuf come next. | [Owner, 2026-11-19; decided 2026-11-20] |
| **Import draw.io and Lucidchart diagrams** | A drawing has shapes and labels, not a model. Open: how shapes map to C4 kinds and lines to relationships; what happens to free drawing that maps to nothing; whether an import becomes a draft to review, as the import file does (DEC-051). | [Owner, 2026-11-17] |

### 2.2 Checks and lints computed from the model [Notes]

- A C4 diagram checklist as automated checks: title, legend, element name, type, technology and description, labelled directional relationships, no "uses", no mixed levels, unexplained acronyms. (`dp check` covers model problems and missing code paths. The checklist, DEC-084, checks descriptions, technology and lines with no label or "Uses" as items that tick themselves; the rest is not covered.)
- Container views that mention deployment terms; container without technology; edge without protocol; UI → database edge; a technology that combines runtimes that cannot share a process.
- Distributed-design warnings: many services on one database, many tiny services with high fan-out, cross-service transactions, business logic on a gateway. → Planned as rules and presets in Wave 8, with the C4 checklist checks above as the "C4 basics" preset.
- Brownfield metrics: afferent and efferent coupling, instability, cycles. → Planned in Wave 7, computed from the model (owner, 2026-11-20). Abstractness, distance from the main sequence, cyclomatic complexity and LCOM need function bodies, field use and type kinds that regexes read badly, so they are not built (revisit after Wave 5 part C); where a team already measures them, a report import is the language-neutral way (2.5). Coverage per component stays in 1.4.
- **Architecture drift detection** [Owner, 2026-11-17; **parked on 2026-11-20 for the owner's review**]. What was planned as Wave 6 before it was cut down to findings and acknowledgements:
  - **Compare** the model with a fresh scan of the working tree, or of a git ref, in both directions. Every check answers *found*, *not found* or *not checkable*, and says why.
  - **In the code, not in the model:** container candidates, known external services and hosts, component folders with no object, unmapped files.
  - **In the model, not in the code:** missing code paths, containers whose evidence (Dockerfile, compose service, manifest) is gone, components with no files. An external system with no evidence is *not checkable*, never "missing", because it may be called through a plain HTTP client.
  - **Lines:** an import between two components with no relationship is found in the code; a container-to-container line is found only when a config host points at the other one's service name, and is otherwise not checkable.
  - **Fixing:** "update the model from code" writes an ordinary import file from the findings the person picks and runs it through the existing checks, importer and review (DEC-051, DEC-064), so it ends in a draft.
  - **Surfaces:** `dp drift [--ref REF] [--fail-on new|any]`, a Drift page, an overlay, a home item, a CI example. It needs the Finding shape from [Wave 6](waves/wave-06-findings.md).
  - **What changed:** dp reads code with one generic regex reader (Wave 5 part C, DEC-096), so the import-based checks work for the major languages, approximately, and an "in the code, not in the model" line is a hint, not a fact. Also available: manifests, compose and Dockerfiles and known services against the model, code paths that no longer exist, and key code gone stale (Wave 5).
  - **Open:** whether a drift limited to those checks is worth building, or whether drift waits for another way of seeing connections, such as the person's answers in the interview or BMO's cited statements.
- **Data drift** [Owner, 2026-11-17]. Open: which kind is meant. It could be a schema that changes under its readers (Wave 13 covers contracts), values whose distribution changes over time (statistical drift, which needs data dp doesn't read), or data that moves somewhere the model doesn't show.

Open: which rules are right for most teams, which are warnings and which errors, and how a team switches one off without a way to hide real problems.

### 2.3 Guided design process [Notes]

- Characteristics → logical components → style → decisions, as gated stages: kata-format intake, a characteristics catalog, a cap of about seven driving characteristics, scoping to quanta, a style picker.
- Decision cards with weighted trade-off tables, ADR sections from the book, "deferred until a trigger" (decision records, DEC-050, already cover the kinds and triggers).
- Style and pattern catalogs; trade-off calculators (availability nines → downtime, payload and coupling estimates).
- Risk: an impact × likelihood matrix, an assessment grid, a risk-storming session mode with hidden scores. → A first cut was planned as Wave 10; the owner **parked it here** on 2026-11-19 (answer A7), and it is not among the twelve features of 1.0.0. [waves/wave-10-risk-storming.md](waves/wave-10-risk-storming.md) keeps the brief. Also open: tracking risk continuously, with direction arrows from measurements.
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
| **Drift detection** between modelled and coded structure | **Parked by the owner on 2026-11-20 (see 2.2).** | [Notes; Owner] |
| **Approval rules** (cost threshold, cross-team, security), a decision-rights matrix per role, signed approvals, encrypted files | Roles are fixed at three (DEC-041). What approvals mean without real-time collaboration is open. | [Notes] |
| **How system design reviews are done** | Who takes part; what is checked (the checklist, rules, risks, decisions); what comes out (decisions, risks, work); whether dp should run a review session the way Wave 10 runs risk storming. | [Owner, 2026-11-17] |
| **Code reviews and test coverage through the tool** | What a code review looks like in dp: a pull request's changes shown on the model, as `dp diff` shows model changes and the coding plan shows code. Which tests the team plans and has, and how tests cover each part of the system (coverage per object; see the Coverage overlay in 1.4). | [Owner, 2026-11-17] |
| **Where to put people** | Showing where effort and skills are needed. Examples: the mix of languages per part of the system ("most of this is Python, hire for it"; the language mix per object was dropped from Wave 5 on 2026-11-20 because dp no longer reads code by language), and where compliance-heavy parts cluster ("sensitive data here: work closely with the compliance team"). | [Owner, 2026-11-17] |

### 2.5 Integrations

Principle [Proposal]: read standard report files, map file paths to model objects, show results as overlays, and run `dp` in CI instead of building hosted apps. Integrations stay in the backlog; any tracker, GitHub first; GitHub CI first, GitLab CI as a later sample [Owner, DEC-063].

- Git hotspots: churn per mapped object as an overlay.
- SBOM and dependency vulnerabilities (CycloneDX or SPDX [Training]) on containers.
- Built (DEC-085): GitLab Code Quality JSON and SonarQube issues as linked work; live status from GitHub, GitLab, SonarQube and SonarCloud, and Jira (DEC-059, DEC-085). Not built: SonarQube coverage and other metrics, complexity per module. A metrics report import is also the language-neutral way to get complexity, cohesion and abstractness, which dp does not compute (Wave 7 measures the model only, 2026-11-20).
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
- **Anti-patterns from telemetry** [Owner, 2026-11-17]. A first cut was planned as Wave 12 (chatty and repeated calls, cycles and deep chains, from trace files, and the observed A/B split); the owner **parked it here** on 2026-11-19 (answer A7). Runtime is outside the software-architecture line of 1.0.0 (scope review P5). [waves/wave-12-runtime-telemetry.md](waves/wave-12-runtime-telemetry.md) keeps the brief. Also open: live collectors, logs and metrics as well as traces, and trends over time.

Open: how much of this is worth the code, since each needs a real running system to check against.

### 2.8 UI

| Idea | What is open | Source |
|---|---|---|
| **A UI redesign, drawn by hand** | The owner asks to look at the UI very closely and think of a redesign drawn by hand. Open: whether this means designing the new UI on paper first (hand-drawn wireframes, then building), or giving the app a hand-drawn look (sketch-style boxes and lines). Either way, it starts with what each screen is for, what people use most, and what can go. `docs/notes/ui-ux-research.md` holds earlier research. | [Owner, 2026-11-17] |
| **Rethink how UI work is designed in dp** | The owner's view: the backend is in good shape, but UI work needs its own design thinking. Open: whether the UI gets a separate section or page for visualising UI code while staying within C4. Open: whether to bring back a side-by-side view, where the UI is on the left and the right shows which C4 elements the user is touching (for example a frontend component in the web app, or the backend service it calls). Facts: `codeMap.ts` already maps components to code files, and `ui/src/` is a code path, so the mapping exists in principle; the side-by-side view and any UI-level mapping (screens, panels, actions) are not built. Proposal: map UI screens and actions to containers and components through the same code paths, so the view comes from the model, not from a hand-kept list. | [Owner, 2026-11-18] |

### 2.9 Broken connections, bugs and bottlenecks

| Idea | What is open | Source |
|---|---|---|
| **How far to show broken connections and design changes that cause bugs** | What is shown today: `dp check` (model problems, missing code paths), the coding plan's check against the code, the endpoint match in System Testing (a call that matches no relationship, or a relationship no call uses), and the unmapped-code warning. Proposal: (1) facts found without a model, always shown: a modelled connection with no code or observed call behind it; code or an observed call with no modelled connection; a failed call. (2) Changes shown with `dp diff` and the history, so a person sees what changed between two versions. (3) "This change caused that bug" is not shown as a fact: a diagram cannot prove causality. At most a suggested risk (from a rule or BMO), labelled as a guess for a person to check. Open: how many of these a person sees by default, and whether they go to the findings of Wave 6. | [Owner, 2026-11-18; Proposal] |
| **Bottlenecks before the system runs** | The model and code can show structural candidates, not bottlenecks: a container many others depend on (high fan-in), one instance under many callers, long synchronous chains, a database written to by many containers, high coupling (Wave 7 metrics). Whether a candidate is a real bottleneck depends on load, which the model does not hold, so predicting latency or throughput from the model is not reliable [Proposal]. Open: whether candidates are shown as "look here" items only. | [Owner, 2026-11-18; Proposal] |
| **Bottlenecks after the system runs (traces)** | Trace files carry a duration for each span (`src/core/traces.ts`), so dp could compute, without an LLM: latency per call, the critical path (the slowest chain of calls), and self time per container (time not spent waiting on another call). I found no critical-path or self-time analysis in the code; per-span durations exist. Open: which measures to show, and how to point at the slow call on the diagram. | [Owner, 2026-11-18; Proposal] |
| **Logs and metrics as bottleneck input** | Logs and metrics are not read today; only trace files are. A log needs its own parser and a time or trace-id key to join it to a call. Open: which log and metric formats to read first (OpenTelemetry is the obvious one), and whether they join to the model through the same endpoint match as traces. | [Owner, 2026-11-18; Proposal] |
| **BMO as the reader of bottleneck evidence** | A language model should not produce the numbers. It can read the figures dp computes and propose hypotheses (for example "the payment call waits on the fraud service"), each citing the figures it used; dp checks that the citations exist (Wave 1). Open: the token limit for a large trace set (a run over the limit is refused today); whether the answer goes to a findings list, since text answers are not stored today. | [Owner, 2026-11-18; Proposal] |

## Where the detail is

- [product-vision.md](product-vision.md): the vision and the twelve features of 1.0.0.
- [waves/README.md](waves/README.md): the owner's list of 2026-11-17 as waves, with a brief per wave and the questions for the owner. [waves/v1-scope-review.md](waves/v1-scope-review.md) lists what is outside software architecture.
- [backlog.md](backlog.md): the full backlog, with the design notes for the code import and BMO that were built in 0.5.0.
- [planned-change.md](planned-change.md): how the planned-change workflow works today, including its limits.
- [decisions.md](decisions.md): the decisions behind the items marked DEC-nnn.
- [reviews.md](reviews.md): the stage reviews that raised the [Review] items.