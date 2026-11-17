# Future plans and backlog

Last updated: 2026-11-16. Current version: 0.5.0 (see `CHANGELOG.md`, which also lists unreleased changes). Latest review: `reviews.md`.

This file collects work that is not built yet, with sources and reasoning. For the short list in order (what to build soon, and what needs more thought), see [future_tasks.md](future_tasks.md). Nothing here is scheduled or rejected; items are revisited after feedback on the current stage.

Source markers: **[Owner]** stated by the project owner (date given) · **[Review]** raised in a file under `docs/reviews/` · **[Notes]** from `docs/notes/` (the two book notes; the `→ designPerspectives` lines there are interpretation, not the authors') · **[Proposal]** an interpretation or recommendation, not sourced · **[Training]** from model training data, not re-verified.

## 1. Project direction (stable decisions)

| Decision | Source | Trade-off |
|---|---|---|
| Local web app started by one command; sign-in is optional (users and three roles, DEC-041); no hosted server | [Owner, 2026-11-13]; sign-in built in 1.0 work, kept in 0.4.0 | No desktop app yet; the UI could later be wrapped or published as a static demo |
| Native model file is a Structurizr workspace JSON, plus one sidecar file (`designperspectives.json`) for data Structurizr has no field for | Owner delegated the choice; format chosen as [Proposal] | One large file per workspace (more merge conflicts); numeric Structurizr IDs replaced by readable slugs here |
| Engineer is the default lens; more lenses are user-made; Business and Security presets are in the backlog | [Owner, 2026-11-13] "Engineer first starting lense" | Lens mechanism is built; presets are not |
| MIT licence, collaboration through git and optional sign-in, LLM off by default | [Owner, 2026-11-11]; sign-in added later (DEC-041) | No real-time co-editing |
| All-TypeScript stack (Node server, `dp` CLI, React UI, shared API types) | [Owner, 2026-11-14]; reasoning in `reviews.md` | Python import scanning uses a hand-written tokenizer instead of `ast` |
| Trade-offs are stated for every design decision | [Owner] | — |
| Target own system first; optimize for other systems later; no LLM access and no cloud accounts during development | [Owner] | Integrations that need tokens or live APIs wait |
| Review document at the end of each stage, with an owner-feedback section | [Owner, 2026-11-11] | — |

## 2. Planned stages (from the PoC plan)

Stage A (model, diagrams, overlays, flows, lenses, demo), Stage B (codebase to model), Stage C (planned change) and Stage D (BMO) are built, the last two with the 0.5.0 release. Deployment, the small batch and the static export are not.

| Stage | Content | Status |
|---|---|---|
| B — Python codebase to model (deterministic) | `dp scan <path>` proposes containers (from `pyproject.toml`, `requirements*.txt`, Dockerfiles, docker-compose), components (Python packages) and connections (imports); proposals are accepted, edited or rejected one by one; accepted objects keep their source paths and a re-scan never changes them (new code appears as "unmapped") | **Built in 0.5.0** (DEC-051, DEC-064, DEC-065): codebase to model with an import file and drafts [Owner, 2026-11-16, DEC-063]. Not built: the MCP backend, Structurizr DSL input, YAML, scan languages beyond Python, JS and TS, drift detection and re-scan, multi-pass summarising for very large repositories, a per-level URL on the Import page. Moved to the Future stage earlier [Owner, 2026-11-14, DEC-026]. The scan lives in `src/import/scan.ts`; `src/core/codeMap.ts` maps components to files and scans Python/JS/TS imports. Design notes: section 4, "Stage B, codebase to model" [Owner, 2026-11-15] |
| C — Planned change | C1 drafts: a separately edited copy of the workspace with a diff overlay (added / changed / removed) and apply or discard. C2 branch compare: scan two git refs and show the same overlay | Built: C1 drafts (DEC-016/017), C2 compare of the stored models at git refs (DEC-018), C3 `dp check` / `dp diff`; C4 planned code changes and the coding plan (`dp plan`). See `reviews.md` and `planned-change.md` |
| D — LLM assist (optional, off by default; done by BMO, the project's agent, on any backend LLM; see section 4, "Stage B") | D-1 describe scan results; D-2 draft a model from a written description (planning a codebase); D-3 explain a diagram or object in the wording of the active lens | **Built in 0.5.0** (DEC-051, DEC-065): BMO with a handoff backend, and direct calls to the Claude API, the OpenAI API and Ollama [Owner, 2026-11-16, DEC-063]. The MCP backend is not built |
| Deployment (next) | Deployment diagrams on the native Structurizr deployment model: nested deployment nodes, infrastructure nodes and container instances, one environment per diagram; diagrams computed from container relationships; per-node diff/merge units; `dp check` rules [Owner, 2026-11-14, DEC-019, DEC-022]. Later on this track: system instances, deployment groups, side-by-side environment diff, cost per environment | Next stage; plan first |
| Small batch (after Deployment) | Technology shown on connections (toggle); owner inherited from the parent; descriptions on tag groups and values; keyboard shortcuts menu; "appears in diagrams" list per object; CSV export (A8+) [Proposal, DEC-028] | Planned after Deployment |
| Static export (after the small batch) | `dp export html`: the built UI plus a snapshot of the model, opened without a server; can be published from CI [Owner, 2026-11-14, DEC-024; order DEC-028] | Planned |
| Future stage | Parked work that needs more review and planning before it is scoped: the MCP server that reads the model and proposes edits as drafts, diagram write tools and agent task packages (DEC-020) [Owner, 2026-11-14]. (Stage B was parked here by DEC-026 and has since been built.) | Not scoped |

Rules for Stage D [Notes]: the LLM gets the model as structured text, not images; output is always a proposal or draft that a person accepts; it never writes the model directly. The useful LLM role is outlining and challenging trade-offs, drafting ADR text and generating options, not making the decision.

## 3. Proposed additions to the stages (integrations)

Principle [Proposal]: because the tool is local, single-user and has no cloud accounts or LLM during development, integrations read **standard report files** and **map file paths to model objects** (using the code mapping), show results as **tag-group or overlay colours**, and run `dp` in CI instead of building hosted apps. Trade-off: no live status or webhooks (data is as fresh as the last report file); no tokens, accounts or vendor lock-in; any tool that writes the standard format works.

| ID | Item | How | Size [Proposal] |
|---|---|---|---|
| A8+ | CSV export of model objects | name, type, technology, owner, tags; created/updated timestamps would need tracking in the sidecar or come from git, so start without them | Small |
| B4 | CODEOWNERS → owner proposals | Read `CODEOWNERS` (used by GitHub, GitLab and Bitbucket [Training]); propose the `owner` property for mapped objects. The 0.5.0 scan already reads `CODEOWNERS` as evidence (`src/import/scan.ts`); proposing owners from it is not done | Small |
| B5 | SARIF import → findings overlay | `dp import sarif <file>`; SARIF 2.1.0 is an OASIS standard written by Semgrep, CodeQL, Trivy and others [Training]; findings mapped to objects by file path; counts by severity as a "Security findings" overlay | Small–medium |
| B6 | Coverage overlay | Cobertura XML (e.g. from coverage.py [Training]) → % per object in High/Medium/Low bands | Small |
| C3 | `dp check` and `dp diff` | Built (see `reviews.md`). `dp check` warns about mapped paths that do not exist, and, once a scan exists, about code that no component maps (`src/import/unmappedCode.ts`, 0.5.0) | Medium |

Answered [Owner, 2026-11-16, DEC-063]: integrations stay in the backlog; any tracker, with GitHub first; GitHub CI first, GitLab CI as a later sample.

## 4. Backlog

### Stage B, codebase to model: LLM-assisted import (Future stage, DEC-026) [Owner, 2026-11-15; the design is [Proposal]]
Built in 0.5.0 (DEC-051, DEC-064, DEC-065); the text below is the design as decided, kept for reference, so it still says "Future stage", `intake.yaml` and "YAML or JSON". What was built differs in these ways: JSON only (the intake is `architecture/import/intake.json`, the import file is JSON); the handoff files (`prompt.md`, `handoff.json`, `result.json`) are in `architecture/import/handoff/`; the review, ignore list and level state are `reviews/`, `ignore.json` and `levels.json` in `architecture/import/`; the thresholds remain guesses. See `README.md` ("Bring in an existing codebase") for how it works now.

Added to the deterministic `dp scan` idea in section 2. The owner's inputs: an import-file approach where a file generated from a script or an LLM is uploaded to build the model, and a public "codebase brain dump" prompt (https://gist.github.com/cmer/2a9b78d2145204eedf1029e9305e3e50). High level only; nothing is scoped. The owner answered the open questions on 2026-11-15; the answers are recorded in DEC-051 and marked **Decided** below.

**BMO** [Owner, 2026-11-15]: the agent in this project is named BMO. BMO has no model of its own; it connects to a backend LLM through a small adapter, so any model can sit behind it. For Stage B, BMO turns the evidence, the intake and the user's typed feedback into import files, one C4 level at a time. The same name covers the Stage D features and the MCP route. Rules: off by default; BMO's output is always a proposal (a draft); BMO never writes the model; the scan, the analysis and every check work without BMO. Backends are listed under "How BMO uses LLMs".

**Shape: evidence, intake, import file, draft.** Two kinds of input feed one output.
1. **Evidence** (deterministic, no LLM): the scan already planned (manifests, Dockerfiles, compose, imports, `CODEOWNERS`, IaC files) written to `architecture/import/evidence.json`. Facts, each with a file path.
2. **Intake** (a short brief discussion with the user): answers that the code cannot give. Saved as `architecture/import/intake.yaml` so a re-run is repeatable and the answers are editable.
3. **Import file** (written by BMO, a script or by hand): one YAML or JSON file of proposed objects, as in the next list.
4. **Draft**: `dp import <file>` validates the file, then creates a draft (Stage C) so the result shows as a diff overlay and is accepted, edited or rejected object by object. The importer goes through `ops.ts`; it never writes `workspace.json` directly. Nothing from an LLM reaches the model unreviewed (same rule as Stage D).

**Preliminary questions to ask most users** (the intake; skip any the repo answers, and let the user say "don't know"):
- *System*: name and one-line purpose; who uses it (people and roles, including admins and support staff); who the diagrams are for (decides the lenses and the depth).
- *Scope*: whole repo or named folders; monorepo with several systems; other repositories that belong to the same system (the agent cannot see them, so they would be wrongly modelled as external); branch that is the truth; code to ignore (generated, legacy, dead, being retired).
- *Depth*: **Decided** [Owner, 2026-11-15]: the default is the entire project down to code level (people, systems, containers, components, and every source file mapped to a component, which is what the code diagrams are computed from). The user may narrow it ("Containers only", named folders). No cap on components. Order of work still starts with the core, so a run that stops early leaves a useful model.
- *Ownership*: which systems the user's team owns, which belong to other teams in the same company, which are vendors; teams and where they appear (`CODEOWNERS`, a wiki).
- *Runtime*: where it runs (cloud, on premises, mixed), environments, where the infrastructure code lives; is the repo what is deployed, or is there a gap.
- *Existing material*: READMEs, ADRs, older diagrams (Mermaid, PlantUML, Structurizr DSL), wiki or ticket links the agent cannot reach; the team's own names for things versus the names in code (a short glossary).
- *Handling*: may the agent read the code at all; files and folders it must not open (`.env`, secrets, customer data); whether the import file may be committed. Agents write environment variable **names**, never values.

**External parts the user does not manage.** Code shows these only as clients, URLs and settings, so the intake asks about them directly and the agent searches for them. Ask the user to list what they know, then check against the evidence:
- Third-party services and APIs: payments, identity and login, email and SMS, analytics, search, maps, LLM providers, feature flags, monitoring and error tracking.
- Cloud-managed services the user configures but a provider runs (databases, queues, object storage, CDN, DNS): modelled as the user's containers, tagged as managed, with the provider noted.
- Other teams' internal services and shared platforms (modelled as separate systems, DEC-023).
- Inbound parties: customers' systems calling the API, webhook senders, partner file drops, browsers and mobile apps as actors.
- Things outside any repo: scheduled jobs set up in a console, manual steps, spreadsheets, people in the loop.
- For each: direction, what flows ("Sends payment requests", not "Uses"), protocol, who owns it, whether the user controls the contract, and the evidence (SDK dependency, hostname or variable name in configuration, route for a webhook, IaC resource).

**Import file format.** **Decided** [Owner, 2026-11-15, delegated; DEC-051]: a small purpose-built import file (YAML or JSON) with a shipped JSON Schema is the main route. Structurizr DSL is a secondary input route. The owner's priority is stability and accuracy.

| Option | For | Against |
|---|---|---|
| Our own workspace JSON | No translation | LLM must invent ids, positions and `dp.*` properties; easy to get wrong |
| Structurizr DSL | Well known to LLMs, readable, diff-friendly, C4-native | The reference parser is Java, so under the all-TypeScript rule dp needs its own parser for a language with variables, includes and scripts; a mistake in the DSL (identifier, nesting, arrow syntax) is found late and reported by line, not by field; no place for evidence, only free properties |
| **A small purpose-built import file (YAML or JSON) with a JSON Schema** (chosen) | Strict and versioned: unknown keys are rejected; every error names the field; maps one-to-one onto `ops.ts`; the schema ships in the package, so an editor and the importer check the same thing offline | One more format to document and version |
| Markdown only | Natural for LLMs | Cannot be validated or merged |

Why not "offload to Structurizr": the dependable part of Structurizr is its **workspace format**, and dp already stores the model in it. The import file is only a transport that ends in a draft; once accepted, the objects are ordinary workspace elements. DSL stays useful as an input for repositories that already have `.dsl` files (they are also evidence for the agent). Route [Proposal, not verified]: Structurizr's own CLI can export a DSL file to workspace JSON [Training], and dp can read a workspace file into a draft; a built-in DSL parser stays in the backlog under "Model and diagrams".

**Stability and accuracy rules** [Owner, 2026-11-15]: things should be as deterministic as possible.
- Same import file, same model: ids come from the slug rules in `modelEdits.ts`, order is fixed, nothing is random or time-based, no network.
- The importer rejects what it can prove wrong (error) and lists what it cannot check (warning); it does not guess or repair.
- **No "inferred", "imported" or "confidence" label is stored in the model.** Accepted objects are indistinguishable from objects made by hand. Evidence, review level and the person's accept decisions live in the import folder (`architecture/import/`, and git history) and are used only while reviewing the draft. The one thing that is kept in the model is evidence that is a real file path: it becomes the code mapping, which the tool can verify.
- Tests use hand-written import files, including a round trip (file → draft → apply → workspace reads back unchanged) and one fixture per error.

Content of the file:
- Objects: slug id, type (person, system, container, component, with an external flag), name, description, technologies, parent, tags, owner, group, and the code paths that map it (the existing code mapping).
- Relationships: source, target, a description of what flows, technology or protocol, and `via` for the queue, topic or broker that carries it (the broker is an object).
- Review-only fields: `evidence` (file path and lines, or "stated by user") and BMO's own `confidence` (high, medium, low), shown but never used to decide anything; the review level that does count is computed by the tool (see "Review level and low-confidence items"). Not copied into the model (see the rules above).
- Optional: flows from the main user journeys (end-to-end tests are a good source), and existing ADRs found in the repo as proposed decision records (DEC-050), kept as text for review.
- A prompt version and schema version, so older files still validate.

**Import readiness analysis and step-by-step import** [Owner, 2026-11-15; the design is [Proposal]]. `dp scan --plan` (and the Import page) reads only files and git, never BMO, so the same commit and settings always give the same numbers. It writes `architecture/import/analysis.json` and can be re-run at any time.

What it counts at each C4 level:

| Level | Candidates (rule) | BMO would read | Needs BMO? |
|---|---|---|---|
| C1 Context | External systems: SDK packages in manifests that match a shipped lookup list, hostnames and variable names in config samples, webhook routes, provider resources in IaC. People: intake answers, plus role names in access-control code | Manifests, config samples, docs | Yes, for names, descriptions and what flows |
| C2 Containers | Deployables: Dockerfiles, compose services, Kubernetes workloads, package manifests with an entry point, serverless functions; datastores and queues from compose and IaC | Those files | Yes, for names, technology and relationship labels |
| C3 Components | Per container: directories (Python packages) up to depth 2 under its source root holding at least 2 source files (both numbers are settings); import edges between them from the existing import scan | Source of that container | Yes, for names and descriptions; edges are measured |
| C4 Code | Source files after the ignore rules (`.gitignore`, vendor, build, generated) | Nothing | **No.** A file under a component's path maps by path prefix. What is left is files outside every component, to assign or ignore |

What it reports, per level and in total:
- **Done and left.** Done = candidates accepted into the model or explicitly rejected or ignored. Left = candidates not yet decided, plus unanswered intake questions, objects with no description, and relationships with no label (or "uses"). Percent = done ÷ (done + left). The project total adds the counts, so a large C3 weighs more than a small C1.
- **Your effort.** Review items = what is left, plus the low-confidence items. Minutes = items × a seconds-per-item setting (default 20 s, an assumed figure, not measured). C4 files that map by path are not counted as effort; the files outside every candidate component are listed as an upper bound until C3 is final.
- **BMO's reading.** Tokens ≈ bytes ÷ 4 (a rough rule [Training]), passes = tokens ÷ the backend's pass budget (a backend setting). Money only if the user enters a price per million tokens. Time is not estimated: it depends on the backend.
- **What it cannot see.** Files in languages whose imports dp does not read are counted as "not analysable"; their edges are unknown, so C3 percent is stated as a ceiling. Anything the code does not show (people, manual steps, systems outside the repo) cannot be counted. So "100%" means "every candidate the scan can find is decided", not "the model is complete", and the report says so.

Illustration (invented numbers):

| Level | Candidates | Decided | Left | BMO tokens (est.) | State |
|---|---|---|---|---|---|
| C1 | 9 | 4 | 5 | 10k | In progress |
| C2 | 6 | 0 | 6 | 8k | Not started |
| C3 | 41 | 0 | 41 | 310k | Not started |
| C4 | 212 files | 0 | 212 by path (not effort) | 0 | Not started |
| Total effort | 56 | 4 (7%) | 52 items, about 17 minutes at 20 s each | ~330k | |

**Recommendation: step by step or in one go.** Deterministic rules; thresholds are settings. Step by step is recommended when any of these holds: more than 300 source files; more than 5 container candidates; any file language not analysable; more than one repository or system in scope; more than 2 BMO passes needed for one level. One go is offered only when none holds (a small repository). The report prints which rules fired. The order is always C1 → C2 → C3 → C4, because the final result of one level is the scope of the next: containers define the source roots for components, and components define the path mapping for files.

**Finalizing a level; stopping at any level.**
- A level can be marked **final** when: every candidate is decided; `dp check` shows no error at that level; every object has a description (and technology, for containers and components); every relationship has a label that is not "uses"; no low-confidence item is waiting; and the user presses "Finalize". It can be reopened. If a finalized level changes after a deeper level was finalized, the analysis says what broke (for example "3 components now have no container").
- The user can stop at any level: `depth` in `intake.yaml` ("stop after C2"). The model is valid at every stage (diagrams are computed per level, and higher levels already show derived edges). `dp check` and the "unmapped code" warnings apply only to levels inside `depth`. States shown per level: not started, in progress, final, stopped here. Raising `depth` later resumes from the analysis.

**Passing information forward** (easy for the user, repeatable, works when the context window runs out):
- `dp scan --prompt` (or an Import page in the UI) writes `architecture/import/`: `prompt.md` (the generated instruction for BMO for the current level, with the intake answers, the schema and a digest of the evidence), `intake.yaml`, `evidence.json`, `analysis.json`, `schema.json`. With the handoff backend the user tells their own coding agent: "Read `architecture/import/prompt.md` and follow it", or presses "Copy prompt". The UI also has a drop or paste box for the result.
- BMO works one level per turn (C1, then C2, then C3; C4 is path mapping done by dp) and writes a file for that level. Inside a level it works core first (entry points, most-imported modules), so stopping early still leaves a useful model. Each turn ends with open questions and assumptions, so the next turn or a new session continues from the files, not from memory. Flows and decision records are an optional last turn.
- Failed validation gives a "copy these errors back to BMO" button, so repair is one paste.
- A re-import is a new draft compared with the model by the existing diff and merge. Slug ids stay stable; fields a person edited are not overwritten; new code shows as "unmapped" (planned in C3).
- Chat-only users (no file access) get a smaller variant: they paste the evidence digest and get the import file back in one reply. Weaker, but works.

**How BMO uses LLMs: backends, in order of preference.** **Decided** [Owner delegated, 2026-11-15; DEC-051]: build 1 first; 2 and 3 after. BMO is the same whichever backend is behind it, and the same analysis, checks and review rules apply, so results from different backends can be compared.
1. *Handoff*: dp generates the prompt files and checks the result; the user runs BMO's turn in their own coding agent (Claude Code, Cursor or any other) and brings the file back. No LLM calls from dp, no tokens or accounts, consistent with "LLM off by default". It is also the most deterministic choice: dp's own behaviour (scan, analysis, validate, import, draft) has no model in it, so only the file BMO writes varies, and that file is checked. Trade-off: a copy-and-paste step, and the result depends on the user's agent.
2. *MCP* (Future stage, DEC-020): BMO reads the intake and schema and proposes draft edits through tools, with validation feedback inside the loop. Trade-off: needs an MCP-capable agent.
3. *Direct*: dp calls a model itself (`dp scan --llm`) with the user's own key and endpoint, or a local model; any model that speaks a common chat API can be used through the adapter. Trade-off: cost, and code leaves the machine unless the model is local, so it needs an explicit opt-in per run.

**Checks the tool does without trusting the LLM** (`dp import --check`, results in the draft's report): paths exist; ids and parents resolve and follow the level rules; names and relationship descriptions are unique and not "uses"; technology names are normalised to the project's list; every container from Dockerfiles and compose appears (or is explained); an import edge claimed between mapped components exists in the code, and import edges in the code that the file lacks are listed; no secret-looking values. Tests use hand-written import files, because no LLM is available during development; prompt quality is judged by the owner on real repositories.

**Review level and low-confidence items** [Owner, 2026-11-15; DEC-051]. The review level is computed by the tool from evidence it can check, not reported by BMO:
- *Verified*: declared in a manifest, IaC or config and the tool found it, or stated by the user.
- *Partly verified*: the cited file and lines exist and mention the thing, but the meaning cannot be checked by rule.
- *Unverified* (low confidence): no evidence given, the cited path is missing, or the evidence contradicts it (for example a claimed import that is not in the code).

Unverified items need an **explicit accept**: "Accept all" in the draft skips them, and a separate "Low confidence (N)" list is worked through one item at a time. For each, the user can:
1. **Verify again**: run the checks that apply (path exists, text found in the file, dependency in the manifest, hostname in config, import edge present) and see the result with file and line. If they pass, the level rises; it is computed, not argued.
2. **Modify**: edit name, level, parent, technology, description or relationship label, or merge into an existing object, then re-check.
3. **Tell BMO**: a text box on the item, and one for the whole draft, to type guidance in plain words ("this is the payment provider, owned by finance; ignore the legacy folder"). The text is saved as written in `architecture/import/feedback.yaml`, keyed by object id, and goes into the next BMO turn. BMO answers with a revised import file, shown as a new revision against the previous one. The tool never interprets the text.
4. **Reject**, or mark the path "not part of this system" (it joins the ignore list).

The accept decision and any typed text stay in the import folder; nothing about them is stored on the object in the model (DEC-051).

**What the brain-dump prompt contributes, and what differs.** Reused ideas: the agent explores with its own file tools instead of pasting the repo; look at the tree and search before reading; skip vendor and build output; start from entry points and end-to-end tests; every claim tied to a file path; an assumptions table with confidence; a state block and continue request between sessions. Differences: its output is prose for another LLM, ours is a structured file for this tool; it asks the user nothing, we start with the intake; it has no stopping rule and neither do we by default (depth is the whole project, with a core-first order); its anchors carry a content hash, which could also drive drift detection (section 4, "Governance"). Its master notes document could be kept as an optional `architecture/import/notes.md` that feeds descriptions.

**Decided** [Owner, 2026-11-15; DEC-051]:
1. Import file: custom schema as the main route, Structurizr DSL as a secondary input; stability and accuracy first.
2. LLM use: BMO is the project's agent and sits in front of any backend LLM; the handoff backend is built first, MCP and direct calls after.
3. Intake: the UI form and the `intake.yaml` file produce the same data; BMO may ask whatever is left.
4. Depth: the entire project down to code level by default, one C4 level at a time with a stop at any level.
5. No "inferred" label or confidence stored on imported objects; the model stays deterministic.
6. The prompt ships in the package and is versioned with it.
7. Code level means files (mapped to components by path, with imports between them); no classes or functions in the model.
8. Low-confidence items need an explicit accept, with ways to verify, modify, or tell BMO in typed text (see "Review level and low-confidence items").
9. The agent is called BMO.
10. A deterministic readiness analysis recommends step-by-step import and estimates what is left.

**Still open [Proposal]:**
1. The default thresholds in the recommendation rules (300 files, 5 containers, 2 passes), the depth-2 and 2-file rule for component candidates, and 20 seconds per item are guesses to adjust on real repositories.
2. Who maintains the shipped lookup list that turns SDK package names into external systems; it is what makes C1 candidates deterministic, and it needs upkeep.
3. Where the "ignore" list and the per-level final state are stored: `architecture/import/` (outside the model, proposed) or the sidecar. **Settled by the build:** `architecture/import/` (`ignore.json`, `levels.json`).
4. Whether an import that is too large for one draft is split by container at C3 (proposed: yes, one draft per container). **Settled by the build:** a C3 import takes one container ID and makes one draft; the tool does not split a large import by itself.

### Planned change (after Stage C) [Review, stage-c]
- Rebase a draft onto the current main model (today conflicts are only reported at apply time), and a merge editor for conflicts.
- Undoing an apply could restore the draft too.
- Compare scan results (Stage B, built in 0.5.0) with the model, using the same diff.
- Done: a sample draft in the demo model; comparing a draft with main as it is now (DEC-063).

### Model and diagrams
- Business and Security lens presets.
- Per-diagram hiding of elements (today a diagram shows everything at its level) [Review, stage-a].
- Line routing, stage 2: route straight/curved/smooth lines in the same pass; give ELK the label sizes so auto-layout leaves room; optional hops where lines cross; an itemised "Line shape: rounded → straight" row in the change list (today a layout change); Make room / Spread out for the selected boxes only. Lanes for lines in a shared gap and label-versus-line avoidance are done in DEC-061. Stage 1 (right angles, spread ends) and routing around boxes are done in DEC-052. Size medium–large [Proposal, DEC-052, DEC-061].
- Characteristic rating **targets** so overlays can show gaps; one-off costs and cost per environment; light/dark theme switch; a separate "Status" tab versus the Lifecycle tag group [Review, stage-a3 questions].
- Ratings on relationships and whole flows (today objects only) [Review, stage-a3].
- Add a pipeline as a **connector** (a line with stages) from the palette by picking two ends [Review, release-0.2].
- Groupings as a first-class concept (layer, bounded context, subsystem, module, org unit) without extra C4 levels [Notes]. Decided: groups are queryable, taggable model objects [Owner, 2026-11-14, DEC-021]; groups nest [Owner, 2026-11-14, DEC-025]; one group per element, tags for other dimensions [Owner, DEC-027]; storage is open.
- Deployment views per environment: now the next stage (see section 2). Still here: system landscape as home screen, dynamic views (sequence ↔ collaboration), side-by-side environment diff [Notes].
- Sketch (low-fidelity) mode, "what-if" branches of the model, semantic layers [Notes].
- Technology catalog with search and icons (today generic symbols, no product logos) [Review, stage-a3].
- Versions/history view, desktop packaging. Share links: read-only serve now, static HTML export after Deployment (DEC-024).
- Shared libraries and services are modelled as their own container or system (DEC-023); multi-parent elements are not planned.
- Export to Mermaid, PlantUML, LikeC4; built-in Structurizr DSL import; DDD context map import (e.g. Context Mapper [Training]); Backstage `catalog-info.yaml` import/export [Training]; docs embedding (static SVG export exists; MkDocs/Docusaurus plugin later).

### Lints and checks (computable from the model) [Notes]
- C4 diagram checklist as automated checks: title, key/legend, element name/type/technology/description, labelled directional relationships, no "uses", preposition at the end of labels, no mixed levels, unexplained acronyms.
- Container views mentioning deployment terms; container without technology; edge without protocol; UI → database direct edge; container whose technology combines runtimes that cannot share a process.
- Distributed-design warnings: more than ~12 services sharing one database; many tiny services with high call fan-out; cross-service transactions; business logic on an API gateway; sync edges between quanta with different scalability needs.
- Brownfield metrics: afferent/efferent coupling, instability, abstractness, distance from the main sequence, cycles, cyclomatic complexity, coverage per component.

### Guided design process [Notes]
- Characteristics → logical components → style → decisions, as gated stages: kata-format intake; characteristics catalog with the three criteria; cap of about seven driving characteristics and a top-3 selection; scoping characteristics to quanta; style picker with the three determinations (monolith vs distributed, where data lives, sync vs async).
- Decision cards with weighted trade-off tables; ADRs with the book's sections (status, context, decision, consequences, compliance, notes), supersede links, a business and a technical justification before acceptance, "deferred until <trigger>" decisions.
- Style and pattern catalogs using the book's per-style template; trade-off calculators (availability nines → downtime, event-payload and stamp-coupling estimates, replicated-cache collision rate).
- Risk: impact × likelihood matrix, assessment grid (criteria × contexts) with direction arrows, risk-storming session mode (scores hidden until reveal), unknown technology scored 9.
- Final intersections checklist (implementation, infrastructure, data, engineering practices, teams, integration, enterprise, business environment, generative AI) before hand-off.
- Optional learning mode (kata practice, quiz cards from the book's discussion questions).

### Governance and hand-off [Notes]
- Fitness-function generation from model rules (layer access, cycles, module dependency caps) for ArchUnit, NetArchTest, PyTestArch, TSArch, dependency-cruiser, import-linter; pass/fail overlay on diagrams.
- Hand-off to coding agents: task packages with constraints at the right granularity (responsibilities, interfaces, allowed dependencies, fitness functions; not internal class design), generated checklists, POC/spike tasks for undecided choices. The MCP server that reads the model and proposes edits as drafts moved to the Future stage (section 2, DEC-020).
- Drift detection between modelled and coded structure.

### Integrations (beyond section 3)
- Git hotspots: churn per mapped object as an overlay.
- SBOM / dependency vulnerabilities (CycloneDX or SPDX [Training]) attached to containers; a Security lens preset.
- GitLab Code Quality JSON; SonarQube/SonarCloud metrics (needs a server or account); complexity per module (e.g. radon [Training]).
- Issue links with live status from GitHub or a tracker (needs tokens); linked work synced from GitHub issues, PRs and security alerts for named repositories (needs a token and network access) [Review, release-0.2]; create issues from a draft; ADR links on objects (Markdown ADRs).
- Infrastructure-as-code import (Terraform, compose, Kubernetes), network and deployment views, isometric rendering, OpenTelemetry runtime traces, live cloud inventory.

### Sign-in and roles (after Stage P4) [Review, prod-p4]
- Real-time collaboration: two people editing the same thing see each other's changes live. Deferred by the owner [Owner, 2026-11-14]; today the last write wins and the other sees it on focus.
- Per-user undo. Undo history is per model version today, so one architect can undo another's edit.
- Server-side lens filtering for viewers, so sensitive sections are not sent to a viewer at all. Kept as it is: a lens is a default view and hides no data (DEC-008, DEC-063).
- Custom roles. Roles are fixed at Architect, Engineer and Viewer (DEC-041).
- Done: engineers change only the drafts they started; architects change any (DEC-063, amends DEC-041).
- Rebase a draft onto a newer main, so "main +N" can be resolved rather than only shown (also open in Stage P3).
- Two engineers cannot share one draft today (DEC-063 trade-off).

### Release and layout (after Stage P6) [Review, prod-p5, prod-p6]
- Light theme. The app is dark only today [Review, prod-p5].
- Windows under 760 px wide. Below that the app shows the canvas with both panels collapsed; nothing more is promised [Review, prod-p5].
- Automated accessibility audit. Labels, focus and keyboard reach were checked by hand and only partly by tests [Review, prod-p5].
- Run the sample CI jobs in a real repository. The jobs in `demo/ci-examples/` have not been run [Review, prod-p6].
- Done: Prettier is enforced in CI (0.4.0).

### Sample data, traces and System Testing (after DEC-043, DEC-046, DEC-075) [Review, live-data]
- Import a sample from a file in the code folder (a JSON fixture, a CSV row, a recorded message) instead of pasting it; show its schema (field names and types) when the sample is JSON.
- Compare nested JSON fields, not only top-level ones, when marking what a stage changed.
- Traces from a collector over the network (OTLP over HTTP) instead of files, and traces in the backtrack view (what a real run of a step did).
- Field lineage across renamed fields (`amountMinor` → `amount`): today only same-named fields are followed, with a list of related names.
- Read trace files written by other exporters (Jaeger, Zipkin JSON).
- Suggest endpoints from the code (route definitions in the API's mapped files) so the model lists them before anyone clicks.
- A secret-name list the project can edit, and masking by the model's sensitive items, in addition to the built-in field names.
- **Next** (owner left the order to us, 2026-11-16): saved test cases with expected results, and a `dp test` runner for CI (a logged call is the shape such a case would save). Open: where a test gets the hidden values of a saved call from (a test cannot replay "•••"), and whether test cases are part of the model and its drafts or a file beside it.
- After that: HTTPS, HTTP/2 and gRPC intercept points (HTTPS needs a decision on certificates first).
- A per-person address override outside git, so developers can run a service on different local ports (today `dp.run.url` is shared by everyone).
- System Testing against a draft. Demo services that write trace files, so a demo run is also drawn as a trace.
- Pausing message queues and other non-HTTP pipeline stages.

### Permissions and scale
- Permissions beyond lenses: decision-rights matrix per role, signed approvals, encrypted files; approval rules (cost threshold, cross-team, security) [Notes].
- More scan languages (TypeScript/JavaScript beyond imports, Java, Go, C#); more precise analysis.

## 5. Known limits and unverified items

- Windows: the CLI's browser opening and paths were written for it but not run [Review, rewrite-ts].
- For 0.4.0, installing the packed tarball was run (1.0 MB, 171 files; `dp init --demo`, `dp check` and `dp serve` worked). Not run: install from the GitHub URL `npm install -g github:AbhishekR3/designPerspectives`; Windows; Structurizr's own tools reading the files (including the `dp.*` properties and the `dp.level` view property; Docker/Maven were not available when the stages were built). These are the owner's steps [Review, release-0.4.0, DEC-063].
- Linked work refresh from GitHub needs a stored token for private repositories; without one, only public repositories are read (DEC-059).
- Line routing is drawn by the app; Structurizr ignores the sidecar `layouts`. Connector stages are not model elements and do not appear in Structurizr views [Review, stage-a2].
- Import scanning handles Python and JS/TS relative imports only [Review, stage-a2].
- The built UI (`static/`) is committed (decided, DEC-063; this closes the question on DEC-014).
