# Decisions

The running list of project decisions and the reasoning behind them, grouped by topic and subtopic. This is the only decisions file. Read the entries of a topic before you change a design choice there.

**Entry format:** `<topic code>-<n> · DEC-<id> — title`, then date · status · who decided · decision · why · trade-off. "Owner" means the project owner. "Proposal" means the choice was delegated and made by the assistant, as an interpretation rather than a sourced fact.

**Rules**
- The DEC id is the permanent name of a decision. Other files cite it; never reuse or renumber one. The next free id is the one after the highest DEC id in this file (**DEC-108** on 2026-11-20).
- Add a new entry at the end of the subtopic it belongs to (or a new subtopic), with the next free DEC id and the next free `<code>-<n>` of its topic. The `<code>-<n>` numbers are positions in this file; a DEC id is not.
- Do not rewrite old entries. When a decision changes, add a new entry and set the old one's status to "Superseded by <ID>", with a "Now:" line saying what changed. The bracket after a title is the state on 2026-11-20.
- Entries are in DEC order within a subtopic, except for entries added later. DEC-074 to DEC-084 are dated 16 November but were written after the 17 November entries.
- Open questions and the ids of answered ones (D, N, Q-) are in the section "Open questions and the ids of answered ones" below the index.

| Code | Topic | Entries |
|---|---|---|
| PRO | Project, scope and process | 23 |
| STK | Stack, files and repo layout | 7 |
| MOD | Model and diagrams | 15 |
| CAN | Canvas, editing and layout | 11 |
| DRF | Drafts, compare and history | 7 |
| SEC | Security, sign-in and roles | 7 |
| REC | Collaboration and records | 5 |
| HUB | Hub, home and catalog | 7 |
| COD | Code import, code reading and BMO | 11 |
| RUN | Runtime and System Testing | 9 |
| WRK | Linked work | 5 |

**Decided, not built**

| Entries | Note |
|---|---|
| 019 and 022 deployment diagrams | Out of the order before 1.0.0 by 090; after 1.0.0 by 104 |
| 020 MCP server | Future stage |
| 021, 025, 027 groups | No groups feature found in `src/core`, the README or the CHANGELOG on 2026-11-20 |
| 024 static export | In 1.0.0, planned as [Wave 21](waves/wave-21-static-export.md) (DEC-100); release, defaults, shapes and hubs in DEC-102 |
| 095 open a local file | Confirmed by the owner (DEC-100); planned in Wave 16 |
| 100 release steps, shared-checkout rule | Written in [CONTRIBUTING.md](CONTRIBUTING.md); the first release made with them is 0.6.0 |
| 101 credentials always encrypted | Planned: [planned_features.md](planned_features.md) A7, as [Wave 23](waves/wave-23-sealed-credentials.md) (0.6.1) |
| 102 static export: release, defaults, shapes, hubs | Planned: [Wave 21](waves/wave-21-static-export.md); release number moved to 0.12.0 by 103 |
| 103 code import and BMO choices (N1 to N15), 0.8.0 split | Planned: Waves 3, 5, 6, 15 and 22 (digests) |
| 105 a finished wave is replaced by its review file | Rule for wave agents: [waves/README.md](waves/README.md#closing-a-wave); no wave is built yet |
| 106 first release group split, Waves 23 to 27 | Planned: [Waves 23 to 27](waves/README.md); release numbers 0.6.1 to 0.13.0; the groups changed again by 107 |
| 107 the second look at the waves | Planned: [Waves 28 and 29](waves/README.md#the-second-look-at-the-waves-2026-11-20), a real-run gate in Wave 1, the context window rule (Wave 14a), release numbers 0.6.1 to 0.14.0 |
| 104 scope of 1.0.0, item by item | Documents written; hiding System Testing, traces and the demo system is planned as [Wave 29](waves/wave-29-system-testing-switch.md) (DEC-107) |

**Not (fully) live**

| Entry | State | By |
|---|---|---|
| 026 Stage B in the future stage | Superseded | 051 |
| 044 live UI inspector | Superseded | 074 |
| 048 demo web app | Half superseded (history part live) | 074, 077 |
| 090 releases stay in 0.5.x | Release part replaced (the 1.0.0 scope stands) | 098 |
| 034 Prettier not enforced | Out of date: Prettier is enforced | note in the entry |
| 047 functions by pattern for TS, JS, Python | To be replaced by the generic reader | 096 (planned) |
| 062 file names | Partly replaced | 066 |
| 063 CI on GitHub, install from GitHub | Partly replaced (CI on GitLab, not yet run) | 089 |
| 056 credentials: encryption optional | The "optional" part is superseded: always encrypted | 101 |
| 001, 006, 018, 024, 028, 041, 043, 045, 046, 049, 057, 063, 070, 073, 079, 084, 095 | Amended; the amendment is named in each entry | various |
| 091 to 097 | Accepted, **not built**; planned in the waves | waves/README.md |

## Open questions and the ids of answered ones

*Moved from the deleted `open-questions.md` on 2026-11-20.*

**Today nothing is open.** The one pending item is a check, not a question: N1's "confirm with BMO" (the folder-skip list of DEC-103) could not be run because BMO was off; it is U26 in section 29 of the [manual test plan](manual-test-plan.md#29-unverified-facts-what-was-never-run-or-measured). Run it as soon as BMO is on (`dp bmo status`), and say whether BMO was available.

**Where a new open question goes.** A question about one planned feature goes in that entry's "Open questions" part in [planned_features.md](planned_features.md), or in the wave file while it exists. A question about the whole product goes to the owner in conversation, and the answer becomes a DEC at the end of its topic here. A recommendation is a [Proposal], not a fact; facts carry a source. Question ids (D, N, Q-) are stable names: a gap in the numbers is an item that moved or closed.

**Where each answered question went** (the owner answered D1, D2, D5, D6, D7, D9 and D15 on 2026-11-20; D4 and N1 to N15 later the same day, N2 to N15 and D16 to D19 on the assistant's reasoning at the owner's request, so the owner may overrule them):

| Question | Where it is now |
|---|---|
| Q-K1, Q-K2, Q-K3, Q-C1, Q-C1b, Q-C3, Q-T4, Q-O3, Q-B6 and their answers; the options and the facts behind the assumption and token-limit questions | [DEC-099](#pro-16--dec-099--owner-answers-to-the-open-questions-of-2026-11-20-part-1-of-open-questionsmd) (decision, alternatives considered, reasons, trade-offs) |
| **D1** static export timing, **D2** accounts, **D5** opening a local file, **D7** release process, **D9** shared working tree, **D15** "needs a look" alignment | [DEC-100](#pro-17--dec-100--owner-answers-to-the-open-questions-of-2026-11-20-part-2-d1-d2-d5-d7-d9-d15). D1 became [Wave 21](waves/wave-21-static-export.md); D2 became [planned_features.md](planned_features.md) A6 (hosted accounts, after 1.0.0); D7 became [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release); D9 became [CONTRIBUTING.md](CONTRIBUTING.md#more-than-one-session-in-one-checkout) |
| **D4** the scope of 1.0.0, item by item | [DEC-104](#pro-20--dec-104--the-scope-of-100-item-by-item-d4-the-scope-review); the short form is "The line, item by item" in [product-vision.md](product-vision.md); the one new piece of work is [planned_features.md](planned_features.md) A8 |
| **D6** credentials in plain text without a key (answered: encrypted) | [DEC-101](#sec-7--dec-101--credentials-are-always-encrypted-at-rest); planned as [planned_features.md](planned_features.md) A7 |
| **D16** release for the static export, **D17** what it includes by default, **D18** single-file shape, **D19** hub export | [DEC-102](#pro-18--dec-102--the-static-export-release-defaults-shapes-and-hubs-d16-to-d19): its own release, the opt-in and opt-out lists, a folder and a single file from one second build target, one project per export. The release number moved to 0.12.0 with DEC-103. Detail in [Wave 21](waves/wave-21-static-export.md) |
| **N1 to N15** code import and BMO choices (what the scan skips, entry points, layered folders, other manifests, the extension lists, the readiness report, who owns the level rules, pinned key code that stops matching, Wave 14, the 0.8.0 split, "needs an LLM" labels, context limits, digests, the assumption work, where the context window comes from) | [DEC-103](#pro-19--dec-103--code-import-and-bmo-choices-and-the-080-split-n1-to-n15); built in Waves 3, 5, 6 and 15 (each wave file has a "Decided (DEC-103)" section) and the digests as [Wave 22](waves/wave-22-digests.md) |
| Q-A1: how to open the demo in Structurizr's tools | [manual-test-plan.md](manual-test-plan.md#30-structurizr-check-the-steps-behind-mt-draft-167), section 30 |
| Unverified facts, what was never run or measured (U1 to U25, later U26 and U27) | [manual-test-plan.md](manual-test-plan.md#29-unverified-facts-what-was-never-run-or-measured), section 29, with a Result column; related gap rows in section 28 |
| The verdict on all 81 questions in reviews.md | [reviews.md](reviews.md), the last section, "Where every question went" |
| **D3** (the 0.6.0 release change), **D8** (where `.gitlab-ci.yml` lives), **D10** (a permission in `.claude/settings.json`), **D11** (the code map in `CLAUDE.md`) | Chores in [planned_features.md](planned_features.md) B7. D3 has its steps in [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release) |
| **D12** (`docs/determinism.md` does not exist yet), **D13** (Prettier is enforced), **D14** (the demo web app page) | Closed: stated in [waves/README.md](waves/README.md), in the notes of DEC-034 and the status of DEC-048 here, and in the decisions index above |

---

## PRO — Project, scope and process

### Vision and scope

#### PRO-1 · DEC-001 — Licence, user model and LLM default

- Date: 2026-11-11 · Status: Accepted · Decided by: Owner
- Decision: MIT licence; single user with collaboration through git; LLM features off by default; no LLM access needed during development.
- Why: the project is open source, makes no money and is meant for everyone to use.
- Trade-off: no real-time co-editing. Every stage must work without an LLM.
- Now: amended by DEC-041 (optional sign-in, no accounts unless a users file exists). "Single user" is read as "no hosted accounts": the vision's collaboration "from different accounts" means the local users file. Settled by DEC-100 (owner, 2026-11-20): local accounts are the account model for 1.0.0; hosted accounts come after 1.0.0 ([planned_features.md](planned_features.md) A6).

#### PRO-2 · DEC-002 — Scope of ambition (from the first design round)

- Date: 2026-11-11 · Status: Accepted, mostly deferred to the backlog (see `backlog.md`) · Decided by: Owner
- Decision: local-first single-user app plus CLI; adopt an existing diagram format instead of inventing a DSL; support both greenfield (planning) and brownfield (existing code); hand code off to external coding agents; personas with permissions; OpenTelemetry support; build one stage at a time with a review document at the end of each.
- Why: the tool should help with planning and understanding code as LLM-written code becomes common.
- Trade-off: the plan is much larger than the first usable version, so the stages deliver the core model and diagrams first.

#### PRO-3 · DEC-004 — Build for our own system first

- Date: 2026-11-11 · Status: Accepted · Decided by: Owner
- Decision: target this project's own codebase first and optimise for other systems later. No cloud accounts for testing yet. The assistant may propose UI wireframes for the owner to review. Demo models: the Internet Banking example from the C4 book (credited in `NOTICE`) and another example from the book.
- Why: a concrete first target keeps the scope testable.
- Trade-off: integrations that need tokens or live APIs wait.

#### PRO-4 · DEC-005 — Rethink from scratch toward a usable proof of concept

- Date: 2026-11-13 · Status: Accepted · Decided by: Owner
- Decision: restart planning from the project's purpose: a model-based C4 tool, comparable to existing commercial ones in its core, with different views of the same software for different users, codebase import, and planned-change views. Deliver features in stages, each ending in something the owner can run and test.
- Why: the earlier plan was too large to test.
- Trade-off: part of the earlier plan became backlog items.

#### PRO-5 · DEC-090 — Version 1.0.0 is software architecture only, with twelve features; releases stay inside 0.5.x

- Date: 2026-11-19 · Status: Accepted (the release numbering is replaced by [DEC-098](#dec-098--releases-follow-semver-as-0xy-and-the-changelog-lists-only-what-is-built-and-tested)) · Decided by: Owner (product vision, answers A1, A2, A7, A8, A10 in the owner's question file, now deleted and moved to `docs/product-vision.md` (A1) and `docs/waves/README.md` (the other cross-cutting answers)). The wave order and the reading of A7 are Proposals.
- Decision:
  - **Purpose.** dp is for software architects, and for the people who work with one during the SDLC. It helps them understand an existing system, design a new one, record why, and keep the picture true as code changes. Full text and the feature status: [product-vision.md](product-vision.md).
  - **Scope of 1.0.0.** Software architecture only. Data architecture and infrastructure come after 1.0.0. dp is **not an IDE**: a person may open files to understand a component, but does not write code in the tool.
  - **The twelve features:** C4 modelling; a single source of truth; architecture change proposals; lenses (architect, DevOps, other SDLC roles); collaboration and notes with images and files from different accounts; contracts between services; an ADR page; codebase importing; git-style commits for architecture; links to GitHub, SonarQube and Jira; a catalog shared between projects; and BMO, the architecture-intelligence agent.
  - **What falls outside** was listed for the owner to decide item by item. Nothing built is removed without that decision. Decided in DEC-104 (the review file is deleted): what is kept, hidden or later is in that entry.
  - **Order.** The waves of `docs/waves/` run interleaved (answer A2), not behind deployment diagrams. This amends the order in DEC-028: deployment diagrams (infrastructure) leave the pre-1.0.0 order pending the review, and the small batch no longer waits for them.
  - **Parked.** Wave 10 (risk storming) and Wave 12 (runtime telemetry) are moved to the owner's ideas list (answer A7; the old `docs/future_tasks.md` was split on 2026-11-20). They are not among the twelve features.
  - **New waves from the vision.** Wave 16 (images and files, feature E), Wave 17 (architecture commits, feature I), Wave 18 (drafts that keep up, feature C), Wave 19 (lenses for roles, feature D) and Wave 20 (a back-and-forth about an existing system, feature H).
  - **Releases.** All releases before 1.0.0 are 0.5.x: 0.5.1 (Waves 1, 2, 3, 16, 4), 0.5.2 (5, 6, 15, 7, 8), 0.5.3 (9, 11, 17, 18, 19), 0.5.4 (13, 14, 20), then 1.0.0.
    - Now: replaced by DEC-098. Releases are `0.X.Y` with no ceiling on X: 0.7.0 (Waves 1, 2, 3, 16, 4), 0.8.0 (5, 15, 6, 7, 8), 0.9.0 (9, 11, 17, 18, 19), 0.10.0 (13, 14, 20). Later regrouped by DEC-103: 0.8.0 (5, 15), 0.9.0 (6, 7, 8), 0.10.0 (9, 11, 17, 18, 19), 0.11.0 (13, 14, 20), 0.12.0 (21).
  - **Planning files stay** in `docs/` (including `docs/waves/`); the owner deletes them before 1.0.0. This is a standing exception to CLAUDE.md's "do not commit superseded plans" for that folder.
  - **Models.** Fable is never used by agents. When a step could go to either of two models, the larger is used.
- Why: LLMs write more of the code, so the scarce skill is understanding and deciding the architecture; that is hard to do on an existing system and for the decisions behind it. A narrow 1.0.0 gets a complete product for one audience. Data and infrastructure are real fields with their own models, and doing them at the same time would thin all of it.
- Trade-offs:
  - Built features for data (the data catalog and access, pipelines) and runtime (System Testing, traces) exist and are outside the line. They stay until the owner decides, so 1.0.0 may ship with features its vision does not name.
  - Parking Waves 10 and 12 drops risk storming and telemetry analysis from 1.0.0, and Wave 11 loses its risk parts.
  - Keeping every release in 0.5.x makes 0.5.4 a large step; the version number then says little until 1.0.0.
  - 0.5.3 and 0.5.4 are now large groups; a wave that runs long moves to the next 0.5.x number.


### Working rules

#### PRO-6 · DEC-003 — Design decisions state their trade-offs

- Date: 2026-11-11 · Status: Accepted · Decided by: Owner
- Decision: every design decision, in the tool and in these docs, names its trade-offs. Source markers (owner, web, training data, proposal) are used so sourced facts and interpretation stay apart.
- Why: the architecture notes in `notes/` treat trade-off analysis as the core of the work.
- Trade-off: slower writing, easier review.

#### PRO-7 · DEC-009 — Reuse the existing GitHub repository

- Date: 2026-11-13 · Status: Accepted · Decided by: Owner
- Decision: build in `AbhishekR3/designPerspectives`; earlier content could be cleared.
- Trade-off: earlier work stays only in git history.

#### PRO-8 · DEC-015 — Docs for this repository

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: the repository keeps the two book notes (`notes/`), the backlog (`backlog.md`), this decisions list, and per-stage reviews (`reviews/`). The books themselves and superseded plans are not committed. Other tools are not named or compared in repository files, commit messages or pull requests. Commits and PRs carry no co-author or session-link lines.
- Why: the owner will work from a local folder synced with this repository, using a local editor with Claude Code, so everything a session needs must be in the repository.
- Now: the backlog is [planned_features.md](planned_features.md) (the owner's private ideas are in the git-ignored `local/ideas.md`); the per-stage reviews are one file, [reviews.md](reviews.md), and the screenshots that once sat in `reviews/` were removed on 2026-11-20. The naming rule stands (DEC-029).

#### PRO-9 · DEC-029 — Research on other tools is allowed; naming them is not

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: pulling information from other websites, tools and competitors is allowed as research input. The naming rule from DEC-015 stays: they are not named or compared in repository files, commit messages or pull requests. Ideas are written in our own terms.
- Why: the owner wants to learn from existing products without the repository becoming a comparison document.
- Trade-off: sources for a feature idea cannot be cited in the repository, so the reasoning must stand on its own.


### Releases and CI

#### PRO-10 · DEC-089 — CI runs on GitLab, on Linux

- Date: 2026-11-18 · Status: Accepted (the pipeline has not run yet; see the last trade-off) · Decided by: Owner

- Decision: the pipeline is `.gitlab-ci.yml` (Linux, Node 20 and 22). `.github/workflows/ci.yml` is removed. GitHub stays the main remote; the GitLab project is a second remote that only runs CI. `npm run ci` (`scripts/ci-local.ts`) runs the same steps on the owner's machine, and `npm run hooks:install` can run it before every push.
- Why: every GitHub Actions job since 14 Nov was refused with "your account is locked due to a billing issue", before any step ran. The code was not at fault: all steps pass locally. The owner does not want to pay for CI.
- Trade-offs:
  - No macOS job: free shared runners on GitLab are Linux only (as far as we know; not checked against GitLab's current terms). macOS-only breakage is no longer caught by CI.
  - Free minutes are limited, so pipelines run only for merge requests and the default branch, with an npm cache, and an old pipeline is cancelled when a newer one starts.
  - GitLab may ask for identity verification before its shared runners start.
  - A push to GitHub alone triggers no checks. The pre-push hook (owner-installed) covers that.
  - The pipeline was written without a GitLab project to run it on, so its first run may need fixes.
- Kept: `.github/` pull request and issue templates, and `demo/ci-examples/github-actions.yml` (a product example, not this repository's CI).

#### PRO-11 · DEC-098 — Releases follow SemVer as 0.X.Y, and the changelog lists only what is built and tested

- Date: 2026-11-20 · Status: Accepted · Decided by: Owner (this session). Replaces the release numbering of DEC-090 (all releases inside 0.5.x) and the later 0.8 ceiling.
- Decision:
  - **Numbering.** Every release before 1.0.0 is a `0.X.Y` version and X has no ceiling. Features raise X, fixes raise Y. `0.6.0` is the work already built and tested; the waves follow as `0.7.0` (Waves 1, 2, 3, 16, 4), `0.8.0` (5, 15, 6, 7, 8), `0.9.0` (9, 11, 17, 18, 19) and `0.10.0` (13, 14, 20), then 1.0.0.
  - **Format.** `docs/CHANGELOG.md` has one section per version, newest first: `## [x.y.z] - Month - DD - YYYY`, then the headings `Added`, `Fixed`, `Changed`, `Deprecated` and `Remove`, in that order. A heading with nothing under it is left out. Security items go under the heading they belong to, with the prefix "Security:".
  - **Content.** Only what is built, tested and working in the repository. There is no `Unreleased` section and no mention of planned work (that lives in `docs/planned_features.md` and `docs/waves/`). A wave agent writes nothing to the changelog; the release change after the last wave of a group writes the section from what shipped.
  - **History.** All earlier entries were rewritten into this format, and the work that sat under `Unreleased` became 0.6.0.
- Why: the owner wants a changelog a reader can trust (everything in it exists) and version numbers that say something, instead of every release sharing 0.5.x.
- Trade-offs:
  - No `Unreleased` block means a change is not recorded until its release is written; the wave reviews (`docs/reviews.md`) hold the notes meanwhile.
  - Minor bumps for each wave group mean X passes 8 and 9 before 1.0.0 (0.10.0 sorts after 0.9.0 under SemVer, not as text).
  - The 0.6.0 section is dated by its last commit while `package.json` and the README still say 0.5.0 until the release change is made.
  - Now: DEC-103 regroups the waves after 0.7.0: 0.8.0 (5, 15), 0.9.0 (6, 7, 8), 0.10.0 (9, 11, 17, 18, 19), 0.11.0 (13, 14, 22, 20), 0.12.0 (21). The numbering rule itself is unchanged.
  - Now: DEC-106 splits the first group and adds Waves 23 to 27: 0.6.1 (23), 0.7.0 (24, 1, 2, 25 and A8), 0.8.0 (3, 26, 16, 4), 0.9.0 (5, 15), 0.10.0 (6, 7, 8, 27), 0.11.0 (9, 11, 17, 18, 19), 0.12.0 (13, 14, 22, 20), 0.13.0 (21).


### Roadmap order

#### PRO-12 · DEC-020 — MCP server moves to a "Future stage"

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: the MCP server (reads the model, proposes edits as drafts) and related agent-facing work are parked in a new stage called Future stage. They are not scoped or scheduled; the owner will review and plan them later.
- Why: needs more thought (relation to Stage D, local authentication, what an agent may write) before it is planned.
- Trade-off: no agent integration soon; drafts and the `X-DP-Model` header (DEC-017) already let any HTTP client write into a draft.

#### PRO-13 · DEC-024 — Sharing: read-only serve now, static export after the deployment stage

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: sharing stays `dp serve --read-only` for now. A static HTML export of the whole model (UI plus a snapshot of the model, no server) is planned after the deployment stage.
- Why: serving is already built; the export needs a static data path in the UI, so it should not delay deployment diagrams. The export fits the `dp check` / `dp diff` CI jobs (publish the model from the pipeline).
- Trade-off: until the export exists, people who cannot run Node cannot view the model. An export is a snapshot and includes everything in the model (notes, costs, links), which must be reviewed before publishing.
- Now: DEC-090 takes deployment diagrams out of the order before 1.0.0, so "after the deployment stage" no longer gives a date. Settled by DEC-100 (owner, 2026-11-20): the export is built before 1.0.0, as [Wave 21](waves/wave-21-static-export.md). The design above stands (a snapshot of the whole model, reviewed before publishing), refined by DEC-102: the whole model is still read, but the export shows the architecture by default and the riskier kinds of data only on request.

#### PRO-14 · DEC-028 — Stage order after Deployment

- Date: 2026-11-14 · Status: Accepted (amended by DEC-090: deployment diagrams leave the order before 1.0.0; by DEC-100: the static export is Wave 21, no longer the step after deployment) · Decided by: Owner delegated the order; choice is a Proposal
- Decision: Deployment stage first (DEC-019), then a small batch of fixes, then the static HTML export (DEC-024). Whether deployment diagrams are per environment only or also per system is deferred to the deployment stage plan [Owner: "think about environment later"].
- Why: the small batch is quick and low risk (technology labels on connections, inherited owner, tag descriptions, a shortcuts menu, an "in diagrams" list, CSV export). The export is larger, and the export then carries those improvements from the start.
- Trade-off: the export is delayed by one small stage; the batch is not a single theme, so its review file lists items separately.


### Owner answer batches (amend many entries)

#### PRO-15 · DEC-063 — Owner answers to the open review questions (release 0.4.0)

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (answers written in `open-questions.md`, since deleted and moved here; "go with your decision" or no note means the recommended answer, marked [Delegated])
- Decision:
  - **Network bind.** `dp serve` with a non-loopback `--host` refuses to start unless users exist, or `--read-only` or `--insecure` is given [Delegated]. Replaces the warning of DEC-030.
  - **Hidden code paths.** Mapping an object to a path with a segment that starts with a dot is refused when it is entered; a path a model already has still loads and `dp check` warns [Delegated]. Refines DEC-031.
  - **Own drafts.** With sign-in, an engineer changes and discards only drafts they started and reads all others; architects change any [Owner: "the second engineer should start another draft"]. Drafts made before sign-in, with no author, can be changed by architects only. Amends DEC-041.
  - **Accepted decisions stay editable** [Owner]. No lock is built (DEC-050 unchanged).
  - **Selection.** Ctrl/Cmd+click adds to the selection, as Shift+click does [Owner].
  - **Draft compare.** A draft can be compared with where it started or with main as it is now [Delegated].
  - **Demo.** The demo ships a sample draft [Delegated] and keeps its made-up git history, with no opt-out flag [Owner]. It already has tag groups.
  - **This repository's CI** runs `dp check --strict` on the demo [Delegated]. The test runner gets its major upgrade [Delegated].
  - **Apply dialog.** "Also write the planned code edits" starts unticked when the draft has a branch [Delegated].
  - **Version.** This release is 0.4.0, not 1.0.0: the owner wants to change more before 1.0.0 [Owner]. Earlier commit messages and review sections that say "1.0.0" mean the state before this release.
  - **Install.** From GitHub only; no npm publish for now [Owner]. So the built UI stays committed (closes the question on DEC-014).
  - **Kept as they are** [Delegated]: no framing in editor preview panes; decisions are written inside a draft by engineers; the fixed front matter grammar; an empty start with `--demo` for the sample; an empty system's context diagram is not listed in the sidebar; `git config user.name` as the author without sign-in; a 12-hour idle session; a lens is a default view and hides no data on the server (DEC-008); the Add palette starts collapsed at 1280 px; layout never conflicts in a draft; stored models are compared at git refs; planned code edits have no undo history of their own; the encryption key for credentials is optional; tables are a list; dialog wording.
  - **Left in the backlog** [Delegated]: rebase of a draft and a merge editor; a light theme; rating targets, one-off and per-environment cost, a Status tab; per-diagram hiding; a connector from the palette; backtracking from traces, explicit field lineage, a live trace collector; integrations from report files; trackers other than GitHub; GitLab CI as the first sample.
  - **Git process** [Delegated]: branch from `main` for each change; one pull request per change, no stacks; a change to the UI rebuilds `static/` in the same commit and a change to model or demo code regenerates `demo/` in the same commit; the owner merges; a release is a `vX.Y.Z` tag on `main` with a GitHub release.
  - **Security review findings fixed in this release** [Proposal, from an internal review]: hub project folders added in the browser must be inside the hub and not hidden, and `hub.json` entries are checked on load; project IDs cannot be built-in object keys; GitHub links are checked before the stored token is used; `comments.json` has a 10 MB cap.
- Why: the questions had collected in 17 review sections over many stages; answering them once lets the release go out with known behaviour.
- Trade-off: two engineers cannot share one draft. A network demo needs one more step (`dp users init` or `--insecure`). Hand-written `hub.json` entries may still point outside the hub folder (DEC-054), so that file must be trusted. A person who is architect on the catalog changes names and descriptions in the linked copies of projects where they have a lower role or none, because copies follow the catalog (DEC-057); this is accepted for now. Not checked for this release: Structurizr's own tools reading the files, Windows, and CI on GitHub (owner's steps).
- Now: the release steps ("a `vX.Y.Z` tag on `main` with a GitHub release") are written out once in [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release) (DEC-100). "The encryption key for credentials is optional" is superseded by DEC-101.
- Now: "CI on GitHub" and "install from GitHub only" are partly replaced: CI runs on GitLab (DEC-089) and has not run yet. The "left in the backlog" items are in [planned_features.md](planned_features.md) and the waves (rebase is Wave 18, light theme is B5). Open items from the review questions: [the open questions section](#open-questions-and-the-ids-of-answered-ones).

#### PRO-16 · DEC-099 — Owner answers to the open questions of 2026-11-20 (Part 1 of open-questions.md)

- Date: 2026-11-20 · Status: Accepted (nothing here is built; each item names where it will be) · Decided by: Owner (answers Q-K1, Q-C1; "go with your reasoning" for Q-C3, Q-T4, Q-O3, Q-B6; "do what you think is best and note the reasoning" for Q-K3; Q-K2 and the follow-up Q-C1b: "go with the recommended"; Q-A1 asked for a how-to). The reasoning for the delegated items is a [Proposal]. Amends DEC-073, DEC-079 and DEC-084.
- Decision:
  - **Q-K1, viewers and checklist questions.** Viewers cannot comment on or answer checklist questions. DEC-084 stands: architects and engineers change the checklist, viewers read it. A viewer who knows an answer comments on an object or diagram (DEC-049); a person who can edit the checklist carries it over.
  - **Q-K2, assumptions.** Owner: go with the recommended option. (1) An assumption is added by BMO (an import), by a person on the checklist, and, new, from a decision's Context ("This decision assumes…"); never by a viewer (Q-K1) and never in a draft's own checklist (there is none). (2) A decision record can cite the assumption items it depends on, by item id; the record shows them. (3) A fourth state, "wrong", is added to an assumption (confirmed, open, wrong, skipped); marking one wrong is told to BMO and puts the decisions that cite it on "needs a look" through the revisit-trigger machinery (DEC-050, DEC-079). (4) A one-click confirm stays non-evidence: only typed words verify anything (DEC-064). (5) An assumption as a property of an element or relationship, drafted and diffed, is not built; revisit if teams want assumptions reviewed in drafts. Not built yet; no wave carries it, so it needs one (answered: Wave 3, DEC-103, N14).
  - **Q-K3, CI and the checklist.** The 16 self-checking rules reach `dp check` through Wave 8's rule registry as model findings. Items a person added, BMO's questions and assumptions do not reach CI, and there is no `dp checklist` command for now.
  - **Q-C1, no token cap in the chat.** The fixed cap of 24,000 tokens of code per chat message (DEC-073) is dropped. Instead dp analyses the request and shows the approximate size (tokens, and the cost where a price is set) in the preview before anything is sent, as the BMO preview already shows an estimated token count. Follow-up Q-C1b, owner: refuse a run only when the prompt is larger than the chosen model's context window, because the provider would reject it anyway; everything below that is the person's call with the estimate shown. This replaces the size refusal of DEC-065 (`runTokenLimit`: budget plus room). When the model's window is unknown dp only warns. Where the window comes from (a small table that goes stale, asking the provider, or typed by the person) is open: `planned_features.md` B7.
  - **Q-C3, flow-step chaining.** Kept: a step links to the nearest earlier and nearest later step at the same element.
  - **Q-T4, saved test cases.** Stay parked with `dp test` and HTTPS intercept points (ideas list I2.7). When they return, a saved case holds the masked call and the names of fields to fill; the person supplies real values at run time, so real values still never reach disk (DEC-075).
  - **Q-O3, routing.** No next routing stage is scheduled. It starts when a real diagram shows a problem; the leftovers stay in `planned_features.md` B5.
  - **Q-B6, "needs a look".** The home page's list and the top-bar badge use one rule: the server's list also includes proposed decisions (amends DEC-079, which left the two different). Recorded in `planned_features.md` B6; not built. Owner, 2026-11-20 (DEC-100, D15): build it with the next code change that touches the home summary.
- Why:
  - **Q-K1**: the checklist is a record that feeds BMO and the import review (DEC-064, DEC-084); limiting who writes it keeps that record to people with edit rights.
  - **Q-K2**: assumptions are the part of a design most likely to turn false; tying them to the decisions that rest on them reuses structures that exist and tells the team what to revisit. A click proves nothing, so typed words stay the only evidence.
  - **Q-K3**: a rule over the model (a container with no description) is a fact about the model and belongs in the same place as other model findings. A to-do a person wrote, or a question BMO asked, is not a property of the model, so failing a build for it would punish a team for having an open conversation.
  - **Q-C1**: a cap decides for the person what is "enough" before anyone has seen a real run (no real provider call has been made, see section 29 of [manual-test-plan.md](manual-test-plan.md#29-unverified-facts-what-was-never-run-or-measured), U1). A number the person sees before sending lets them decide. **Q-C1b**: a refusal above the window saves the person the cost of a call that must fail; a refusal below it is a cap in disguise.
  - **Q-C3**: in an ordered list of steps only the neighbours are unambiguous; a farther link would need a rule for which of several matching steps to pick.
  - **Q-T4**: a case that stored real values would write secrets to disk, which DEC-075 rules out.
  - **Q-O3, Q-B6**: routing has no known failing diagram; the badge and the list disagreeing is a plain inconsistency, so the smallest fix is one rule.
- Context (facts as of 2026-11-20, moved here from the deleted open-questions.md):
  - An *assumption* is one of three checklist item kinds (`task`, `question`, `assumption`; `src/shared/types.ts:695`) kept in `architecture/checklist.json`, outside the model: no undo step, not diffed, not merged by drafts (DEC-084). BMO adds its `assumptions` (an import file field, at most 200, `src/import/schema.ts:200`) under "Questions from BMO"; a person can add one by choosing the kind "Assumption" in the add row (`ui/src/common/Checklist.tsx:264`). A person can tick it or press "Correct it" and type what is true; a typed correction is typed text (it can verify an import note and goes to BMO), a bare tick is told to BMO but is not evidence (`answerNotes`, `src/core/checklist.ts:494`).
  - Where an assumption could not be added before: on a draft, as a property of an element or relationship that shows in the change list and `dp diff`, in a decision record (its structured part is revisit triggers, DEC-050), or as a typed kind of sticky note (planned, DEC-092).
  - DEC-065 refuses a run whose prompt is larger than the budget plus room (`runTokenLimit` in `src/assistant/settings.ts`; 150,000 tokens at the default budget of 100,000). The BMO preview already shows an estimated token count (`ui/src/common/BmoSheet.tsx`, near line 198).
- Alternatives considered:
  - **Assumptions (Q-K2).** (A) Keep them on the checklist only: nothing to build, but no drafts, no diff and no link to the decisions that rest on them. (B) Store them as model data on elements, relationships and diagrams (`dp.assumptions`, like linked work): reviewed with the change, but a second home for the same text and more units to maintain. (C, chosen) Keep the checklist and let a decision cite assumption items: it reuses decisions, revisit triggers and the needs-a-look rule. (D, chosen with C) A "wrong" state.
  - **Oversized runs (Q-C1b).** Keep the DEC-065 refusal: stops a costly mistake but is a cap. Replace it with a warning and send only on confirm: matches "tell the user before they start", but a run can be expensive if the person ignores it. (Chosen) Refuse only above the model's context window: the provider would reject the call anyway, so the person is not charged for a failure.
- Trade-offs:
  - Viewers keep no route to answer checklist questions; their knowledge reaches BMO only through a person with edit rights.
  - Open checklist items never fail CI, so a team that wants that must use a model rule.
  - With no cap, a long chat can send a large prompt; the estimate before sending is the guard, plus the refusal above the model's context window (Q-C1b). The estimate is approximate (tokens ≈ bytes ÷ 4, a rule of thumb).
  - Dropping the cap changes DEC-073's "at most 24,000 tokens of code"; the code path that applies it must change with the preview text.
  - The home page's list will show more entries (proposed decisions) and be rarely empty, as the badge already is (DEC-079).
  - Q-C1b needs the model's context window, which dp does not know today: a table of limits goes stale, asking the provider needs a network call, typing it puts the work on the person. Until one is chosen the refusal cannot be built and dp can only warn.
  - Q-K2: assumptions on the checklist stay outside drafts, so a draft's decision may cite an item main does not have (shown as "not in this version", as comments are). A "wrong" state adds one more state to a list that already has three, and the needs-a-look rule gains a source.

#### PRO-17 · DEC-100 — Owner answers to the open questions of 2026-11-20, part 2 (D1, D2, D5, D7, D9, D15)

- Date: 2026-11-20 · Status: Accepted (the documents are written; the code items are not built, each names where it will be) · Decided by: Owner (D1, D2 and D5 as stated; D7 "plan the release steps for me"; D9 "yes, your rule is good"; D15 "go with your decision"). D6 is [DEC-101](#sec-7--dec-101--credentials-are-always-encrypted-at-rest). D4 (the scope of 1.0.0) was decided later the same day: [DEC-104](#pro-20--dec-104--the-scope-of-100-item-by-item-d4-the-scope-review). The release steps, the shared-checkout rule and the wave placement are Proposals. Amends DEC-001, DEC-024, DEC-028, DEC-063 and DEC-095.
- Decision:
  - **D1, static export.** The static HTML export is part of 1.0.0 and is built before it ("will be done before deployment of v1"). It is [Wave 21](waves/wave-21-static-export.md), after every wave that adds data to the export. DEC-024's design stands: the built UI plus a snapshot of the model, opened without a server, with a review step before anything is published. It no longer waits for deployment diagrams (DEC-028's order is replaced). This also moves scope-review item P3 from "later" to "keep".
  - **D2, accounts.** For 1.0.0 an account is a user in the local users file (DEC-041): a name, a password hash, a role, optionally a role per hub project. There are no hosted or cloud accounts. They are planned for after 1.0.0 as [planned_features.md](planned_features.md) A6. "From different accounts" in the product vision (feature E) means these local users: they can comment and attach files (Wave 16) as themselves.
  - **D5, opening a local file.** DEC-095 stands as written: a click opens the file in the system's default app, within its limits (this machine only, a fixed type list, the full path shown first, an argument list never a shell). Wave 16's security review still decides whether the route is safe; Copy path only is the fallback, not the default.
  - **D7, release process.** One written procedure, in [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release): a release branch holds one small change (version, README, changelog section), the full `npm run ci` runs, the owner merges, then the tag `vX.Y.Z` is made on `main` and a GitHub release carries the changelog section as its notes. GitHub holds the tag and the release; the GitLab remote only runs CI (DEC-089). Nothing is pushed, merged or tagged without the owner's go.
  - **D9, shared working tree.** One branch per session; commit by path; never edit a file that another session has modified and not committed. Written in CONTRIBUTING.md and, in one line, in `.claude/CLAUDE.md`.
  - **D15, "needs a look".** The alignment of DEC-099 (Q-B6) is built with the next code change that touches `src/core/homeSummary.ts` or the home page, not as a release of its own, with a test that the home page list and the top-bar badge give the same count on the demo, which ships proposed decisions.
- Why:
  - **D1**: the owner wants people who cannot run Node to see a model before 1.0.0, and the export fits the CI jobs that already run `dp check` and `dp diff` (DEC-024). It goes last because it carries what notes, attachments, decisions, findings and the library hold, so it should be built once, against their final shape.
  - **D2**: DEC-041 already gives each person a name, a role and an author stamp on drafts; a hosted account service is a separate product (sign-up, recovery, billing, a server to run) and not needed to deliver the twelve features.
  - **D5**: the owner wants no copy of a large file and the way it opens anywhere else on the computer (DEC-095's reason). The limits in DEC-095 are the guard; the review is the check.
  - **D7**: the tag, the release and CI sit on two services (DEC-063, DEC-089), and no release has been made yet, so one written list avoids deciding it again each time. GitHub is where `gh` is logged in and where the repository's pull requests are.
  - **D9**: on 2026-11-20 a second session had 27 uncommitted documentation edits on `main` while a clean-up ran, and `reviews.md` records the same for DEC-050 and DEC-051. Each time the cost was a repair. The rule is cheap.
  - **D15**: the page and the badge disagree today because the demo ships proposed decisions; a one-rule fix inside a change that already touches the file costs less than a branch of its own.
- Alternatives considered:
  - **D1.** (A) After 1.0.0, as the scope review first proposed: smaller 1.0.0, but until then only `dp serve --read-only` shares a model. (B, chosen) Before 1.0.0, last in the order. (C) Before the waves, so every wave can test its export row: the export would then change with every wave.
  - **D2.** Plan hosted accounts now: more to build before 1.0.0, with no user asking for it yet.
  - **D5.** Copy path only: the safer default and the first recommendation. The owner chose to keep "open".
  - **D7.** Publish to npm: not chosen (DEC-063: install from GitHub only). Generated release notes: not chosen, because the changelog is written to DEC-098's standard and the release should say the same thing.
- Trade-offs:
  - **D1.** An export includes everything in the model: notes, costs, links, comments if chosen, and `local:` paths that show a user name (DEC-095). The review step is the guard, and it is real work. Wave 21 delays 1.0.0 by one release (proposed 0.11.0). A static page cannot run System Testing, BMO, drafts or any other write; the export is read-only by construction.
  - **D2.** With local accounts a hub is trusted at the folder level: someone with the hub folder sees every project (DEC-060). Real multi-office collaboration waits for A6.
  - **D5.** dp asks the operating system to start another program from a path that can come from someone else's repository (DEC-095's first trade-off, unchanged).
  - **D7.** A written procedure is only as good as its use; a mismatch between `package.json` and the top changelog heading is not checked by CI yet.
  - **D9.** The rule is discipline, not enforcement. A second worktree costs disk and one more `npm ci`.

#### PRO-18 · DEC-102 — The static export: release, defaults, shapes and hubs (D16 to D19)

- Date: 2026-11-20 · Status: Accepted (not built; [Wave 21](waves/wave-21-static-export.md)) · Decided by: Owner delegated ("do your best reasoning for D16-D19"); all four choices are Proposals made by the assistant. Amends DEC-024 and DEC-100. Amended by DEC-103: the release number is 0.12.0.
- Decision:
  - **D16, release.** Wave 21 is its own release, **0.11.0**, run last, after the waves of 0.10.0.
    - Now: DEC-103 splits 0.8.0, so every later group moves up by one and Wave 21 is **0.12.0**, still last.
    - Now: DEC-106 splits 0.7.0, so Wave 21 is **0.13.0**, still last.
  - **D17, what an export includes.** The rule: an export shows what the diagrams and panels show about the architecture; whatever is not the model itself, or has the most risk of leaving by accident, is opt-in. Included by default, each removable with `--without`: the model, `notes`, `decisions`, `links`, `owners`, `addresses`, `library`, `keycode`, `findings`, `contracts`. Left out by default, each added with `--with`: `comments`, `attachments`, `work`, `costs`, `local-paths` (without it, a file name only), `code`, `checklist`, `import-review`, `bmo-runs`. A secret-looking value always refuses the export. `.dp/`, credentials, users, integrations and drafts are never exported. The command only prints a report until `--yes` is given.
  - **D18, shapes.** Both are built, from one second UI build target (classic script, relative paths, data as script files, elkjs as a separate classic script): a **folder** that opens from a web host and from disk (21a), and a **single file** with everything inline (21b). The check that this works from a `file:` address in three browsers is the first step of the wave; if it fails in one, the wave stops and asks.
  - **D19, hubs.** One project per export. No home page, catalog or cross-project Work page. A folder per project with an index page may come after 1.0.0.
- Why:
  - **D16**: the export carries what Waves 2, 3, 6, 8, 9, 13 and 16 add, so it must come after them; it is a publishing feature with its own review step and its own security review, which is easier to judge in a release of its own; 0.10.0 already holds an L wave (Wave 20); a minor version for a new command fits DEC-098.
  - **D17**: the review report and `--yes` are the guard, but defaults still decide what leaks when someone skips reading. Costs, ticket keys, comments, files and local paths each reveal something the diagram does not (money, internal systems, people's conversation, a user name), so they are opt-in. Notes, decisions, links and owners are part of what an architect shares, so leaving them out would make the export a worse picture. Splitting the two lists (nothing appears in both) keeps each switch's meaning plain.
  - **D18**: DEC-024 promised a page that opens "without a server". A folder with module scripts and `fetch` does not open from disk in common browsers [Training, not verified], so without the second build target the promise would hold only for people with a web host, who are not the people DEC-024 had in mind. One build target gives the folder the same reach as the single file, and the single file is then only an inlining step, which is what an email attachment needs.
  - **D19**: DEC-060 gives each project its own roles, so one export that mixed projects could carry one the person may not publish. Per project is also the smallest design: the hub's pages need hub routes, which the snapshot would otherwise have to copy.
- Alternatives considered:
  - **D16.** Join 0.10.0: one fewer release, a larger and later 0.10.0. Before the waves: the export would change with every wave.
  - **D17.** Everything on by default with a long `--without` list: the most useful picture, the easiest accident. Everything off by default except the bare model: safe, and an export that is nearly empty, so people would turn everything on out of habit.
  - **D18.** Folder only: smaller, but needs a host. Single file only: works anywhere, but a large model gives one very large file and no way to host assets separately. Reading the model in the browser (running the diagram code there instead of baking its answers): no server calls, but it would copy `src/core` into the UI and change two build targets' worth of code.
  - **D19.** A whole hub as one site: the home page and catalog come along, at the cost of the mixing risk above.
- Trade-offs:
  - Two build targets double the places a UI change must work, and CI must check both outputs are current (`static/` and `static-export/`). The package grows by about the size of the UI again (about 2.6 MB).
  - A default that omits costs and linked work means a person who wants them must say so, and an export made in a hurry can look thinner than the live model. The report lists what was left out, so it is visible.
  - The `file:` behaviour of browsers is from training, not from a run; the wave's first step is that run.
  - A single file with a large model can be many megabytes; there is no size limit set.

#### PRO-19 · DEC-103 — Code import and BMO choices, and the 0.8.0 split (N1 to N15)

- Date: 2026-11-20 · Status: Accepted (not built; each item names where it is built) · Decided by: Owner for N1 ("yes, confirm with BMO if available"); N2 to N15 on the assistant's reasoning at the owner's request ("do your best reasoning", then "do what you think is best"), so each is a Proposal the owner may overrule. Amends DEC-102 (release number) and DEC-098 (release groups).
- Decision:
  - **N1, skip folders.** The scan skips `test`, `tests`, `__tests__`, `spec`, `docs`, `doc`, `examples`, `example`, `scripts`, `migrations`, `fixtures`, `generated` and `third_party` by name when it looks for C3 candidates, in `EXTRA_SKIP_DIRS` of `scan.ts` only, not in the code map's `SKIP_DIRS`. The candidate review lists what was skipped, each with "add back". Built in Wave 15 (the import release). BMO was off when this was asked (checked twice on 2026-11-20: handoff backend, no provider, no credential), so the list was checked against the code only and the owner was told. The standing rule: whenever BMO is available to the owner, use it for this check and say whether it was available; manual-test-plan U26 holds the steps.
  - **N2, entry points.** Entry points and public interfaces become hints for key code from the Wave 5 pattern table, never components.
  - **N3, layered folders.** No rule; the Wave 15 interview asks "are these folders one component?" when the names look layered.
  - **N4, manifests.** Cargo, Gemfile, Composer and .NET project files are added to the manifest table (Wave 5). Maven and Gradle stay out (owner, Q5.3).
  - **N5, extensions.** One list of source extensions, in the Wave 5 pattern table, with a flag for "counts as source" versus "known file type".
  - **N6, readiness report.** Keep minutes, tokens and passes. Money is shown only when the person has set `pricePerMTok`. The old statement "no price setting exists" was wrong (the setting exists and feeds the BMO preview) and is corrected in `import-design.md`.
  - **N7, who owns the rule.** `import-design.md` states what matters at each C4 level; Wave 5 implements it and links back.
  - **N8, a pinned key-code entry that no longer matches.** A finding (Wave 6) the person can acknowledge. Never silent, never removed by dp; when only the name is gone and the file exists, the finding says so.
  - **N9, Wave 14.** Stays where it is.
  - **N10, the 0.8.0 split.** 0.8.0 is Waves 5 and 15 (the import release). 0.9.0 is Waves 6, 7, 8. 0.10.0 is Waves 9, 11, 17, 18, 19. 0.11.0 is Waves 13, 14, 22, 20 (22 is the digests wave of N13, run before 20). The static export (Wave 21) is 0.12.0.
    - Now: DEC-106 moves every group after 0.7.0 up by one: the import release (Waves 5 and 15) is 0.9.0.
  - **N11, labels.** Each import step carries a fixed badge: "no LLM" or "needs an LLM".
  - Now (N12, N15): DEC-107 settles the refusal rule: a window the person typed is a limit and a larger request is refused; with none typed, dp warns and shows "limit not set"; the pass-budget refusal stays.
  - **N12, N15, context window.** A new optional BMO setting holds the model's context window, typed by the person. The size refusal stays tied to the pass budget; the window drives a warning and the limit shown beside the estimate in the BMO sheet, which says "limit not set" when it is unknown. Reading an Ollama model's own value is allowed only after a check against a real server (manual-test-plan U27).
  - **N13, digests.** A wave of its own after Waves 5 and 15 ([Wave 22](waves/wave-22-digests.md), 0.11.0, before Wave 20): digests per container and component in `architecture/import/digests/`, a computed part plus a labelled BMO summary, and a hash that marks a digest out of date and never regenerates it silently. The agent instructions file is written only on request (`dp context --write`).
  - **N14, assumptions.** The assumption work of DEC-099 is built in Wave 3 (the decision record and its page), with the "wrong" state as a small checklist change; Wave 6 reads that state and does not define it.
- Why:
  - **N1 to N5, N7, N8**: each keeps the rule fixed and checkable (DEC-093, DEC-096), puts a question to the person where a guess would hide structure, and keeps the person's own pins untouched. Hints cannot create a wrong component; a wrong merge of folders can.
  - **N6**: a number that the settings already can compute should not be described as missing; showing nothing without a price keeps a guess from looking like a cost.
  - **N9**: nothing in 0.7.0 needs the word index, and the move stays cheap while it depends only on Waves 1 and 2.
  - **N10**: Waves 5 and 15 can be judged on real repositories on their own, and Wave 8 (size L) should not hold back findings and metrics.
  - **N11, N12, N15**: a person deciding whether to send code to a model should see which steps need one and how big the request is, without dp claiming a limit it does not know.
  - **N13**: a computed part first keeps the digest checkable; regeneration can cost money, so it is never silent; a generated file in someone's repository is written only when asked.
  - **N14**: the link lives where the decision lives.
- Alternatives considered:
  - **N1.** Read `.gitignore`: it hides generated files in projects that keep them out of git, but says nothing about tests or docs, and it adds a parser. Language rules (for example "`*_test.go`"): refused by DEC-096.
  - **N3.** A name rule for layers: wrong in both directions.
  - **N4.** All ecosystems including Maven and Gradle: against Q5.3.
  - **N9.** Move Wave 14 into 0.7.0: earlier local models, a larger 0.7.0.
  - **N10.** Keep 0.8.0 as it was: one fewer release, a larger and later 0.8.0.
  - **N15.** A built-in table of models (goes stale); ask the provider (a network call).
- Trade-offs:
  - **N1.** A project whose product is a folder named `docs` or `scripts` must add it back by hand.
  - **N10.** One more release to make; every wave file and the release table were renumbered by hand, so a missed reference is possible (checked by search on 2026-11-20).
  - **N12, N15.** The window is only as right as what the person types; the warning is a hint.
  - **N13.** A new store, a staleness check and a UI list to maintain.

#### PRO-20 · DEC-104 — The scope of 1.0.0, item by item (D4, the scope review)

- Date: 2026-11-20 · Status: Accepted (the documents are written; hiding System Testing is not built, it is [planned_features.md](planned_features.md) A8) · Decided by: Owner ("go with recommendations for the open items"; asked two questions: the hide work is one planned-features entry and not a wave, and backtracking is kept). Each row below is the assistant's recommendation, adopted by the owner, so it is a Proposal the owner made theirs. P3 (D1) and P4 (Q4.1 to Q4.3) were already answered. Amends DEC-090 (what falls outside), DEC-075 and DEC-077 (hidden by default). The file `docs/waves/v1-scope-review.md` is deleted; its content is here, in [product-vision.md](product-vision.md) and in the files named per row.
- Facts used (counted in the repository on 2026-11-20): 57,102 lines of TypeScript in `src/` and `ui/src/`, 1,134 automated test rows in `tests/TESTS.csv`, 252 manual test rows.
- Decision, for what is **built**:
  - **B1, the data catalog and data access (DEC-055): keep, together with P4.** `src/core/catalog.ts` (179 lines, which also holds the shared-catalog usage that feature K needs), `ui/src/panels/DataSections.tsx` (204) and `cleanData` and `cleanAccess` in `modelEdits.ts`. P4's CRUD letters and role × data matrix edit exactly this code, so B1 and P4 always get the same answer. The vision's "software architecture only" gets one exception here (see [product-vision.md](product-vision.md)): data access as a property of a part of the system, not a data model.
  - **B2, data pipelines and connector stages (DEC-043, DEC-047): keep, backtracking too.** 1,009 lines in 6 files, 9 backtrack test rows, 10 manual rows. Wave 13 (contracts) builds on `dp.example`, `dp.format`, `dp.stages` and `dp.stepData`; `diagrams.ts` computes connector diagrams and `codeMap.ts` imports `connectors.ts`. Backtracking (a step followed to its data source) is the only separable half (`ui/src/inspect/Backtrack.tsx`, one route); the owner chose to keep it.
  - **B3, System Testing mode (DEC-075, DEC-076): later, hidden, not deleted.** 3,361 lines in 19 files (1,697 server, 1,664 UI, about 6% of the code), 74 test rows, 13 routes, 12 manual rows, nine decisions in the RUN topic. It is the one place a listener forwards live traffic, and it sits against the vision's non-goal ("debugging a running service in dp is not a 1.0.0 goal"). How: off unless `dp serve --testing` (or a setting) turns it on; its tests stay in CI; the docs call it experimental. `dp.run.url` stays a property either way. Planned as A8.
  - **B4, observed traces (DEC-045, DEC-046): follows B3.** 608 lines in 3 files, 7 test rows; its viewer, `ui/src/testing/TraceView.tsx`, lives inside B3's screens, and the `GET /api/traces*` routes go behind the same switch.
  - **B5, the cost overlay (DEC-013, DEC-068): keep.** `dp.cost` is read by five core files (`designPerspectivesFile.ts`, `diff.ts`, `modelEdits.ts`, `modelUnits.ts`, `validate.ts`); 10 test rows, 4 manual rows. In the book, cost is an architecture characteristic, so it may be on the line; Wave 9's table can compare it.
  - **B6, deployment data kept, not modelled (DEC-019, DEC-022): keep as is.** Nodes are kept whole so a Structurizr file round-trips; no code to remove.
  - **B7, the demo system (DEC-077): follows B3.** 283 lines in `src/demo/demoSystem.ts`, 9 test rows. `dp serve --demo` no longer starts the five services on ports 4200 to 4204 unless asked (`--with-system`); the demo tour's System Testing chapter moves behind that flag.
  - **Together, B3, B4 and B7:** about 4,250 lines (7% of the code), about 90 test rows and 12 manual rows leave the default 1.0.0 surface, and two listeners (the proxy and the demo services) no longer start by default. Nothing is deleted.
- Decision, for what is **planned**:
  - **P1, deployment diagrams (DEC-019, DEC-022): later** (the ideas list, I1). The static export no longer waits for them (DEC-100), so DEC-028's order (deployment, small batch, export) is gone.
  - **P2, the small batch (DEC-028): keep.** Technology on connections, inherited owner, tag descriptions, an "in diagrams" list per object, CSV export. No longer behind P1 ([planned_features.md](planned_features.md) B2 task 2).
  - **P3, the static HTML export: keep** (D1, DEC-100, [Wave 21](waves/wave-21-static-export.md)).
  - **P4, the data half of Wave 4: keep**, with B1 ([Wave 4](waves/wave-04-roles-data-variants.md)). The other half (conditions on lines, A/B variants as grouped flows) is C4 modelling.
  - **P5, Wave 12 (runtime): later** (A7). **P6, Wave 10 (risk storming): later** (A7). Both stay parked in the ideas list.
  - **P7, Wave 14 (local runtimes and the word index): keep.** It lets BMO work with no cloud call, which suits people with no API credits ([planned_features.md](planned_features.md) A2).
  - **P8, the language mix per object in Wave 5: dropped** (Wave 5 has no per-language code).
  - **P9, Wave 7: the `dp metrics` CSV is kept** (Wave 7 is now model coupling); **test coverage stays later** ([planned_features.md](planned_features.md) B5).
- Settled by other answers, so the review needed no decision: hosted accounts are after 1.0.0 (D2, DEC-100, A6); credentials are always encrypted (D6, DEC-101, A7); opening a local file in the default app is in scope as part of Wave 16 (D5, DEC-095, DEC-100).
- Why:
  - **B1 and P4 together**: the owner kept the CRUD work, and cutting the catalog's data half would mean splitting `catalog.ts` for about 200 lines of UI.
  - **B2**: Wave 13 (feature F) cannot be built without its samples and stages; hiding backtracking would save one route.
  - **B3, B4, B7**: the owner's own non-goal; the largest security surface in the product; 74 automated and 12 manual tests to keep green for something 1.0.0 does not need. Hiding keeps the work and the tests, and costs less than removing.
  - **B5**: small, spread over five core files, and a characteristic the table compares.
  - **P2, P7**: small and clearly inside software architecture (P2); plumbing that lets feature L work offline (P7).
- Alternatives considered:
  - **B1 and P4 both later.** Matches the vision's wording, and Wave 4 shrinks to its C4 half; refused because the owner answered Q4.1 to Q4.3 with the CRUD work in mind.
  - **B3 kept as it is (on by default).** It is built, tested, local-only, and a live demo of flows is the most vivid thing the product does; refused because of the non-goal and the traffic-forwarding listener, with the same code still reachable through the flag.
  - **B3, B4, B7 removed.** Smallest 1.0.0 surface; refused: removing built code is a bigger step than not building more, and nothing else needs the removal.
  - **A wave for the hide work.** A wave file for one flag and some documents would be mostly empty; it is one planned-features entry.
  - **Backtracking hidden (later).** Little saved; refused.
- Trade-offs:
  - **The flag adds a second mode to test.** The suites for System Testing run in CI with the flag on; a few tests check that the routes are absent with it off.
  - **The default demo shows less.** Without `--with-system` the demo cannot pause a live call; the tour says how to start it.
  - **Data access stays in 1.0.0** although the vision says software architecture only; the vision now names the exception instead of hiding it.
  - **Deployment diagrams and runtime views wait**; a canary or blue/green split is modelled with a condition on a line (Wave 4) and a note.

#### PRO-21 · DEC-105 — A finished wave is replaced by its review file

- Date: 2026-11-20 · Status: Accepted (a rule for the wave agents; no wave is built yet) · Decided by: Owner ("whenever a wave is completed create a wave1-review.md file and delete the original wave-01-grounded-bmo file, and so on whenever each wave is implemented"). The file name `wave-NN-review.md`, the contents and the order of steps are Proposals. Replaces the owner's rule of 2026-11-19 that no wave file is deleted before 1.0.0.
- Decision: when a wave is complete (everything built, checks passed, reviews done) its agent writes `docs/waves/wave-NN-review.md`, deletes the wave file, fixes every link to it, and commits by path. The review file holds what was built, how it was checked, differences from the plan, limits, notes for the release entry, questions, an empty owner-feedback part, and the wave file's "Questions, options and answers" section word for word. The steps are in [waves/README.md](waves/README.md#closing-a-wave). Parked waves and partly built waves keep their files.
- Why: the wave file is a plan, and once the wave is built it describes what was meant, not what exists; the review says what is true. Copying the questions section keeps the options and the owner's words, which no other file holds.
- Alternatives considered: a section per wave in `reviews.md` (the earlier rule; one big file, and the wave file would still have to be deleted by hand later); keeping wave files until 1.0.0 (plans and reality sit side by side and drift).
- Trade-offs: links must be fixed at each close, and a missed one breaks a document (the agent runs a link check); the plan is no longer there to compare with the result, so the review file records the differences; the file name differs from the owner's wording only by the dash (`wave-01-review.md` follows the `wave-01-...` names).

#### PRO-22 · DEC-106 — The first release group is split, and Waves 23 to 27 are added from the planned features

- Date: 2026-11-20 · Status: Accepted (documents only; no wave is built) · Decided by: Owner ("Split it the best way you think. You can increase the number of waves"). The split, the five new waves and their order are the assistant's reasoning and so a Proposal. Amends DEC-098, DEC-102 and DEC-103 (release numbers only).
- Facts: 0.7.0 held Waves 1, 2, 3, 16, 4 and, in effect, entries A2 to A5, A7 and A8 of [planned_features.md](planned_features.md), which nothing in the waves placed (A8 only said "0.7.0 group"). The small batch (DEC-104, P2) was kept in 1.0.0 but had no release.
- Decision:
  - **Five new waves**, each from a planned-features entry: [Wave 23](waves/wave-23-sealed-credentials.md) (A7, credentials always sealed), [Wave 24](waves/wave-24-remove-project-from-hub.md) (A3, remove a project from a hub), [Wave 25](waves/wave-25-bmo-own-subscription.md) (A2 and the first half of A4, BMO on from the start with your own subscription), [Wave 26](waves/wave-26-users-and-roles.md) (A5, a Users page) and [Wave 27](waves/wave-27-small-batch.md) (the small batch).
  - **A8 stays a planned-features entry, not a wave** (DEC-104 refused a wave for it). It is done in the 0.7.0 group before that release change.
  - **The release groups.** 0.6.1 (Wave 23, a security fix, so a patch under DEC-098); 0.7.0 (Waves 24, 1, 2, 25 and A8); 0.8.0 (Waves 3, 26, 16, 4); then every later group moves up by one: 0.9.0 (5, 15), 0.10.0 (6, 7, 8, 27), 0.11.0 (9, 11, 17, 18, 19), 0.12.0 (13, 14, 22, 20), 0.13.0 (21). Then 1.0.0.
  - **Order inside the groups.** Wave 23 first, before the owner's first real provider call. Wave 25 after Waves 1 and 2 (it needs the citation checker and the deterministic BMO). Wave 26 before Wave 16, so attaching has people with roles. Wave 27 after Wave 7, so the CSV export can share its writer.
  - **Table items placed in existing waves** (no new wave): the "needs a look" alignment in Wave 6; the context-window display in Wave 14; the "no LLM" badge, the per-level Import URL, the known-services upkeep, the CODEOWNERS owner cards and the second half of A4 in Wave 15; the plan check on the generic reader in Wave 5; the draft-start code comparison as an optional part of Wave 18.
  - **Left unplaced on purpose:** A1 (Codacy and live refresh: feature J is built and the live parts are in the ideas list), A6 (hosted accounts, after 1.0.0), the light theme and the accessibility audit (items of the 1.0.0 checklist, after Wave 21), the coverage overlay, line routing stage 2, per-diagram hiding and ratings on relationships.
  - **Old to new release numbers:** 0.7.0 (1, 2, 3, 16, 4) became 0.7.0 (24, 1, 2, 25) and 0.8.0 (3, 26, 16, 4); old 0.8.0 became 0.9.0; old 0.9.0 became 0.10.0; old 0.10.0 became 0.11.0; old 0.11.0 became 0.12.0; old 0.12.0 became 0.13.0.
- Why: the first group was the largest by far and mixed three kinds of work (BMO, collaboration and reference, housekeeping). The split keeps each release one story, puts the security fix first as the entry asks, and gives every item the owner decided to build a place, so none is lost.
- Alternatives considered:
  - **One 0.7.0 with an order inside it.** No renumbering; refused because the group would hold ten pieces of work and release only at the end.
  - **Patch releases (0.6.2, 0.6.3) for the small waves.** No renumbering; refused because DEC-098 reserves the patch number for fixes, and A3 and A8 are changes.
  - **A wave for A8.** Refused by DEC-104 and kept refused.
  - **Waves for A1, the light theme and the accessibility audit.** Not added: A1 is outside the twelve features, and the other two are checklist items that depend on the final UI.
- Trade-offs:
  - **Release numbers written in DEC-098, DEC-102, DEC-103 and DEC-104 are the earlier plan.** Those entries keep their text and carry a "Now:" line pointing here; the wave files and the waves README hold the current numbers.
  - **0.7.0 is still the largest group** (two M–L waves, two M waves and A8).
  - **Wave 23 is a patch only if "fix" includes a security fix.** It changes how values are stored, not what the product does.
  - **Five new waves bring questions** (Q23.1 to Q27.2), each with a recommendation that holds if the owner leaves it blank.
  - **Two accepted decisions disagree on the context window** (DEC-099 Q-C1b refuses above the window; DEC-103 N12 only warns). Found while placing the item in Wave 14, whose file says to ask the owner; this entry does not settle it.
  - Now: DEC-107 settles it (a window the person typed is a limit; none typed means a warning), and changes the release groups again.

#### PRO-23 · DEC-107 — The second look at the waves: a real-run gate, the context window rule, Waves 28 and 29, moves and the deleted parked waves

- Date: 2026-11-20 · Status: Accepted (documents only; no wave is built) · Decided by: Owner for the real-run gate in Wave 1, the context window rule, adding Wave 28 without the light theme, making A8 a wave, deleting the parked Waves 10 and 12, and accepting that 0.7.0 and 0.8.0 stay large; the assistant's reasoning, at the owner's request ("go with best reasoning for the rest"), for everything else below, so each of those is a Proposal the owner may overrule. Amends DEC-065 (the size refusal), DEC-099 (Q-C1b), DEC-103 (N10, N12, N15), DEC-104 (A8 is now a wave) and DEC-106 (release groups).
- Facts: the owner asked to "rethink each wave" after the vision (DEC-090), the code-reading rule (DEC-096), the scope decisions (DEC-104) and the five waves of DEC-106 had changed the plan. No real model has ever answered through dp (manual test plan U1 to U3), the model ids were never checked, and Waves 1, 11, 15b, 20, 22b and 25 are written against the answer shape and verifier Wave 1 defines. DEC-099 (Q-C1b) and DEC-103 (N12, N15) disagreed on what happens above a model's context window. The 1.0.0 checklist named an accessibility audit, a scale check, models from older versions that must still open, a statement of what 1.0.0 keeps stable and a check of the package contents, with no wave to carry them.
- Decision:
  - **Real-run gate (owner).** [Wave 1](waves/wave-01-grounded-bmo.md) closes only after one real run through a route the owner uses (an API key, a chat subscription by handoff, or Ollama), after the default model ids are checked; [Wave 25](waves/wave-25-bmo-own-subscription.md) also needs one real handoff round trip. If no route can be tried, the BMO waves wait.
  - **Context window rule (owner).** A context window the person typed for the chosen model is a limit: a larger request is refused, and the message names the window, the estimate and what to narrow. With none typed, dp shows "limit not set" and only warns. The pass-budget refusal (`runTokenLimit`, DEC-065) stays in both cases. The window is part of the preview hash. It comes from the person only; reading an Ollama model's own value waits for a check on a real server (U27). Built in Wave 14a, which writes the DEC that records it.
  - **Wave 14 is split.** 14a (local runtimes, the typed window, the size shown before a run) ships in 0.9.0 and runs before Wave 15; 14b (the word index) stays in 0.12.0 and runs before Waves 22 and 20.
  - **Wave 27 moves to 0.8.0 and runs right after Wave 4**, which builds the shared CSV writer `src/core/csv.ts` (with the formula-character rule) that Waves 7 and 27 reuse.
  - **Wave 17 runs after Wave 18**, and Wave 18 leaves one place after a successful apply where Wave 17's hook runs. **Wave 8 gets a split point** (8a registry, presets and Rules page; 8b detectors and overlay). **Wave 13 adds a contracts section to the lenses** that Wave 19 builds first. **Wave 2 keeps the "Use an LLM" default in one constant** that Wave 25 changes.
  - **New Wave 28, quality for 1.0.0, without the light theme (owner).** 28a (guard rails: compatibility fixtures from released versions, a snapshot of the public surface, a generated large model with time budgets, a package-contents check) runs early and has no release of its own; 28b (an automated accessibility audit including the exported file, a keyboard-only walk, the fixes, the stable-surface statement) is 0.14.0 and runs last. Q28.1 to Q28.3 were settled by the assistant: a development-only checker, budgets at three times the first measured run, and the Python 0.2 sentence retracted unless a real file turns up. 1.0.0 is dark only and says so.
  - **A8 becomes [Wave 29](waves/wave-29-system-testing-switch.md)** (owner: "Yes"), in 0.7.0 and run last in the group. The flag is `dp serve --testing` only, with no setting; the demo's services start only with `--with-system`. This overrules DEC-104's "not a wave" and keeps its decision to hide and not delete.
  - **Waves 10 and 12 are deleted (owner).** Their designs moved to the ideas list (I2.3 and I2.7); the decisions that parked them (A7, DEC-097, DEC-104 P5 and P6) stand.
  - **Release groups now:** 0.6.1 (23, 28a), 0.7.0 (24, 1, 2, 25, 29), 0.8.0 (3, 26, 16, 4, 27), 0.9.0 (5, 14a, 15), 0.10.0 (6, 7, 8), 0.11.0 (9, 11, 18, 17, 19), 0.12.0 (14b, 13, 22, 20), 0.13.0 (21), 0.14.0 (28b), then 1.0.0.
- Why: a gate before six waves are built on an answer shape is cheaper than a redesign after them; one of two conflicting decisions had to give, and the combined rule honours both while dp never claims a limit it does not know; each move removes a double edit of the same code (line labels, `Drafts.apply`, a CSV writer, a default setting) or a missing input (the inherited owner before Wave 15's owner cards, the window before the import release); guards are worth most when they run before the work they guard; a flag without a wave had no start prompt.
- Alternatives considered: no gate (the real run happens last, on the checklist); the gate before Wave 25 only; "warn only" or "refuse and drop the pass budget" for the window; Wave 28 with the light theme, or no Wave 28; moving Wave 24 out of 0.7.0 (it only renames releases); splitting Wave 2 (Waves 5 and 25 need both halves); keeping Waves 10 and 12 as files (they were the longest designs for the ideas list, which now holds them).
- Trade-offs: Wave 1 cannot close without the owner's key or chat app; 0.7.0 holds five waves and 0.8.0 five (the owner accepted this); one more wave and release (0.14.0) and every later wave updates the public-surface snapshot; the ideas file is git-ignored, so the two parked designs are no longer in the repository; release numbers written in DEC-098, DEC-102, DEC-103, DEC-104 and DEC-106 are earlier plans, and the waves README holds the current ones.

## STK — Stack, files and repo layout

### Stack and delivery

#### STK-1 · DEC-006 — Local web app started by one command

- Date: 2026-11-13 · Status: Accepted · Decided by: Owner ("local web app for now")
- Decision: a local server reads and writes model files in a folder and serves the UI to the browser. No accounts, no hosted server.
- Why: simplest way to get a usable tool without installers or accounts.
- Trade-off: no installable desktop app for now. The UI could later be wrapped in a desktop shell or published as a static demo.
- Amended by DEC-041.

#### STK-2 · DEC-012 — All-TypeScript stack

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (asked for the best language; "I know all languages"); supersedes the earlier Python-first plan
- Decision: one TypeScript stack: Node.js server (Hono), `dp` CLI (commander), React UI, and one shared API-types file (`src/shared/types.ts`).
- Why: removes hand-copied API types between server and UI, and keeps model rules reusable in the browser later. This reasoning is the assistant's assessment, not a measurement.
- Options rejected: Python backend with TypeScript UI (two languages, types copied by hand); Rust (Tauri) with TypeScript UI (full rewrite, slower iteration).
- Trade-off: Python import scanning uses a hand-written tokenizer instead of `ast` (a file with a syntax error still shows its imports); numbers are written as JavaScript writes them, so a project saved by 0.2 gets a one-time diff.
- Details: `reviews.md`.

#### STK-3 · DEC-014 — Built UI is committed

- Date: 2026-11-14 · Status: Accepted (closed by DEC-063: the built UI stays committed) · Decided by: assistant
- Decision: the built UI (`static/`) is committed and shipped in the npm package; CI fails if a build changes it.
- Why: installing from git does not require building the UI.
- Trade-off: build output creates large diffs after every UI change.


### Model file format

#### STK-4 · DEC-007 — Native model file is a Structurizr workspace plus a sidecar

- Date: 2026-11-13 · Status: Accepted · Decided by: Owner delegated; choice is a Proposal
- Decision: `architecture/workspace.json` is a Structurizr workspace (elements, relationships, views, positions, flows). `architecture/designperspectives.json` holds data Structurizr has no field for (tag groups, lenses, characteristics list, cost settings, styles, layouts). Per-object extras are stored as `dp.*` properties inside the workspace.
- Why: Structurizr's format is open (Apache-2.0), plain JSON and widely understood; adopting it avoids adding another C4 format.
- Options rejected: own JSON files (a new format nobody else reads); LikeC4 DSL and Structurizr DSL (the UI would have to write canvas edits back into DSL source).
- Trade-off: one large file per workspace (more merge conflicts than many small files); Structurizr's numeric IDs are replaced by readable slugs here; opening our files in Structurizr's own tools has not been verified.


### Tooling

#### STK-5 · DEC-034 — ESLint enforced, Prettier configured but not enforced

- Date: 2026-11-14 · Status: Accepted (built in Stage R; the Prettier part is out of date, see "Now" below) · Decided by: [Proposal]
- Decision: ESLint runs in CI (`npm run lint`) with the recommended rules for JavaScript and TypeScript and the two hook rules. Prettier is configured (print width 200) with `npm run format` and `format:check`, but it is not applied and CI does not check it. The 18 hook-dependency warnings were each reviewed and marked intentional with a reason. No dependency array was changed.
- Why: lint finds real bugs at low cost. Applying Prettier now would re-wrap 58 of 113 source files and bury real changes in the history.
- Trade-off: the code is not formatted to one style until the owner decides. The hook-dependency disables are only correct while callers keep passing state setters and refs.
- Now: Prettier is enforced. CI runs `npm run format:check` (`.gitlab-ci.yml:38`, `scripts/ci-local.ts:47`) and the code was formatted (reviews.md, release 0.4.0). No decision records the change; this note does.


### Layout and naming

#### STK-6 · DEC-062 — Files are grouped by area with plain names

- Date: 2026-11-16 · Status: Accepted (names partly replaced by DEC-066) · Decided by: Owner [2026-11-16] ("keep it easy for users to navigate around this project so straightforward names and combine files that can be combined"), [Proposal] (the layout)
- Decision:
  - **Backend.** `src/core/` keeps the model modules, with plain names: `project.ts` (was `store.ts`), `uiInspector.ts` (was `inspect.ts`), `codeFiles.ts` (was `codefs.ts`), `codeMap.ts` (was `code.ts`, with `functions.ts` folded in), `util.ts` (was `fsutil.ts` and `json.ts`), and `diff.ts` (with `compare.ts` folded in). The demo code moves to `src/demo/` (`demoApp.ts`, `demoHistory.ts`).
  - **Routes.** `src/server/routes/` has one module per area: `read.ts` (with history and backtracking), `drafts.ts`, `model.ts` (with flows, work status and catalog copies), `sidecar.ts`, `code.ts`, `decisions.ts`, `inspect.ts`, `comments.ts`, `hub.ts` (with credentials) and `ui.ts`.
  - **UI.** `ui/src/` is split into folders: `canvas/` (diagram drawing, line routing, the palette and the dock), `hooks/`, `panels/` (the right-hand property panels), `pages/` (home, catalog, credentials, history, decisions and sign-in), `drafts/` (the draft list, change list and apply dialog), `inspect/` (live UI inspector and backtracking), and `common/` (shared dialogs, icons and widgets). Files that stay at the root are `main.tsx`, `Root.tsx`, `App.tsx`, `api.ts`, `types.ts`, `storage.ts`, `menus.ts`, `actions.ts`, `overlays.ts`, and `styles/`.
  - **Rule going forward.** A new file goes in the folder for its area. A file under about 50 lines with one user is folded into that user. A file is named after the main thing it holds.
- Why: the flat `ui/src` had about 60 files, and several route modules were 10 to 40 lines long. A newcomer could not tell where to look for a feature.
- Trade-off: `git blame` and older review notes name the old paths. `git log --follow` follows the renames, and reviews are history, so they are not rewritten. Larger route files (`model.ts`, `hub.ts`, `read.ts`) now hold several areas each.

#### STK-7 · DEC-066 — Repository layout: a short root, one demo folder, one tests folder, readable names

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("the only file in the root that is not in a folder is README.md"; merge the conduct, contributing and security files; delete NOTICE; demo and sample material in one folder; one tests folder with a spreadsheet of every test; readable names, source files included; keep package.json, package-lock.json, LICENSE and .gitignore at the root because the tools require them; a generated CSV for the test list), [Proposal] (details)
- Decision:
  - **Root.** Only `README.md`, `LICENSE`, `package.json`, `package-lock.json` and `.gitignore` stay at the root, with the folders. Tool settings move to `config/` (`tsconfig.base.json` plus a small `tsconfig.json` in `src/`, `tests/` and `scripts/`; `tsconfig.json` there for the one-pass typecheck; ESLint, Prettier, Vitest, Playwright). The npm scripts pass the paths; `.vscode/settings.json` points the editor extensions at them. `CHANGELOG.md` moves to `docs/`, `CLAUDE.md` to `.claude/`. The owner's own files (reference books, notes) live in the git-ignored `local/`.
  - **One policy file.** `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` and `SECURITY.md` become `docs/CONTRIBUTING.md` (contributing, code of conduct, reporting a security problem, security model).
  - **NOTICE removed; the credit kept.** The demo model's Apache-2.0 attribution moves to `demo/README.md` (Credits), with a pointer in `README.md`.
  - **One demo folder.** `demo/` holds the model, sample code, sample draft, demo hub, example import file, example CI jobs (`ci-examples/`, from `docs/examples/ci/`) and the guided tour (`README.md`, from `docs/demo-tour.md`).
  - **One tests folder.** `tests/unit/` (Vitest: logic, API, CLI; no browser) and `tests/browser/` (Playwright, from `e2e/`). They stay two folders because they need two runners. `tests/TESTS.csv`, generated by `scripts/list-tests.ts` from the test files, lists every test (one row per written test) with its purpose, the source files it covers, what it needs and the command to run it alone; CI fails when it is stale. Each test file starts with a one-line doc comment. `npm run test:e2e` is now `npm run test:browser`.
  - **Readable names.** The built UI is `static/assets/app.js`, `app.css` and `diagram-layout.js`, with no content hash; the server sends them with `Cache-Control: no-cache` and an `ETag` (304 when unchanged) instead of a year-long immutable cache. Unclear source files are renamed (for example `ops.ts` → `modelEdits.ts`, `units.ts` → `modelUnits.ts`, `sidecar.ts` → `designPerspectivesFile.ts`, `src/bmo/` → `src/assistant/`, `Dock.tsx` → `OverlayDock.tsx`, `canvasParts.tsx` → `BoxesAndLines.tsx`); `sectionEditors.tsx` and `valueEditors.tsx` are merged into `listEditors.tsx`. Product terms and on-disk names stay: BMO, `/api/bmo/*`, `.dp/bmo.json`, `designperspectives.json`.
- Why: the owner found the root and the file names hard to read, and wanted one place each for the demo and the tests, and a list of what each test checks.
- Trade-off: npm, git and GitHub only read their files at the root, so five files stay there. Tools run from `config/` need explicit paths, and an editor without the `.vscode` settings will not find the ESLint and Prettier settings. GitHub's Security tab no longer links a policy file (private vulnerability reporting still works; the issue template links the new section). Without content hashes the browser asks the server whether each asset changed on every load (cheap on a local server; one round trip per file). The renames touch most files once and make older commits and reviews name the old paths (DEC-062 and earlier reviews are left as written). The CSV has one row per written test, so a test in a loop is one row although it runs once per item.


## MOD — Model and diagrams

### Model structure

#### MOD-1 · DEC-021 — Groups are model objects

- Date: 2026-11-14 · Status: Accepted (storage open) · Decided by: Owner
- Decision: groups (layer, bounded context, subsystem, module, org unit) are queryable and taggable model objects, not shapes drawn on a single diagram.
- Why: groups must work with tags, overlays, lenses, checks and diffs.
- Trade-off: more model work than drawn boxes. Open: whether an element can be in several groups, whether groups nest, and how they are stored (Structurizr's `group` string cannot carry tags, so a sidecar list or `dp.*` data is likely).

#### MOD-2 · DEC-023 — Shared resources are modelled as their own container or system

- Date: 2026-11-14 · Status: Accepted (revisit if it confuses people) · Decided by: Owner (chose the simpler option from a comparison)
- Decision: a shared library or service is its own container or software system, and each user of it has a relationship to it. No multi-parent elements. A component keeps exactly one parent, as in Structurizr.
- Why: works today, stays standard Structurizr, keeps unique names per scope and cost rollups simple.
- Options rejected for now: multi-parent elements (extra parents stored in `dp.*` data, shown as references) — a medium to large change that breaks the one-parent rule.
- Trade-off: a shared library does not look "inside" the apps that use it; their diagrams show it as an outside box. A "shared" tag with a legend entry is a cheap aid if needed.

#### MOD-3 · DEC-025 — Groups can nest

- Date: 2026-11-14 · Status: Accepted (storage and multiple groups open) · Decided by: Owner
- Decision: groups nest (for example a layer containing bounded contexts). Refines DEC-021.
- Why: layers, contexts and org units are naturally trees.
- Trade-off: nesting needs cycle checks and a rule for deleting a group that has children. Still open: whether an element can be in several groups, and where groups are stored. Structurizr's own `group` is a plain string on an element [Training], so groups that carry tags need a sidecar list or `dp.*` data.

#### MOD-4 · DEC-027 — One group per element; tags for other dimensions

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner
- Decision: an element belongs to at most one group. Groups nest (DEC-025), so an element's group is one path in a tree. A second dimension (for example a compliance scope next to a layer) is a tag, not a second group. Refines DEC-021 and DEC-025.
- Why: maps onto Structurizr's single group per element, and avoids a colouring rule for overlays when an element has several groups.
- Trade-off: an element cannot sit in two trees at once; the tag is a flat label without nesting. Storage (Structurizr's `group` string with a separator, or a sidecar list so groups can carry tags) is still to be decided in the plan.

#### MOD-5 · DEC-037 — Elements can change parent; drafts treat a move as a change to the element

- Date: 2026-11-15 · Status: Accepted (built in Stage P2) · Decided by: [Proposal]
- Decision: a container can move to another software system, and a component can move to another container (`POST /api/elements/:id/move`). The move keeps the ID, the children and the relationships. It is refused when the name is already taken in the new parent, or when a relationship would then join an element and its own parent. In a draft, a move is one change to the element (Parent before → after). Apply merges it. The merge reports a conflict if main moved, changed or removed the element, or removed the new parent. In the compare overlay the element shows as changed in its new place, and a ghost marks the old place. People and software systems cannot move.
- Why: a box in the wrong parent should be moved, not deleted and added again. Adding it again loses its ID and its relationships.
- Trade-off: a move and any other change to the same element on the other side conflict, even when the two edits do not overlap. The merge does not try to combine them. People and software systems do not move because they are top-level in the C4 model.


### Deployment

#### MOD-6 · DEC-019 — Deployment diagrams come next, on the native Structurizr deployment model

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (order and model choice)
- Decision: the next stage builds deployment diagrams ahead of the other small backlog items. They use Structurizr's own deployment model (deployment nodes, infrastructure nodes, container instances, deployment views) rather than a tag-based substitute. Deployment diagrams are computed from the model like the C4 diagrams (DEC-010): connections are entered once at container level and shown between instances.
- Why: most requested missing view in the backlog review; native data stays readable by Structurizr tools.
- Trade-off: more element kinds to build and test than tags on containers. Deployment nodes are currently kept as one unit in `units.ts`, so they need per-node units before drafts and `dp diff` handle them well. Opening our files in Structurizr's tools is still untested.
- Open: first-cut scope, one or several environments per diagram, per-system or per-environment diagrams (to settle in the stage plan).

#### MOD-7 · DEC-022 — Deployment first cut

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (confirmed the proposed scope)
- Decision: the first deployment stage covers deployment nodes (nested), infrastructure nodes and container instances. One environment per diagram. Software system instances, deployment groups, health checks, side-by-side environment diff and cost per environment come later. Refines DEC-019.
- Why: smallest slice that shows where each container runs.
- Trade-off: no multi-environment view in the first cut; a system that is deployed as a whole (no containers modelled) cannot be shown yet.


### Diagram content

#### MOD-8 · DEC-010 — Diagram content is computed from the model

- Date: 2026-11-14 · Status: Accepted (open to revisit) · Decided by: assistant (decision, per `reviews.md`)
- Decision: each diagram shows everything at its level, like `include *` (a container diagram shows all containers of the system plus what they connect to). Lower-level relationships appear on higher-level diagrams as dashed derived lines, which are not written to the file. Positions are stored at twice the UI size in Structurizr units.
- Why: a rename shows everywhere, and relationships are not duplicated in the file.
- Trade-off: an element cannot be hidden from one diagram (per-diagram hiding is in the backlog); in Structurizr, our views show only explicit relationships.

#### MOD-9 · DEC-068 — A diagram's cost is the cost of what it is about

- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] ("monthly costs should reflect the actual cost of what you are viewing now; it really should be $8690 for C2"), [Proposal] (the second row)
- Decision: a context, container or component diagram shows the monthly cost of its scope (the system or container, with everything inside it). Boxes drawn around it that carry a cost (external systems, neighbouring containers) are added up in a second row, "Outside this system" or "Outside this container". The landscape has no scope and adds up the boxes it shows. The Cost overlay uses the same figures (`ui/src/diagramCost.ts`).
- Why: adding up every box on a container diagram counted the neighbouring systems (for example the Mainframe at $9,500) as part of the system's own cost.
- Trade-off: the scope's figure includes objects the diagram does not draw (for example containers hidden by a lens), so it is not always the sum of the boxes seen. The second row keeps the rest visible.

#### MOD-10 · DEC-078 — Only a missing diagram opens the landscape

- Date: 2026-11-16 · Status: Accepted · Decided by: [Proposal], in the interaction fixes the owner asked for [2026-11-16]
- Decision: when a diagram cannot be loaded, only the answer "not found" (404) means the diagram is gone. The landscape then takes its place, also in the browser history (the entry is replaced, not added), and a short notice says so. Any other failure (the server, the network) shows an error and leaves the view as it is.
- Why: every failure used to open the landscape without a word, and as a new history entry, so Back returned to the missing diagram and was sent forward again each time.
- Trade-off: the Back list no longer holds the address of a deleted diagram, so it cannot be reached again by Back after an undo brings it back; the sidebar still opens it. After a failure that is not "not found" the diagram on screen can be the one opened before, under the new address, until the next load works.


### Lenses

#### MOD-11 · DEC-008 — Engineer is the default lens

- Date: 2026-11-13 · Status: Accepted · Decided by: Owner ("Engineer first starting lense"; "only built-in lens" is the assistant's reading)
- Decision: the Engineer lens is the default; users create further lenses. Business and Security presets are in the backlog.
- Why: the first audience is engineers.
- Trade-off: the lens mechanism is built, but only one preset ships. Lenses are defaults for what a person sees, not access control.

#### MOD-12 · DEC-011 — Active lens is remembered per browser

- Date: 2026-11-14 · Status: Accepted · Decided by: assistant (per `reviews.md`)
- Decision: the active lens is stored in the browser (localStorage), not in the project files. Lens definitions stay in the sidecar.
- Why: switching lenses should not create git changes.
- Trade-off: the active lens does not follow the user to another browser.

#### MOD-13 · DEC-038 — Architect and Overview built-in lenses; default lens depends on the model

- Date: 2026-11-15 · Status: Accepted (built in Stage P2) · Decided by: [Proposal]
- Decision: two built-in lenses ship next to Engineer. **Architect** shows all levels and all sections. **Overview** shows the landscape and context levels, and hides the cost, notes, trade-offs, sensitive and code sections, and technology. The state response has `defaultLens`: Architect when the model has no containers, otherwise Engineer. The lens a person picks is remembered per project in the browser (the key includes the project folder). The resolved default is saved on the first load. This refines DEC-008: Engineer stays the default once the model has containers.
- Why: a model with no containers has nothing below the landscape for the Engineer lens to show, so the broad lens fits better there. Overview gives a summary for readers who do not need detail.
- Trade-off: the same person can see a different default lens in different projects. The saved default does not change when the model gains containers, so a user who started with Architect stays on it until they switch to Engineer by hand.


### Colour and overlays

#### MOD-14 · DEC-013 — Dark theme only, with overlays for characteristics and cost

- Date: 2026-11-14 · Status: Accepted (open question: light/dark switch) · Decided by: owner asked for a closer-to-reference layout and for cost and "-ility" information; specific design choices by the assistant
- Decision: dark theme only; per-object characteristic ratings (1–5, with a "driving" flag) and monthly cost lines; cost rolls up from contained objects; editable cost bands.
- Trade-off: exports have a dark background; ratings and cost live on objects only (not on relationships or flows).
- Details: `reviews.md`.

#### MOD-15 · DEC-083 — A diagram has colour of its own: lines by connection kind, a hue per pipeline, a tint per kind of box

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("add more colour and make the UI more appealing", "colour can represent data, like pipelines in different colours", "go with what you think is best"), [Proposal] (the rules below)
- Decision: besides overlays, a diagram is coloured by what the model already says, with nothing stored. (1) A line takes the colour of its connection kind (synchronous API, message, stream, data pipeline, batch, database connection, file transfer, cloud service); a line with no kind takes one from its technology when that names a well-known one (HTTPS, SQL, Redis, Kafka, MQ, SFTP). Kinds that are easy to confuse also have a pattern (dashes, dots). (2) A connection with stages is a pipeline and has its own hue, chosen from eight by a hash of the relationship ID; inside it, the line and the stages take that hue and the stages get stronger along the pipeline. (3) A summary line (derived from lower-level relationships) takes a colour only when every relationship behind it has the same kind, and stays dashed. (4) Boxes get a quiet tint of their kind (person, system, container, component). **Order of precedence:** a fill or line colour set by hand, then an overlay, then these. A legend (**Colour**, bottom left) lists what is on the diagram and holds the switch; the switch is kept in the browser (`dp.colour`) and turns all of it off.
- Why: the canvas was grey apart from overlays, so a diagram said nothing until someone chose an overlay, and the connection kind, the technology and the pipelines the model holds were not visible at all. Colour from the ID (not from how often a value occurs, as technology overlay colours are) keeps a pipeline's colour when others are added.
- Trade-off: a busier canvas by default (hence the switch). The kind taken from a technology is a guess made from words (a message queue that is described as "JSON over MQ" is a message, but an unusual product name gets no colour); it is used for colour only and is never written to the model. Eight pipeline hues repeat in a model with more pipelines on one diagram. The switch is per browser, not per diagram or per project, and the model's own colours (tag groups, characteristics) are not changed.


## CAN — Canvas, editing and layout

### Editing behaviour

#### CAN-1 · DEC-033 — In-app dialogs replace browser prompt and confirm

- Date: 2026-11-14 · Status: Accepted (built in Stage R) · Decided by: [Proposal]
- Decision: the browser's prompt and confirm boxes are replaced by in-app dialogs. Dialogs take focus, keep Tab inside, give focus back when they close, and close on Escape without clearing the canvas selection. Keyboard shortcuts do nothing while a dialog is open. Destructive confirms name the action (Delete, Discard). Prompts trim the text and refuse an empty value. Failures that used to be silent are shown in an error slot or as a toast.
- Why: native boxes cannot be styled, they block the page while open, and keyboard shortcuts can act behind them.
- Trade-off: more UI code to maintain. Browser tests must click the dialog buttons, and they fail if a native dialog opens.

#### CAN-2 · DEC-035 — Add-and-connect, readable IDs, several boxes, one lens per project

- Date: 2026-11-15 · Status: Accepted (built in Stage P2) · Decided by: [Proposal]
- Decision: (1) A person or software system added on a context, container or component diagram is created together with a line (one request, one undo step): to the system on a context diagram, else to the selected box inside the boundary, or the only box inside it. With two or more boxes and none selected nothing is created and a short notice says to select one; with none inside, the palette items are disabled with the reason. A line dragged onto empty canvas opens a small menu of the kinds the diagram can add (the usual kind first, Enter takes it, Escape cancels) and creates the box with its line in one request. (2) The first rename of a box added in this session sends `reslug`, so its ID is made from the new name; Escape keeps the generated ID. (3) Shift+click and Shift+drag select several boxes (never lines, ghosts, stages or files): they move and nudge together and are deleted with one question and one undo step (`POST /api/elements/delete`). (4) Move to… is offered for containers and components, built on the server's move rules; a refusal is shown in the dialog. (5) The lens is remembered per project (`dp.lens:<project folder>`), and the lens picked on first load is saved. (6) A software system with nothing inside is one sidebar entry, marked "(empty)", that opens its containers diagram.
- Why: before this, a person added on a container diagram vanished (it had no line), IDs kept names like `new-container-2`, deleting several boxes took one question and one undo each, and a model that began empty changed lens when its first container was added.
- Trade-off: the notice for an unclear target asks one extra click instead of guessing. The first rename after a reload no longer renames the ID (the fresh mark lives only in the open page). Multi-select uses Shift for both click and drag, so Ctrl/Cmd+click is not a second way. The context diagram of an empty system is no longer listed in the sidebar (it stays reachable from the system's panel, the breadcrumb and double-click). A kind menu adds one step to dragging a line to empty canvas for diagrams that offer several kinds.

#### CAN-3 · DEC-067 — A change by hand moves only what it touches

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("if the user manually moves things around it should modify only that object, don't automatically rearrange everything; only if the user manually requests it or selects a specific bunch to move around"), [Proposal] (how)
- Decision: after a change by hand (a box dragged or nudged, a line added, removed or changed, a label that changes size) the canvas plans again only the lines that changed or touch a box that moved (`updateLines` in `ui/src/canvas/lineLayout.ts`). Every other line keeps its ends, route and label exactly. Every line is planned together only when a diagram or another model version opens, and when a person asks for Auto-layout, or Make room or Spread out on the whole diagram. Make room and Spread out on a selection plan only the lines of the boxes they moved. A box dropped on top of another still goes to the nearest free spot; that moves only the dropped box.
- Why: before, the end of a drag planned every line again (ends, lanes, labels), so lines and labels far from the moved box jumped.
- Trade-off: the line plan is not saved. Opening the diagram again plans every line together, so lines can look different from the picture just before (the boxes are where they were). A line planned again keeps clear of the lines and labels that stay, but those are not moved to make room for it, so a crowded spot can get tighter until the person runs Make room or Auto-layout.

#### CAN-4 · DEC-072 — Changing several objects at once is one edit

- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] ("if I select multiple objects and edit, it should modify all of them"), [Proposal] (how)
- Decision: with two or more boxes selected the panel shows the fields every selected kind has (owner, symbol, technology, tag groups), with the shared value or "Mixed". A change applies to all of them through `POST /api/elements/update` (`{updates: [{id, patch}]}`), one undo step; an error on one element changes none. Technology chips on only some of the boxes are shown faded ("on 2 of 3"); a click adds them to all. The Incoming and Outgoing lists in the element panel can be edited the same way: description and technology in place, delete, and add a connection.
- Why: editing a selection one box at a time was slow and left several undo steps.
- Trade-off: a mixed selection (a person and a container) shows only the fields both have. Box colours are not in the multi-selection panel yet: styles are saved per object and would take several undo steps.


### Lines and layout

#### CAN-5 · DEC-042 — Layout is built from rows that wrap, with measured insets; the canvas keeps a minimum width

- Date: 2026-11-15 · Status: Accepted (built in Stage P5) · Decided by: [Proposal]
- Decision: the top area is two rows that wrap instead of one bar that scrolls. Crumbs truncate, middle first. The search box collapses to an icon. The draft strip and the role banner are one row that wraps, and Apply, Discard and Back to main always stay visible. Bars, the Add palette, the dock and the zoom buttons share measured insets. Fit-to-view fits the area they leave free. A side panel cannot shrink the canvas below 420 px. The right panel collapses to a rail, and it starts collapsed under 1100 px. The app is not supported below 760 px wide.
- Why: at 1024 px and 1280 px, the search and lens bar covered the breadcrumb, and the change counts stacked so the draft strip scrolled sideways. Fixed sizes and pure CSS placement could not keep the bars and the canvas clear of each other as panels opened and closed. Measuring the insets lets fit-to-view and the quick bar use the space that is really free.
- Trade-off: more layout code, and a measured attribute (the insets) that must be kept in step with the CSS. The diagram re-fits when the canvas resizes until the user pans or zooms, and it does not re-fit when only a dock panel opens. Below 760 px the canvas is shown with both panels collapsed, and nothing else is promised.

#### CAN-6 · DEC-052 — Lines use right angles, go around boxes and spread out on each side of a box

- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (straight lines that turn at right angles; separate lines into the same box)
- Decision: a line whose shape is "Automatic" (no saved shape) is now drawn with right angles and rounded corners instead of a straight diagonal (or a curve for a second line between the same two boxes). Lines are routed together for the whole diagram, not one at a time. Each end picks a side of its box: the side facing the other box, an L with one bend when the boxes are diagonal, or a straight line when they line up. All line ends on one side are spread along it, ordered by where the other end is, so they do not meet at one point or cross next to the box. Ends set by hand (dragged anchors) and a dragged bend point are kept; a dragged bend point is a point the line passes through. A label with no saved position sits on the middle of the line's longest segment, not on a corner. Automatic lines also go around other boxes. A route keeps 15px clearance from a box; where the gap is tight it uses 5px. If no way exists, the line keeps its old path. When a box blocks the sides a line would use, another pair of sides is chosen. For example, a line leaves from the right side and enters from the top instead of running down through two boxes. Labels are placed where they do not overlap other labels or boxes. Label sizes are estimated from the label text (`ui/src/labelSize.ts`). Routes are computed on every render, including during drags, and are not saved, so the model files and git diffs do not change. The code is a pure module, `ui/src/routing.ts`, with unit tests.
- Why: the owner asked for straight lines that turn at 90 degrees, and for lines into the same box to be separated instead of overlapping [Owner, 2026-11-15]. Spreading the ends is the cheapest fix with the largest effect. Computing all lines in one pass is what makes it possible.
- Trade-off: existing diagrams change look on next open. Lines with no saved shape become right-angled, and a saved bend point on such a line now places the middle segment instead of bending a curve. A saved shape (straight, curved, smooth) still wins, per line. Remaining: lines can still sit on top of each other in a shared gap; labels can still sit on neighbouring lines; straight, curved and smooth lines are not routed around boxes or used in label placement; side switching is skipped for lines with a hand-set end or bend point (their path is still routed around boxes). Moving a box can move the ends of other lines on the same side. Next steps are in the backlog.

#### CAN-7 · DEC-061 — Default line shape per diagram, lanes, and Make room / Spread out

- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] (90° lines by default unless the path is straight; a per-diagram default; a way to make room in a crowded diagram)
- Decision:
  - **Default line shape.** Each diagram has a default line shape, stored as `layouts[<diagram>].lineShape` in the sidecar. When absent, the shape is rounded right angles, the owner's choice. It is set from the diagram details panel ("Line shape"). Choosing "Rounded right angles (default)" removes the key, so the diagram follows the default again. An explicit "rounded" from older files is still accepted. A value this version does not know (for example, one written by a newer version) is kept on disk and treated as the default. [Decided by the main session; the owner said "do whatever you think is best".] A line's own saved shape wins. The "Automatic" option of a line names the diagram default. A change shows in drafts and `dp diff` as a layout change.
  - **Lanes and labels.** Lines that run on the same coordinate through a gap are spread into lanes 10px apart (8px or 6px when tight). Lanes are ordered so the lines do not cross at the ends of the shared part. Line ends at boxes never move. A near-straight line whose two ends differ by under 12px is made straight by aligning the two ends. Labels also avoid lying on other lines: weight 8 for a line, against 10 for another label and 4 for a box.
  - **Make room and Spread out.** Two canvas actions, in the toolbar next to Auto-layout and in the empty-canvas right-click menu.
    - Make room adds space only where two boxes are closer than the base gap (50px) plus 12px for each line running between them, plus the size of any label there. When one box is inside the system boundary and the other is outside, the boundary padding is added too.
    - Spread out does the same and makes every gap about 20% larger.
    - Both stretch each axis without changing which box is left, right, above or below another. Boxes in one row or column stay lined up. Sizes do not change. The drawing's top-left corner stays put.
    - Each is one undo step. Make room on a diagram with nothing too close says so and saves nothing.
    - With two or more boxes selected, both act on the selected boxes only, spreading around the centre of the selection. Unselected boxes move only if a selected box would end up closer than the base gap, and then only as far as needed. With fewer than two boxes selected, both act on the whole diagram [Owner, 2026-11-15]. The labels say "(selected boxes)". Boxes hidden by a filter take part and keep their order. Boxes shown only in compare mode never move. Lines and labels of every shape (not only right angles) count in the room needed. Boxes almost on top of each other (centres within 8px) are separated along x.
    - Code: `ui/src/spread.ts`.
  - **Drag performance.** While a box is being dragged, only the lines touching it are re-routed. Lanes and label placement run once on release. This keeps large diagrams responsive.
- Why: the owner asked for 90° lines by default unless the path is straight, a per-diagram default, and a way to expand a crowded diagram, such as the Internet Banking System containers diagram, so that boxes which are too close get space naturally [Owner, 2026-11-15]. Stretching only where needed keeps the picture people already know. A full auto-layout would rearrange it.
- Trade-off: on the demo containers diagram, labels crossed by another line went from 19 to 11, not to 0. Some labels now sit up to about 400px along their line from its middle. Total line crossings rose slightly (21 → 23), because separating lines that lie on top of each other sometimes needs a crossing. Make room uses the routes and labels of the current drawing, so a second press right after can still find a little to do in rare cases. During a drag, lanes and labels update only on release. The sidecar gains one optional key.

#### CAN-8 · DEC-071 — Lines can be shaped by hand, and near-straight lines are straight

- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] ("when a line is a few pixels from being straight it should auto-adjust straight"; "modify lines by selecting the line anywhere to adjust that specific part"), [Proposal] (how)
- Decision: a jog shorter than 12 px in a planned right-angle line is removed, by moving an inner piece or sliding an end along its box side; it is never removed by undoing a lane or cutting a box. Hand drags snap within 8 px, and straight lines within 2° of level. On a selected right-angle line any piece can be dragged sideways; on a straight line dragging anywhere adds a corner; on curved lines dragging anywhere moves the bend. The corners are saved as `points` on the line's layout (canvas units, at most 50). They win over the bend point and the planner; a change of line shape, "Reset line shape" and Auto-layout clear them. When both boxes of a line move together (or with Make room / Spread out) the corners move with them; when one box moves, that end re-attaches.
- Why: a line a few pixels off straight looked broken, and only the single bend grip could change a line's path.
- Trade-off: lines shaped by hand are not put into lanes or routed around boxes, and other lines do not route around them; only their ends are respected. Moving boxes saves positions and corners as two requests.


### UI state and awareness

#### CAN-9 · DEC-039 — The UI applies only the newest response and rechecks the model on window focus

- Date: 2026-11-15 · Status: Accepted (built in Stage P3) · Decided by: [Proposal]
- Decision: each request gets a ticket, and the UI applies only the response to the newest one. A slower, older response is dropped. The state response carries a `version`. When the window regains focus, the UI checks it and reloads only if the model changed. There is no timer. The check waits while the user is typing or a dialog is open.
- Why: quick edits and drags could apply responses out of order, so a box jumped back. A focus check picks up git checkouts, other tabs and CLI edits without a push connection.
- Trade-off: there is no live push, so a change made elsewhere shows only when the window regains focus. A superseded response is dropped silently.

#### CAN-10 · DEC-079 — "Needs a look" is one rule, and a proposed decision is part of it

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner approved the plan [2026-11-16]; the rule itself is a [Proposal]
- Decision: a decision needs a look when `decisionFlags` reports anything for it: a review or a deadline that has come, a trigger that is met, a record that cannot be read, or the status "proposed". `decisionNeedsLook` in `src/shared/decisionAlerts.ts` is the one place for it; the top bar badge, the filter on the Decisions page and the list on its first screen all use it.
- Why: the three places counted differently (the filter counted proposed decisions, the badge and the list did not), so the same page could say "2" and show none.
- Trade-off: the top bar badge now also counts proposed decisions, so it is rarely empty in a project that discusses decisions; it says less about urgency than before. The home page's "needs a look" list is built by the server from the warning flags only and was not changed, so it can show fewer decisions than the badge.
- Now: DEC-099 aligns the home page list with the badge (proposed decisions included); not built yet.

#### CAN-11 · DEC-080 — A bell with what waits now and what was shown earlier

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("include notification symbol in the top right that has log warning/errors and relevant notifications"), [Proposal] (what it holds)
- Decision: a bell at the top right, in a project's top bar and on the hub pages. Its list has two parts. "Now" is computed from the state: load errors of the model, drafts that are behind the main model, and the number of decisions that need a look (DEC-079); each item opens what it names. "Earlier in this tab" is a log of the errors and notices the page showed, newest first, at most 50, with a count of the ones not seen yet. Successes are not logged. The log lives in memory (`ui/src/common/notify.tsx`), is the same list in a project and on the hub pages, and is gone when the tab is reloaded.
- Why: an error stays only until it is dismissed or replaced (there is one error slot) and a notice is gone in three seconds, so what went wrong could not be read again.
- Trade-off: nothing is stored or shared, so the bell says nothing about what happened before the reload, in another tab or to another person; a stored, per-user list would need a file and a rule for who sees what. The hub pages have no "Now" part: what waits there is already on the home page. The yellow dot for waiting items is shown only when nothing is new, so it can be missed behind a count.


## DRF — Drafts, compare and history

### Drafts

#### DRF-1 · DEC-016 — Drafts are folders with a base copy; applying is a three-way merge

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner (merge behaviour, storage, scope); file layout and merge granularity by the assistant (Proposal)
- Decision: a draft is `architecture/drafts/<id>/` holding its own `workspace.json` and `designperspectives.json`, a `draft.json` (title, description, date) and `base/` (the main model's two files when the draft was made). Drafts are meant to be committed. Applying merges object by object (element, relationship, view, position, tag group, lens, style, layout entry): a change on one side wins; the same change on both sides is kept; different changes to the same object are a conflict and nothing is applied. Positions and other layout never conflict (the draft's wins). References are checked after the merge (an element inside a removed element, a relationship to a removed element) and model rules are run, so a merge that breaks one (e.g. two containers with the same name) is refused too. Apply is one undo step on the main model and deletes the draft.
- Why: the base copy is what makes a three-way merge possible, so a draft can live while the main model keeps changing. Object-level units match how the model is edited (one edit touches one object), so unrelated edits merge cleanly.
- Trade-off: five files per draft in git; Structurizr tools ignore the folder. A conflict must be resolved by editing one side (no merge editor yet). Undoing an apply restores the main model but not the draft (git history still has it). New objects from the draft are placed after the object that preceded them in the draft, so sibling order can differ slightly from the draft's.
- Now: rebase of a draft, a merge editor and an undo of an apply that brings the draft back are planned (Wave 18). DEC-063 chose "one pull request per change" for the repository, not for drafts.

#### DRF-2 · DEC-032 — Apply writes code first, then the model, with rollback

- Date: 2026-11-14 · Status: Accepted (built in Stage P1) · Decided by: [Proposal]
- Decision: apply with code writes the code files first, keeping a backup of each. Then it writes the model. Then it deletes the draft. If a file write or the model step fails, every file is restored and the draft stays.
- Why: a failed file write used to leave the model applied and the draft in place, so the model and the code could disagree.
- Trade-off: restore is best effort. Content and permissions come back, modification times do not, and a failed restore is logged. A crash between the steps is not covered. Deleting the draft is not rolled back.

#### DRF-3 · DEC-040 — Drafts record an author and show how far main has moved

- Date: 2026-11-15 · Status: Accepted (built in Stage P3) · Decided by: [Proposal]
- Decision: a draft has an optional `author`. The client sends it; otherwise the server uses `git config user.name`. The author shows in the drafts list and in the `dp plan` Markdown header. A draft shows "main +N": the number of objects main changed since the draft's base. This is a diff of the base against main, cached by main's revision.
- Why: with several drafts, a label shows who started each change. The count shows whether a draft is out of date before apply.
- Trade-off: the author is a plain label, not an identity check, so any name can be written. The count costs one diff per main revision per draft. There is no rebase yet, so the count only reports the gap.


### Version selection

#### DRF-4 · DEC-017 — The model version is chosen per request

- Date: 2026-11-14 · Status: Accepted · Decided by: assistant (Proposal)
- Decision: every API request names the model version it works on in the header `X-DP-Model` (`main` or `draft:<id>`) and, optionally, the version it is compared with in `X-DP-Compare` (`base` or `main`). With a compare, diagrams carry `change` and `ghost` marks and `GET /api/changes` lists the changes. The UI keeps both in the URL (`#/d/<diagram>?m=…&c=…`).
- Why: the server holds no "current draft", so two browser tabs can show different versions, links keep the version, and tests stay stateless.
- Options rejected: a server-side "active draft" (tabs would interfere); separate URL prefixes per version (every route and client call would change).
- Trade-off: the header is invisible in the browser's network URL list; clients other than the UI must send it to work on a draft.

#### DRF-5 · DEC-018 — Git versions are read with the git command line

- Date: 2026-11-14 · Status: Accepted (amended by DEC-091: dp may commit `architecture/`; reading stays read-only) · Decided by: assistant (Proposal)
- Decision: Stage C2 compares the **stored model** at a git ref (branch, tag, commit, `HEAD~n`) with the working model, or two refs with each other, using the same diff and overlay as drafts. The model files are read with `git show <commit>:<path>`; refs are resolved with `git rev-parse --verify`, listed with `git for-each-ref`. Commands run without a shell; refs that start with `-` or contain `:`, spaces, `..` and other characters git forbids are refused. A version at a ref is read-only (`X-DP-Model: ref:<ref>`, `X-DP-Compare: ref:<ref>`).
- Why: no new dependency, works with any repository git can read, and a commit's model can be cached by its hash.
- Interpretation: the backlog says C2 "scans" two refs. Code scanning (Stage B) is not built, so this compares the models stored at the refs; scan results can use the same diff later.
- Trade-off: needs `git` on the PATH (the feature is hidden without it). A commit without the model files shows as an empty model. A repository created after the server started is found on the next request; one that disappears needs a restart.


### History

#### DRF-6 · DEC-058 — History: what each commit changed in the models (git read-only)

- Date: 2026-11-15 · Status: Accepted (keeps DEC-018: git is only read) · Decided by: Owner [2026-11-15] ("have a Git for this project to understand changes"; a read-only history view), [Proposal] (shape)
- Decision:
  - **The page.** A History page (`#/history`, in the home page's rail) lists the commits that touched the model folders, newest first, for one project or across a hub.
  - **Each commit** shows its author, date and subject, and what it changed per project: added, changed and removed counts and up to 12 objects. Elements, relationships, flows, decisions and settings are compared with the commit's parent model.
  - **Opening a version.** "Open this version" shows the model at that commit compared with its parent, in the usual compare view.
  - **Uncommitted changes.** Above the list, each project's not-yet-committed changes (main model compared with HEAD) link to the compare view against HEAD.
  - **API.** `GET /api/history[?project=&limit=]`. Results per commit are cached (commits never change).
- Why:
  - It answers "what changed, when, by whom" in model terms rather than JSON lines.
  - It reuses the existing git reading and diff without dp ever writing to git.
- Trade-off:
  - The first load of a long history runs a model diff per commit (20 by default, 100 at most).
  - Commits that only change drafts or layout show as such.
  - Commits made outside the model folders are not listed.

#### DRF-7 · DEC-091 — dp may commit the architecture folder, on request or when a draft is applied [planned, not built]

- Date: 2026-11-19 · Status: Accepted, not built (planned in [waves/wave-17-architecture-commits.md](waves/wave-17-architecture-commits.md)) · Decided by: Owner (answer C1: "Yes", to option 2). Amends DEC-018.
- Decision:
  - dp may run `git commit` for the project's model folder (`architecture/`) and nothing else: when an architect presses **Commit**, runs `dp commit`, or (a setting, off by default, kept in `.dp/commit.json`) when a draft is applied.
  - It commits only paths under that folder, as `git commit -m … -- <paths>`, so other staged changes are left alone. It uses an argument list, never a shell.
  - It never pushes, amends, resets, switches branches, stashes or skips hooks. The repository's hooks run, and a refusal or a failing hook is reported.
  - The message is built in code from the draft's title, description and change summary, with the draft id and the signed-in user as trailers.
  - Reading git stays as DEC-018 says (read-only functions in `src/core/git.ts`); the commit code is a separate module.
  - Planned in [waves/wave-17-architecture-commits.md](waves/wave-17-architecture-commits.md).
- Why: the owner's vision lists git-style commits for software architecture. Drafts are branches and apply is a merge; the missing piece was a commit with a message made from inside the tool.
- Trade-offs:
  - dp now writes to the repository's history. A bug could commit something unintended; the path confinement and the refusals are the guard.
  - Undo after a committed apply leaves the commit; dp does not rewrite history.
  - Commit identity is git's. A signed-in user is a trailer only, not the author.
  - A team that wants git fully read-only leaves the setting off and never presses Commit.


## SEC — Security, sign-in and roles

### Server protection

#### SEC-1 · DEC-030 — Request protection for the local server

- Date: 2026-11-14 · Status: Accepted (built in Stage P1) · Decided by: [Proposal]
- Decision: the server checks every request. When it is bound to loopback, the Host header must be `localhost`, `127.0.0.1` or `[::1]`; `dp serve --allow-host <name>` adds names. Changes to `/api/*` (any method other than GET, HEAD or OPTIONS) are refused with 403 when Origin is not the server's own origin or Sec-Fetch-Site is cross-site. A body must be `application/json` (415 otherwise) and at most 5 MB (413 above). Every response carries a Content-Security-Policy (own origin only, inline styles allowed), `X-Frame-Options: DENY`, `nosniff` and `no-referrer`. Binding a non-loopback host turns the Host check off and prints a warning that there is no login. Unexpected errors return a generic message; the detail goes to the server log only.
- Why: before this, any web page open in the browser could send a plain POST to 127.0.0.1:8765 and change the model or apply a draft. The Host check stops DNS rebinding.
- Trade-off: scripts using curl must send `-H 'Content-Type: application/json'`. The UI cannot be embedded in a frame, so editor preview panes cannot show it. A non-loopback bind has no login; the warning is the only guard.
- Now: the frame exception is gone (DEC-074). A non-loopback `--host` now refuses to start unless users exist, or `--read-only` or `--insecure` is given (DEC-063). More loopback listeners exist for System Testing (DEC-075).

#### SEC-2 · DEC-031 — Hidden paths are off limits

- Date: 2026-11-14 · Status: Accepted · Decided by: Owner [Owner, 2026-11-14]
- Decision: files and folders whose name starts with a dot (`.git`, `.env`, `.ssh`, `.github` and others) are never read, written, listed or planned through dp. This covers the code folder, a draft's planned edits and git versions. Symlinks that point to them are refused. Code file writes are capped at 1 MB, the same as reads.
- Why: writing `.git/config` allowed commands to run the next time dp called git. Dot files often hold secrets.
- Trade-off: a component cannot be mapped to `.github/workflows`, and `.eslintrc.json` cannot be shown. Secrets with ordinary names (for example `config/secrets.yaml`) are not covered.

#### SEC-3 · DEC-095 — A referenced local file opens in the system's default app, with limits [planned, not built]

- Date: 2026-11-19 · Status: Accepted, not built (planned in [waves/wave-16-attachments.md](waves/wave-16-attachments.md), item 12; confirmed by the owner on 2026-11-20, DEC-100; the security review can still reduce it to "Copy path only") · Decided by: Owner (answer Q3.5 and its follow-up: "if I click a PDF it opens in Adobe Acrobat, a .xls in Excel").
- Decision:
  - A decision link or attachment can point at a file on the reader's own computer (`local:` path). dp stores the path text. It never reads, copies, hashes or uploads the file, and never sends its contents to BMO.
  - A click shows a dialog with the full path. On Open, dp's server asks the operating system to open it with the default app.
  - Only on a server running on this machine, for a request from this machine. On a hub or remote server the button is Copy path only.
  - Only these document types: pdf, doc, docx, xls, xlsx, ppt, pptx, csv, txt, md, rtf, png, jpg, gif, webp. Programs, scripts, shortcuts, `.app` bundles, `.html`, `.svg` and macro-enabled Office files are refused. The path is resolved (symlinks followed) and the real file's type is checked; it must be an existing regular file.
  - The opener is started with an argument list, never through a shell. The route is a POST with a `ROUTE_RULES` entry and the cross-site rule of uploads (a custom header, no preflight).
- Why: the owner wants no duplicate of a large file and wants it to open the way it does anywhere else on the computer.
- Trade-offs:
  - dp now asks the operating system to start another program from a path written in a file that can come from someone else's repository. The type list, the full-path dialog and the local-only rule are the guard, and the security review may find them not enough.
  - A path in git helps only on that machine and shows a user name unless written with `~/`.
  - The default app is whatever the person's system chooses; a document in it can run its own content (a spreadsheet's links, a PDF's scripts). That is the same as opening the file by hand.
  - The Windows path is written, not run.
- Now: the owner chose "open" over "Copy path only" as the default on 2026-11-20 (DEC-100, answer D5), after the safer default was offered. The limits above stay as written. "Copy path only" remains the fallback in two cases: a server that is not on the reader's machine, and a flaw the security review of Wave 16 finds in the opener (the wave then ships Copy path only and tells the owner).


### Sign-in and roles

#### SEC-4 · DEC-041 — Optional sign-in with three roles; edit rights enforced on the server

- Date: 2026-11-15 · Status: Accepted (built in Stage P4) · Decided by: Owner [2026-11-14]
- Decision: dp stays a local tool. Sign-in is optional and off by default. With no `.dp/users.json` in the project, nothing changes. Three roles: **Architect** does everything. **Engineer** reads everything, creates drafts and edits any draft; it cannot change the main model, write real code files or apply a draft, and it can discard only drafts it started. **Viewer** reads everything and changes nothing. The server enforces these rights on every changing route. A route with no rule is Architect-only, and a test fails for a new route with no rule. `dp users` stores passwords as scrypt hashes. Sessions use an HttpOnly, SameSite=Strict cookie, end after 12 hours idle and live in memory. Five failed sign-ins lock a name for 30 seconds. Lenses stay a default view, not data hiding. Git versions stay read-only for everyone. Drafts record the signed-in user as author.
- Why: a shared local model needs a way to stop an engineer from changing the main model by accident. This works without a hosted server or accounts. Checks on the server hold even when the UI is bypassed.
- Amends: DEC-001 and DEC-006. "No accounts" now reads "no accounts unless a users file exists". DEC-008 is unchanged.
- Trade-off: not real-time. Two users editing the same thing: the last write wins, and the other sees it when the window regains focus. Undo history is per model version, not per user. Sessions are lost on restart. Passwords travel in clear text unless the server is behind HTTPS, so a network needs a TLS proxy. Lenses do not hide data: a viewer can read costs and notes through the API. `dp users` commands must not run in parallel. Roles are fixed. Open for the owner: (1) should engineers edit only their own drafts; (2) should a viewer's lens hide sensitive sections on the server (this would change DEC-008); (3) is a 12-hour idle session right.

#### SEC-5 · DEC-060 — "No access" to a hub project

- Date: 2026-11-15 · Status: Accepted (amends DEC-057) · Decided by: Owner [2026-11-15] ("a role should have no access to an entire project too"), [Proposal] (shape)
- Decision:
  - **The role.** A user's role in one hub project can be `none`: `"projects": {"payments": "none"}` in `<hub>/.dp/users.json`, set with `dp users role NAME none HUB --project payments`.
  - **Refused.** Every request to that project is refused with 403, reading included and on a read-only server too: model, diagrams, drafts, comments, code, history.
  - **Hidden.** The project is left out of everything the hub shows that user: the project list and rail, the home page (cards, attention, decisions, catalog changes copied), the shared catalog usage (its copies, readers and writers), and History. A link to it opens the home page.
  - **What still shows.** The catalog's own definitions stay visible, since they are shared by design.
  - **Scope.** `none` exists only per project. A user's role everywhere stays architect, engineer or viewer, so a hub cannot have a signed-in user who sees nothing.
  - **Changes apply live**, on the next request.
- Why: the owner asked for it. Hiding rather than only refusing keeps a project's names, tables and decisions out of the other projects' views, where usage would otherwise reveal them.
- Trade-off:
  - **Sign-in off.** With sign-in off there are no users, so nothing is hidden; this is a sign-in feature.
  - **Not a security boundary for the files.** Someone with access to the hub folder or its git repository still sees every project.
  - **Architects too.** An architect everywhere can still be given `none` in a project; hub administration (adding projects, credentials) follows the role everywhere.


### Secrets

#### SEC-6 · DEC-056 — Integration credentials: kept by the server, outside git, write-only, optionally encrypted

- Date: 2026-11-15 · Status: Accepted (updates the backlog rule "integrations that need tokens wait": the store exists; nothing used it when written; DEC-059 and DEC-085 do now). **The optional encryption is superseded by [DEC-101](#sec-7--dec-101--credentials-are-always-encrypted-at-rest)**; everything else here stands · Decided by: Owner [2026-11-15] ("add API keys storing": integration credentials for dp itself), [Proposal] (shape)
- Decision:
  - **Where.** Credentials (name, provider, scopes, a note, dates, the value) are kept in `<hub or project>/.dp/credentials.json`.
    - The file is written atomically with mode 0600, in a folder created with mode 0700, and `.dp/` is added to `.gitignore`.
    - The code routes never open dot folders (DEC-031).
  - **Encryption.** With `DP_SECRET_KEY` set, values are encrypted with AES-256-GCM.
    - The key is derived by scrypt from the variable and a fresh salt per value. The credential's name and provider are associated data, so a sealed value cannot be moved to another entry.
    - Without the variable, the file's permissions are the only protection, and the page says so.
    - A value sealed with another key shows as "locked".
  - **Write-only values.** The API lists names, providers, scopes, dates and a masked hint (the last four characters, for values of 12 or more), never the value. Only server code reads it (`get`, which stamps "last used").
  - **Who.** Architects only (new action `admin`, also used for adding projects); refused on a `--read-only` server.
  - **Interfaces.**
    - Routes: `GET/POST /api/credentials`, `PUT` (rotate), `PATCH` (provider, scopes, note) and `DELETE /api/credentials/:name`.
    - CLI: `dp credentials list|add|rotate|remove [folder]`, with values read from standard input, never from arguments.
- Why:
  - Credentials belong to the server and the hub, not to one person's machine; this mirrors `users.json`.
  - Write-only values and an opt-in key cover the local-first case without a keychain dependency.
- Trade-off:
  - Without `DP_SECRET_KEY` the values are plain text on disk (mode 0600).
  - A lost key makes sealed values unusable (by design).
  - The hint shows four characters.
  - There is no "test connection" (it would need network calls, and nothing uses the credentials yet).
  - No per-project credentials inside a hub.
- Now: DEC-101 (owner, 2026-11-20) makes encryption always on, with a key file that dp creates when `DP_SECRET_KEY` is not set. The "plain text without the variable" trade-offs above describe the built state until DEC-101 is built ([planned_features.md](planned_features.md) A7).

#### SEC-7 · DEC-101 — Credentials are always encrypted at rest

- Date: 2026-11-20 · Status: Accepted, not built (planned: [planned_features.md](planned_features.md) A7) · Decided by: Owner ("go with what you think is best; I want to save credentials on the tool, but encrypted and secure", answer D6). The key source, the file location and the migration are Proposals. Supersedes the optional encryption of DEC-056 and the line "the encryption key for credentials is optional" in DEC-063.
- Decision:
  - **Never plain text.** No credential value is written to disk unencrypted, in a project or a hub. The cipher is unchanged from DEC-056: AES-256-GCM, a key from scrypt with a fresh salt per value, the credential's name and provider as associated data.
  - **Where the key comes from, in this order.**
    1. `DP_SECRET_KEY`, when set: a passphrase the person or a secret manager supplies. This is the route for servers, CI and shared hubs, and for anyone who wants the strongest setting.
    2. Otherwise a key file that dp creates the first time a credential is saved: 32 random bytes, mode 0600, in a folder of mode 0700 under the user's config folder (`$XDG_CONFIG_HOME/dp/`, else `~/.config/dp/`; `%APPDATA%\dp\` on Windows). It is **never inside a project or hub folder and never in git**. [Proposal: the exact path.]
  - **No fallback to plain text.** If neither source works (no variable, and the config folder cannot be written, as in some containers), saving a credential is refused with the reason and the way out (set `DP_SECRET_KEY`).
  - **Existing plain values** (from versions before this decision) are sealed the first time a writable server, or a `dp credentials` command, opens the store; `dp credentials seal` does it on request. Until then the Credentials page and `dp check` say "not encrypted". A `--read-only` server never writes, so it only warns.
  - **Unchanged.** Values are write-only through the API. A value sealed by another key shows as "locked" and is re-entered (rotated). The masked hint (the last four characters of a value of 12 or more) stays in the file in plain text.
- Why:
  - The owner wants credentials kept in the tool, encrypted and secure. Three features now rely on the store (BMO's provider keys, tool connections, linked-work status: DEC-065, DEC-085), and the first real provider call has not yet been made (manual test plan U1), so the change lands before most keys exist; the migration above covers any that do.
  - An optional key that nobody sets is no protection. A key file that dp makes itself gives every user encryption with no setup, and `DP_SECRET_KEY` stays for people who want more.
  - Keeping the key outside the project and hub folder separates the secret from the usual ways a folder travels: a commit (even with `.dp/` ignored, `git add -f` or a changed ignore file can add it), a zip, a shared drive, a bug-report attachment.
- Alternatives considered:
  - **Require `DP_SECRET_KEY` always.** The strongest against someone on the same account, since the key is not on disk. But it is a barrier, and in practice the value ends up in a shell profile in plain text. Kept as route 1, not as the only route.
  - **The operating system's keychain** (macOS Keychain, Windows Credential Manager, a Secret Service on Linux). Better protection from other programs, and no key file. Not chosen now: dp has three runtime dependencies and no native code, each system needs its own tool or library, and a Linux server often has no keychain. It can be added as a third key source later without changing the file format.
  - **Ask for a passphrase at start.** Interactive, so it breaks `dp serve` in scripts and CI.
- Trade-offs:
  - The key file is on the same computer as the encrypted values. Anyone who can read both (the same operating-system account, a disk image or backup of the home folder) can decrypt. The protection is against the folder leaving the machine, not against an attacker already on it. Set `DP_SECRET_KEY` from a secret manager for the stronger setting.
  - A lost or deleted key file (a new laptop, a cleaned config folder) locks every value until each is entered again. A backup of the config folder keeps them readable, which is the person's choice.
  - A hub moved to another machine or server keeps its credential names and loses their values, unless both machines use the same `DP_SECRET_KEY`.
  - Values are decrypted in the server's memory while a call is made. That cannot be avoided.
  - The four-character hint reveals part of a value. Dropping it is a separate, small choice.
  - Tests must not touch a real config folder: the store takes the key (or the key file's path) as a parameter, as it takes the secret today.
  - A `--read-only` server cannot create the key file, so it can use values sealed earlier and cannot save new ones (it cannot save anything anyway).


## REC — Collaboration and records

### Comments

#### REC-1 · DEC-049 — Comments, ideas and questions live in their own file, open to every role

- Date: 2026-11-15 · Status: Accepted (amended by DEC-070 for notes on a diagram; DEC-092 and DEC-094, planned, let BMO read comments) · Decided by: Owner [2026-11-15] ("add comments, suggest ideas or ask questions in the diagrams"), [Proposal] (shape)
- Decision: a person can start a thread of one of three kinds (comment, idea, question) about an element, a relationship or a whole diagram, reply to it, and mark it resolved or reopen it. Threads are stored in `architecture/comments.json` (`core/comments.ts`), anchored by element ID, relationship ID or diagram key, in the order they were started, with a stable layout for `git diff`. They are not part of the Structurizr workspace or the sidecar, so they have no undo step, are not diffed, merged or copied by drafts, and do not change the model's version. The new action `comment` is allowed for all three roles on every model version (a viewer included), and refused only on a `--read-only` server. With sign-in the author is always the signed-in name; without it the sender may give a name, otherwise git's `user.name`, otherwise "Anonymous". Only the author or an architect can edit or delete a thread or reply; anyone who may comment can resolve or reopen. Text is at most 4,000 characters, 200 replies per thread and 5,000 threads per project. The server marks a thread `missing` when its target is not in the version shown (deleted, or only in another draft); the UI lists those apart. The UI shows a count pin on boxes and a count badge on lines with open threads, a Discussion block in each object's details panel, and, with nothing selected, a list of the diagram's own threads and those about what it shows, with filters and a jump to each. Routes: `GET/POST /api/comments`, `POST /api/comments/:id/replies`, `PATCH/DELETE /api/comments/:id`, `DELETE /api/comments/:id/replies/:rid`.
- Why: review talk is not part of the model: a viewer must be able to ask a question about a model they cannot change, an engineer must be able to comment on main without starting a draft, and a comment should not be undone with the next Ctrl+Z or lost when a draft is discarded. A separate file keeps `workspace.json` diffs about the architecture only, while still being versioned and shared through git.
- Amends: the working rule "new per-object data goes in `dp.*` properties" (CLAUDE.md): comments are the exception, for the reasons above.
- Trade-off: the file is plain data in git, so two people commenting on different branches get a normal merge, and a conflict is possible when both add at the end of the list. Anyone can read all comments; they are not hidden by lenses. Comments are anchored by ID: when an element is deleted its threads stay in the file and show as "not in this version" until someone deletes them. Moving an element keeps its ID, so threads follow it. A comment made while looking at a draft is shared with main, so a thread about a draft-only element is an orphan on main. Not real time: others' comments show on the next change or when the window regains focus. With sign-in off, anyone can delete anyone's comment (everyone acts as an architect), as with every other edit. Not built: mentions, notifications, free-floating pins at a position on the canvas, turning an idea into a draft, and comment counts in `dp check` or `dp diff`.


### Notes

#### REC-2 · DEC-070 — Notes placed on a diagram

- Date: 2026-11-17 · Status: Accepted (amended by DEC-092: stickies, planned) · Decided by: Owner [2026-11-17] ("add/attach comments in the UI to a diagram and move that comment around"), [Proposal] (how)
- Decision: a comment, idea or question about a diagram may carry `position: {x, y}` (canvas units, in `comments.json`). It is drawn on that diagram as a note in the colour of its kind, above the lines and outside the diagram's own objects, so layout, line routing and Make room never see it. Right-click on empty canvas: "Add note here…". Drag a note to move it, click it to open the thread. Anyone who may comment may move a note; moving keeps the author and the time. Resolved notes are hidden from the canvas, and notes are left out of image exports.
- Why: comments about a diagram had no place on it (left open in DEC-049), and a note is a remark about the model, not part of it (no undo step, no draft).
- Trade-off: a note does not follow a box that moves and is not re-targeted when dropped on one. After a new layout a note can point at the wrong place.

#### REC-3 · DEC-092 — Sticky notes are model data, and BMO always reads notes and comments [planned, not built]

- Date: 2026-11-19 · Status: Accepted, not built (planned in [waves/wave-02-notes-context-help.md](waves/wave-02-notes-context-help.md)) · Decided by: Owner (answers Q2.1 and Q2.2, and the follow-up of 2026-11-19 that comments reach BMO). Amends DEC-070 and, for notes, DEC-073.
- Decision:
  - A **sticky note** is a short Markdown card with a position on one diagram. It is stuck to an object (a box or a line on that diagram, kept as an offset so it moves with the object) or to the diagram itself.
  - It is stored in the model as `dp.stickies` on the diagram's view, the way linked work is stored. It goes through drafts, undo, `dp diff`, merge and the static export. A deleted object turns its stickies into free ones; nothing is deleted silently.
  - Only those who edit the model write stickies: architects on main, engineers in a draft (the owner's answer C6a).
  - Comments placed on a diagram (DEC-070) stay as they are: conversation, open to every role, kept in `comments.json`. BMO reads them too (DEC-094). An architect can turn a placed comment into a sticky.
  - `dp.notes` on an object is unchanged. The separate "one note per diagram" field is not built; a sticky stuck to the diagram is that note.
  - BMO sees every object note, every sticky and every comment thread in scope, whatever the lens shows. There is no "include notes" switch. The Overview lens still hides notes in the UI.
  - Notes and comments go in data blocks after redaction, comments labelled with their author and "not reviewed", with their share of the pack budget. Whole notes are dropped, never cut, and the manifest lists any left out.
- Why: the owner wants stickies to be part of the architecture and analysed by BMO, wants BMO to see all notes, and wants comments reachable too (everything on screen, DEC-094). The earlier worry was that text from any account would steer BMO. DEC-064 already treats all such text as data and never as instructions, so a note or a comment is more data of the same kind.
- Trade-offs:
  - Viewers cannot add stickies; they comment, and BMO reads their comments. A viewer's remark reaches BMO without an architect's review, labelled as not reviewed.
  - A comment can mislead an answer. The label and the checked cites (`comment:<id>`) make that visible; they do not prevent it.
  - Moving a sticky is an edit that appears in a draft's change list and `dp diff`. Moving a comment pin never did.
  - A secret typed into a note or a comment reaches BMO unless redaction catches it. DEC-064's redaction applies, and the preview shows the exact prompt before anything is sent.
  - Two note-like things sit on a diagram, a sticky and a comment pin, and the menu has to make the difference clear.


### Decision records

#### REC-4 · DEC-050 — Decision records: one Markdown file per decision, part of the model

- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] ("a section to track decisions … we would have gone for Q, W, E if we had X, Y, Z, but we don't, so we went with A, B, C"; one Markdown file each), [Proposal] (format and shape)
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


### Checklist

#### REC-5 · DEC-084 — A checklist next to the model: starter lists, checks dp makes itself, and BMO's questions

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("Create a checklist of things when importing a codebase or starting a project"; "a way to quickly check the checklist and CRUD processes on the checklist when you're modelling a diagram"), [Proposal] (shape, storage, roles, the rules, how answers reach BMO)
- Decision:
  - **Where it is kept.** `architecture/checklist.json`, next to the model and not part of it, like the comments (DEC-049): no undo step, not diffed or merged with drafts, one list per project whatever version is shown, committed with the model so a team shares it. Plain JSON in a fixed key order. Items: a task, a question or an assumption; a section; open, done or skipped; an optional answer or note (who and when); an optional target (element, relationship or diagram); where it came from (a person, a starter list, BMO).
  - **Starter lists.** Two lists ship with dp (`src/core/checklist.ts`): *Starting a project* (15 items, scope and people to the last label) and *Importing a codebase* (14 items, intake to unmapped files). An item both lists hold has one key, so adding both does not repeat it; adding a list again adds only what is missing.
  - **Checks dp makes itself.** A starter item can carry one of 16 rules (`src/core/checklistRules.ts`): people, containers per own system, descriptions, technology, labels ("Uses" or none), code paths, a decision, a flow, model problems, intake answered, code scanned, C1/C2/C3 final, unverified import items, unmapped files. The model rules read the version shown (a draft's change shows only in the draft); the import rules read `architecture/import/`. Such an item shows as done while its rule passes and open when it fails, with the count, a sentence and up to 50 failing IDs to step through. It cannot be ticked by hand, only skipped.
  - **Who changes it.** Architects and engineers, on any version (new action `checklist`); viewers and a `--read-only` server read it.
  - **BMO's questions.** An import puts the file's `questions` and `assumptions` on the checklist under "Questions from BMO", linked to the draft; a text already there (same words, ignoring case, spacing and a closing full stop) is not added again. A full checklist never fails an import.
  - **Answers go back.** An answer, correction or note typed on the checklist, and the text of an item a person added, is typed text for the import review: a `user` note that quotes it is found (extends DEC-064's list). The text of a BMO item never counts, even after a person edits it. Answers also go into BMO's next import turn as feedback, labelled with the item they answer, and stay after the draft that asked is applied or discarded. A confirmed assumption with no typed words and a skipped question ("don't know") are told to BMO, but are not evidence.
  - **While modelling.** A Checklist button with the open count in the top bar and the key L open a card docked over the canvas: filter (open, all, the selection), tick, skip, edit in place, answer, link to the selection, move to a section, delete, clear done items, and add with Enter. "Add to checklist…" on the right-click menu of a box, a line or the canvas adds an item about it. The bell lists open BMO questions; the Import code page offers the import list and says how many questions an import added.
- Why: the import already asked BMO for questions and assumptions, but dp dropped them, so a person never saw them; and the typed feedback that verifies notes lived in the review of one draft and was lost with it. A list beside the diagram, which ticks itself where the model can answer, turns "is the model done?" into something a person can see and work through.
- Trade-off: not versioned with drafts, so a draft cannot carry its own checklist and ticks have no undo (git history is the record). The rules are fixed and a person cannot override one except by skipping it. Matching BMO's questions by exact words keeps re-worded repeats; a person deletes them. A viewer who knows an answer has to comment instead. Confirming an assumption by a click does not verify notes: the words must be typed (the same rule as DEC-064), which costs typing. Storing it in the sidecar was not chosen: ticks would need edit rights and every draft would fork the list.
- Now: DEC-099 confirms that viewers cannot answer checklist questions and that only the 16 self-checking rules reach `dp check`; where an assumption can be added is decided in DEC-099 (Q-K2: decisions can cite assumptions, a "wrong" state; not built).


## HUB — Hub, home and catalog

### Projects

#### HUB-1 · DEC-036 — A new project starts empty; the sample model is opt-in

- Date: 2026-11-15 · Status: Accepted (built in Stage P2) · Decided by: [Proposal]
- Decision: `dp serve` and `dp init` create an empty model. `--demo` creates the sample model with its sample code. `--empty` is still accepted. Before this, `dp serve` in a new folder created the sample model and copied `sample_code/` into the user's folder. This changes the default in DEC-006's "one command" flow: one command still starts the app, but the model starts with no elements. The first-run card ("Start your architecture", three steps: add a person, add a software system) and `--demo` cover the first-time experience.
- Why: a new folder should not get sample files that the user did not ask for.
- Trade-off: a first-time user sees an empty canvas rather than a worked example. The first-run card and `--demo` are the answer to that. A user who wants the example has to ask for it.

#### HUB-2 · DEC-081 — New project asks before it uses a model that is already in the folder

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("You can give warning pop ups in this")
- Decision: `Hub.addProject` on a folder that already holds `architecture/workspace.json` throws `ExistingModel` unless it is called with `adopt`; the route answers 409 with `existing: true`, the folder and the name of the workspace found. The New project dialog then asks, and on yes sends the request again with `adopt: true`. The model is kept as it is (its own name included) and the chosen template is not used.
- Why: the folder's model used to become the project without a word, so "Blank model" could open a model with systems in it.
- Trade-off: one more question for the person who adds an existing folder on purpose. A script that relied on the silent take-over now gets 409 and must send `adopt: true`.


### Home and hub

#### HUB-3 · DEC-053 — A home page above the diagrams

- Numbering note: DEC-053 to DEC-060 were numbered DEC-052 to DEC-059 in commits 47042c2, 9cea2f8 and 7ed976a (their messages and earlier reviews say so); they were moved up by one because DEC-052 is the line routing decision (branch `feat/orthogonal-routing`).
- Date: 2026-11-15 · Status: Accepted · Decided by: Owner [2026-11-15] ("a home page / dashboard to track the project, relevant models … decisions"), [Proposal] (shape)
- Decision:
  - **What it shows.** A home page at `#/home`, outside the diagram workspace:
    - a card per project, with a small picture of its landscape drawn from stored positions (a grid where there are none), counts, drafts, model problems and its last commit
    - "Needs a look": model errors, `dp check` warnings, drafts behind main, decisions that are proposed, past review or decide-by, expired, or have a trigger met, and, in a hub, the catalog findings of DEC-055
    - "Watching": open revisit triggers, and review, decide-by and expiry dates within 120 days
    - the latest decisions of every project
    - in a hub, the shared catalog in numbers
  - **Navigation.** A left rail leads to Home, the shared catalog (Data in a single project), Credentials (architects) and each project. Every item links to where it is: a diagram, a decision, a draft, or an element (`reveal=` in the URL, shown once the model is in).
  - **Views.** Projects show as cards or as a list; the choice is kept in the browser.
  - **Landing.** In a hub an empty URL opens the home page. In a single project it still opens the diagrams; the sidebar's top line links home.
  - **API.** `GET /api/home` (and `GET /api/hub`) answer the same in both modes. A single project is a hub of one, so the UI has one code path.
  - **Caching.** Results are cached by model revision; the git log for 30 seconds.
- Why: the owner asked for one place to track projects, models and decisions. The layout follows the common pattern of diagram tools' start pages: projects as cards with a picture, a list view, and starting a project from a template. It also takes from architecture tools' landscape pages the idea of listing what needs attention.
- Trade-off:
  - Thumbnails are drawn from stored positions; a landscape never laid out shows a grid.
  - Counts and problems come from main only (drafts show as a count).
  - The page is read-only apart from "New project".
  - `dp check` runs per project on the first load after a change, which is slow for large hubs.

#### HUB-4 · DEC-054 — A hub serves several projects: `dp serve --hub DIR`

- Date: 2026-11-15 · Status: Accepted (amends DEC-007: one workspace per folder still holds, several folders per server) · Decided by: Owner [2026-11-15] (a hub folder, committable to git), [Proposal] (shape)
- Decision:
  - **`hub.json`.** It lists projects (`{id, path, name?}`) and a catalog folder (`catalog`, DEC-055). Each project is an ordinary project folder with its own `architecture/`, code, drafts, comments and git history.
  - **Server.** The server builds one app per project on first use (`buildApp`, the route modules unchanged). The hub's own app answers sign-in, `/api/hub`, `/api/home`, `/api/catalog*`, `/api/credentials*`, `POST /api/hub/projects` and the UI. It passes every other `/api/*` request to the project named by the `X-DP-Project` header: 422 without it, 404 for an unknown project.
  - **UI.** The browser keeps the project in the URL (`pr=`) and sends the header from `api.ts`.
  - **Sign-in.** One sign-in for every project, from `<hub>/.dp/users.json`. Roles are global; a project's own users file is not used in a hub.
  - **Folders.** No project folder may hold the hub folder or another project's folder, so no project's code routes can reach `hub.json`, the catalog or another project's model. In a hub, each project's code folder and traces folder are its own folder.
  - **New projects.** `POST /api/hub/projects` (architects) creates a project folder from a blank model or the demo and adds it to `hub.json`. `hub.json` is read again when it changes on disk.
  - **CLI.** `dp init --hub DIR [--demo]`, `dp serve DIR --hub [--demo]`, `dp check DIR --hub`. The demo hub is generated by `npm run make-demo` into `demo/hub/`.
  - **Single project.** `dp serve PATH` without `--hub` is unchanged.
- Why:
  - A hub folder can be committed and shared, so a team sees the same list.
  - One app per project keeps every project rule and route exactly as it is, and a header matches how the model version is already chosen (`X-DP-Model`).
- Trade-off:
  - **Shared roles.** A person has one role in every project; per-project roles are an owner question.
  - **Memory.** Every project loaded stays in memory.
  - **Request bodies.** Requests are passed on in-process, and their bodies are read twice.
  - **Logs.** The project is not in the path, so server logs do not show it.
  - **Paths outside the hub.** A project path outside the hub folder (`../x`) is allowed, as long as it does not hold the hub.

#### HUB-5 · DEC-082 — A new hub starts with the demo project

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("Include the demo as a project in all home screens when the user sets up the app"), [Proposal] (which setup and what it adds)
- Decision: `dp init --hub` and `dp serve --hub` on a folder with no hub create `hub.json` with two projects: the empty shared catalog and a project `demo` ("Demo bank"), a copy of the sample model with its sample code, decisions and made-up git history (as `dp init --demo` makes one). `dp init --hub --demo` still copies the demo hub (its two bank projects) unchanged.
- Why: a new hub's home screen was empty, so the first thing a person saw was nothing to open.
- Trade-off: a new hub holds a sample model the person must delete or leave alone (the project can be removed by hand from `hub.json`). A single-project `dp serve` has no project list, so it does not gain the demo; the demo is added only where a hub is created.


### Shared catalog

#### HUB-6 · DEC-055 — Shared elements live once in a catalog; projects keep linked copies; data is listed with who reads and writes it

- Date: 2026-11-15 · Status: Accepted (refines DEC-023: still no element with several parents) · Decided by: Owner [2026-11-15] (catalog + linked copies; "different projects sharing the same database but different tables or sometimes shared tables"), [Proposal] (shape)
- Decision:
  - **The catalog.** A hub's catalog is a normal project folder (`<hub>/catalog/`). Its elements are the shared definitions: people, systems, databases, brokers. It is edited, drafted and undone like any project.
  - **Linked copies.** A project keeps a copy of each shared element it uses, marked `dp.catalog = <catalog element ID>`, so its workspace stays a complete Structurizr file.
    - A linked copy's name, description and technology come from the catalog; changing them in the project is refused. Everything else (owner, notes, cost, its own data) is the project's.
    - "Update from catalog" takes the catalog's fields again. It is an explicit edit, never done automatically across projects, so role rules, drafts and undo apply.
    - "Add from the catalog" adds a linked copy, inside a linked copy of its catalog parent (made too when missing).
    - An element can be linked to, or unlinked from, a catalog element of the same kind.
  - **Data.** `dp.data` on an element lists the data it holds: tables, views, topics, queues, buckets, collections, files and indexes, each with an owner and a sensitive flag.
    - On a catalog element the data is shared; on a project's copy it is private to that project. This covers "the same database, different tables".
    - `dp.data.access` on a relationship says which of the data at either end it reads or writes (destination first).
  - **Usage.** `GET /api/catalog/usage` computes, across projects:
    - each catalog element and the projects that use it
    - copies that differ from the catalog (name, description, technology), and copies of elements no longer in the catalog
    - each data asset with its readers and writers by project and element, flagged "used by several projects" and "written by several projects"
    - access to data the other end does not list
  - **Where it shows.** The home page lists the findings. The Shared catalog page (Data in a single project) shows the tables, with update and add-to-project actions. The panels have Shared catalog, Data and Data access sections; derived lines show the data access of each relationship behind them.
- Why:
  - Linked copies keep each project a self-contained Structurizr file for export, history and `git diff`, as the owner chose.
  - Data at the level of tables answers the owner's question (shared or private tables) without turning every table into a C4 component.
  - Several writers to one table is the coupling worth flagging.
- Trade-off:
  - **Duplication.** A copy duplicates the shared fields. When the catalog changes, every copy shows drift until each project updates it.
  - **Tables are not boxes.** They do not show on component diagrams.
  - **Access needs a pair of elements.** Data access is recorded per relationship, so a service that reaches a database without a modelled relationship is not counted.
  - **Single project.** Without a hub there is no catalog; the Data page shows one project's data.
  - **No visible marker on the canvas** for a linked copy yet.

#### HUB-7 · DEC-057 — In a hub, roles are per project, and catalog copies follow the catalog automatically

- Date: 2026-11-15 · Status: Accepted (amends DEC-054 and DEC-055) · Decided by: Owner [2026-11-15] ("project roles should be in a hub"; "every copy should update automatically once a user commits the changes", meaning once saved to the catalog), [Proposal] (shape)
- Decision:
  - **Roles per project.**
    - Each user keeps a role everywhere and may have another role in some projects: `projects: {"<id>": "<role>"}` in `<hub>/.dp/users.json`.
    - A project's app gives the request the user's role in that project, so every rule (drafts only for engineers, nothing for viewers) applies per project. The catalog is a project like the others.
    - Adding projects and managing credentials (`admin`) follow the role everywhere.
    - `dp users role NAME ROLE [--project ID]`; `default` with `--project` removes the project's own role.
    - A project role is read live, so a change applies on the next request. A change of the role everywhere still signs the user out.
    - `GET /api/hub` gives the user's role per project. The home page shows it on each card and in the rail.
  - **Catalog copies follow the catalog.**
    - As soon as a change is saved to the catalog's main model (an edit, an applied catalog draft, or files changed on disk), every project's linked copies take its name, description and technology.
    - It runs before each project request and after each catalog request, and is checked by the revisions of the catalog and the project, so nothing is done when nothing changed. A project with nothing to update is not written.
    - The copy is not an undo step of the project. An undo of the project's own edit is followed by the copy again, so a copy never stays behind.
    - A copy that cannot take the catalog's name (another element there has it) is left as it is and listed as drift, with "Update from catalog" once the clash is resolved.
    - Drafts get the change when they are applied, like any change on main.
    - Not on a read-only server.
    - The home page lists recent copies ("Catalog changes copied": element, fields, projects).
- Why:
  - The owner wants per-project access in one hub, and copies that never lag behind the shared definition.
  - Doing it in the hub, on save, needs no git hook and works outside a repository.
- Trade-off:
  - **Writes on a read.** A project's files can change on a request that only reads (its first request after a catalog change); the change shows as uncommitted in git, and in History.
  - **Memory.** The list of copies made is kept in memory and lost on restart; git history keeps the changes themselves.
  - **No role can hide a project:** there is no "no access" role. Amended by DEC-060, which adds one.
- Owner answer [2026-11-15, delegated: "do what you think is best"]: dp does **not** commit the copies it makes.
  - They show as "not committed yet" on the History page and in git, and are committed with the rest of the work, with the team's own tools and messages.
  - Why: a tool that commits on its own surprises people, can land on whatever branch is checked out, and would turn DEC-018's read-only git into read-write for one case.


## COD — Code import, code reading and BMO

### Import

#### COD-1 · DEC-026 — Stage B (codebase to model) moves to the Future stage [superseded by 051]

- Date: 2026-11-14 · Status: Superseded by DEC-051 (Stage B was built in 0.5.0) · Decided by: Owner
- Decision: Stage B, reverse engineering a C4 model from an existing codebase (`dp scan`: proposed containers, components and connections from the code), joins the MCP server in the Future stage. It is not scheduled; the owner will review and plan it later. Refines DEC-020.
- Why: needs more review and planning; deployment diagrams come first (DEC-019).
- Trade-off: the model is entered by hand for now. Already built and kept: mapping components to files and scanning Python/JS/TS imports (`code.ts`), and the code diagram. Items that depend on a scan wait: "unmapped code" in `dp check`, comparing scan results with the model, more scan languages.

#### COD-2 · DEC-051 — Stage B import: BMO, a purpose-built import file, one C4 level at a time, no inferred labels

- Date: 2026-11-15 · Status: Accepted, built in 0.5.0 (refines DEC-026; was Future stage, not scheduled) · Decided by: Owner [2026-11-15] (depth, no inferred label, intake, prompt shipping, files at code level, explicit accept of low-confidence items, the agent's name, a deterministic readiness analysis), Owner delegated [2026-11-15] (file format, backend order; "stability and accuracy"), [Proposal] (shape)
- Changed when built [Owner, 2026-11-16]: JSON only (no YAML); direct backends are the Claude API, the OpenAI API and Ollama; MCP and Structurizr DSL input are not built.
- Now: where the body says "YAML or JSON" and `intake.yaml`, read JSON only (`architecture/import/intake.json`). "The design is in `backlog.md`, section 4" is now [import-design.md](import-design.md), rewritten 2026-11-20 around DEC-096 and Waves 5 and 15.
- Decision: a codebase is brought in through one import file (YAML or JSON) with a JSON Schema shipped in the package, validated by `dp import --check`, and turned into a draft (Stage C) that a person accepts, edits or rejects object by object. Structurizr DSL is a secondary input, not the main route. The project's agent is called **BMO**. BMO has no model of its own: it reaches a backend LLM through an adapter. Backends in build order: handoff (dp writes `architecture/import/prompt.md` from the deterministic scan, the intake `intake.yaml` and the schema, and the user runs BMO's turn in their own coding agent), then MCP, then direct calls with the user's own key, endpoint or a local model. BMO is off by default and its output is always a proposal. Import goes one C4 level at a time (C1, C2, C3), the user can stop at any level, and C4 (code level, files only) needs no BMO because a file maps to a component by path prefix. A deterministic readiness analysis (`dp scan --plan`, files and git only) counts candidates per level, reports done and left, estimates the user's review effort and BMO's reading, and recommends step by step or one go by fixed rules. Default depth is the whole project, worked core first. Imported objects carry no "inferred", "imported" or confidence label in the model. The review level (verified, partly verified, unverified) is computed by the tool from checkable evidence, not reported by BMO; unverified items need an explicit accept, with ways to verify again, edit, tell BMO in typed text, or reject. Evidence that is a real file path becomes the code mapping. The prompt ships in the package, versioned with it. The design is in `backlog.md`, section 4.
- Why: the dependable part of Structurizr is the workspace format, which dp already stores; the import file is only a transport, and a strict schema (unknown keys rejected, field-level errors, one-to-one with `ops.ts`) is easier to make stable than a DSL whose only reference parser is Java and which the all-TypeScript rule would make dp reimplement. Handoff first keeps dp itself free of any model, so the same import file always gives the same draft and the only variable input is a file that is checked before it is used. Naming one agent and keeping the checks outside it makes results from any backend comparable. A level-by-level order follows the C4 dependency (containers define source roots, components define file mapping) and lets a user stop with a valid model. Computing the review level, not asking BMO for it, keeps confidence from being an argument. No label keeps imported and hand-made objects the same, as the owner asked for a deterministic model.
- Trade-off: one more format to document and version; with the handoff backend the user copies a prompt to their own agent and the result depends on it; the analysis counts only what the scan can see (people, manual steps and unreadable languages are not counted, so "100% decided" is not "complete"), and its thresholds, the 20 s per item and the lookup list of known external services are guesses that need upkeep; with no label, a reader cannot tell later which objects BMO first proposed (git history and the kept import folder are the only record); full depth on a large repository costs many turns, so it may need one draft per container; a DSL file can reach dp only through a conversion or a later parser.

#### COD-3 · DEC-064 — What an import file cannot vouch for itself, and what the import and BMO code will not read or keep

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (confirmed; the extra review time is accepted as long as the review UI makes it clear), [Proposal] from a security review of the import and BMO code (the rules), [Proposal] (the `scope.include` rule, which the owner left to us)
- Decision:
  - **Review levels are computed from what a person typed, not from what the file says.** A `user` note verifies an item only when its words (at least 12 characters, letter case and spacing ignored) are found in the intake, in the feedback stored for that item or draft, or in the description a person typed for describe-to-model (the server keeps it next to the import file as `files/<draft>.source.txt`, outside the file the model wrote). A cited scan fact verifies only when it is about the item (its name or system is the item's name or ID, or its path is under one of the item's code paths). Anything else is a failed check, and the item stays unverified unless other evidence verifies it. The failed check quotes the note and says why it did not count (not found, too short, empty), and the review tells the reviewer what they can do.
  - **Links do not open what rules close.** The must-not-open globs, the scope, the deny-list and the hidden-path rule apply to where a symlink really points, in BMO's file selection and in the scan.
  - **Redaction.** One detection (`redactText`) is used before anything is sent, for the files next to a handoff, and to refuse an import file or a decision that holds a secret. Names of secrets are widened (`*_KEY`, `passphrase`, `pwd`, `credential`, `private`) with a list of plain keys that stay (`PRIMARY_KEY`, `partition_key`, a bare `key`). Every pattern is linear in the text; the PEM scan and the glob matcher no longer backtrack.
  - **Git.** `architecture/import/.gitignore` lists the handoff folder and the typed descriptions (`handoff-description.txt`, `files/*.source.txt`); the import files and reviews stay committable.
  - **Fail closed.** An import draft whose review file is missing or unreadable is not applied; "Check again" makes the review again with every item pending. With no accepted item nothing is applied, whatever else the draft changed. A code edit cannot be planned or saved under `architecture/` or `.dp/`.
  - **Who loosens limits.** An engineer may edit the intake and add to what is closed or lower a cap; only an architect removes or narrows an entry of `mustNotOpen` or `scope.exclude`, makes `scope.include` read more, or raises a size or file cap. An empty `scope.include` means the whole code root, so emptying it, or adding or changing an entry while it has entries, reads more; removing some entries while one stays, or giving the first entry to an empty list, reads less and is open to anyone who may edit the intake.
  - **A run is confirmed for its destination too.** The hash a run is confirmed with covers the provider, host and model as well as the prompt. The Ollama endpoint refuses link-local and cloud-metadata addresses, the reply is read with a size cap as a stream, and a reply in the wrong shape is not repeated.
  - **BMO settings in a hub** are read and written by the hub itself (no project header), by an architect of the hub.
- Why: a model's answer, a pasted file and a repository are all untrusted input; each of the rules above closed a way for them to make output look checked, to leave the machine, or to land in git.
- Trade-off: notes that only paraphrase the description come out unverified and need an explicit accept, which costs review time (the owner accepted this on condition that the review UI is clear). A name list for secrets over-masks some constants. A lost review loses its accept decisions. With the typed description git-ignored, "Verify again" on another clone cannot use it, so a note it verified there comes out unverified. Making every `scope.include` removal architect-only was not chosen: removing an entry while others stay only narrows what is read.


### Code reading

#### COD-4 · DEC-047 — Backtracking from a step: data, code, functions and history

- Date: 2026-11-15 · Status: Accepted (the function finding by pattern for TypeScript, JavaScript and Python is to be replaced by the generic reader of DEC-096, planned) · Decided by: Owner [2026-11-15] (backtrack a step: where the data came from, how it changed, functions and processes around it, recent changes), [Proposal] (shape)
- Decision: from a connector stage (or the data entering it) or a flow step, `GET /api/backtrack` returns every step up to it. For each: the sample and format; the element that does it; its code (a stage: the implementing element's code paths; a flow step: the relationship's and the receiving element's); the functions in those files (found by pattern for TypeScript/JavaScript and Python); the last 15 commits that touched each file; whether the file has uncommitted edits; and the commits that changed this step in the model (the stage, the relationship, the element), found by comparing each commit of `workspace.json` with the one before. A step is "recent" when any of that falls in the window (7, 14 (default), 30 or 90 days) or is uncommitted. Functions whose lines changed since just before the oldest recent commit are marked. The UI follows one field through every step's sample (same name, ignoring case and `_`), saying where it appears and where it changes, and lists related field names.
- Why: to find where a problem at step 8 came from, a reader needs the data at each step, what code does each step, and what changed lately, in one place. Everything needed is already in the model (samples, stages, code mapping) and in git; nothing new has to be recorded.
- Trade-off: field following matches names only, so a renamed or computed field (amountMinor → amount) breaks the chain, though related names are listed. Function ranges are approximate (until the next function). Model history assumes linear history and reads at most 15 model commits; each read parses that commit's model (cached). History comes from git only; without a repository the view still shows data, files and functions.

#### COD-5 · DEC-069 — The code level shows where a connection enters and leaves the code

- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] (show which file the input goes into and where the output comes out; both set by hand and guessed), [Proposal] (how)
- Decision: the C4 code diagram of an element also shows each relationship between the element and something outside it. The other end is a faded element box; the line runs from the file where the call leaves, or to the file where the input arrives. The file is set on the relationship (`dp.code.from` in the source's code, `dp.code.to` in the destination's code; "Files at the ends" in the relationship panel) and then drawn solid. Otherwise it is guessed from imports between the two elements' files (dashed). When neither is known the line ends at the element's own box (dotted). A file both elements map counts for a guess only when nothing else decides it.
- Why: the files behind a component were drawn alone, so a code diagram could not show how calls from other parts reach them. Plain `dp.*` properties need no new machinery in drafts, compare and merge.
- Trade-off: a guess can be wrong where components share files; guessed lines are marked so. The element's own box is used instead of the boundary because lines cannot end on a boundary. Each neighbour adds its files to the scan of the diagram.

#### COD-6 · DEC-096 — dp finds code by search, pins key code, and reads imports and definitions with one generic regex reader [planned, not built]

- Date: 2026-11-20 · Status: Accepted, not built (planned in [waves/wave-05-code-search.md](waves/wave-05-code-search.md) and [wave-07-metrics.md](waves/wave-07-metrics.md)) · Decided by: Owner (answers Q5.1, Q5.2, Q5.5 and Q5.8 in the Wave 5 file (`docs/waves/wave-05-code-search.md`, questions section; the question file `questions.md` was deleted on 2026-11-20 and its content moved): "Remove non-LLM reading of code… search", "nothing should be programming language specific", "only the main files and functions related to a C3 object", and, later the same day, "just do the regex expressions and things can be generalized to all types of major coding languages"). Replaces the plan for language modules, Java support and file roles.
- Decision:
  - **No code per language.** No module, tokenizer, resolver or branch for a single language. The Python and JS/TS readers built earlier (`codeMap.ts`) are to be removed. They are still in the code until Wave 5 is built.
  - **One generic reader.** A table of regular expressions (`codePatterns.ts`) for imports and definitions in the major languages (Python, JavaScript and TypeScript, Java, Kotlin, Scala, C#, Go, Rust, C and C++, Ruby, PHP, Swift), run by one engine on every code file, with one generic comment cut and one generic way of matching an import to a file by its path tail. Results are class approximate and say so. A language not in the table still gets search.
  - **Search.** dp finds a name in the code as plain text: the BMO command `where <name>` with the LLM off, `dp find <name> --code`, `GET /api/code/search`. It reads only what the code viewer reads and shows masked lines. Hits that match a generic definition pattern are marked "looks like a definition" (heuristic) and listed first.
  - **Key code.** A component keeps a short list of main files and functions, `dp.code.key` `[{path, name?, line?, note?}]`. A person pins entries; dp checks the file exists and holds the name; dp offers heuristic hints with no LLM; BMO can propose entries, which dp verifies before they can be pinned.
  - **Not built:** Maven and Gradle reading, file roles, shared-helper hiding, config facts from settings files, language mix per object, a hash cache.
  - **Metrics** (Wave 7) are computed from the model's lines. Complexity, LCOM and abstractness are not built: they need bodies and fields, which regexes read badly. Revisit after the generic reader has proved itself.
- Why: the owner wants code reading that is simple and works for any major language. A pattern table is data that grows by adding a line and a test string, instead of a reader per language to keep true.
- Trade-offs:
  - Regexes without a tokenizer can read a commented-out or string-embedded import as real, miss dynamic imports and injected dependencies, and cannot resolve an import whose path tail is ambiguous (dp draws no line and says so). The old Python reader was exact for Python; that is traded for breadth.
  - Results for Python and JS/TS may differ slightly from before; the wave records the differences and regenerates the demo.
  - Definition marks are patterns, so a function written in an unusual style is not marked.
  - Key code is only as good as the person's pins; hints and BMO proposals never save themselves.

#### COD-7 · DEC-097 — Architecture drift is parked; Wave 6 builds findings and acknowledgements only [planned, not built]

- Date: 2026-11-20 · Status: Accepted, not built (planned in [waves/wave-06-findings.md](waves/wave-06-findings.md)) · Decided by: Owner ("Push architecture drift to future_tasks.md for me to review later").
- Decision:
  - Drift detection (model ↔ code, `dp drift`, "update the model from code", a Drift page) is not built for 1.0.0. Its design is kept in the owner's ideas list (I2.2; the old `docs/future_tasks.md` was split on 2026-11-20) for the owner to review.
  - Wave 6 keeps the part other waves need: one Finding shape and acknowledgements stored as model data (`dp.acks`, answer A5, 2026-11-19). The warnings dp already makes become the first findings, so the wave is useful alone. An acknowledged warning no longer counts under `dp check --strict`.
  - Waves 8, 11 and 13 build on the Finding shape. Wave 11's packs no longer carry drift.
- Why: with code no longer read by language (DEC-096), most drift checks have nothing to compare, and the owner wants to review what is left before it is built.
- Trade-offs:
  - Nothing tells a team that the code has moved away from the model, except the checks that already exist (missing code paths, unmapped code, key code that no longer matches).
  - The Finding shape ships with outcomes ("not found", "not checkable") that only later waves use.


### BMO

#### COD-8 · DEC-065 — BMO: where it runs, who may run it, and how an import draft is applied

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (one round; JSON only; three direct providers; all the uses in the plan, seven tasks; apply accepted items and keep the rest; settings on the server outside git; any role may run BMO unless the settings restrict it, confirmed again on 2026-11-16 for viewers and text tasks; `via` as two relationships through the broker), [Proposal] (details; the size cut-off, which the owner left to us)
- Decision:
  - **Where BMO runs.** Off by default. Two backends: handoff (dp writes the prompt and files and calls no model) and direct (dp calls the Claude API, the OpenAI API or Ollama, with plain `fetch` and no SDK). The two cloud providers are pinned to their hosts; another address for them needs an explicit allow.
  - **Who may run it.** Any signed-in role may run BMO, viewers included, unless the settings' `allowedRoles` list restricts it (per project in a hub). Text tasks (explain, challenge, draft summary) need only that role. A task that makes a draft also needs the right to create one, so a viewer cannot run it.
  - **Settings.** `.dp/bmo.json` on the server (in a hub, the hub's own file), mode 0600, outside git, changed by architects only. It is not in the sidecar, so an engineer's draft cannot redirect the key or the code to another host.
  - **Preview and confirmation.** The server builds every prompt. A run needs the hash of the preview it follows, and the hash covers the provider, host and model as well as the prompt. Each direct run is logged in `.dp/bmo/runs/`.
  - **Size of a run.** The settings' `passBudgetTokens` caps the code digest (with the intake's budget: the lower one wins). A prompt larger than the budget plus room for the rest (half the budget, at least 32,000 tokens; `runTokenLimit` in `src/bmo/settings.ts`) is refused before anything is sent. At the default budget of 100,000 this is 150,000, the same as the first cut-off of 1.5 × the budget. Measured on 2026-11-16 (estimated tokens outside the digest): 3,000–10,000 for the demo, 21,000–30,000 with 300 more containers and 600 relationships.
  - **Import drafts.** Applying an import draft applies the accepted items and keeps the rest in the draft (partial apply, then a rebase of the draft onto main). An item that is not accepted is held back, and a draft whose review file is missing is not applied.
  - **`via` relationships.** A relationship through a broker is written as two relationships, source to broker and broker to target. The broker is an ordinary object.
  - **Not built.** The MCP backend, Structurizr DSL input, YAML and multi-pass summarising.
- Why: the owner asked for one round in which BMO covers the whole project, with the two kinds of backend and three direct providers named above, and with a team able to limit who runs it. Partial apply lets verified work reach the model without waiting for unverified items. Keeping the settings out of the sidecar and out of git means a draft cannot change where the code goes.
- Trade-off: partial apply adds merge code on the data path, where a bug could lose work; the fallback (block apply until every item is decided) is smaller but stalls verified items behind unverified ones. Settings are per machine or per hub and are not shared through git, so each person who wants direct runs sets them up again. Viewers can run text tasks, which cost money on direct runs, unless the settings restrict them. The fixed 32,000-token room lets a run with a small budget be larger than its budget; with a plain 1.5 × the budget, the demo's runs are refused under a budget of 6,000 to 20,000 (by task), because the fixed text and the model alone are larger than half of it. Each brokered connection carries two labels to write. Three small request shapes are ours to maintain, instead of vendor SDKs; a provider change breaks one shape, not a dependency. Redaction cannot catch a secret written as a plain word.
- Now: the size refusal (`runTokenLimit`, budget plus room) is to be replaced by a refusal only above the chosen model's context window, with a warning and the estimate below that (DEC-099, Q-C1b). Not built.

#### COD-9 · DEC-073 — BMO chat: questions about named objects, every message previewed

- Date: 2026-11-17 · Status: Accepted (amended by DEC-092 and DEC-094, planned) · Decided by: Owner [2026-11-17] (an open chat where `[Name]` refers to an object; each message is previewed before it is sent), [Proposal] (how)
- Decision: a text task `ask` takes the question, up to 10 referenced object IDs, an optional diagram and lens, and up to 6 earlier turns as selectors. Typing `[` in the chat suggests objects by name; the one picked is kept by ID. The server builds the prompt: each referenced object's details for the lens, its parents, contents and relationships, and redacted code excerpts through the same file gate as the import digest (at most 24,000 tokens of code). Without a reference it sends the viewed diagram, or else a short overview. Earlier turns go in a data block marked as earlier conversation. Every message shows a short preview card and is sent with its hash, as DEC-064 requires. The answer is shown and not stored; the conversation lives only in the browser tab.
- Why: the owner wanted to ask questions about specific objects. Keeping "what was shown is what goes" means the chat adds no new way for text or files to leave unseen.
- Trade-off: one extra keypress per message. The earlier turns come from the client, so they can be altered; they carry the same trust as the question. The conversation is lost on reload, the code cap can leave out code that would help, and the chat has no handoff mode yet.
- Now: the 24,000-token code cap is dropped (DEC-099); the preview shows the approximate size before sending.

#### COD-10 · DEC-093 — BMO works without an LLM [planned, not built]

- Date: 2026-11-19 · Status: Accepted, not built (planned in [waves/wave-02-notes-context-help.md](waves/wave-02-notes-context-help.md)) · Decided by: Owner (answer Q2.5). Amends DEC-051 and DEC-065, which describe BMO as off by default.
- Decision:
  - BMO's settings gain a clear switch, "Use an LLM" (the existing `enabled` flag, off by default, changed by architects only).
  - With it off, BMO stays in the UI as a deterministic assistant. It builds no prompt, sends nothing and writes no handoff file. No backend is called.
  - It answers a fixed list of commands from the model, notes, decisions, reference notes and the docs: `find`, `help`, `show`, `notes`, `decisions about`. Free text is run as a search, and the chat says it searched. Later waves add their own commands to the list.
  - The same functions are available as `dp find`, `dp help` and `dp context`. They use GET routes only.
  - With it on, handoff and direct runs work as before (DEC-064, DEC-065).
  - The results are class computed. They carry no "BMO" label because nothing is proposed.
- Why: the owner wants dp to be useful with no LLM, and an LLM to be a choice that is called out (the determinism classes, plan answer A4).
- Trade-offs:
  - Free-text questions get a search, not an answer. That is honest but less helpful than a model.
  - "Enabled" used to mean "BMO exists"; it now means "an LLM may be used". The settings screen and the docs have to say so, and the BMO button no longer hides when it is off.
  - Search quality is the word index's; it misses a question whose words are not in the names and text.

#### COD-11 · DEC-094 — BMO can reach everything the UI shows [planned, not built]

- Date: 2026-11-19 · Status: Accepted, not built (planned in [waves/wave-01-grounded-bmo.md](waves/wave-01-grounded-bmo.md), [wave-02](waves/wave-02-notes-context-help.md) and [wave-16](waves/wave-16-attachments.md)) · Decided by: Owner ("everything a person can visualize on screen should be reachable by BMO"). Builds on DEC-064 and DEC-073.
- Decision:
  - Every kind of thing the UI shows about a scope has a place in that scope's context pack, either by default or through the lens and preview choices. The pack's manifest says what was left out and why.
  - The pack builder adds a new kind of data in one place. A computed test walks the fields the panels show for an object and fails if one is neither in the pack nor named in the manifest.
  - Known kinds added by the plan: comments and sticky notes (Wave 2), and attachments (Wave 16: a list always, text files' content after redaction).
  - One exception, kept by the assistant and open to the owner's decision: the contents of images, PDFs and Office files are not sent, because dp cannot scan them for secrets (DEC-064). They are listed.
  - The rest of DEC-064 stands: everything is a fixed, previewed prompt with its hash; repository and account text goes in data blocks, redacted, never into system text; output is a proposal.
- Why: the owner wants BMO to work from what a person sees, so an answer cannot miss a comment or a note that is on the screen.
- Trade-offs:
  - Bigger packs. The budget and the manifest handle it by dropping whole items in a fixed order, so an answer can still miss something that was dropped; the manifest says so.
  - More text from more accounts reaches the model. It is labelled and redacted, not vetted.
  - The parity test only checks fields it knows about; a new panel field the test does not list is not caught until the list is updated.


## RUN — Runtime and System Testing

### Observed data

#### RUN-1 · DEC-043 — Sample data on relationships and connector stages

- Date: 2026-11-15 · Status: Accepted (amended by DEC-075) · Decided by: Owner [2026-11-15] (authored samples), [Proposal] (shape)
- Decision: a relationship has an optional sample payload and format (`dp.example`, `dp.format`). Each connector stage has the same two fields inside `dp.stages`, and a stage's sample is the data **leaving** that stage. Clicking a line shows the samples in order: what enters, then what each stage produces, then where it ends. When two neighbouring samples are JSON objects, the top-level fields the stage added, removed or changed are marked. A sample is at most 8,000 characters. Samples are written by people (or agents); the tool does not read data from running systems. A relationship with no sample shows the examples of flow steps that use it.
- Why: a pipeline's stage names say what happens; a sample shows it ("Mask PII" turning `email` into `user_ref`). Field marks make the change visible without reading two payloads side by side. Keeping samples in the workspace means they are versioned, diffed and reviewed like the rest of the model, and work offline.
- Trade-off: samples are only as current as the last edit; nothing checks that they match the real data. The field comparison only looks at top-level fields of JSON objects (or the first object of an array); CSV, SQL and nested changes show as plain text. Samples live in git, so the person writing one must remove real personal data; the 8,000-character cap keeps them short but does not check content. Flow step examples stay separate (`dp.stepData`), because one relationship can carry different data in different flows.

#### RUN-2 · DEC-045 — Observed data stays masked, including personal financial data

- Date: 2026-11-15 · Status: Accepted (amended by DEC-075: masking is done on the server, at every depth) · Decided by: Owner [2026-11-15] ("give it a mask over the data")
- Decision: everywhere dp shows data observed in a running system (the live UI inspector's sent and returned data, trace span attributes), values of fields whose names look like secrets or personal financial data are replaced with "•••". The list is one pattern (`src/shared/mask.ts`; the inspector script carries the same text): passwords, tokens, keys, authorization, cookies, sessions, card numbers, CVV, PIN, SSN, IBAN. Masking happens in the browser before data leaves the app, and on the server for trace attributes. The two-second window for linking calls to a click stays (owner, same day).
- Why: observed data can be saved into the model, which lives in git; masked by default is the safe choice.
- Trade-off: masking is by field name, so a secret under an ordinary name shows; masked test data (a test IBAN) cannot be seen in dp.

#### RUN-3 · DEC-046 — Trace files are read from a folder and laid over the model

- Date: 2026-11-15 · Status: Accepted (amended by DEC-074: dp no longer adds a `traceparent` header) · Decided by: Owner [2026-11-15] (read trace files), [Proposal] (shape)
- Decision: dp reads OpenTelemetry trace files in OTLP JSON (the Collector's file exporter format: one object per line, or a whole JSON file) from one folder (`dp serve --traces <folder>`, default `<project>/traces`), re-reading files when they change and keeping the newest 2,000 traces from the last 20 MB of each file. A span is matched to an element by, in order: the `dp.element` attribute; the file it ran in (`code.filepath` / `code.file.path`) against code paths, a file mapped to several elements going to the one that lists it first; its parent span's element when both run in the same service; `service.name` against the element's trace service name (`dp.otel.service`), ID or name. `peer.service` on a client or producer span names the element called. A change of element from parent to child span is a hop, matched to a relationship directly or between the elements' parents or children. Hops with no relationship and names no element matches are shown as differences between the running system and the model. The live UI inspector puts a W3C `traceparent` header on the app's own (same-origin) calls so it knows each call's trace ID. Routes: `GET /api/traces`, `GET /api/traces/:id?ui=<element>` (read-only, every role).
- Why: the model-only walk shows every way on from an element; a trace shows what one request did. Files keep dp local and offline (backlog principle in section 3): any service that can export OTLP JSON works, with no collector connection, accounts or tokens. Matching by code path reuses the code mapping, so a team that mapped its code needs no extra setup.
- Trade-off: traces are as fresh as the file; nothing is pushed. The `traceparent` header changes the app's requests, which a backend may already set or reject; cross-origin calls are not tagged (a new header would trigger a CORS preflight), so their traces are not found by ID. Matching by file assumes a component's first code path is its main file. A hop matched "between parents or children" names the first relationship found, which can be a sibling's. Large trace folders are read in full on change.
- Now: the trace viewer is part of System Testing's screens and goes behind the same switch as the mode (DEC-104, [planned_features.md](planned_features.md) A8). The code and tests stay.


### Live testing

#### RUN-4 · DEC-044 — Live UI inspector: the running app framed through a local proxy, calls matched to endpoints on relationships [superseded by 074]

- Date: 2026-11-15 · Status: Superseded by DEC-074 (the live UI inspector was removed) · Decided by: Owner [2026-11-15] (live embedded app), [Proposal] (shape)
- Decision: an element can have a live UI address (`dp.ui.url`, http or https). "Inspect live UI" opens that app inside dp. For each app origin, dp starts a listener on 127.0.0.1 (a free port). It forwards requests to that origin only, removes `X-Frame-Options` and `Content-Security-Policy` from responses, and adds a small script to HTML pages. The script reports clicks and the fetch / XMLHttpRequest calls made in the two seconds after each click to the dp page (`postMessage`, only to the origin that greeted it). Relationships list the HTTP calls they carry as endpoints (`dp.endpoints`: method and path, `:name` for one segment, a final `*` for the rest, or a full URL). `POST /api/inspect` matches the calls to relationships that start at the UI element or its children, then walks on through outgoing relationships (each element once, up to three steps). It also names the flows that contain a matched relationship. The panel shows each call with what was sent and returned next to the documented example, and what follows in the model. A call that matches nothing can be added as an endpoint in one click. Sent or returned data can be saved as the relationship's example (DEC-043).
- Why: the owner wants to click in a real UI and see which calls it makes and which parts of the system they touch. A browser does not let a page read clicks in a frame from another origin, and many apps refuse to be framed. A proxy on its own port fixes both. Absolute paths in the app keep working, and the app stays in another origin than dp, so its scripts cannot read dp's API. Matching through endpoints written on relationships keeps the model the single source: the tool observes calls, but what they mean comes from the model.
- Security: the proxy target comes only from the model, never from a request. Targets must be on this machine unless their host is allowed with `dp serve --allow-ui-host <name>`. The proxy answers only requests addressed to itself (Host check against DNS rebinding). Cookies are shared across ports on one host, so dp's session cookie is removed from every forwarded request. The script replaces JSON fields and form fields whose names look like secrets (password, token, authorization, cookie, card number, IBAN, ...) with "•••", and cuts bodies to 2,000 characters before they leave the page. Observed data is kept in the browser tab only and written to the model only when someone clicks Save. Opening the inspector changes nothing, so every role may use it (`open` in the route rules); adding an endpoint or saving an example is an ordinary edit.
- Trade-off: the inspected app runs without its own framing and content-security headers inside dp, so dp shows a weaker version of the app's protection (fine for a local or test build, wrong for judging those headers). Only fetch and XMLHttpRequest are seen: WebSocket messages, server-sent events, `sendBeacon`, calls from workers, and calls made by the servers behind the API are not. Attribution is by time (two seconds after a click), so a poll that fires in that window is counted, and a slow chain started later is not. Secret masking is by field name, so a secret under an ordinary name is shown. The proxy listens on 127.0.0.1, so it works only in a browser on the machine that runs `dp serve`. An app that pins absolute URLs to its own origin, uses a service worker, or checks the `Host` or `Origin` header strictly may not work through the proxy. The onward walk shows every way on from an element, which is more than one request uses; flows give the precise path.

#### RUN-5 · DEC-074 — The live UI inspector and the demo web app are removed

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] ("instead of a side by side C4-UI (which can be removed)"; "remove all of it"; "we can remove the demo web app, since we don't have a UI viewer"), [Proposal] (what stays)
- Decision: the live UI inspector is gone: the full-screen page that framed a running app, its local proxy, the script it added to pages, `POST /api/ui-proxy`, `POST /api/inspect`, `--allow-ui-host`, and the frame exception in the Content-Security-Policy. The demo web app (`dp serve --demo` on port 4200) and `demo/web-app/` are gone with it. Kept: API endpoints on relationships (`dp.endpoints`, now matched by System Testing mode, DEC-075), the service name for trace files (`dp.otel.service`), the trace file reader and `GET /api/traces*` (DEC-046), sample data (DEC-043), backtracking (DEC-047) and the demo's made-up git history (DEC-048). The demo ships one made-up trace file (`demo/traces/sample.jsonl`), copied to `traces/` of a demo project.
- Supersedes DEC-044 and the web-app half of DEC-048. Amends DEC-046: dp no longer adds a `traceparent` header to anything.
- Why: the inspector only watched, saw only the calls a browser makes, and covered the diagram it was meant to explain. The owner wants testing on the diagrams themselves.
- Trade-off: the view of which click caused which call is lost. Nothing in the demo runs, so pausing a live call can only be tried against a system of your own. Facts: the files and routes named above were deleted. Interpretation: that the click view is not worth keeping beside the new mode.

#### RUN-6 · DEC-075 — System Testing mode: pause and change live calls on the diagram

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (a testing and debugging mode like a code editor's, on the architecture diagrams; change the data about to be sent to an object; intercept live traffic; an intercept point per line; keep traces as watched-only; flows and pipelines; on for local targets, architects and engineers), [Proposal] (everything else below)
- Decision: **Test** in the toolbar turns the mode on (`t=1` in the URL, main model only). Model editing is off while it is on.
  - **Intercept points.** dp opens a port on 127.0.0.1 that forwards to the address a relationship's destination runs at (DEC-076). A person sets the calling service's base URL to that port. A calling service has one base URL per target, so one point covers every relationship from that caller to that target address; each call is put down to the relationship whose endpoint (`dp.endpoints`) matches, and a call that matches none is flagged with an endpoint to add. Ports are remembered in `.dp/testing.json`, so a caller's setting stays valid; after a restart a person starts the saved points.
  - **Pausing.** A breakpoint on a line, an object, a flow step or a pipeline stage (with optional method, path and conditions on `body.<field>`, `header.<name>`, `query.<name>`, `status`) pauses a call at its request, its reply or both. **Pause next** and **Step** pause the next thing that happens. A paused request can be changed (method, path, headers, body), dropped, or answered by the person (status, body, delay) without reaching the target; a paused reply can be changed or dropped. A logged call can be sent again, changed.
  - **The run log** lists the newest 200 calls with status and time; watched fields are shown across calls; an observed body can be saved as the relationship's example.
  - **Traces.** A trace file picked in the mode is drawn on the diagram: its hops are marked on the lines as watched, hops the model lacks on the boxes.
  - **Flows and pipelines.** On a flow the player follows the paused call, and each step is marked live, watched or not live. A step can be stepped into: its pipeline opens, and a stage linked to an element with an address can have its own point. Other stages show their hand-written sample, labelled as not live.
- Security (facts):
  - A point forwards only to the address in the **main** model, never to one from a request or a draft. The address must be this machine unless its host was named with `--allow-target-host`; link-local and metadata addresses are always refused.
  - Points listen on 127.0.0.1 and answer only requests addressed to themselves (another name that resolves here gets 403). dp's session cookie is never forwarded.
  - New action `testing`: architects and engineers, on any version; refused for viewers and on a `--read-only` server. The GET routes check it themselves, so a viewer sees no live data. Every testing route refuses a browser that is not on this machine.
  - Real values stay in server memory. The browser gets secret-looking values as "•••" (field names of DEC-045, at every depth, plus `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` and the query). An edit that leaves "•••" in place keeps the real value; "•••" anywhere else is refused, so a hidden value cannot be moved into a field that is shown. Conditions and watches read the shown values.
  - Nothing of a call is written to disk. `.dp/testing.json` (mode 0600, outside git) holds ports, breakpoints, watches and the hold time only.
  - A paused call is released unchanged after 120 seconds (10 to 600), at most 20 calls are paused at once, and all are released when no testing page has asked for the state for 10 seconds or dp stops.
- Amends DEC-043 (samples stay hand-written; the mode shows live data beside them and writes one only on **Save as the example**), DEC-045 (masking is done on the server, at every depth, and masked values pass through unchanged unless edited), DEC-041 (the action `testing`), DEC-030 (more listeners on loopback; the frame exception is gone).
- Why: the owner wants to test and debug flows and pipelines where the architecture is drawn, with real data, and to change that data before an object receives it.
- Trade-off (facts unless marked):
  - dp can now change live requests. An edit, a reply written by hand or a resend has real effects in the target.
  - Points speak plain HTTP/1.1. A caller that needs HTTPS, HTTP/2 or gRPC to its target cannot go through one. A caller in a container cannot reach 127.0.0.1 on the host.
  - Bodies over 1 MB, compressed request bodies, event streams, WebSocket upgrades and browser preflight requests are passed through and cannot be paused. dp removes `Accept-Encoding` from forwarded requests so replies can be read.
  - A signed request fails at the target once it is edited. A call held longer than the caller's own timeout fails at the caller, and a caller that retries creates a second paused call.
  - A relationship used by two steps of one flow cannot be told apart, so a step breakpoint stops both.
  - Masking is by field name. A secret inside a plain-text body, or under a field name that does not look secret, is shown.
  - One session per project is shared by everyone who may test: the first release of a paused call wins (confirmed by the owner, 2026-11-16).
  - Not against a draft. In a hub each project has its own session and its own `.dp/testing.json`; the shared catalog has none (owner, 2026-11-16: "whatever you think is best").
  - Interpretation: that one port per (caller, target) is what "an intercept point per line" must mean where several lines share a base URL; that viewers should see traces but no live calls.
- Later: saved test cases with expected results and a `dp test` runner. `core/testing.ts` has no server imports and a logged call (`TestCallDetail`) is the shape such a case would save.
- Now: System Testing is hidden by default for 1.0.0: it is off unless `dp serve --testing` (or a setting) turns it on, its tests stay in CI, and the docs call it experimental (DEC-104, [planned_features.md](planned_features.md) A8). Not built yet. Nothing else in this entry changes.

#### RUN-7 · DEC-076 — Where something runs: `dp.run.url`

- Date: 2026-11-16 · Status: Accepted · Decided by: [Proposal], within the owner's choice of an intercept point per line [2026-11-16]
- Decision: an element may carry the address it runs at (`dp.run.url`, "Address it runs at" in the Running system section; API field `runUrl`): http or https, a host and a port, no path. A relationship's target is the address of its destination, or of the nearest parent that has one, because endpoints sit on relationships into components and the address belongs to the container that hosts them. The older `dp.ui.url` is read when the new key is absent; saving the field writes the new key and removes the old one.
- Why: an intercept point needs to know where to forward. One address per running thing avoids repeating it on every line.
- Trade-off: the address is saved with the model, so it goes into git and is the same for everyone: use a local or test address. There is one address per element, with no per-environment or per-person value, and a service reached through two addresses (directly and through a gateway) cannot be described. Because the address is in the model, whoever may change the main model decides where a point forwards; the target check of DEC-075 bounds that.


### Demo

#### RUN-8 · DEC-048 — The demo gets a made-up git history and a running web app [half superseded by 074, 077]

- Date: 2026-11-15 · Status: Accepted (the web-app half was superseded by DEC-074; the demo system is DEC-077) · Decided by: Owner [2026-11-15] ("include a demo for this as well"), [Proposal] (shape)
- Decision: `dp serve --demo` and `dp init --demo` turn a new demo folder into a git repository with four dated commits from `demo/history.json` (made by `npm run make-demo` from the shipped files: older versions are derived, so they cannot drift). The newest commit, two days before now, introduces the demo's bug (currency conversion rounds each amount). This is skipped when the folder is already inside a git repository or git is missing. `traces/` is ignored in that repository. `dp serve --demo` also runs a demo bank web app on 127.0.0.1:4200 (`src/server/demoApp.ts`, page in `demo/web-app/`): sign in, accounts, statements, payments, password reset and exchange rates over a made-up API, writing one OTLP trace per call to `traces/demo-app.jsonl`. The demo model's Single-Page Application points at it. The exchange-rates call reaches a provider the model lacks, and statements show the one-cent difference that backtracking explains.
- Why: backtracking needs recent history and the inspector needs a running app with traces; without them a new user cannot see either feature in the demo.
- Trade-off: the demo folder gets a `.git` folder and commits the user did not make (dates relative to the day the demo is created). Port 4200 may be taken; dp then says so and the rest works. The demo app's page is plain browser JavaScript and HTML (demo content, like the sample code), not TypeScript.

#### RUN-9 · DEC-077 — The demo gets a small runnable system

- Date: 2026-11-16 · Status: Accepted · Decided by: Owner [2026-11-16] (asked whether a made-up trace is enough for the demo: "small runnable system as well"), [Proposal] (how)
- Decision: `dp serve --demo` starts five small services on 127.0.0.1, ports 4200 to 4204: the page of the web app, the API application, the payments service, and stand-ins for the mainframe and the fraud detection system. Every hop between them is a real HTTP call, and the demo model carries their addresses (`dp.run.url`) and endpoints, so System Testing mode can pause a real call between two services. Before each call a demo service asks dp whether an intercept point is open between it and its target and uses that port; otherwise it calls the target directly. The made-up trace file of DEC-074 stays.
- Amends DEC-074: the demo has something running again. The removed single-process demo web app, whose services were made up, does not come back.
- Why: without a running system the mode's main feature, pausing and changing a live call, could not be tried in the demo.
- Trade-off: the demo services follow open points by themselves, which a real system does not: there a person sets the caller's base URL to the port shown, and the tour says so. The services write no trace files, so a demo run is not drawn as a trace. Five fixed ports can clash with something else on the machine; dp then says so and runs without the demo system. The hop from the payment orchestrator to the mainframe is a message queue in the model and stays not live. More demo code to keep working. Facts: what starts and on which ports. Interpretation: that following points automatically is the right ease for a demo.


## WRK — Linked work
- Now: `dp serve --demo` will start the five services only with `--with-system` (DEC-104, [planned_features.md](planned_features.md) A8). Not built yet.

### Work status and CI push

#### WRK-1 · DEC-059 — First use of the credentials: linked work status from GitHub

- Date: 2026-11-15 · Status: Accepted (first use of DEC-056; GitHub only until DEC-085 added GitLab, SonarQube and Jira) · Decided by: Owner delegated [2026-11-15] ("keep it simple, go with whatever you think"), [Proposal]
- Decision:
  - **What it does.** "Refresh status from GitHub" under Linked work (`POST /api/work/refresh`, action `edit`) reads every work item of the shown version whose link is a GitHub issue or pull request, and asks api.github.com for its state.
    - A closed issue or a closed or merged pull request becomes "done".
    - An open one keeps "in-progress" or "blocked", and is otherwise "open"; a "done" one that is open again becomes "open".
  - **How.** It runs only on request, with at most 100 links, 4 at a time and 10 seconds each.
    - It uses the first stored credential with provider `github`; without one it reads public repositories only, at GitHub's lower rate.
    - The changes are one undo step; nothing is written when nothing changed.
    - The answer lists what changed and which links could not be read (not found, refused token, rate limit), never the token.
- Owner [2026-11-15]: on demand only. No schedule, no background polling.
- Why: linked work already holds GitHub links; keeping their status current is the smallest useful integration, it shows the credentials working end to end, and it needs no new model data.
- Trade-off:
  - It reaches out to the network (only to api.github.com, only when asked).
  - Statuses are a snapshot, not live.
  - GitHub Enterprise hosts and other trackers are not covered yet.

#### WRK-2 · DEC-085 — Linked work from GitHub, GitLab, SonarQube and Jira, pushed from CI, pinned anywhere

- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-16] ("integrate … open source tools that developers use … like SonarQube or GitLab … so users can pin different links/issues/bugs … to this project in the diagram to track"; chose GitLab including self-hosted, SonarQube/SonarCloud and Jira; pull and push; boxes, lines, diagrams, flows and the project), [Proposal] (storage, connections, token rules, import formats)
- Decision:
  - **Where it can be pinned.** Linked work (`dp.work`) can sit on an element, a relationship, a diagram (its stored view), a flow (its dynamic view) or the project (the workspace's properties). Connector and code diagrams are refused, with a hint to pin to the relationship or the element. Targets use the same vocabulary as comments and checklist items (element, relationship, diagram), plus project.
  - **What an item holds.** The existing fields, plus `key` (a stable ID from a tool), `remote` (the tool's own status words) and `checked` (when the status was read). A new type `quality` (a SonarQube project's quality gate). At most 500 items per object and 5000 per model.
  - **Live status, on request only.** **Refresh status** (`POST /api/work/refresh`) reads GitHub (github.com and GitHub Enterprise), GitLab (gitlab.com and self-hosted; issues and merge requests), SonarQube and SonarCloud (issues, security hotspots, and the project's quality gate with counts) and Jira (issues; the status category gives open, in progress or done; the priority gives severity).
    - Rule: the tool says done, so done; open on a done item, so open; in progress, so in progress; otherwise the status is kept, so a manual "blocked" stays.
    - A change is written only when the status, the tool's words or the severity changed. A refresh that finds nothing new writes nothing and adds no undo step.
  - **Tool connections.** The built-in connections are github.com, gitlab.com and sonarcloud.io. Others (self-hosted GitLab, SonarQube, Jira, GitHub Enterprise) are kept in `.dp/integrations.json` (mode 0600, ignored by git; the hub's own in a hub). Only architects change them: on the Credentials page, with `dp integrations list|set|remove`, or with `GET/PUT /api/integrations` and `DELETE /api/integrations/:id`.
    - A connection names a stored credential (DEC-056) by name. `auth` is `bearer` (the default) or `basic` (`user:token`, for example Jira Cloud's email and API token).
    - A built-in connection uses the first credential of its provider (github, gitlab, or sonarqube, a new provider) that no connection names. So a token for a team's own server never goes to a public host.
  - **Push, with no network.** `dp work list|add|import`, and `GET /api/work`, `PUT /api/work/target`, `POST /api/work/items`, `POST /api/work/import`. Import formats: SARIF 2.1.0, GitLab Code Quality JSON, SonarQube issues search JSON, and a small dp JSON format (`dp work import --schema` prints it).
    - Each finding goes to the element whose `dp.code.paths` hold its file (the longest path match, then the deeper element), otherwise to the project.
    - `--source NAME` keeps the keys under `NAME:`. `--close-missing` sets that source's items, which this run no longer reports, to done. `--draft ID` writes into a draft. `--check` writes nothing.
    - A push that changes nothing writes nothing.
    - CI pattern: run the scanner, then `dp work import results.sarif . --format sarif --source codeql --close-missing`, and commit the model.
    - **A push goes to the main model by default** (owner question answered 2026-11-17: "whatever you think is best"). In CI, "the main model" is the model on the CI branch, and the pull request is where people review it. A default draft would keep findings out of the model until someone applies the draft after every scan, so the Work page and the overlays would lag behind the scanner. `--draft ID` is there for a team that wants an architect to accept findings first.
  - **Against the checklist (DEC-084).** The checklist is a to-do list for modelling, in a file next to the model. It is not drafted or diffed. Linked work points at items in other tools and stays in the model, so it goes through drafts, diffs and merges like other model data.
- Why: linked work already points at items in other tools, so keeping their status current and taking reports from CI is the smallest useful next step. Report files work offline, so CI needs no tokens.
- Alternatives considered:
  - Hosts in the sidecar: refused. An engineer can edit a draft's sidecar and point a token at another host.
  - Live API sync from the tools into the model on a schedule: refused. It needs tokens and network access in CI, where report files work offline.
  - A separate work file next to the model, like the checklist: refused. Work items belong to model objects and should follow drafts.
- Trade-off:
  - A status is a snapshot. There is no polling and no webhooks.
  - Unattended pushes from outside (webhooks with API keys) are not built. The server binds to 127.0.0.1 and has session sign-in only, so CI uses the CLI and commits the model.
  - SonarQube bearer tokens need SonarQube 10 or later. Older servers use `basic` with the token as the user name.
  - A refresh reads at most 200 links. A finding in a file shared by several components goes to the first one in model order.
  - Outbound calls and their limits are in [CONTRIBUTING.md](CONTRIBUTING.md#linked-work-status-dec-085).


### Work page and severity

#### WRK-3 · DEC-086 — A Work page for every pinned item

- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-16] ("There should be a separate section to track these"; chose a page per project), Owner [2026-11-17] (no key, "just the work toolbar button"), [Proposal] (columns, filters, entry points)
- Decision:
  - **A page over the diagram.** `p=work`, from the **Work** button in the toolbar (no key: the owner chose the button only). It lists every linked work item in the model with what it is pinned to: the title (a link), tool, type, status (editable), severity, pinned to (a click reveals the box or line, or opens the diagram or flow), the tool's status and when it was checked, and the note.
  - **Filters and grouping.** Text, tool, type, status (done is hidden by default), severity and kind of target. Group by target.
  - **Adding and refreshing.** **Add item** has a target picker (default: Project). **Refresh status** reads the live status of the linked items (DEC-085).
  - **Entry points.** **Link work…** in the right-click menu of a box, a line or the diagram background opens the page with that target chosen. Diagram and flow panels have a "Linked work" section. The diagram list shows a count beside diagrams and flows that have open items of their own.
- Why: a checklist card beside the diagram suits a short list. Linked work can be long and needs a table with filters, so it gets a page.
- Trade-off: the page is per project. Work across a hub is DEC-088.

#### WRK-4 · DEC-087 — The severity mapping is a model setting, explained and edited on the Work page

- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] (on the import severity mappings: "Include info like this in a page to understand the tool better and allows user to change around things"), [Proposal] (where it is stored, the tables, the page)
- Decision:
  - **Stored in the sidecar** as `work.severity` (`designperspectives.json`). It holds five parts: the SARIF `security-severity` score thresholds (critical, high and medium, from 9, 7 and 4 by default), and four name tables: SARIF levels, GitLab Code Quality severities, SonarQube severities (issues, impacts and hotspot probability), and Jira priorities. Names match in lower case, and a name that is not listed (or one mapped to "none") gives no severity. The defaults are the mappings DEC-085 shipped, plus SonarQube's newer `HIGH`, `MEDIUM` and `LOW` in the import. A model with the defaults writes nothing, so existing files are unchanged.
  - **Used by** `dp work import`, `POST /api/work/import` and **Refresh status** (SonarQube and Jira). An item already in the model keeps its severity until the next import or refresh.
  - **Edited** with `PUT /api/work-settings` (`{severity}`, or `null` for the defaults; role `edit`). The mapping is part of the model, so a draft can change it and the change list shows it as "Linked work settings".
  - **"How it works" on the Work page.** A second view next to **Items** explains, in the page itself:
    - what linked work is, compared with the checklist;
    - which servers and link shapes give a live status;
    - the status rule;
    - how CI brings findings in, with the commands;
    - the severity mapping, as editable tables. Names can be added (a Jira site's own priorities), changed and removed. Duplicate names and scores that do not go down are refused before saving, and **Use dp's defaults** resets it.
- Why: a tool's severities do not match every team's sense of urgency (one team's "major" is another's "high"), and Jira sites rename their priorities. The owner wanted the rules visible and changeable. In the sidecar the mapping follows the model's review flow, and it holds no host or token, so it is safe for an engineer to edit (unlike tool connections, DEC-085).
- Alternatives considered:
  - In `.dp/integrations.json`, next to the connections: refused. That file is for architects only and is not reviewed with the model, and a mapping needs neither restriction.
  - Fixed in code with a long help text: refused, because the owner asked to be able to change it.
- Trade-off:
  - A changed mapping does not rewrite items already in the model; the next import or refresh does.
  - GitHub and GitLab give no severity, so they have no table.


### Across projects

#### WRK-5 · DEC-088 — Work across projects on the hub pages

- Date: 2026-11-17 · Status: Accepted · Decided by: Owner [2026-11-17] ("you can have an open work across all projects but include filters and relevant items"), [Proposal] (route, page, links)
- Decision:
  - **`GET /api/hub/work`**: the linked work of every project the person may see (DEC-060), read from each main model. Each row has its project. Each project reports its open and total counts, or the error that kept it from loading. It returns the tool connections, work types and statuses, so the page can label rows without a project's state. In a single project it is the same list for that project.
  - **A Work page on the hub pages** (`#/work`, **Work** in the left rail). It shows:
    - totals: open, critical or high, security, and how many projects have open work;
    - one chip per project, with its open count, which filters to that project;
    - filters for text, status (not done by default), type, severity, tool and kind of target;
    - grouping by project (on by default in a hub).
  - Each row links out: its title to the tool, its project to that project's Work page, and its target to the box on its diagram, to the diagram or flow, or (for a line or the project) to the project's Work page.
  - **Read-only.** Items are added, changed and refreshed in a project's own Work page, where the version (main or a draft) and the role are clear.
- Why: someone who looks after several projects wants to see what is open, especially security findings and failed quality gates, without opening each project.
- Trade-off:
  - Main models only: drafts are not included.
  - The list is built from every project on each request. It is reloaded when the window gets the focus back, not live.
  - No refresh from this page, so a status is as fresh as each project's last refresh.
