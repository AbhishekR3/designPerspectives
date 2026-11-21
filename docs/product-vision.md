# Product vision and the scope of 1.0.0

Status: owner's statement of 2026-11-19, recorded as DEC-090. This replaces the open "product vision" item in ideas list I2.0. Facts carry a source (a DEC, a file or a wave). [Owner] is the owner's own words or choice; [Proposal] is our interpretation.

## The vision [Owner, 2026-11-19]

Developers are moving away from hand-coding every function and file, because LLMs write more of the code. So software architects are needed more. But it is hard today to understand an existing system's architecture or codebase, and the decisions behind a design (ADRs and similar records). That is the opening for a new way to look at software development.

designPerspectives is for the **software architect**, and for the people who work with one during the software development life cycle (SDLC). It helps them see an existing system, design a new one, record why, and keep the picture true as the code changes.

## Scope of 1.0.0 [Owner]

- **Software architecture only.** Data architecture and infrastructure are planned for later, not for 1.0.0.
- Everything built or planned that falls outside software architecture was reviewed item by item and decided on 2026-11-20 (DEC-104). The result is in "The line, item by item" below.
- **The static HTML export is in 1.0.0** [Owner, 2026-11-20, DEC-100]. It is not a thirteenth feature: it is how a model reaches people who cannot run Node. Planned as [Wave 21](waves/wave-21-static-export.md), last before 1.0.0.
- **"Different accounts" (feature E) means local accounts in 1.0.0** [Owner, 2026-11-20, DEC-100]: users in the users file, with roles (DEC-041). Hosted, cloud accounts are planned for after 1.0.0 ([planned_features.md](planned_features.md) A6).

## Non-goal [Owner]

- **dp is not an IDE or a coding environment.** A person can open the relevant files to understand a component (the C3 level and the code level), but does not write code in the tool. Where this note and a planned feature disagree, the note wins: for example, debugging a running service in dp, as an editor's debugger does, is not a 1.0.0 goal.

## The twelve features of 1.0.0 [Owner]

Status as of 2026-11-19. "Built" means in `main`. A wave is a planned unit of work in [waves/README.md](waves/README.md).

| | Feature | Built today | Planned | Left open |
|---|---|---|---|---|
| A | **C4 architecture modelling** | Landscape, context, container, component and code levels; flows as dynamic views; a Structurizr workspace on disk (DEC-007, DEC-010) | Wave 4 (conditions on lines, A/B variants as flows) | Deployment diagrams are infrastructure (DEC-019, DEC-022); after 1.0.0 (DEC-104) |
| B | **Single source of truth model** | One workspace plus a sidecar; every diagram is computed from it (DEC-007, DEC-010); `dp.*` properties for anything Structurizr has no field for | Every wave keeps this rule | None |
| C | **Architecture change proposals** | Drafts, the change list, three-way merge apply, `dp diff`, the coding plan (DEC-016, DEC-032, DEC-040) | Wave 18 (rebase a draft, a merge editor, undo that restores the draft) | Comparing planned code edits with the code at the draft's start stays later ([planned_features.md](planned_features.md) B3) |
| D | **Architecture lenses** (architect, DevOps, other SDLC roles) | The lens mechanism and three lenses: Engineer, Architect, Overview (DEC-008, DEC-038) | Wave 19 (DevOps, Security and Business lenses) | Compliance and QA lenses stay ideas |
| E | **Collaboration and notes**: different accounts add notes, images and files to diagrams | Three sign-in roles, per-project roles in a hub (DEC-041, DEC-057); comments, ideas and questions on any object or diagram, open to every role, with sticky notes on a diagram (DEC-049, DEC-070); one `dp.notes` text per object | Wave 2 (sticky notes stored in the model and stuck to objects or diagrams, read by BMO; a Notes page; safe Markdown); Wave 3 (links in decisions, including a reference to a file on your own computer); **Wave 16 (images and files, up to 10 MB each, anyone can attach, stored in the project)** | No image or file can be attached to anything today |
| F | **Architect contracts between services** | `dp.endpoints` (a method and a path) and `dp.example` (a sample) only | Wave 13 (contracts, fingerprints, who consumes them, breaking changes, "needs a look") | The YAML dependency question (Q13.1) |
| G | **ADR page** | Decision records, one Markdown file per decision, with kinds, alternatives, triggers and review dates (DEC-050); the page is called "Decisions" | Wave 3 (the page keeps the name "Decisions"; links, Compliance section); Wave 16 (attachments) | None |
| H | **Codebase importing** | `dp scan`, the import file, review levels, the Import page, BMO import tasks (DEC-051, DEC-064, DEC-065); Python and JS/TS | Wave 5 (find a name in the code with no LLM, key code: a component's main files and functions, and one generic regex reader for the major languages); Wave 15 (guided interview); Wave 20 (a back-and-forth with BMO about the system) | Architecture drift is parked in ideas list I2.2 (owner, 2026-11-20). The Python and JS/TS readers are replaced by the generic reader (waves question Q5.8) |
| I | **Git-style commits for software architecture** | A History page: git commits with what each changed in the model (DEC-058). Git is read-only for dp today (DEC-018) | Wave 17 (a Commit button, `dp commit`, an opt-in commit when a draft is applied; amends DEC-018) | dp never pushes, amends or reverts |
| J | **External services linking** (GitHub, SonarQube, Jira) | Linked work pinned to any object, pushed from CI, status refreshed on request from GitHub, GitLab, SonarQube and Jira; a Work page per project and across projects (DEC-059, DEC-085 to DEC-088) | — | Create issues from a draft; GitHub security alerts as a source (ideas list I2.5) |
| K | **Share a catalog between projects** | A hub, a shared catalog, linked copies that follow the catalog (DEC-054, DEC-055, DEC-057) | Wave 3 (a hub-wide reference library) | A catalog badge on canvas boxes |
| L | **Architecture intelligence, the BMO agent** | BMO: handoff, Claude, OpenAI and Ollama backends; explain, ask, challenge, summarise, import tasks; every prompt previewed (DEC-064, DEC-065, DEC-073) | Wave 1 (grounded, cited answers); Wave 2 (help about dp, `dp context`); Wave 6 (findings and acknowledgements); Wave 7 (coupling and cycles from the model); Wave 8 (anti-pattern detectors, presets); Wave 9 (the "-ilities" table); Wave 11 (BMO reviews); Wave 14 (local runtimes, word index); Wave 20 (the back-and-forth) | "ADR broken or violated" is a `check-decisions` task in Wave 11 (a computed signal plus BMO). See [waves/wave-11-bmo-reviews.md](waves/wave-11-bmo-reviews.md) |

BMO's analysis list [Owner]: the "-ilities" (architecture characteristics), metrics, anti-pattern detection, explaining components, code and context, and a decision that is broken or violated. Where dp can compute an answer it does, and BMO's part is labelled (the determinism classes of Wave 1).

## What is not in 1.0.0 [Owner and Proposal]

- Data architecture and infrastructure, with the exceptions kept below (data access on a part of the system; cost).
- Deployment diagrams (infrastructure): after 1.0.0 (DEC-104). The deployment nodes in a Structurizr file are kept whole so the file round-trips.
- Waves 10 (risk storming) and 12 (runtime telemetry): the owner chose to push both to the ideas list (answer A7). They are not among the twelve features.
- Hosted (cloud) accounts: after 1.0.0 ([planned_features.md](planned_features.md) A6). 1.0.0 has local accounts.
- System Testing, observed traces and the demo system's five services: built, but **off by default** in 1.0.0 and called experimental (DEC-104, [planned_features.md](planned_features.md) A8). Nothing is deleted.
- Test coverage as an overlay (the `dp metrics` CSV stays), and the language mix per object ("where to put people"): later and dropped.
- Everything in the ideas list (the owner's private `local/ideas.md`) stays an idea until the owner moves it to [planned_features.md](planned_features.md).

## The line, item by item [Owner, 2026-11-20, DEC-104]

How the vision's line was applied. Sizes and reasons are in [decisions.md](decisions.md) (DEC-104); this is the short form.

**Built, and kept although they sit on or past the line**

| What | Decision | Why it stays |
|---|---|---|
| Data catalog and data access (DEC-055) | Keep, with the data half of Wave 4 | Wave 4's CRUD letters and role × data matrix edit this code. The exception to "software architecture only": data access is a property of a part of the system, not a data model |
| Data pipelines, connector stages, samples, backtracking (DEC-043, DEC-047) | Keep | Wave 13 (contracts) builds on the samples and stages; connector diagrams are computed with the other diagrams |
| Cost overlay (DEC-013, DEC-068) | Keep | In the book, cost is an architecture characteristic; Wave 9's table compares it; small and spread over five core files |
| Deployment data kept whole in a Structurizr file (DEC-019, DEC-022) | Keep as is | A file with deployment nodes must round-trip; there is no deployment diagram |
| Small batch (technology on connections, inherited owner, tag descriptions, "in diagrams" list, CSV export) | Keep | Plain software architecture; no longer waits for deployment diagrams |
| Wave 14, local runtimes and the word index | Keep | Lets BMO work with no cloud call |

**Built, and hidden by default (not deleted)**

| What | Decision |
|---|---|
| System Testing mode (DEC-075, DEC-076), observed traces (DEC-045, DEC-046) | Off unless `dp serve --testing` (or a setting) turns it on; its tests stay in CI; the docs call it experimental. It sits against the non-goal above and is the only listener that forwards live traffic |
| The demo system (DEC-077) | `dp serve --demo` starts its services only with `--with-system` |

**Settled by other answers:** the static export is in (D1, DEC-100); local accounts now, hosted later (D2); credentials always encrypted (D6, DEC-101); opening a local file in the default app is in, as part of Wave 16 (D5, DEC-095).

**Checked and on the line, so no decision was needed:** the scan reading Dockerfiles, compose files, Kubernetes manifests and package manifests (evidence for containers and technology: feature H); linked work (a tool connection: feature J); the checklist (DEC-084: guides starting and importing a project); hubs and the shared catalog of elements (feature K); `dp context` and the help about dp (how BMO and coding agents learn the model: feature L); the per-object `dp.usage`, `dp.sensitive`, `dp.tradeoffs` and `dp.characteristics` (trade-offs and the "-ilities" are in the book; a sensitive-data marker says that a part handles sensitive data, a security characteristic of a part, which Wave 19's Security lens reads); the code level, the coding plan and flows as dynamic views (features A and C). Every wave except 10, 12 and 21 maps to one of the twelve features ([waves/README.md](waves/README.md#where-each-item-went)); Wave 4 stays for both its halves, and Wave 21 supports features B and E.

**Outside the line and left as ideas** (all in `local/ideas.md`): infrastructure-as-code import, isometric rendering and a live cloud inventory (I2.5; the scan's compose and Dockerfile reading stays); SBOM and dependency vulnerabilities (I2.5); data drift (I2.2); logs and metrics as bottleneck input (I2.9); debugging through dp compared with an editor's debugger, saved System Testing cases, `dp test`, HTTPS and gRPC intercept points (I2.7); code reviews and test coverage through the tool (I2.4); TOGAF (I2.0); where to put people and compliance clusters (I2.4); fitness-function generation for ArchUnit, NetArchTest and similar (I2.4, on the edge: it generates code for another tool); importing draw.io and Lucidchart diagrams (I2.1, software architecture but not among the twelve features).

## How this was decided

The vision was asked as question A1 in the owner's question file (now deleted); the question, the analysis and the owner's answer are below. The release numbering (`0.X.Y` releases, with no ceiling on X, until 1.0.0; DEC-098) is in [waves/README.md](waves/README.md#releases). The other cross-cutting answers (order, determinism classes, releases, agent models) are in [waves/README.md](waves/README.md#cross-cutting-questions-and-answers-moved-from-questionsmd).

### A1. Should the product vision come first? (the analysis behind this file)

**Why it matters.** You marked the product vision "MOST IMPORTANT" and put it in the think-later list. Some waves only pay off for some kinds of user.

**Analysis** [Proposal]

The list pulls toward at least four products:
- **A modelling and decision tool for architects:** notes, ADRs, the reference library, characteristics, risk (Waves 2, 3, 9, 10).
- **A model-and-code consistency checker for tech leads, run in CI:** code facts, drift, metrics, rules (Waves 5 to 8).
- **An assistant that explains and reviews:** BMO (Waves 1, 11, 14).
- **A runtime companion:** System Testing, telemetry, contracts (Waves 12, 13).

Waves 1 to 6 help all four. Waves 12 to 14 depend on the vision most.

One candidate sentence: "dp is a modelling tool with deterministic checks; data dp doesn't own (complexity, coverage, runtime) arrives as report files." The backlog's project direction already says "Target own system first" [Owner] (the old `docs/backlog.md`, deleted 2026-11-20).

**Recommended.** Write a one-page vision before Wave 7: who it's for, the three jobs it must do well, what it won't do, and how you'll know it works. Waves 1 to 6 go ahead meanwhile. Claude can give you a template of questions to fill in.

**Owner's thinking:** As developers move away from hand-coding each function and file, because LLMs write more of it, software architects are needed more. But understanding an existing system, its codebase, and the decisions behind a design (ADRs and similar) is hard. That is the opening. Version 1.0.0 is for software architecture only; data architecture and infrastructure come later. Twelve features (A to L): C4 modelling; a single source of truth; architecture change proposals; lenses (architect, DevOps, other SDLC members); collaboration and notes with different accounts adding notes, images and files; contracts between services; an ADR page; codebase importing; git-style commits for architecture; links to GitHub, SonarQube and Jira; a catalog shared between projects; and BMO, the architecture-intelligence agent (the "-ilities", metrics, anti-pattern detection, explaining components, code and context, and ADRs that are broken or violated). Call out anything planned or built outside software architecture in a .md file for manual review. Non-goal: this is not an IDE.

**Applied [2026-11-19].**
- The vision is written up in [../product-vision.md](product-vision.md), with the twelve features checked against what is built and planned. It is recorded as DEC-090.
- Everything built or planned outside software architecture was listed item by item for your decision, and decided on 2026-11-20 (DEC-104; the list, `v1-scope-review.md`, is deleted and its content is in DEC-104 and [../product-vision.md](product-vision.md)).
- Gaps the twelve features exposed: **E** (images and files: new [Wave 16](waves/wave-16-attachments.md)); **L** ("ADR broken or violated": added to [Wave 11](waves/wave-11-bmo-reviews.md)); **D** (a DevOps lens), **C** (rebase and merge editor) and **I** (git-style commits) are in no wave. They are Part C questions.
- The earlier recommendation, "write a vision before Wave 7", is done.
