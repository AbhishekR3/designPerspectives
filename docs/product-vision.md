# Product vision and the scope of 1.0.0

Status: owner's statement of 2026-11-19, recorded as DEC-090. This replaces the open "product vision" item in ideas list I2.0. Facts carry a source (a DEC, a file or a wave). [Owner] is the owner's own words or choice; [Proposal] is our interpretation.

## The vision [Owner, 2026-11-19]

Developers are moving away from hand-coding every function and file, because LLMs write more of the code. So software architects are needed more. But it is hard today to understand an existing system's architecture or codebase, and the decisions behind a design (ADRs and similar records). That is the opening for a new way to look at software development.

designPerspectives is for the **software architect**, and for the people who work with one during the software development life cycle (SDLC). It helps them see an existing system, design a new one, record why, and keep the picture true as the code changes.

## Scope of 1.0.0 [Owner]

- **Software architecture only.** Data architecture and infrastructure are planned for later, not for 1.0.0.
- Anything built or planned that falls outside software architecture is listed in [waves/v1-scope-review.md](waves/v1-scope-review.md), so the owner can review each item by hand and decide whether it goes in 1.0.0.

## Non-goal [Owner]

- **dp is not an IDE or a coding environment.** A person can open the relevant files to understand a component (the C3 level and the code level), but does not write code in the tool. Where this note and a planned feature disagree, the note wins: for example, debugging a running service in dp, as an editor's debugger does, is not a 1.0.0 goal.

## The twelve features of 1.0.0 [Owner]

Status as of 2026-11-19. "Built" means in `main`. A wave is a planned unit of work in [waves/README.md](waves/README.md).

| | Feature | Built today | Planned | Left open |
|---|---|---|---|---|
| A | **C4 architecture modelling** | Landscape, context, container, component and code levels; flows as dynamic views; a Structurizr workspace on disk (DEC-007, DEC-010) | Wave 4 (conditions on lines, A/B variants as flows) | Deployment diagrams are infrastructure (DEC-019, DEC-022); not in 1.0.0 unless the owner says so |
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

- Data architecture and infrastructure (see the review file).
- Waves 10 (risk storming) and 12 (runtime telemetry): the owner chose to push both to the ideas list (answer A7). They are not among the twelve features.
- Everything in the ideas list (the owner's private `local/ideas.md`) stays an idea until the owner moves it to [planned_features.md](planned_features.md).

## How this was decided

Questions and answers are in [waves/questions.md](waves/questions.md) (A1 and Part C). The release numbering (all releases inside 0.5.x until 1.0.0) is in [waves/README.md](waves/README.md#releases).
