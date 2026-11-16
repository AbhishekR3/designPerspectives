# Future plans and backlog

Last updated: 2026-11-15. Current version: 1.0.0 (see `../CHANGELOG.md`). Latest review: `reviews/prod-p6_review.md`.

This file collects work that is not built yet. Nothing here is scheduled or rejected; items are revisited after feedback on the current stage.

Source markers: **[Owner]** stated by the project owner (date given) · **[Review]** raised in a file under `docs/reviews/` · **[Notes]** from `docs/notes/` (the two book notes; the `→ designPerspectives` lines there are interpretation, not the authors') · **[Proposal]** an interpretation or recommendation, not sourced · **[Training]** from model training data, not re-verified.

## 1. Project direction (stable decisions)

| Decision | Source | Trade-off |
|---|---|---|
| Local web app started by one command; no accounts, no hosted server | [Owner, 2026-11-13] | No desktop app yet; the UI could later be wrapped or published as a static demo |
| Native model file is a Structurizr workspace JSON, plus one sidecar file (`designperspectives.json`) for data Structurizr has no field for | Owner delegated the choice; format chosen as [Proposal] | One large file per workspace (more merge conflicts); numeric Structurizr IDs replaced by readable slugs here |
| Engineer is the default lens; more lenses are user-made; Business and Security presets are in the backlog | [Owner, 2026-11-13] "Engineer first starting lense" | Lens mechanism is built; presets are not |
| MIT licence, single user, collaboration through git, LLM off by default | [Owner, 2026-11-11] | No real-time co-editing |
| All-TypeScript stack (Node server, `dp` CLI, React UI, shared API types) | [Owner, 2026-11-14]; reasoning in `reviews/rewrite-ts_review.md` | Python import scanning uses a hand-written tokenizer instead of `ast` |
| Trade-offs are stated for every design decision | [Owner] | — |
| Target own system first; optimize for other systems later; no LLM access and no cloud accounts during development | [Owner] | Integrations that need tokens or live APIs wait |
| Review document at the end of each stage, with an owner-feedback section | [Owner, 2026-11-11] | — |

## 2. Planned stages (from the PoC plan)

Stage A (model, diagrams, overlays, flows, lenses, demo) is built and extended in 0.2/0.3. Check the repo before relying on the status of B–D; the last review that states it is `reviews/rewrite-ts_review.md`.

| Stage | Content | Status |
|---|---|---|
| B — Python codebase to model (deterministic) | `dp scan <path>` proposes containers (from `pyproject.toml`, `requirements*.txt`, Dockerfiles, docker-compose), components (Python packages) and connections (imports); proposals are accepted, edited or rejected one by one; accepted objects keep their source paths and a re-scan never changes them (new code appears as "unmapped") | **Moved to the Future stage** [Owner, 2026-11-14, DEC-026]. `src/core/code.ts` already maps components to files and scans Python/JS/TS imports |
| C — Planned change | C1 drafts: a separately edited copy of the workspace with a diff overlay (added / changed / removed) and apply or discard. C2 branch compare: scan two git refs and show the same overlay | Built: C1 drafts (DEC-016/017), C2 compare of the stored models at git refs (DEC-018), C3 `dp check` / `dp diff`; C4 planned code changes and the coding plan (`dp plan`). See `reviews/stage-c_review.md`, `reviews/stage-c4_review.md` and `planned-change.md` |
| D — LLM assist (optional, off by default) | D-1 describe scan results; D-2 draft a model from a written description (planning a codebase); D-3 explain a diagram or object in the wording of the active lens | Not built |
| Deployment (next) | Deployment diagrams on the native Structurizr deployment model: nested deployment nodes, infrastructure nodes and container instances, one environment per diagram; diagrams computed from container relationships; per-node diff/merge units; `dp check` rules [Owner, 2026-11-14, DEC-019, DEC-022]. Later on this track: system instances, deployment groups, side-by-side environment diff, cost per environment | Next stage; plan first |
| Small batch (after Deployment) | Technology shown on connections (toggle); owner inherited from the parent; descriptions on tag groups and values; keyboard shortcuts menu; "appears in diagrams" list per object; CSV export (A8+) [Proposal, DEC-028] | Planned after Deployment |
| Static export (after the small batch) | `dp export html`: the built UI plus a snapshot of the model, opened without a server; can be published from CI [Owner, 2026-11-14, DEC-024; order DEC-028] | Planned |
| Future stage | Parked work that needs more review and planning before it is scoped: **Stage B** (reverse engineering a C4 model from an existing codebase, DEC-026); the MCP server that reads the model and proposes edits as drafts, diagram write tools and agent task packages (DEC-020) [Owner, 2026-11-14] | Not scoped |

Rules for Stage D [Notes]: the LLM gets the model as structured text, not images; output is always a proposal or draft that a person accepts; it never writes the model directly. The useful LLM role is outlining and challenging trade-offs, drafting ADR text and generating options, not making the decision.

## 3. Proposed additions to the stages (integrations)

Principle [Proposal]: because the tool is local, single-user and has no cloud accounts or LLM during development, integrations read **standard report files** and **map file paths to model objects** (using the code mapping), show results as **tag-group or overlay colours**, and run `dp` in CI instead of building hosted apps. Trade-off: no live status or webhooks (data is as fresh as the last report file); no tokens, accounts or vendor lock-in; any tool that writes the standard format works.

| ID | Item | How | Size [Proposal] |
|---|---|---|---|
| A8+ | CSV export of model objects | name, type, technology, owner, tags; created/updated timestamps would need tracking in the sidecar or come from git, so start without them | Small |
| B4 | CODEOWNERS → owner proposals | Read `CODEOWNERS` (used by GitHub, GitLab and Bitbucket [Training]); propose the `owner` property for mapped objects | Small |
| B5 | SARIF import → findings overlay | `dp import sarif <file>`; SARIF 2.1.0 is an OASIS standard written by Semgrep, CodeQL, Trivy and others [Training]; findings mapped to objects by file path; counts by severity as a "Security findings" overlay | Small–medium |
| B6 | Coverage overlay | Cobertura XML (e.g. from coverage.py [Training]) → % per object in High/Medium/Low bands | Small |
| C3 | `dp check` and `dp diff` | Built (see `reviews/stage-c_review.md`). "Unmapped code" (code no object points to) waits for Stage B; `dp check` warns about mapped paths that do not exist instead | Medium |

Open questions for the owner [Proposal]:
1. Accept B4–B6 and C3 into the plan, or keep all integrations in the backlog until Stage A feedback?
2. Jira specifically, or any tracker (determines whether issue references follow a key format or are free-form URLs)?
3. Is GitLab the primary host for CI/CD, or GitHub (current repo) with GitLab as a second template?

## 4. Backlog

### Planned change (after Stage C) [Review, stage-c]
- Rebase a draft onto the current main model (today conflicts are only reported at apply time), and a merge editor for conflicts.
- Undoing an apply could restore the draft too.
- A sample draft in the demo model.
- Compare scan results (Stage B, now in the Future stage) with the model, using the same diff.
- Compare against a draft from the main model ("what would this draft change now"), not only draft vs its base.

### Model and diagrams
- Business and Security lens presets.
- Per-diagram hiding of elements (today a diagram shows everything at its level) [Review, stage-a].
- Line routing, stage 2: push apart lines that run side by side in the same gap; treat lines as light obstacles when placing labels; route straight/curved/smooth lines in the same pass; give ELK the label sizes so auto-layout leaves room; optional hops where lines cross. Stage 1 (right angles, spread ends) and routing around boxes are done in DEC-052. Size medium–large [Proposal, DEC-052].
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
- Server-side lens filtering for viewers, so sensitive sections are not sent to a viewer at all. This would change DEC-008 and is an open question for the owner.
- Custom roles. Roles are fixed at Architect, Engineer and Viewer (DEC-041).
- Draft ownership rules: whether engineers may edit only drafts they started (open question for the owner).
- Rebase a draft onto a newer main, so "main +N" can be resolved rather than only shown (also open in Stage P3).

### Release and layout (after Stage P6) [Review, prod-p5, prod-p6]
- Light theme. The app is dark only today [Review, prod-p5].
- Windows under 760 px wide. Below that the app shows the canvas with both panels collapsed; nothing more is promised [Review, prod-p5].
- Automated accessibility audit. Labels, focus and keyboard reach were checked by hand and only partly by tests [Review, prod-p5].
- Apply and enforce Prettier. It is configured but not applied to the code [Review, prod-p6].
- Run the sample CI jobs in a real repository. The jobs in `docs/examples/ci/` have not been run [Review, prod-p6].

### Sample data and the live UI inspector (after DEC-043, DEC-044) [Review, live-data]
- Import a sample from a file in the code folder (a JSON fixture, a CSV row, a recorded message) instead of pasting it; show its schema (field names and types) when the sample is JSON.
- Compare nested JSON fields, not only top-level ones, when marking what a stage changed.
- Capture more than fetch and XMLHttpRequest in the inspector: WebSocket messages, server-sent events, `sendBeacon`.
- Traces from a collector over the network (OTLP over HTTP) instead of files, and traces in the backtrack view (what a real run of a step did).
- Field lineage across renamed fields (`amountMinor` → `amount`): today only same-named fields are followed, with a list of related names.
- Read trace files written by other exporters (Jaeger, Zipkin JSON).
- Suggest endpoints from the code (route definitions in the API's mapped files) so the model lists them before anyone clicks.
- A secret-name list the project can edit, and masking by the model's sensitive items, in addition to the built-in field names.
- Highlight the touched elements on the diagram while the inspector is open, instead of a chip list.

### Permissions and scale
- Permissions beyond lenses: decision-rights matrix per role, signed approvals, encrypted files; approval rules (cost threshold, cross-team, security) [Notes].
- More scan languages (TypeScript/JavaScript beyond imports, Java, Go, C#); more precise analysis.

## 5. Known limits and unverified items

- Windows: the CLI's browser opening and paths were written for it but not run [Review, rewrite-ts].
- `npm install -g github:AbhishekR3/designPerspectives` was not tested before merge; installing the packed tarball was tested and CI repeats it [Review, rewrite-ts].
- Opening a workspace written by this tool in Structurizr's own tools (including the `dp.*` properties and the `dp.level` view property) was not run: Docker/Maven were not available when the stages were built; owner's checklist step 10 asks for it [Review, stage-a, stage-a2, stage-a3].
- Linked work is entered by hand; nothing is fetched from GitHub or a tracker [Review, release-0.2].
- Line routing is drawn by the app; Structurizr ignores the sidecar `layouts`. Connector stages are not model elements and do not appear in Structurizr views [Review, stage-a2].
- Import scanning handles Python and JS/TS relative imports only [Review, stage-a2].
- Question left open: keep committing the built UI (`static/`) or build it only for releases (installing from git would then need Node) [Review, stage-a]. Current `CLAUDE.md` says it is committed.
