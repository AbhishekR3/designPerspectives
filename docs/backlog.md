# Future plans and backlog

Last updated: 2026-11-14. Baseline: release 0.3.0 (TypeScript rewrite, feature parity with 0.2.0; see `reviews/rewrite-ts_review.md`).

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
| B — Python codebase to model (deterministic) | `dp scan <path>` proposes containers (from `pyproject.toml`, `requirements*.txt`, Dockerfiles, docker-compose), components (Python packages) and connections (imports); proposals are accepted, edited or rejected one by one; accepted objects keep their source paths and a re-scan never changes them (new code appears as "unmapped") | Not confirmed as built. `src/core/code.ts` already maps components to files and scans Python/JS/TS imports |
| C — Planned change | C1 drafts: a separately edited copy of the workspace with a diff overlay (added / changed / removed) and apply or discard. C2 branch compare: scan two git refs and show the same overlay | C1 built (branch `stage-c1-drafts`, DEC-016/017); C2 and C3 in progress. Stage review at the end of C3 |
| D — LLM assist (optional, off by default) | D-1 describe scan results; D-2 draft a model from a written description (planning a codebase); D-3 explain a diagram or object in the wording of the active lens | Not built |

Rules for Stage D [Notes]: the LLM gets the model as structured text, not images; output is always a proposal or draft that a person accepts; it never writes the model directly. The useful LLM role is outlining and challenging trade-offs, drafting ADR text and generating options, not making the decision.

## 3. Proposed additions to the stages (integrations)

Principle [Proposal]: because the tool is local, single-user and has no cloud accounts or LLM during development, integrations read **standard report files** and **map file paths to model objects** (using the code mapping), show results as **tag-group or overlay colours**, and run `dp` in CI instead of building hosted apps. Trade-off: no live status or webhooks (data is as fresh as the last report file); no tokens, accounts or vendor lock-in; any tool that writes the standard format works.

| ID | Item | How | Size [Proposal] |
|---|---|---|---|
| A8+ | CSV export of model objects | name, type, technology, owner, tags; created/updated timestamps would need tracking in the sidecar or come from git, so start without them | Small |
| B4 | CODEOWNERS → owner proposals | Read `CODEOWNERS` (used by GitHub, GitLab and Bitbucket [Training]); propose the `owner` property for mapped objects | Small |
| B5 | SARIF import → findings overlay | `dp import sarif <file>`; SARIF 2.1.0 is an OASIS standard written by Semgrep, CodeQL, Trivy and others [Training]; findings mapped to objects by file path; counts by severity as a "Security findings" overlay | Small–medium |
| B6 | Coverage overlay | Cobertura XML (e.g. from coverage.py [Training]) → % per object in High/Medium/Low bands | Small |
| C3 | `dp check` and `dp diff` | `dp check`: validate the workspace (schema, dangling relationships, unmapped code) with a CI exit code. `dp diff --base <ref>`: reuse C2 branch compare, write a Markdown summary for a PR comment. Sample GitHub Actions and GitLab CI files; posting the comment uses the host's own CLI/token | Medium |

Open questions for the owner [Proposal]:
1. Accept B4–B6 and C3 into the plan, or keep all integrations in the backlog until Stage A feedback?
2. Jira specifically, or any tracker (determines whether issue references follow a key format or are free-form URLs)?
3. Is GitLab the primary host for CI/CD, or GitHub (current repo) with GitLab as a second template?

## 4. Backlog

### Model and diagrams
- Business and Security lens presets.
- Per-diagram hiding of elements (today a diagram shows everything at its level) [Review, stage-a].
- Characteristic rating **targets** so overlays can show gaps; one-off costs and cost per environment; light/dark theme switch; a separate "Status" tab versus the Lifecycle tag group [Review, stage-a3 questions].
- Ratings on relationships and whole flows (today objects only) [Review, stage-a3].
- Add a pipeline as a **connector** (a line with stages) from the palette by picking two ends [Review, release-0.2].
- Groupings as a first-class concept (layer, bounded context, subsystem, module, org unit) without extra C4 levels [Notes].
- Deployment views per environment, system landscape as home screen, dynamic views (sequence ↔ collaboration), side-by-side environment diff [Notes].
- Sketch (low-fidelity) mode, "what-if" branches of the model, semantic layers [Notes].
- Technology catalog with search and icons (today generic symbols, no product logos) [Review, stage-a3].
- Versions/history view, share links, desktop packaging.
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
- Hand-off to coding agents: task packages with constraints at the right granularity (responsibilities, interfaces, allowed dependencies, fitness functions; not internal class design), generated checklists, POC/spike tasks for undecided choices; an MCP server that reads the model and proposes edits as drafts.
- Drift detection between modelled and coded structure.

### Integrations (beyond section 3)
- Git hotspots: churn per mapped object as an overlay.
- SBOM / dependency vulnerabilities (CycloneDX or SPDX [Training]) attached to containers; a Security lens preset.
- GitLab Code Quality JSON; SonarQube/SonarCloud metrics (needs a server or account); complexity per module (e.g. radon [Training]).
- Issue links with live status from GitHub or a tracker (needs tokens); linked work synced from GitHub issues, PRs and security alerts for named repositories (needs a token and network access) [Review, release-0.2]; create issues from a draft; ADR links on objects (Markdown ADRs).
- Infrastructure-as-code import (Terraform, compose, Kubernetes), network and deployment views, isometric rendering, OpenTelemetry runtime traces, live cloud inventory.

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
