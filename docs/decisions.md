# Decisions

The running list of project decisions and the reasoning behind them, grouped by topic and subtopic. This is the only decisions file. Read the entries of a topic before you change a design choice there.

**Entry format**

```
# [Code] - [Code Title]            (a topic)
## [SubTopic Title]
### [Code] - [XX] - [Decision Title]
- Decision: 1 or 2 lines about the decision
- Why: 1 or 2 lines about why it was made
- Technical Notes: context for people changing the code (rules, files, routes, limits, trade-offs)
- Non-Technical Notes: context for product, process and users (scope, trade-offs, who decided what matters)
```

A decision has Technical Notes, Non-Technical Notes or both, whichever are useful. "Owner" means the project owner. "Proposal" means the choice was delegated and made by the assistant, as an interpretation rather than a sourced fact.

**Rules**
- A decision is named by its code and number, for example `PRO-05` or `COD-02`. Other files cite it that way; never reuse or renumber one. The number is its position in its topic.
- Add a new entry at the end of the subtopic it belongs to (or a new subtopic), with the next free number of its topic. Check the topic's last entry when you write it, not when you start.
- Do not rewrite old entries to hide a change. When a decision changes, add a new entry and say in the old entry's notes which entry replaces it and what changed.
- Entries are in the order they were decided within a subtopic, except for entries added later. HUB-03 to SEC-05 are dated 15 November but were numbered after later entries.
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
| MOD-06, MOD-07 deployment diagrams | Out of the order before 1.0.0 by PRO-05; after 1.0.0 by PRO-20 |
| PRO-12 MCP server | Future stage |
| MOD-01, MOD-03, MOD-04 groups | No groups feature found in `src/core`, the README or the CHANGELOG on 2026-11-20 |
| PRO-13 static export | In 1.0.0, planned as [Wave 21](waves/wave-21-static-export.md) (PRO-17); release, defaults, shapes and hubs in PRO-18 |
| SEC-03 open a local file | Confirmed by the owner (PRO-17); planned in Wave 16 |
| PRO-17 release steps, shared-checkout rule | Written in [CONTRIBUTING.md](CONTRIBUTING.md); the first release made with them is 0.6.0 |
| SEC-07 credentials always encrypted | Planned: [planned_features.md](planned_features.md) A7, as [Wave 23](waves/wave-23-sealed-credentials.md) (0.6.1) |
| PRO-18 static export: release, defaults, shapes, hubs | Planned: [Wave 21](waves/wave-21-static-export.md); release number moved to 0.13.0 by PRO-22 |
| PRO-19 code import and BMO choices (N1 to N15), 0.8.0 split | Planned: Waves 3, 5, 6, 15 and 22 (digests) |
| PRO-21 a finished wave is replaced by its review file | Rule for wave agents: [waves/README.md](waves/README.md#closing-a-wave); no wave is built yet |
| PRO-22 first release group split, Waves 23 to 27 | Planned: [Waves 23 to 27](waves/README.md); the groups changed again by PRO-23 |
| PRO-23 the second look at the waves | Planned: [Waves 28 and 29](waves/README.md#the-second-look-at-the-waves-2026-11-20), a real-run gate in Wave 1, the context window rule (Wave 14a), release numbers 0.6.1 to 0.14.0 |
| PRO-20 scope of 1.0.0, item by item | Documents written; hiding System Testing, traces and the demo system is planned as [Wave 29](waves/wave-29-system-testing-switch.md) (PRO-23) |
| DRF-07 commits to the architecture folder | Accepted, not built; [Wave 17](waves/wave-17-architecture-commits.md) |
| REC-03 sticky notes | Accepted, not built; [Wave 2](waves/wave-02-notes-context-help.md) |
| COD-06, COD-07, COD-10, COD-11 | Accepted, not built; planned in the waves ([waves/README.md](waves/README.md)) |

**Not (fully) live**

| Entry | State | By |
|---|---|---|
| COD-01 Stage B in the future stage | Superseded | COD-02 |
| RUN-04 live UI inspector | Superseded | RUN-05 |
| RUN-08 demo web app | Half superseded (history part live) | RUN-05, RUN-09 |
| PRO-05 releases stay in 0.5.x | Release part replaced (the 1.0.0 scope stands) | PRO-11 |
| COD-04 functions by pattern for TS, JS, Python | To be replaced by the generic reader | COD-06 (planned) |
| STK-06 file names | Partly replaced | STK-07 |
| PRO-15 CI on GitHub, install from GitHub | Partly replaced (CI on GitLab, not yet run) | PRO-10 |
| SEC-06 credentials: encryption optional | The "optional" part is superseded: always encrypted | SEC-07 |
| PRO-01, STK-01, DRF-05, PRO-13, PRO-14, SEC-04, RUN-01, RUN-02, RUN-03, REC-01, HUB-07, PRO-15, REC-02, COD-09, CAN-10, REC-05, SEC-03 | Amended; the amendment is named in each entry | various |

## Open questions and the ids of answered ones

*Moved from the deleted `open-questions.md` on 2026-11-20.*

**Today nothing is open.** The one pending item is a check, not a question: N1's "confirm with BMO" (the folder-skip list of PRO-19) could not be run because BMO was off; it is U26 in section 29 of the [manual test plan](manual-test-plan.md#29-unverified-facts-what-was-never-run-or-measured). Run it as soon as BMO is on (`dp bmo status`), and say whether BMO was available.

**Where a new open question goes.** A question about one planned feature goes in that entry's "Open questions" part in [planned_features.md](planned_features.md), or in the wave file while it exists. A question about the whole product goes to the owner in conversation, and the answer becomes an entry at the end of its topic here. A recommendation is a [Proposal], not a fact; facts carry a source. Question ids (D, N, Q-) are stable names: a gap in the numbers is an item that moved or closed.

**Where each answered question went** (the owner answered D1, D2, D5, D6, D7, D9 and D15 on 2026-11-20; D4 and N1 to N15 later the same day, N2 to N15 and D16 to D19 on the assistant's reasoning at the owner's request, so the owner may overrule them):

| Question | Where it is now |
|---|---|
| Q-K1, Q-K2, Q-K3, Q-C1, Q-C1b, Q-C3, Q-T4, Q-O3, Q-B6 and their answers; the options and the facts behind the assumption and token-limit questions | [PRO-16](#pro---16---owner-answers-to-the-open-questions-of-2026-11-20-part-1) (decision, alternatives considered, reasons, trade-offs) |
| **D1** static export timing, **D2** accounts, **D5** opening a local file, **D7** release process, **D9** shared working tree, **D15** "needs a look" alignment | [PRO-17](#pro---17---owner-answers-to-the-open-questions-of-2026-11-20-part-2). D1 became [Wave 21](waves/wave-21-static-export.md); D2 became [planned_features.md](planned_features.md) A6 (hosted accounts, after 1.0.0); D7 became [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release); D9 became [CONTRIBUTING.md](CONTRIBUTING.md#more-than-one-session-in-one-checkout) |
| **D4** the scope of 1.0.0, item by item | [PRO-20](#pro---20---the-scope-of-100-item-by-item); the short form is "The line, item by item" in [product-vision.md](product-vision.md); the one new piece of work is [planned_features.md](planned_features.md) A8 |
| **D6** credentials in plain text without a key (answered: encrypted) | [SEC-07](#sec---07---credentials-are-always-encrypted-at-rest); planned as [planned_features.md](planned_features.md) A7 |
| **D16** release for the static export, **D17** what it includes by default, **D18** single-file shape, **D19** hub export | [PRO-18](#pro---18---the-static-export-release-defaults-shapes-and-hubs): its own release, the opt-in and opt-out lists, a folder and a single file from one second build target, one project per export. The release number moved to 0.12.0 with PRO-19 and to 0.13.0 with PRO-22. Detail in [Wave 21](waves/wave-21-static-export.md) |
| **N1 to N15** code import and BMO choices (what the scan skips, entry points, layered folders, other manifests, the extension lists, the readiness report, who owns the level rules, pinned key code that stops matching, Wave 14, the 0.8.0 split, "needs an LLM" labels, context limits, digests, the assumption work, where the context window comes from) | [PRO-19](#pro---19---code-import-and-bmo-choices-n1-to-n15); built in Waves 3, 5, 6 and 15 (each wave file has a "Decided (PRO-19)" section) and the digests as [Wave 22](waves/wave-22-digests.md) |
| Q-A1: how to open the demo in Structurizr's tools | [manual-test-plan.md](manual-test-plan.md#30-structurizr-check-the-steps-behind-mt-draft-167), section 30 |
| Unverified facts, what was never run or measured (U1 to U25, later U26 and U27) | [manual-test-plan.md](manual-test-plan.md#29-unverified-facts-what-was-never-run-or-measured), section 29, with a Result column; related gap rows in section 28 |
| The verdict on all 81 questions of the stage reviews | The deleted `reviews.md`, last section "Where every question went" (`git show 24bbca1:docs/reviews.md`). Every row there points to an entry in this file or to a row above; the stage limits it listed are now section 31 of the [manual test plan](manual-test-plan.md#31-known-limits-by-area) |
| **D3** (the 0.6.0 release change), **D8** (where `.gitlab-ci.yml` lives), **D10** (a permission in `.claude/settings.json`), **D11** (the code map in `CLAUDE.md`) | Chores in the former backlog B7 (now in the wave files). D3 has its steps in [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release) |
| **D12** (`docs/determinism.md` does not exist yet), **D13** (Prettier is enforced), **D14** (the demo web app page) | Closed: stated in [waves/README.md](waves/README.md), in the notes of STK-05 and the status of RUN-08 here, and in the decisions index above |

---

---

# PRO - Project, scope and process

## Vision and scope

### PRO - 01 - Licence, user model and LLM default

- Decision: MIT licence; one user with collaboration through git; LLM features off by default; no LLM needed to develop.
- Why: the project is open source, makes no money and is meant for everyone to use.
- Technical Notes:
  - Every stage must work without an LLM. There is no real-time co-editing.
  - Amended by SEC-04: sign-in is optional and there are no accounts unless a users file exists. "Single user" means "no hosted accounts"; local accounts (the users file) are the account model for 1.0.0, and hosted accounts come after 1.0.0 ([planned_features.md](planned_features.md) A6; PRO-17).
- Non-Technical Notes:
  - The vision's "collaboration from different accounts" means the people in the local users file.

### PRO - 02 - Scope of ambition (from the first design round)

- Decision: a local-first app plus CLI that adopts an existing diagram format instead of inventing a DSL, supports planning (greenfield) and existing code (brownfield), and hands code off to external coding agents.
- Why: the tool should help with planning and understanding code as LLM-written code becomes common.
- Technical Notes:
  - Also in scope from the start: personas with permissions, OpenTelemetry support, and one stage at a time with a review at the end of each.
- Non-Technical Notes:
  - The plan was much larger than the first usable version, so the early stages deliver the core model and diagrams first. Most of the rest went to the backlog ([planned_features.md](planned_features.md)).

### PRO - 03 - Build for our own system first

- Decision: aim first at this project's own codebase, and optimise for other systems later.
- Why: a concrete first target keeps the scope testable.
- Technical Notes:
  - Demo models: the Internet Banking example from the C4 book (credited in `NOTICE`) and another example from the book.
- Non-Technical Notes:
  - No cloud accounts for testing yet, so integrations that need tokens or live APIs wait.

### PRO - 04 - Rethink from scratch toward a usable proof of concept

- Decision: restart planning from the project's purpose: a model-based C4 tool with different views of the same software for different users, code import and planned-change views, delivered in stages that each end in something the owner can run.
- Why: the earlier plan was too large to test.
- Non-Technical Notes:
  - Part of the earlier plan became backlog items.

### PRO - 05 - Version 1.0.0 is software architecture only, with twelve features

- Decision: dp is for software architects and the people who work with them in the SDLC; 1.0.0 covers software architecture only, with twelve features, and dp is not an IDE.
- Why: LLMs write more of the code, so the scarce skill is understanding and deciding the architecture. A narrow 1.0.0 gets a complete product for one audience; data and infrastructure are separate fields.
- Technical Notes:
  - **The twelve features:** C4 modelling; a single source of truth; architecture change proposals; lenses (architect, DevOps, other roles); collaboration and notes with images and files; contracts between services; an ADR page; code import; git-style commits for architecture; links to GitHub, SonarQube and Jira; a catalog shared between projects; and BMO, the architecture-intelligence agent. Full text: [product-vision.md](product-vision.md).
  - **Outside the line:** data architecture and infrastructure come after 1.0.0. What built features stay, hide or wait is in PRO-20.
  - **Order:** the waves in `docs/waves/` run interleaved, not behind deployment diagrams (amends PRO-14). Parked: Wave 10 (risk storming) and Wave 12 (runtime telemetry), moved to the owner's ideas list and later deleted (PRO-23). New waves from the vision: 16 (images and files), 17 (architecture commits), 18 (drafts that keep up), 19 (lenses for roles), 20 (a conversation about an existing system).
  - **Releases:** the original 0.5.x-only numbering is replaced by PRO-11.
  - Planning files stay in `docs/` (including `docs/waves/`) until the owner deletes them before 1.0.0. This is a standing exception to CLAUDE.md's "do not commit superseded plans".
  - Agents never use Fable; when a step could use either of two models, the larger is used.
- Non-Technical Notes:
  - Data features (the data catalog and access, pipelines) and runtime features (System Testing, traces) are built but outside the line, so 1.0.0 may ship with features its vision does not name.
  - Parking risk storming and telemetry drops them from 1.0.0.

## Working rules

### PRO - 06 - Design decisions state their trade-offs

- Decision: every design decision, in the tool and in these docs, names its trade-offs and marks its sources (owner, web, training data, proposal) so facts and interpretation stay apart.
- Why: the architecture notes in `notes/` treat trade-off analysis as the core of the work.
- Non-Technical Notes:
  - Writing is slower and review is easier.

### PRO - 07 - Reuse the existing GitHub repository

- Decision: build in `AbhishekR3/designPerspectives`; earlier content could be cleared.
- Why: one repository, no new setup.
- Non-Technical Notes:
  - Earlier work stays only in git history.

### PRO - 08 - Docs for this repository

- Decision: the repository keeps the book notes (`notes/`), the backlog, this decisions list and a review for each finished stage or wave. The books themselves and superseded plans are not committed.
- Why: the owner works from a local folder synced with this repository, so everything a session needs must be in it.
- Technical Notes:
  - Other tools are not named or compared in repository files, commit messages or pull requests (PRO-09). Commits and PRs carry no co-author or session-link lines.
  - The backlog is [planned_features.md](planned_features.md); the owner's private ideas are in the git-ignored `local/ideas.md`. The per-stage reviews (`reviews.md`) were deleted on 2026-11-20; their limits are section 31 of the [manual test plan](manual-test-plan.md#31-known-limits-by-area), and the text is in git (`git show 24bbca1:docs/reviews.md`).

### PRO - 09 - Research on other tools is allowed; naming them is not

- Decision: pulling information from other websites, tools and competitors is allowed as research input, but they are not named or compared in repository files, commit messages or pull requests. Ideas are written in our own terms.
- Why: the owner wants to learn from existing products without the repository becoming a comparison document.
- Non-Technical Notes:
  - Sources for a feature idea cannot be cited in the repository, so the reasoning must stand on its own.

## Releases and CI

### PRO - 10 - CI runs on GitLab, on Linux

- Decision: the pipeline is `.gitlab-ci.yml` (Linux, Node 20 and 22) and `.github/workflows/ci.yml` is removed. GitHub stays the main remote; the GitLab project is a second remote that only runs CI.
- Why: every GitHub Actions job since 14 Nov was refused with "your account is locked due to a billing issue", before any step ran, and the owner does not want to pay for CI.
- Technical Notes:
  - `npm run ci` (`scripts/ci-local.ts`) runs the same steps locally; `npm run hooks:install` can run it before every push.
  - Pipelines run only for merge requests and the default branch, with an npm cache, and an older pipeline is cancelled when a newer one starts, because free minutes are limited.
  - No macOS job: free shared runners are Linux only (as far as we know, not checked against GitLab's current terms), so macOS-only breakage is not caught. A push to GitHub alone triggers no checks; the owner-installed pre-push hook covers that.
  - The pipeline was written without a GitLab project to run on, so its first run may need fixes. GitLab may ask for identity verification before shared runners start.
  - Kept: `.github/` pull request and issue templates, and `demo/ci-examples/github-actions.yml` (a product example, not this repository's CI).

### PRO - 11 - Releases follow SemVer as 0.X.Y, and the changelog lists only what is built and tested

- Decision: every release before 1.0.0 is `0.X.Y` with no ceiling on X (features raise X, fixes raise Y), and `docs/CHANGELOG.md` lists only what is built, tested and working.
- Why: the owner wants a changelog a reader can trust and version numbers that say something.
- Technical Notes:
  - **Format:** one section per version, newest first: `## [x.y.z] - Month - DD - YYYY`, then `Added`, `Fixed`, `Changed`, `Deprecated`, `Remove` in that order; an empty heading is left out. Security items go under their heading with the prefix "Security:".
  - **Content:** no `Unreleased` section and no planned work (that lives in `planned_features.md` and `docs/waves/`). A wave agent writes nothing to the changelog; the release change after the last wave of a group writes the section from what shipped. The wave review files (PRO-21) hold the notes meanwhile.
  - `0.6.0` is the work already built and tested. The current release groups are in PRO-23 and the waves README; PRO-18, PRO-19, PRO-20 and PRO-22 hold earlier numbers.
  - The 0.6.0 section is dated by its last commit while `package.json` and the README still say 0.5.0 until the release change is made. A mismatch between `package.json` and the top changelog heading is not checked by CI.
- Non-Technical Notes:
  - Minor versions sort numerically under SemVer (0.10.0 comes after 0.9.0), not as text.

## Roadmap order

### PRO - 12 - MCP server moves to a "Future stage"

- Decision: the MCP server (reads the model, proposes edits as drafts) and related agent-facing work are parked in a Future stage, not scoped or scheduled.
- Why: it needs more thought first: its relation to the sign-in work, local authentication and what an agent may write.
- Technical Notes:
  - Any HTTP client can already write into a draft through the `X-DP-Model` header (DRF-04).
- Non-Technical Notes:
  - No agent integration soon.

### PRO - 13 - Sharing: read-only serve now, static export later

- Decision: sharing stays `dp serve --read-only` for now; a static HTML export of the model (UI plus a snapshot, no server) is built later.
- Why: serving is already built, and the export needs a static data path in the UI. It also fits the `dp check` / `dp diff` CI jobs (publish the model from the pipeline).
- Technical Notes:
  - The export is a snapshot of everything in the model (notes, costs, links), so it must be reviewed before publishing.
  - Timing settled by PRO-17: the export is built before 1.0.0 as [Wave 21](waves/wave-21-static-export.md). Defaults and shapes are in PRO-18: the whole model is read, the architecture is shown by default and the riskier data only on request.
- Non-Technical Notes:
  - Until the export exists, people who cannot run Node cannot view a model.

### PRO - 14 - Order after the deployment diagrams: a small batch, then the export

- Decision: deployment diagrams first (MOD-06), then a small batch of fixes, then the static HTML export (PRO-13).
- Why: the small batch is quick and low risk, and the export then carries those improvements from the start.
- Technical Notes:
  - The batch: technology labels on connections, inherited owner, tag descriptions, a shortcuts menu, an "in diagrams" list, CSV export. Its review lists the items separately because it is not one theme.
  - Whether deployment diagrams are per environment only or also per system is deferred to the deployment plan.
  - Replaced in part: deployment diagrams left the pre-1.0.0 order (PRO-05, PRO-20); the export is Wave 21 (PRO-17); the small batch is kept and is Wave 27 (PRO-22).

## Owner answer batches (amend many entries)

### PRO - 15 - Owner answers to the open review questions (release 0.4.0)

- Decision: the open review questions of 17 review sections were answered once, so release 0.4.0 goes out with known behaviour. Items marked [Delegated] are the recommended answer, taken because the owner gave no other.
- Why: the questions had collected over many stages.
- Technical Notes:
  - **Network bind.** `dp serve` with a non-loopback `--host` refuses to start unless users exist, or `--read-only` or `--insecure` is given. Replaces the warning of SEC-01.
  - **Hidden code paths.** Mapping an object to a path with a dot-prefixed segment is refused when entered; a path a model already has still loads and `dp check` warns. Refines SEC-02.
  - **Own drafts.** With sign-in, an engineer changes and discards only drafts they started and reads all others; architects change any. Drafts made before sign-in have no author and only architects change them. Amends SEC-04.
  - **Accepted decisions stay editable.** No lock is built (REC-04 unchanged).
  - **Selection.** Ctrl/Cmd+click adds to the selection, as Shift+click does.
  - **Draft compare.** A draft can be compared with where it started or with main as it is now.
  - **Demo.** It ships a sample draft and keeps its made-up git history, with no opt-out flag.
  - **CI** runs `dp check --strict` on the demo; the test runner gets its major upgrade. "Also write the planned code edits" starts unticked when the draft has a branch.
  - **Install** is from GitHub only, with no npm publish for now, so the built UI stays committed (closes the question on STK-03).
  - **Kept as they are:** no framing in editor preview panes; decisions written in a draft by engineers; the fixed front-matter grammar; an empty start with `--demo` for the sample; an empty system's context diagram not listed in the sidebar; `git config user.name` as the author without sign-in; a 12-hour idle session; a lens is a default view and hides no data on the server (MOD-11); the Add palette starts collapsed at 1280 px; layout never conflicts in a draft; stored models are compared at git refs; planned code edits have no undo history of their own; tables are a list.
  - **Git process:** branch from `main` for each change; one pull request per change, no stacks; a UI change rebuilds `static/` and a model or demo code change regenerates `demo/` in the same commit; the owner merges; a release is a `vX.Y.Z` tag on `main` with a GitHub release (written out in [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release), PRO-17).
  - **Security fixes in this release:** hub project folders added in the browser must be inside the hub and not hidden, and `hub.json` entries are checked on load; project ids cannot be built-in object keys; GitHub links are checked before the stored token is used; `comments.json` has a 10 MB cap.
  - Left in the backlog: rebase of a draft and a merge editor (Wave 18); a light theme (B5); rating targets, per-environment cost; per-diagram hiding; a connector from the palette; backtracking from traces; trackers other than GitHub. See [planned_features.md](planned_features.md).
  - Superseded in part: CI is on GitLab (PRO-10); the encryption key for credentials is no longer optional (SEC-07).
- Non-Technical Notes:
  - This release is 0.4.0, not 1.0.0: the owner wants to change more before 1.0.0.
  - Two engineers cannot share one draft; a network demo needs `dp users init` or `--insecure`.
  - Hand-written `hub.json` entries may still point outside the hub folder (HUB-04), so that file must be trusted. A person who is architect on the catalog changes names and descriptions in linked copies in projects where they have a lower role, because copies follow the catalog (HUB-07).
  - Not checked for this release: Structurizr's own tools reading the files, Windows, and CI on GitHub.

### PRO - 16 - Owner answers to the open questions of 2026-11-20, part 1

- Decision: Q-K1, Q-K2, Q-K3, Q-C1, Q-C1b, Q-C3, Q-T4, Q-O3 and Q-B6 are answered: viewers cannot answer checklist questions, assumptions get a "wrong" state and can be cited by decisions, there is no token cap in BMO chat, and the "needs a look" count uses one rule.
- Why: each follows the structures that already exist and keeps real values and unreviewed guesses out of the record. Nothing here is built; each item names where it will be.
- Technical Notes:
  - **Q-K1, viewers.** Viewers cannot comment on or answer checklist questions. Architects and engineers change the checklist, viewers read it (REC-05). A viewer who knows an answer comments on an object (REC-01) and a person who can edit the checklist carries it over.
  - **Q-K2, assumptions** (an assumption is one of three checklist item kinds: `task`, `question`, `assumption`, in `architecture/checklist.json`, outside the model). (1) Added by BMO (an import), by a person on the checklist, and, new, from a decision's Context ("This decision assumes..."); never by a viewer or in a draft. (2) A decision record can cite assumption items by id and shows them. (3) A fourth state, "wrong" (confirmed, open, wrong, skipped): marking one wrong is told to BMO and puts the decisions that cite it on "needs a look" through the revisit-trigger machinery (REC-04, CAN-10). (4) A one-click confirm is not evidence; only typed words verify anything (COD-03). (5) An assumption as a property of an element, drafted and diffed, is not built. Built in Wave 3 (PRO-19, N14).
  - **Q-K3, CI.** The 16 self-checking rules reach `dp check` through Wave 8's rule registry. Items a person added, BMO's questions and assumptions do not reach CI, and there is no `dp checklist` command for now.
  - **Q-C1, no token cap.** The fixed 24,000-token code cap per chat message (COD-09) is dropped. dp shows the approximate size (tokens, and cost where a price is set) in the preview before anything is sent. Q-C1b: refuse a run only when the prompt is larger than the model's context window; when the window is unknown dp only warns. This replaces the size refusal of COD-08 (`runTokenLimit`) and was later refined by PRO-23. The estimate is tokens ≈ bytes ÷ 4.
  - **Q-C3, flow-step chaining.** Kept: a step links to the nearest earlier and nearest later step at the same element.
  - **Q-T4, saved test cases.** Stay parked with `dp test` and HTTPS intercept points (ideas list I2.7). A saved case would hold the masked call and the names of fields to fill; real values are supplied at run time and never reach disk (RUN-06).
  - **Q-O3, routing.** No next routing stage until a real diagram shows a problem; leftovers are in the former backlog B5 (now in the wave files).
  - **Q-B6, "needs a look".** The home page list and the top-bar badge use one rule, and the server's list also includes proposed decisions (amends CAN-10). Build it with the next code change that touches `src/core/homeSummary.ts` or the home page (PRO-17, D15).
  - Facts as of 2026-11-20: the BMO preview already shows an estimated token count (`ui/src/common/BmoSheet.tsx`); COD-08 refuses a prompt larger than the budget plus room (150,000 tokens at the default budget of 100,000).
  - Alternatives for Q-K2: keep assumptions on the checklist only (nothing to build, but no drafts, diff or link to decisions); store them as model data (`dp.assumptions`, reviewed with the change but a second home for the same text). Alternatives for Q-C1b: keep the COD-08 refusal (a cap in disguise); warn and send only on confirm (a run can be expensive if ignored).
- Non-Technical Notes:
  - Viewers keep no route to answer checklist questions; their knowledge reaches BMO only through a person with edit rights.
  - Open checklist items never fail CI; a team that wants that must use a model rule.
  - With no cap, a long chat can send a large prompt; the estimate before sending is the guard.
  - Q-C1b needs the model's context window, which dp does not know today. Options: a table of limits (goes stale), asking the provider (a network call), or the person types it (PRO-23 chose this). Until then dp can only warn.
  - A "wrong" state adds a fourth state to a list that has three, and the needs-a-look rule gains a source. A draft's decision may cite an item main does not have (shown as "not in this version").
  - The home page list will show more entries (proposed decisions) and will rarely be empty, as the badge already is.

### PRO - 17 - Owner answers to the open questions of 2026-11-20, part 2

- Decision: D1, D2, D5, D7, D9 and D15 are answered: the static export is built before 1.0.0, accounts are local users, "open a local file" stays, there is one written release procedure, one branch per session, and the "needs a look" alignment ships with the next change that touches the home summary.
- Why: each uses what exists (local users, the CI jobs, the file opener's limits) instead of a new service, and the rules are cheap compared with the repairs they prevent.
- Technical Notes:
  - **D1, static export.** [Wave 21](waves/wave-21-static-export.md), after every wave that adds data to the export. PRO-13's design stands (built UI plus a model snapshot, opened without a server, a review step before publishing). It no longer waits for deployment diagrams.
  - **D2, accounts.** A user in the local users file (SEC-04): a name, a password hash, a role, optionally a role per hub project. Hosted accounts are after 1.0.0 ([planned_features.md](planned_features.md) A6). Local users can comment and attach files (Wave 16) as themselves.
  - **D5, opening a local file.** SEC-03 stands: a click opens the file in the system's default app, within its limits (this machine only, a fixed type list, the full path shown first, an argument list never a shell). Wave 16's security review still decides whether the route is safe; "Copy path only" is the fallback.
  - **D7, release process.** Written in [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release): a release branch holds one small change (version, README, changelog section), the full `npm run ci` runs, the owner merges, the tag `vX.Y.Z` is made on `main` and a GitHub release carries the changelog section as its notes. GitHub holds the tag and release; GitLab only runs CI (PRO-10). Nothing is pushed, merged or tagged without the owner's go.
  - **D9, shared working tree.** One branch per session; commit by path; never edit a file another session has modified and not committed. Written in CONTRIBUTING.md and in one line in `.claude/CLAUDE.md`. It is discipline, not enforcement.
  - **D15, "needs a look".** The alignment of PRO-16 (Q-B6) is built with the next change to `src/core/homeSummary.ts` or the home page, with a test that the home list and the top-bar badge give the same count on the demo, which ships proposed decisions.
  - Alternatives: export after 1.0.0 (smaller 1.0.0, but only `--read-only` shares a model until then) or before the waves (the export would change with every wave); publish to npm (not chosen, install is from GitHub only); generated release notes (not chosen, the changelog already follows PRO-11).
  - Amends PRO-01, PRO-13, PRO-14, PRO-15 and SEC-03. D6 is SEC-07; D4 is PRO-20.
- Non-Technical Notes:
  - **D1.** An export includes everything in the model unless chosen otherwise: notes, costs, links, `local:` paths that show a user name. The review step is the guard and is real work. A static page cannot run System Testing, BMO, drafts or any write.
  - **D2.** With local accounts a hub is trusted at the folder level: someone with the hub folder sees every project (SEC-05). Real multi-office collaboration waits for hosted accounts.
  - **D5.** dp asks the operating system to start another program from a path that can come from someone else's repository.
  - **D9.** On 2026-11-20 a second session had 27 uncommitted documentation edits on `main` while a clean-up ran; each such clash had cost a repair. A second worktree costs disk and one more `npm ci`.

### PRO - 18 - The static export: release, defaults, shapes and hubs

- Decision: Wave 21 is its own release, run last; an export includes the architecture by default and the riskier data only on request; both a folder and a single file are built from one second UI build target; a hub exports one project at a time.
- Why: the export carries what many waves add, so it comes after them; defaults decide what leaks when someone skips the review; a folder with module scripts does not open from disk in common browsers, so a second build target is what makes "no server" true; per-project export avoids mixing projects with different roles.
- Technical Notes:
  - **Included by default, removable with `--without`:** the model, `notes`, `decisions`, `links`, `owners`, `addresses`, `library`, `keycode`, `findings`, `contracts`. **Left out by default, added with `--with`:** `comments`, `attachments`, `work`, `costs`, `local-paths` (a file name only without it), `code`, `checklist`, `import-review`, `bmo-runs`. Nothing is in both lists. A secret-looking value always refuses the export. `.dp/`, credentials, users, integrations and drafts are never exported. The command only prints a report until `--yes` is given.
  - **Shapes:** a **folder** that opens from a web host and from disk (21a), and a **single file** with everything inline (21b), from one second UI build target (classic script, relative paths, data as script files, elkjs as a separate classic script). The first step of the wave checks that this works from a `file:` address in three browsers; if it fails in one, the wave stops and asks. The `file:` behaviour is from training, not from a run.
  - **Hubs:** one project per export; no home page, catalog or cross-project Work page. A folder per project with an index page may come after 1.0.0 (SEC-05 gives each project its own roles).
  - Two build targets mean CI must check that both `static/` and `static-export/` are current, and the package grows by about 2.6 MB.
  - Release number: 0.13.0 under the current groups (PRO-23).
  - Alternatives: everything on by default (easiest accident); only the bare model (nearly empty, so people would turn everything on); folder only (needs a host); single file only (one huge file); reading the model in the browser (copies `src/core` into the UI).
- Non-Technical Notes:
  - Costs, ticket keys, comments, files and local paths each reveal something the diagram does not (money, internal systems, conversation, a user name), so they are opt-in. Notes, decisions, links and owners are part of what an architect shares.
  - An export made in a hurry can look thinner than the live model; the report lists what was left out.
  - A single file with a large model can be many megabytes; no size limit is set.

### PRO - 19 - Code import and BMO choices (N1 to N15)

- Decision: fifteen small choices for the code import and BMO, mostly taken on the assistant's reasoning at the owner's request, so each may be overruled: what the scan skips, how entry points and layered folders are treated, which manifests count, how the readiness report shows cost, how a context window is handled, and a digests wave.
- Why: each keeps the rule fixed and checkable (COD-10, COD-06), asks the person where a guess would hide structure, and leaves the person's own pins alone.
- Technical Notes:
  - **N1, skip folders.** `test`, `tests`, `__tests__`, `spec`, `docs`, `doc`, `examples`, `example`, `scripts`, `migrations`, `fixtures`, `generated`, `third_party` are skipped by name only where component folders are chosen (the per-folder count that makes `component-dir` facts in `scan.ts`), through a new separate set. `EXTRA_SKIP_DIRS` (`scan.ts`) and `SKIP_DIRS` (`codeMap.ts`) stay unchanged, because adding to `EXTRA_SKIP_DIRS` would hide those files from every fact. Their files still count as evidence; the candidate review lists each skipped folder with its reason and "add back". Built in Wave 15. The list was not checked with BMO because BMO was off; check it whenever BMO is available (manual-test-plan U26, section 32). A project whose product is a folder named `docs` or `scripts` must add it back by hand.
  - **N2.** Entry points and public interfaces become hints for key code from the Wave 5 pattern table, never components.
  - **N3.** No rule for layered folders; the Wave 15 interview asks "are these folders one component?" when names look layered.
  - **N4.** Cargo, Gemfile, Composer and .NET project files join the manifest table (Wave 5); Maven and Gradle stay out.
  - **N5.** One list of source extensions in the Wave 5 pattern table, with a flag "counts as source" versus "known file type".
  - **N6.** The readiness report keeps minutes, tokens and passes; money only when `pricePerMTok` is set (the earlier "no price setting exists" in `import-design.md` was wrong and is corrected).
  - **N7.** `import-design.md` states what matters at each C4 level; Wave 5 implements it.
  - **N8.** A pinned key-code entry that no longer matches becomes a finding (Wave 6) the person can acknowledge; never silent, never removed by dp.
  - **N9.** Wave 14 stays where it is.
  - **N10.** The 0.8.0 split: the import release is Waves 5 and 15 (current numbering in PRO-23).
  - **N11.** Each import step carries a fixed badge: "no LLM" or "needs an LLM".
  - **N12 and N15, context window.** A new optional BMO setting holds the window, typed by the person; it drives a warning and the limit shown beside the estimate ("limit not set" when unknown). Reading an Ollama model's value waits for a check on a real server (U27). The refusal rule is settled in PRO-23.
  - **N13, digests.** [Wave 22](waves/wave-22-digests.md): digests per container and component in `architecture/import/digests/`, a computed part plus a labelled BMO summary, and a hash that marks a digest out of date and never regenerates it silently. The agent instructions file is written only on request (`dp context --write`).
  - **N14.** The assumption work of PRO-16 is built in Wave 3, with the "wrong" state as a small checklist change; Wave 6 reads that state.
  - Alternatives: read `.gitignore` for N1 (says nothing about tests or docs, needs a parser); language rules such as `*_test.go` (refused by COD-06); a name rule for layers; all ecosystems for N4; a built-in model table for N15 (goes stale) or asking the provider (a network call).
- Non-Technical Notes:
  - N1 adds one more list to maintain, against not hiding test and script folders from the rest of the scan; if the owner prefers the walk-wide skip, the file count shrinks and no evidence comes from those folders.
  - The window is only as right as what the person types; the warning is a hint.
  - The N10 split meant renumbering every wave file by hand; a missed reference is possible.
  - Digests add a store, a staleness check and a UI list to maintain.

### PRO - 20 - The scope of 1.0.0, item by item

- Decision: built data and runtime features stay in the product but System Testing, traces and the demo system are hidden by default; the data catalog, pipelines, cost overlay and deployment data are kept; deployment diagrams, runtime telemetry and risk storming wait.
- Why: it follows the vision's non-goal ("debugging a running service in dp is not a 1.0.0 goal"): hiding keeps the work and the tests and costs less than removing, and the kept features are small, tied to wanted waves, or inside software architecture.
- Technical Notes:
  - **Built, decided:**
    - **B1, data catalog and data access (HUB-06): keep**, together with P4. `src/core/catalog.ts` also holds the shared-catalog usage feature K needs; P4's CRUD letters and role × data matrix edit the same code. The vision gets one stated exception: data access as a property of a part of the system, not a data model.
    - **B2, data pipelines and connector stages (RUN-01, COD-04): keep, backtracking too.** Wave 13 (contracts) builds on `dp.example`, `dp.format`, `dp.stages` and `dp.stepData`.
    - **B3, System Testing mode (RUN-06, RUN-07): hidden, not deleted.** About 3,361 lines in 19 files, 74 test rows, 13 routes. Off unless `dp serve --testing`; its tests stay in CI; docs call it experimental; `dp.run.url` stays a property. Built as [Wave 29](waves/wave-29-system-testing-switch.md) (PRO-23).
    - **B4, observed traces (RUN-02, RUN-03):** follows B3; the `GET /api/traces*` routes go behind the same switch.
    - **B5, cost overlay (MOD-14, MOD-09): keep.** `dp.cost` is read by five core files; cost is an architecture characteristic in the book, and Wave 9's table can compare it.
    - **B6, deployment data (MOD-06, MOD-07): keep as is.** Nodes stay whole so a Structurizr file round-trips.
    - **B7, the demo system (RUN-09):** follows B3. `dp serve --demo` no longer starts the five services on ports 4200 to 4204 unless `--with-system` is given; the demo tour's System Testing chapter moves behind that flag.
    - Together B3, B4 and B7 are about 4,250 lines (7% of the code) and about 90 test rows leaving the default surface; two listeners (the proxy and the demo services) no longer start by default. Nothing is deleted.
  - **Planned, decided:** P1 deployment diagrams: later (ideas list I1); the export no longer waits for them (PRO-17). P2 the small batch (PRO-14): keep (the former backlog B2 (now in the wave files)). P3 the static export: keep (PRO-17). P4 the data half of [Wave 4](waves/wave-04-roles-data-variants.md): keep, with B1. P5 Wave 12 (runtime) and P6 Wave 10 (risk storming): later (A7). P7 Wave 14 (local runtimes and the word index): keep, since it lets BMO work with no cloud call (A2). P8 the language mix per object in Wave 5: dropped. P9 Wave 7: the `dp metrics` CSV is kept; test coverage stays later.
  - Settled elsewhere: hosted accounts after 1.0.0 (PRO-17); credentials always encrypted (SEC-07); opening a local file stays (SEC-03).
  - Amends PRO-05, RUN-06 and RUN-09 (hidden by default).
  - Alternatives: B1 and P4 both later (refused, the owner answered the CRUD questions with that work in mind); B3 on by default (refused for the non-goal and the traffic-forwarding listener); B3, B4, B7 removed (refused, removing built code is a bigger step); a wave for the hide work (first refused, then made Wave 29 by PRO-23); hiding backtracking (little saved).
- Non-Technical Notes:
  - The flag adds a second mode to test: the System Testing suites run in CI with the flag on, and a few tests check the routes are absent with it off.
  - The default demo shows less: without `--with-system` it cannot pause a live call; the tour says how to start it.
  - Data access stays in 1.0.0 although the vision says software architecture only; the vision now names the exception.
  - A canary or blue/green split is modelled with a condition on a line (Wave 4) and a note until deployment views exist.

### PRO - 21 - A finished wave is replaced by its review file

- Decision: when a wave is complete, its agent writes `docs/waves/wave-NN-review.md`, deletes the wave file, fixes every link to it, and commits by path. Parked and partly built waves keep their files.
- Why: a wave file is a plan and describes what was meant; the review says what is true. Copying the questions section keeps the options and the owner's words, which no other file holds.
- Technical Notes:
  - The review holds what was built, how it was checked, differences from the plan, limits, notes for the release entry, questions, an empty owner-feedback part, and the wave file's "Questions, options and answers" section word for word. Steps: [waves/README.md](waves/README.md#closing-a-wave).
  - Replaces the earlier rule that no wave file is deleted before 1.0.0. A missed link breaks a document, so the agent runs a link check.
  - Alternatives: a section per wave in the old `reviews.md` (one big file); keeping wave files until 1.0.0 (plans and reality drift apart).
- Non-Technical Notes:
  - The plan is no longer there to compare with the result, so the review records the differences.

### PRO - 22 - The first release group is split, and Waves 23 to 27 are added

- Decision: the first release group is split into smaller releases and five waves are added from the planned features: 23 (credentials always sealed), 24 (remove a project from a hub), 25 (BMO with your own subscription), 26 (a Users page) and 27 (the small batch).
- Why: the first group was the largest by far and mixed BMO, collaboration and housekeeping; splitting keeps each release one story, puts the security fix first, and gives every item the owner decided to build a place.
- Technical Notes:
  - The new waves are [23](waves/wave-23-sealed-credentials.md) (planned_features A7), [24](waves/wave-24-remove-project-from-hub.md) (A3), [25](waves/wave-25-bmo-own-subscription.md) (A2 and the first half of A4), [26](waves/wave-26-users-and-roles.md) (A5) and [27](waves/wave-27-small-batch.md) (PRO-20, P2).
  - A8 stays a planned-features entry, not a wave (made a wave by PRO-23).
  - Order inside groups: Wave 23 first, before the owner's first real provider call; Wave 25 after Waves 1 and 2 (it needs the citation checker and the deterministic BMO); Wave 26 before Wave 16 so attaching has roles; Wave 27 after Wave 7 so the CSV export shares its writer.
  - Table items placed in existing waves: the "needs a look" alignment in Wave 6; the context-window display in Wave 14; the "no LLM" badge, the per-level Import URL, the known-services upkeep, the CODEOWNERS owner cards and the second half of A4 in Wave 15; the plan check on the generic reader in Wave 5; the draft-start code comparison as an optional part of Wave 18.
  - Left unplaced on purpose: A1 (Codacy and live refresh), A6 (hosted accounts, after 1.0.0), the light theme and accessibility audit (1.0.0 checklist items after Wave 21), the coverage overlay, line routing stage 2, per-diagram hiding, ratings on relationships.
  - Wave 23 is a patch (0.6.1) only because "fix" includes a security fix (PRO-11). The current release groups are in PRO-23.
  - Alternatives: one 0.7.0 with an order inside it (ten pieces of work, release only at the end); patch releases for small waves (PRO-11 reserves patches for fixes).
- Non-Technical Notes:
  - 0.7.0 is still the largest group.
  - The five new waves bring questions (Q23.1 to Q27.2), each with a recommendation that holds if the owner leaves it blank.

### PRO - 23 - The second look at the waves: a real-run gate, the context window rule, Waves 28 and 29

- Decision: Wave 1 closes only after one real model run; a context window the person typed is a limit and none typed means a warning; Wave 14 is split; Waves 28 (quality for 1.0.0) and 29 (the System Testing switch) are added; parked Waves 10 and 12 are deleted.
- Why: a gate before six waves are built on an answer shape is cheaper than a redesign after them; each move removes a double edit of the same code or a missing input; guards are worth most when they run before the work they guard.
- Technical Notes:
  - **Real-run gate.** [Wave 1](waves/wave-01-grounded-bmo.md) closes only after one real run through a route the owner uses (an API key, a chat subscription by handoff, or Ollama), after the default model ids are checked; [Wave 25](waves/wave-25-bmo-own-subscription.md) also needs one real handoff round trip. If no route can be tried, the BMO waves wait. (No real model has answered through dp yet: manual test plan U1 to U3.)
  - **Context window rule.** A window the person typed is a limit: a larger request is refused, and the message names the window, the estimate and what to narrow. With none typed, dp shows "limit not set" and only warns. The pass-budget refusal (`runTokenLimit`, COD-08) stays. The window is part of the preview hash and comes from the person only. This settles the conflict between PRO-16 (Q-C1b) and PRO-19 (N12, N15). Built in Wave 14a.
  - **Wave 14 is split:** 14a (local runtimes, the typed window, the size before a run) in 0.9.0 before Wave 15; 14b (the word index) in 0.12.0 before Waves 22 and 20.
  - **Wave 27** moves to 0.8.0, right after Wave 4, which builds the shared CSV writer `src/core/csv.ts` (with the formula-character rule) that Waves 7 and 27 reuse.
  - **Other ordering:** Wave 17 runs after Wave 18, which leaves one hook place after a successful apply; Wave 8 gets a split point (8a registry, presets, Rules page; 8b detectors, overlay); Wave 13 adds a contracts section to the lenses Wave 19 builds first; Wave 2 keeps the "Use an LLM" default in one constant that Wave 25 changes.
  - **Wave 28.** 28a (guard rails: compatibility fixtures from released versions, a snapshot of the public surface, a generated large model with time budgets, a package-contents check) runs early with no release of its own; 28b (an automated accessibility audit including the exported file, a keyboard-only walk, the fixes, the stable-surface statement) is 0.14.0 and runs last. No light theme: 1.0.0 is dark only and says so.
  - **Wave 29** is the A8 switch: `dp serve --testing` only, no setting; the demo's services start only with `--with-system`. It overrules PRO-20's "not a wave" and keeps its decision to hide and not delete.
  - **Waves 10 and 12 are deleted.** Their designs moved to the ideas list (I2.3 and I2.7); the decisions that parked them (A7, COD-07, PRO-20 P5 and P6) stand.
  - **Release groups now:** 0.6.1 (23, 28a), 0.7.0 (24, 1, 2, 25, 29), 0.8.0 (3, 26, 16, 4, 27), 0.9.0 (5, 14a, 15), 0.10.0 (6, 7, 8), 0.11.0 (9, 11, 18, 17, 19), 0.12.0 (14b, 13, 22, 20), 0.13.0 (21), 0.14.0 (28b), then 1.0.0. The waves README holds the current numbers.
  - Amends COD-08, PRO-16, PRO-19, PRO-20 and PRO-22.
  - Alternatives: no gate; the gate before Wave 25 only; "warn only" or "refuse and drop the pass budget" for the window; Wave 28 with the light theme; keeping Waves 10 and 12 as files.
- Non-Technical Notes:
  - Wave 1 cannot close without the owner's key or chat app.
  - 0.7.0 and 0.8.0 hold five waves each (the owner accepted this); one more wave and release (0.14.0) were added, and every later wave updates the public-surface snapshot.
  - The ideas file is git-ignored, so the two parked designs are no longer in the repository.
  - The Wave 28 questions were settled by the assistant: a development-only checker, budgets at three times the first measured run, and the Python 0.2 sentence retracted unless a real file turns up.

# STK - Stack, files and repo layout

## Stack and delivery

### STK - 01 - Local web app started by one command

- Decision: a local server reads and writes model files in a folder and serves the UI to the browser; no accounts, no hosted server.
- Why: the simplest way to get a usable tool without installers or accounts.
- Technical Notes:
  - Amended by SEC-04: sign-in is optional.
- Non-Technical Notes:
  - No installable desktop app for now; the UI could later be wrapped in a desktop shell or published as a static demo.

### STK - 02 - All-TypeScript stack

- Decision: one TypeScript stack: a Node.js server (Hono), the `dp` CLI (commander), a React UI and one shared API-types file (`src/shared/types.ts`).
- Why: it removes hand-copied API types between server and UI and keeps model rules reusable in the browser later (the assistant's assessment, not a measurement).
- Technical Notes:
  - Rejected: a Python backend with a TypeScript UI (two languages, types copied by hand); Rust (Tauri) with a TypeScript UI (full rewrite, slower iteration). Supersedes the earlier Python-first plan.
  - Python import scanning uses a hand-written tokenizer instead of `ast` (a file with a syntax error still shows its imports). Numbers are written as JavaScript writes them, so a project saved by 0.2 gets a one-time diff.
  - More detail: the deleted `reviews.md` (in git at 24bbca1).

### STK - 03 - Built UI is committed

- Decision: the built UI (`static/`) is committed and shipped in the npm package; CI fails if a build changes it.
- Why: installing from git then does not require building the UI.
- Technical Notes:
  - Install stays from GitHub only (PRO-15), so this holds.
- Non-Technical Notes:
  - Build output makes large diffs after every UI change.

## Model file format

### STK - 04 - Native model file is a Structurizr workspace plus a sidecar

- Decision: `architecture/workspace.json` is a Structurizr workspace; `architecture/designperspectives.json` holds what Structurizr has no field for; per-object extras are `dp.*` properties inside the workspace.
- Why: Structurizr's format is open (Apache-2.0), plain JSON and widely understood, so no new C4 format is added.
- Technical Notes:
  - The sidecar holds tag groups, lenses, the characteristics list, cost settings, styles and layouts.
  - Rejected: own JSON files (a format nobody else reads); LikeC4 or Structurizr DSL (canvas edits would have to be written back into DSL source).
  - Structurizr's numeric ids are replaced by readable slugs.
- Non-Technical Notes:
  - One large file per workspace means more merge conflicts than many small files.
  - Opening our files in Structurizr's own tools has not been verified (manual-test-plan section 30).

## Tooling

### STK - 05 - ESLint and Prettier are enforced in CI

- Decision: ESLint (recommended rules plus the two hook rules, `npm run lint`) and Prettier (print width 200, `npm run format:check`) both run in CI.
- Why: lint finds real bugs at low cost, and one format keeps real changes visible in history.
- Technical Notes:
  - The 18 hook-dependency warnings were each reviewed and marked intentional with a reason; no dependency array was changed. These disables are only correct while callers keep passing state setters and refs.
  - Originally Prettier was configured but not applied, because it would have re-wrapped 58 of 113 files. It is now enforced (`.gitlab-ci.yml`, `scripts/ci-local.ts`) and the code was formatted in release 0.4.0.

## Layout and naming

### STK - 06 - Files are grouped by area with plain names

- Decision: files are grouped into folders by area and named plainly; a new file goes in the folder for its area, a file under about 50 lines with one user is folded into that user, and a file is named after its main content.
- Why: the flat `ui/src` had about 60 files and several route modules of 10 to 40 lines, so a newcomer could not tell where to look.
- Technical Notes:
  - Backend: `src/core/` model modules (`project.ts`, `codeFiles.ts`, `codeMap.ts`, `util.ts`, `diff.ts` and so on); `src/demo/`; `src/server/routes/` one module per area.
  - UI: `ui/src/` folders `canvas/`, `hooks/`, `panels/`, `pages/`, `drafts/`, `inspect/`, `common/`, `styles/`. Current names are in the Architecture section of `.claude/CLAUDE.md`; some names were replaced by STK-07.
  - `git log --follow` follows the renames. Route files such as `model.ts`, `hub.ts` and `read.ts` hold several areas each.
- Non-Technical Notes:
  - `git blame` and older review notes name the old paths.

### STK - 07 - Repository layout: a short root, one demo folder, one tests folder, readable names

- Decision: the root holds only `README.md`, `LICENSE`, `package.json`, `package-lock.json` and `.gitignore` plus folders; the demo is one folder, the tests are one folder with a generated list, and files have readable names.
- Why: the owner found the root and file names hard to read and wanted one place each for the demo and the tests, and a list of what each test checks.
- Technical Notes:
  - **Config** moves to `config/` (`tsconfig.base.json`, ESLint, Prettier, Vitest, Playwright; small `tsconfig.json` files in `src/`, `tests/`, `scripts/`); npm scripts pass the paths and `.vscode/settings.json` points editors at them. `CHANGELOG.md` is in `docs/`, `CLAUDE.md` in `.claude/`; the owner's own files live in the git-ignored `local/`.
  - **Policy:** `docs/CONTRIBUTING.md` holds contributing, code of conduct, reporting a security problem and the security model. NOTICE is removed; the demo's Apache-2.0 credit is in `demo/README.md`.
  - **Demo:** `demo/` holds the model, sample code, sample draft, demo hub, example import file, `ci-examples/` and the tour.
  - **Tests:** `tests/unit/` (Vitest) and `tests/browser/` (Playwright, run with `npm run test:browser`). `tests/TESTS.csv`, generated by `scripts/list-tests.ts`, has one row per written test; CI fails when it is stale; each test file starts with a one-line doc comment.
  - **Names:** the built UI is `static/assets/app.js`, `app.css`, `diagram-layout.js` with no content hash, sent with `Cache-Control: no-cache` and an `ETag`. Source files were renamed (`ops.ts` → `modelEdits.ts`, `units.ts` → `modelUnits.ts`, `sidecar.ts` → `designPerspectivesFile.ts`, `src/bmo/` → `src/assistant/`, and others). Product terms and on-disk names stay (BMO, `/api/bmo/*`, `.dp/bmo.json`, `designperspectives.json`).
  - Tools run from `config/` need explicit paths; an editor without the `.vscode` settings will not find the ESLint and Prettier settings. A test in a loop is one CSV row though it runs once per item.
- Non-Technical Notes:
  - npm, git and GitHub only read their files at the root, so five files stay there. GitHub's Security tab no longer links a policy file (private reporting still works).
  - The renames touch most files once and make older commits and reviews name old paths.

# MOD - Model and diagrams

## Model structure

### MOD - 01 - Groups are model objects

- Decision: groups (layer, bounded context, subsystem, module, org unit) are queryable and taggable model objects, not shapes on one diagram.
- Why: groups must work with tags, overlays, lenses, checks and diffs.
- Technical Notes:
  - Storage is open: Structurizr's `group` is a plain string that cannot carry tags, so a sidecar list or `dp.*` data is likely. Refined by MOD-03 and MOD-04.
- Non-Technical Notes:
  - More model work than drawn boxes. No groups feature was found in the code on 2026-11-20 (decided, not built).

### MOD - 02 - Shared resources are modelled as their own container or system

- Decision: a shared library or service is its own container or software system, and each user has a relationship to it; there are no multi-parent elements.
- Why: it works today, stays standard Structurizr, and keeps unique names per scope and cost rollups simple.
- Technical Notes:
  - A component keeps exactly one parent. Rejected for now: multi-parent elements with extra parents in `dp.*` data (a medium to large change that breaks the one-parent rule).
- Non-Technical Notes:
  - A shared library does not look "inside" the apps that use it; it shows as an outside box. A "shared" tag with a legend entry is a cheap aid. Revisit if it confuses people.

### MOD - 03 - Groups can nest

- Decision: groups nest (for example a layer containing bounded contexts).
- Why: layers, contexts and org units are naturally trees.
- Technical Notes:
  - Nesting needs cycle checks and a rule for deleting a group that has children. Refines MOD-01.

### MOD - 04 - One group per element; tags for other dimensions

- Decision: an element belongs to at most one group, so its group is one path in a tree; a second dimension (such as a compliance scope) is a tag.
- Why: it maps onto Structurizr's single group per element and avoids a colouring rule for overlays when an element has several groups.
- Technical Notes:
  - A tag is a flat label without nesting. Storage (the `group` string with a separator, or a sidecar list so groups can carry tags) is still to be decided. Refines MOD-01 and MOD-03.

### MOD - 05 - Elements can change parent; drafts treat a move as a change to the element

- Decision: a container can move to another software system and a component to another container, keeping its id, children and relationships; in a draft a move is one change to the element.
- Why: a box in the wrong parent should be moved, not deleted and added again, which loses its id and relationships.
- Technical Notes:
  - `POST /api/elements/:id/move`. Refused when the name is taken in the new parent or when a relationship would join an element and its own parent. Apply merges the move and reports a conflict if main moved, changed or removed the element, or removed the new parent. In compare, the element shows as changed in its new place with a ghost at the old place.
  - People and software systems cannot move because they are top-level in C4.
- Non-Technical Notes:
  - A move and any other change to the same element on the other side conflict even if they do not overlap; the merge does not combine them.

## Deployment

### MOD - 06 - Deployment diagrams come next, on the native Structurizr deployment model

- Decision: deployment diagrams use Structurizr's own deployment model (deployment nodes, infrastructure nodes, container instances, deployment views), computed from the model like the C4 diagrams (MOD-08).
- Why: it was the most requested missing view, and native data stays readable by Structurizr tools.
- Technical Notes:
  - Deployment nodes are kept as one unit in `modelUnits.ts`, so they need per-node units before drafts and `dp diff` handle them well.
  - Later moved out of the pre-1.0.0 order (PRO-05, PRO-20); deployment data is kept as is.
- Non-Technical Notes:
  - More element kinds to build and test than tags on containers. Opening our files in Structurizr's tools is still untested.

### MOD - 07 - Deployment first cut

- Decision: the first deployment cut covers nested deployment nodes, infrastructure nodes and container instances, with one environment per diagram.
- Why: it is the smallest slice that shows where each container runs.
- Non-Technical Notes:
  - Later: software system instances, deployment groups, health checks, side-by-side environment diff and cost per environment. A system deployed as a whole cannot be shown yet. Refines MOD-06.

## Diagram content

### MOD - 08 - Diagram content is computed from the model

- Decision: each diagram shows everything at its level, like `include *`, and lower-level relationships show on higher-level diagrams as dashed derived lines that are not written to the file.
- Why: a rename shows everywhere and relationships are not duplicated in the file.
- Technical Notes:
  - Positions are stored at twice the UI size in Structurizr units.
- Non-Technical Notes:
  - An element cannot be hidden from one diagram (per-diagram hiding is in the backlog). In Structurizr, our views show only explicit relationships.

### MOD - 09 - A diagram's cost is the cost of what it is about

- Decision: a context, container or component diagram shows the monthly cost of its scope; boxes drawn around it that carry a cost are added in a second row, "Outside this system" or "Outside this container".
- Why: adding up every box counted neighbouring systems (for example the Mainframe at $9,500) as part of the system's own cost.
- Technical Notes:
  - The landscape has no scope and adds the boxes it shows. The Cost overlay uses the same figures (`ui/src/diagramCost.ts`).
- Non-Technical Notes:
  - The scope figure includes objects the diagram does not draw (for example containers hidden by a lens), so it is not always the sum of boxes seen.

### MOD - 10 - Only a missing diagram opens the landscape

- Decision: only a "not found" (404) answer means a diagram is gone: the landscape takes its place in the browser history (replaced, not added) with a short notice. Other failures show an error and leave the view as it is.
- Why: every failure used to open the landscape silently as a new history entry, so Back returned to the missing diagram and was sent forward again.
- Non-Technical Notes:
  - Back can no longer reach a deleted diagram after an undo brings it back (the sidebar still opens it). After a non-404 failure the screen can show the earlier diagram under the new address until the next load works.

## Lenses

### MOD - 11 - Engineer is the default lens

- Decision: the Engineer lens is the default and users create further lenses.
- Why: the first audience is engineers.
- Technical Notes:
  - Lenses are defaults for what a person sees, not access control. Refined by MOD-13.
- Non-Technical Notes:
  - Business and Security presets are in the backlog.

### MOD - 12 - Active lens is remembered per browser

- Decision: the active lens is kept in the browser (localStorage), not in the project files; lens definitions stay in the sidecar.
- Why: switching lenses should not create git changes.
- Non-Technical Notes:
  - The active lens does not follow the person to another browser.

### MOD - 13 - Architect and Overview built-in lenses; default lens depends on the model

- Decision: Architect (all levels and sections) and Overview (landscape and context only, hiding cost, notes, trade-offs, sensitive and code sections, and technology) ship next to Engineer; the default is Architect when the model has no containers, otherwise Engineer.
- Why: a model with no containers has nothing below the landscape for Engineer to show, and Overview gives readers who do not need detail a summary.
- Technical Notes:
  - The state response has `defaultLens`. The picked lens is remembered per project in the browser (the key includes the project folder) and the resolved default is saved on first load, so it does not change when the model gains containers.
- Non-Technical Notes:
  - The same person can see a different default lens in different projects.

## Colour and overlays

### MOD - 14 - Dark theme only, with overlays for characteristics and cost

- Decision: dark theme only, with per-object characteristic ratings (1 to 5, with a "driving" flag) and monthly cost lines whose cost rolls up from contained objects, with editable bands.
- Why: the owner asked for a layout closer to the reference and for cost and "-ility" information.
- Technical Notes:
  - Ratings and cost live on objects only, not relationships or flows. The light theme stays in the backlog (the former backlog B5 (now in the wave files)); 1.0.0 is dark only (PRO-23).
- Non-Technical Notes:
  - Exports have a dark background.

### MOD - 15 - A diagram has colour of its own: lines by connection kind, a hue per pipeline, a tint per kind of box

- Decision: besides overlays, a diagram is coloured from what the model already says, with nothing stored: lines by connection kind, a hue per pipeline, and a quiet tint per kind of box.
- Why: the canvas was grey apart from overlays, so connection kind, technology and pipelines were invisible until an overlay was chosen.
- Technical Notes:
  - A line takes the colour of its kind (synchronous API, message, stream, data pipeline, batch, database connection, file transfer, cloud service); with no kind it takes one from a well-known technology (HTTPS, SQL, Redis, Kafka, MQ, SFTP). Easily confused kinds also have a pattern (dashes, dots).
  - A connection with stages is a pipeline with its own hue, chosen from eight by a hash of the relationship id (so it stays when others are added); stages get stronger along the pipeline.
  - A summary line (derived) is coloured only when every relationship behind it has the same kind, and stays dashed.
  - **Precedence:** a hand-set fill or line colour, then an overlay, then these. A legend ("Colour", bottom left) lists what is shown and holds the switch, kept in the browser (`dp.colour`).
- Non-Technical Notes:
  - A busier canvas by default (hence the switch). The kind from a technology is a guess from words, used for colour only and never written to the model. Eight hues repeat when more pipelines share a diagram. The switch is per browser, not per diagram or project.

# CAN - Canvas, editing and layout

## Editing behaviour

### CAN - 01 - In-app dialogs replace browser prompt and confirm

- Decision: the browser's prompt and confirm boxes are replaced by in-app dialogs.
- Why: native boxes cannot be styled, block the page while open, and let keyboard shortcuts act behind them.
- Technical Notes:
  - Dialogs take focus, keep Tab inside, return focus on close, and close on Escape without clearing the canvas selection. Shortcuts do nothing while a dialog is open. Destructive confirms name the action; prompts trim and refuse empty values; formerly silent failures show in an error slot or toast.
  - Browser tests must click the dialog buttons and fail if a native dialog opens.

### CAN - 02 - Add-and-connect, readable IDs, several boxes, one lens per project

- Decision: a person or system added on a context, container or component diagram is created together with a line (one request, one undo step); the first rename sets a readable id; boxes can be selected and edited several at a time.
- Why: a person added on a container diagram used to vanish (no line), ids kept names like `new-container-2`, deleting several boxes took one question and one undo each, and an empty model changed lens when its first container was added.
- Technical Notes:
  - The line goes to the system on a context diagram, else to the selected box inside the boundary, or the only box inside. With several boxes and none selected nothing is created and a notice asks for a selection; with none inside the palette items are disabled with the reason. A line dragged onto empty canvas opens a small kind menu (Enter takes the usual kind, Escape cancels) and creates box and line in one request.
  - The first rename of a box added this session sends `reslug`; Escape keeps the generated id. After a reload the first rename no longer renames the id.
  - Shift+click and Shift+drag select several boxes (never lines, ghosts, stages or files); they move, nudge and delete together (`POST /api/elements/delete`). Ctrl/Cmd+click was added later (PRO-15). "Move to…" is offered for containers and components (MOD-05).
  - The lens is remembered per project (`dp.lens:<project folder>`). A software system with nothing inside is one sidebar entry marked "(empty)" that opens its containers diagram; its context diagram is reachable from the panel, breadcrumb and double-click.
- Non-Technical Notes:
  - An unclear target costs one extra click instead of a guess. A kind menu adds one step on diagrams that offer several kinds.

### CAN - 03 - A change by hand moves only what it touches

- Decision: after a change by hand (a box dragged or nudged, a line added, removed or changed, a label that changes size) only the affected lines are planned again; every other line keeps its ends, route and label.
- Why: the end of a drag used to plan every line again, so lines and labels far from the moved box jumped.
- Technical Notes:
  - `updateLines` in `ui/src/canvas/lineLayout.ts`. Every line is planned together only when a diagram or another version opens, on Auto-layout, or on Make room or Spread out on the whole diagram; on a selection those plan only the lines of the boxes they moved. A box dropped on another goes to the nearest free spot, moving only itself.
  - The line plan is not saved.
- Non-Technical Notes:
  - Reopening a diagram can look different from the picture just before. A line planned again keeps clear of lines that stay but does not move them, so a crowded spot can tighten until Make room or Auto-layout is run.

### CAN - 04 - Changing several objects at once is one edit

- Decision: with two or more boxes selected the panel shows the fields all selected kinds share (owner, symbol, technology, tag groups) and a change applies to all of them as one undo step.
- Why: editing a selection one box at a time was slow and left several undo steps.
- Technical Notes:
  - `POST /api/elements/update` with `{updates: [{id, patch}]}`; an error on one element changes none. Technology chips on only some boxes are faded ("on 2 of 3") and a click adds them to all. The element panel's Incoming and Outgoing lists can be edited the same way (description, technology, delete, add a connection).
- Non-Technical Notes:
  - A mixed selection shows only fields both kinds have. Box colours are not in the multi-selection panel yet (styles are per object and would take several undo steps).

## Lines and layout

### CAN - 05 - Layout is built from rows that wrap, with measured insets; the canvas keeps a minimum width

- Decision: the top area is two rows that wrap instead of one bar that scrolls, with measured insets shared by bars, the palette, the dock and zoom buttons; a side panel cannot shrink the canvas below 420 px.
- Why: at 1024 and 1280 px the search and lens bar covered the breadcrumb and the draft strip scrolled sideways; only measured insets let fit-to-view and the quick bar use the space really free.
- Technical Notes:
  - Crumbs truncate (middle first); the search box collapses to an icon; the draft strip and role banner are one wrapping row with Apply, Discard and Back to main always visible. The right panel collapses to a rail and starts collapsed under 1100 px. Not supported below 760 px.
  - The diagram re-fits on canvas resize until the person pans or zooms, but not when only a dock panel opens. The measured attribute must be kept in step with the CSS.

### CAN - 06 - Lines use right angles, go around boxes and spread out on each side of a box

- Decision: an "Automatic" line is drawn with rounded right angles instead of a diagonal, routed together with every other line, around other boxes, with line ends spread along each side of a box.
- Why: the owner asked for lines that turn at 90 degrees and for lines into one box to be separated; spreading ends is the cheapest fix with the largest effect, and one pass over all lines makes it possible.
- Technical Notes:
  - Each end picks a side: the one facing the other box, an L when diagonal, straight when aligned. Ends on one side are ordered by where the other end is. Hand-set anchors and dragged bend points are kept (a bend point is a point the line passes through). A label with no saved position sits on the middle of the longest segment.
  - Routes keep 15 px clearance from a box (5 px where tight); if no way exists the line keeps its old path; when a box blocks the sides another pair of sides is chosen. Labels avoid other labels and boxes; sizes are estimated (`ui/src/labelSize.ts`).
  - Routes are computed on every render, including drags, and are not saved, so model files and diffs do not change. The code is the pure module `ui/src/routing.ts` with unit tests.
  - Remaining: lines can still overlap in a shared gap and labels can sit on neighbouring lines (improved by CAN-07); straight, curved and smooth lines are not routed around boxes; side switching is skipped for lines with a hand-set end or bend point.
- Non-Technical Notes:
  - Existing diagrams change look on next open. A saved shape (straight, curved, smooth) still wins per line, and a saved bend point on an automatic line now places the middle segment.

### CAN - 07 - Default line shape per diagram, lanes, and Make room / Spread out

- Decision: each diagram has a default line shape, lines sharing a gap are spread into lanes, and two actions, Make room and Spread out, widen a crowded diagram.
- Why: the owner asked for 90° lines by default unless the path is straight, a per-diagram default, and a way to expand a crowded diagram; stretching only where needed keeps the picture people know, where a full auto-layout would rearrange it.
- Technical Notes:
  - **Default shape:** `layouts[<diagram>].lineShape` in the sidecar; absent means rounded right angles. Set from the diagram panel ("Line shape"); choosing the default removes the key. An unknown value from a newer version is kept on disk and treated as the default. A line's own shape wins. Changes show in drafts and `dp diff` as a layout change.
  - **Lanes and labels:** lines on one coordinate through a gap are spread 10 px apart (8 or 6 when tight) and ordered not to cross at the ends of the shared part. A line whose ends differ by under 12 px is made straight. Labels also avoid lying on lines (weight 8 for a line, 10 another label, 4 a box).
  - **Make room** adds space only where two boxes are closer than the base gap (50 px) plus 12 px per line between them plus any label; boundary padding is added across a system boundary. **Spread out** does the same and makes every gap about 20% larger. Both keep the order and alignment of boxes, change no sizes, keep the top-left fixed, and are one undo step. With two or more boxes selected they act on the selection, around its centre, moving others only as far as needed; otherwise on the whole diagram. Boxes hidden by a filter take part; compare-only boxes never move; boxes within 8 px are separated along x. Code: `ui/src/spread.ts` (now `makeRoom.ts`).
  - While dragging only the lines touching the box are re-routed; lanes and labels run on release.
- Non-Technical Notes:
  - On the demo containers diagram, crossed labels went from 19 to 11 (not 0), some labels sit up to about 400 px from their line's middle, and crossings rose slightly (21 to 23) because separating overlapping lines sometimes needs one. A second Make room can still find a little to do.

### CAN - 08 - Lines can be shaped by hand, and near-straight lines are straight

- Decision: on a selected line any piece can be dragged to shape it, and a jog shorter than 12 px is removed so near-straight lines are straight.
- Why: a line a few pixels off straight looked broken, and only the single bend grip could change a path.
- Technical Notes:
  - Hand drags snap within 8 px, straight lines within 2° of level. Right-angle lines: any piece drags sideways; straight lines: dragging anywhere adds a corner; curved lines: dragging anywhere moves the bend. Corners are saved as `points` on the line's layout (canvas units, at most 50) and win over the bend point and the planner. Changing line shape, "Reset line shape" and Auto-layout clear them.
  - When both boxes move together (or with Make room or Spread out) the corners move too; when one box moves, that end re-attaches. Moving boxes saves positions and corners as two requests.
- Non-Technical Notes:
  - Hand-shaped lines are not put into lanes or routed around boxes, and other lines do not route around them.

## UI state and awareness

### CAN - 09 - The UI applies only the newest response and rechecks the model on window focus

- Decision: each request gets a ticket and only the newest response is applied; on window focus the UI checks the state `version` and reloads only if the model changed.
- Why: quick edits and drags could apply out of order so a box jumped back, and a focus check picks up git checkouts, other tabs and CLI edits without a push connection.
- Technical Notes:
  - No timer; the check waits while the person types or a dialog is open. A superseded response is dropped silently.
- Non-Technical Notes:
  - There is no live push, so a change made elsewhere shows only when the window regains focus.

### CAN - 10 - "Needs a look" is one rule, and a proposed decision is part of it

- Decision: a decision needs a look when `decisionFlags` reports anything: a review or deadline that has come, a met trigger, an unreadable record, or the status "proposed".
- Why: the filter, the badge and the list counted differently, so a page could say "2" and show none.
- Technical Notes:
  - `decisionNeedsLook` in `src/shared/decisionAlerts.ts` is the one place; the top-bar badge, the Decisions page filter and its first-screen list use it. The home page's list is built by the server from warning flags only and can show fewer; PRO-16 and PRO-17 (D15) align it, not built yet.
- Non-Technical Notes:
  - The badge is rarely empty in a project that discusses decisions, so it says less about urgency.

### CAN - 11 - A bell with what waits now and what was shown earlier

- Decision: a bell at the top right (project top bar and hub pages) lists what waits now and a log of the errors and notices shown earlier in this tab.
- Why: an error stays only until dismissed or replaced and a notice is gone in three seconds, so what went wrong could not be read again.
- Technical Notes:
  - "Now" is computed from state: model load errors, drafts behind main, and decisions that need a look (CAN-10); each item opens what it names. "Earlier in this tab" is newest first, at most 50, with a count of unseen ones; successes are not logged. The log lives in memory (`ui/src/common/notify.tsx`) and is gone on reload. The hub pages have no "Now" part (it is on the home page).
- Non-Technical Notes:
  - Nothing is stored or shared, so the bell says nothing about earlier reloads, other tabs or other people. The yellow dot shows only when nothing is new and can hide behind a count.

# DRF - Drafts, compare and history

## Drafts

### DRF - 01 - Drafts are folders with a base copy; applying is a three-way merge

- Decision: a draft is a folder `architecture/drafts/<id>/` with its own model files and a `base/` copy of main as it was; applying merges object by object and refuses on conflicts.
- Why: the base copy makes a three-way merge possible, so a draft can live while main keeps changing; object-level units match how the model is edited, so unrelated edits merge cleanly.
- Technical Notes:
  - Layout: `workspace.json`, `designperspectives.json`, `draft.json` (title, description, date) and `base/`. Drafts are meant to be committed.
  - Merge units: element, relationship, view, position, tag group, lens, style, layout entry. A change on one side wins; the same change on both is kept; different changes to one object conflict and nothing is applied. Positions and layout never conflict (the draft wins). References and model rules are checked after the merge, so a merge that breaks one (two containers with one name) is refused.
  - Apply is one undo step on main and deletes the draft; undo does not bring the draft back (git still has it). New objects are placed after the object that preceded them in the draft, so sibling order can differ slightly.
  - Planned (Wave 18): rebase, a merge editor, and an undo of an apply that restores the draft.
- Non-Technical Notes:
  - Five files per draft in git; Structurizr tools ignore the folder. A conflict must be resolved by editing one side.

### DRF - 02 - Apply writes code first, then the model, with rollback

- Decision: applying with code writes the code files first (keeping backups), then the model, then deletes the draft; if a file write or the model step fails, every file is restored and the draft stays.
- Why: a failed file write used to leave the model applied and the draft in place, so model and code could disagree.
- Technical Notes:
  - Restore is best effort: content and permissions come back, modification times do not, and a failed restore is logged. A crash between steps is not covered; deleting the draft is not rolled back.

### DRF - 03 - Drafts record an author and show how far main has moved

- Decision: a draft has an optional `author` (sent by the client, else `git config user.name`), and shows "main +N", the number of objects main changed since the draft's base.
- Why: with several drafts, a label shows who started each; the count shows whether a draft is out of date before apply.
- Technical Notes:
  - The author appears in the drafts list and the `dp plan` header. The count is a diff of base against main, cached by main's revision (one diff per revision per draft). With no rebase yet, it only reports the gap.
- Non-Technical Notes:
  - The author is a plain label, not an identity check. With sign-in, engineers change only their own drafts (PRO-15).

## Version selection

### DRF - 04 - The model version is chosen per request

- Decision: every API request names its model version in `X-DP-Model` (`main`, `draft:<id>`, later `ref:<git ref>`) and optionally a compared version in `X-DP-Compare` (`base`, `main`, `ref:<ref>`).
- Why: the server holds no "current draft", so two tabs can show different versions, links keep the version, and tests stay stateless.
- Technical Notes:
  - With a compare, diagrams carry `change` and `ghost` marks and `GET /api/changes` lists changes. The UI keeps both in the URL (`#/d/<diagram>?m=…&c=…`). Clients other than the UI must send the header to work on a draft.
  - Rejected: a server-side "active draft" (tabs would interfere); URL prefixes per version (every route would change).

### DRF - 05 - Git versions are read with the git command line

- Decision: the stored model at any git ref (branch, tag, commit, `HEAD~n`) can be compared with the working model or another ref, read-only, using the same diff and overlay as drafts.
- Why: no new dependency, it works with any repository git can read, and a commit's model can be cached by its hash.
- Technical Notes:
  - Files are read with `git show <commit>:<path>`; refs resolved with `git rev-parse --verify` and listed with `git for-each-ref`. Commands run without a shell; refs starting with `-` or containing `:`, spaces, `..` or other forbidden characters are refused. A version at a ref is read-only.
  - It compares stored models, not scanned code; scan results can use the same diff later. DRF-07 lets dp commit `architecture/`, but reading stays read-only.
- Non-Technical Notes:
  - Needs `git` on the PATH (the feature is hidden without it). A commit without model files shows as an empty model.

## History

### DRF - 06 - History: what each commit changed in the models

- Decision: a History page (`#/history`) lists the commits that touched the model folders, newest first, with what each changed per project.
- Why: it answers "what changed, when, by whom" in model terms instead of JSON lines, reusing the git reading and diff without dp writing to git.
- Technical Notes:
  - Each commit shows author, date, subject, and added, changed and removed counts with up to 12 objects (elements, relationships, flows, decisions, settings) compared with its parent. "Open this version" shows the commit against its parent in the compare view. Uncommitted changes (main against HEAD) are listed above. `GET /api/history[?project=&limit=]`; results per commit are cached.
  - The first load of a long history runs a model diff per commit (20 by default, 100 at most).
- Non-Technical Notes:
  - Commits that only change drafts or layout show as such; commits outside the model folders are not listed.

### DRF - 07 - dp may commit the architecture folder, on request or when a draft is applied

- Decision: dp may run `git commit` for `architecture/` only, when an architect presses Commit, runs `dp commit`, or (a setting, off by default, in `.dp/commit.json`) when a draft is applied. Not built; planned as [Wave 17](waves/wave-17-architecture-commits.md).
- Why: the vision lists git-style commits for architecture; drafts are branches and apply is a merge, and the missing piece was a commit with a message made in the tool.
- Technical Notes:
  - Only paths under `architecture/`, as `git commit -m … -- <paths>`, so other staged changes are untouched; an argument list, never a shell. It never pushes, amends, resets, switches branches, stashes or skips hooks; hook failures are reported.
  - The message is built in code from the draft's title, description and change summary, with the draft id and signed-in user as trailers. Reading stays in `src/core/git.ts`; commit code is a separate module. Amends DRF-05.
- Non-Technical Notes:
  - dp now writes to the repository's history; path confinement and the refusals are the guard. Undo after a committed apply leaves the commit. Commit identity is git's; the signed-in user is a trailer only. A team that wants git read-only leaves the setting off.

# SEC - Security, sign-in and roles

## Server protection

### SEC - 01 - Request protection for the local server

- Decision: the server checks every request: Host header, origin, content type and size, and sends security headers.
- Why: any web page open in the browser could send a plain POST to 127.0.0.1:8765 and change the model or apply a draft; the Host check stops DNS rebinding.
- Technical Notes:
  - On loopback the Host must be `localhost`, `127.0.0.1` or `[::1]` (`--allow-host <name>` adds names). Changes to `/api/*` are refused with 403 when Origin is not the server's own or Sec-Fetch-Site is cross-site. Bodies must be `application/json` (415) and at most 5 MB (413). Every response carries a CSP (own origin, inline styles allowed), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`. Unexpected errors return a generic message; the detail goes to the log.
  - Later changes: a non-loopback `--host` refuses to start unless users exist or `--read-only` or `--insecure` is given (PRO-15); the frame exception is gone (RUN-05); System Testing adds loopback listeners (RUN-06).
  - curl scripts must send `-H 'Content-Type: application/json'`. The UI cannot be framed.

### SEC - 02 - Hidden paths are off limits

- Decision: files and folders whose name starts with a dot are never read, written, listed or planned through dp, including the code folder, a draft's planned edits and git versions; symlinks to them are refused.
- Why: writing `.git/config` allowed commands to run the next time dp called git, and dot files often hold secrets.
- Technical Notes:
  - Code file writes are capped at 1 MB, as reads are. Mapping an object to a dotted path is refused on entry (PRO-15).
- Non-Technical Notes:
  - A component cannot be mapped to `.github/workflows`. Secrets with ordinary names (`config/secrets.yaml`) are not covered.

### SEC - 03 - A referenced local file opens in the system's default app, with limits

- Decision: a decision link or attachment can point at a file on the reader's computer (`local:` path) and a click opens it in the system's default app, with strict limits. Not built; planned in [Wave 16](waves/wave-16-attachments.md).
- Why: the owner wants no copy of a large file and wants it to open the way it does anywhere else.
- Technical Notes:
  - dp stores only the path text; it never reads, copies, hashes or uploads the file or sends it to BMO. A click shows the full path first; on Open the server asks the OS to open it.
  - Only on a server on this machine for a request from this machine; on a hub or remote server the button is "Copy path only". Allowed types: pdf, doc, docx, xls, xlsx, ppt, pptx, csv, txt, md, rtf, png, jpg, gif, webp; programs, scripts, shortcuts, `.app`, `.html`, `.svg` and macro-enabled Office files are refused. The path is resolved (symlinks followed), must be an existing regular file, and its real type is checked.
  - The opener is started with an argument list, never a shell. The route is a POST with a `ROUTE_RULES` entry and the cross-site rule of uploads. The Windows path is written, not run.
  - Confirmed by the owner over "Copy path only" as the default (PRO-17, D5); Wave 16's security review can still reduce it to Copy path only.
- Non-Technical Notes:
  - dp asks the OS to start another program from a path that can come from someone else's repository. A path in git helps only on that machine and shows a user name unless written with `~/`. A document can run its own content in its default app, as when opened by hand.

## Sign-in and roles

### SEC - 04 - Optional sign-in with three roles; edit rights enforced on the server

- Decision: sign-in is optional and off by default; with no `.dp/users.json` nothing changes. Three roles: Architect (everything), Engineer (reads, creates and edits drafts; cannot change main, write real code files or apply), Viewer (reads only).
- Why: a shared local model needs a way to stop an engineer changing main by accident, without a hosted server; server checks hold even when the UI is bypassed.
- Technical Notes:
  - A route with no rule is Architect-only, and a test fails for a new route with no rule. `dp users` stores scrypt password hashes. Sessions: HttpOnly SameSite=Strict cookie, 12 hours idle, in memory (lost on restart). Five failed sign-ins lock a name for 30 seconds. Drafts record the signed-in user as author; engineers discard only their own drafts (PRO-15). Lenses stay a default view (MOD-11). Git versions are read-only for all. Amends PRO-01 and STK-01.
  - Two users editing the same thing: last write wins, and the other sees it on window focus. Undo history is per model version, not per user. `dp users` commands must not run in parallel. Roles are fixed.
- Non-Technical Notes:
  - Passwords travel in clear text unless the server is behind HTTPS, so a network needs a TLS proxy. A viewer can read costs and notes through the API.

### SEC - 05 - "No access" to a hub project

- Decision: a user's role in one hub project can be `none`: every request to that project is refused (403) and the project is hidden from everything the hub shows that user.
- Why: the owner asked for it; hiding, not only refusing, keeps a project's names, tables and decisions out of other projects' views where usage would reveal them.
- Technical Notes:
  - Set as `"projects": {"payments": "none"}` in `<hub>/.dp/users.json` or `dp users role NAME none HUB --project payments`. Refused even for reading and on a read-only server. Hidden from the project list and rail, home page, shared catalog usage (copies, readers, writers) and History; a link opens the home page. The catalog's own definitions stay visible. `none` exists only per project; applies on the next request. Amends HUB-07.
- Non-Technical Notes:
  - With sign-in off nothing is hidden. It is not a security boundary for files: anyone with the hub folder or repository sees every project. An architect everywhere can still be given `none` in one project.

## Secrets

### SEC - 06 - Integration credentials: kept by the server, outside git, write-only

- Decision: integration credentials are kept by the server in `<hub or project>/.dp/credentials.json`, outside git, with values that can be written but never read back through the API.
- Why: credentials belong to the server and hub, not one person's machine (mirrors `users.json`); write-only values cover the local-first case without a keychain dependency.
- Technical Notes:
  - The file is written atomically with mode 0600 in a 0700 folder and `.dp/` is added to `.gitignore`; code routes never open dot folders (SEC-02).
  - Stored: name, provider, scopes, note, dates, value. The API lists a masked hint (last four characters, for values of 12 or more), never the value; only server code reads it (`get`, which stamps "last used"). Architects only (action `admin`); refused on a read-only server.
  - Routes `GET/POST /api/credentials`, `PUT` (rotate), `PATCH`, `DELETE /api/credentials/:name`; CLI `dp credentials list|add|rotate|remove [folder]` with values from standard input, never arguments.
  - Encryption was optional (AES-256-GCM with `DP_SECRET_KEY`, scrypt key per value, name and provider as associated data); SEC-07 makes it always on. A value sealed by another key shows as "locked".
- Non-Technical Notes:
  - Until SEC-07 is built, values are plain text on disk (mode 0600) without `DP_SECRET_KEY`; a lost key makes sealed values unusable. No "test connection" and no per-project credentials inside a hub. Used first by WRK-01 and WRK-02.

### SEC - 07 - Credentials are always encrypted at rest

- Decision: no credential value is ever written to disk unencrypted; dp creates a key file when `DP_SECRET_KEY` is not set. Not built; planned as [planned_features.md](planned_features.md) A7 and Wave 23.
- Why: the owner wants credentials kept in the tool, encrypted and secure; an optional key nobody sets is no protection, and three features (BMO keys, tool connections, linked-work status) rely on the store.
- Technical Notes:
  - Cipher unchanged from SEC-06. Key order: (1) `DP_SECRET_KEY`, the route for servers, CI and shared hubs; (2) a key file dp creates on first save: 32 random bytes, mode 0600, in a 0700 folder under the user's config folder (`$XDG_CONFIG_HOME/dp/`, else `~/.config/dp/`; `%APPDATA%\dp\` on Windows), never in a project or hub folder or git. The exact path is a Proposal.
  - No plain-text fallback: if neither source works, saving is refused with the reason and the way out.
  - Existing plain values are sealed the first time a writable server or `dp credentials` command opens the store, or on `dp credentials seal`; until then the page and `dp check` say "not encrypted". A read-only server only warns. The masked hint stays in plain text; a value sealed by another key is "locked" and re-entered.
  - Tests must not touch a real config folder: the store takes the key or its path as a parameter.
  - Rejected: requiring `DP_SECRET_KEY` always (a barrier; ends up in a shell profile); the OS keychain (native code per system; can be added later without a format change); a passphrase prompt at start (breaks scripts and CI).
- Non-Technical Notes:
  - The key file is on the same computer as the values, so this protects against the folder leaving the machine, not an attacker already on it; set `DP_SECRET_KEY` from a secret manager for more.
  - A lost key file locks every value until re-entered; a hub moved to another machine keeps names but loses values unless both use the same `DP_SECRET_KEY`. The four-character hint reveals part of a value.

# REC - Collaboration and records

## Comments

### REC - 01 - Comments, ideas and questions live in their own file, open to every role

- Decision: a person can start a comment, idea or question thread on an element, relationship or diagram, reply, and resolve or reopen it; threads live in `architecture/comments.json`, outside the model.
- Why: review talk is not part of the model: a viewer must be able to ask questions, an engineer must comment on main without a draft, and a comment should not be undone by Ctrl+Z or lost when a draft is discarded.
- Technical Notes:
  - Handled by `core/comments.ts`. Anchored by element id, relationship id or diagram key; no undo step, not diffed, merged or copied by drafts. The `comment` action is allowed for all three roles on every version and refused only on a read-only server. The author is the signed-in name, else a given name, else `git user.name`, else "Anonymous". Only the author or an architect edits or deletes; anyone who may comment resolves or reopens. Limits: 4,000 characters, 200 replies per thread, 5,000 threads.
  - The server marks a thread `missing` when its target is not in the version shown; the UI lists those apart. The UI shows pins on boxes, badges on lines, a Discussion block in the details panel and a filterable diagram list. Routes: `GET/POST /api/comments`, `POST /api/comments/:id/replies`, `PATCH/DELETE /api/comments/:id`, `DELETE /api/comments/:id/replies/:rid`.
  - An exception to "new per-object data goes in `dp.*`". BMO reading comments: REC-03, COD-11.
  - Not built: mentions, notifications, free pins on the canvas, turning an idea into a draft, counts in `dp check` or `dp diff`.
- Non-Technical Notes:
  - Plain data in git, so two branches get a normal merge with a possible conflict at the end of the list. Not hidden by lenses. Deleting an element leaves its threads as "not in this version". A comment on a draft-only element is an orphan on main. With sign-in off, anyone can delete anyone's comment.

## Notes

### REC - 02 - Notes placed on a diagram

- Decision: a comment, idea or question about a diagram may carry a position and is drawn as a note on that diagram, outside layout and routing; drag to move, click to open the thread.
- Why: comments about a diagram had no place on it, and a note is a remark about the model, not part of it.
- Technical Notes:
  - `position: {x, y}` in canvas units in `comments.json`. Added from the empty-canvas menu "Add note here…". Anyone who may comment may move a note; moving keeps author and time. Resolved notes are hidden; notes are left out of image exports. Amended by REC-03 (stickies).
- Non-Technical Notes:
  - A note does not follow a box that moves and is not re-targeted when dropped on one, so after a new layout it can point at the wrong place.

### REC - 03 - Sticky notes are model data, and BMO always reads notes and comments

- Decision: a sticky note is a short Markdown card on one diagram, stuck to an object or the diagram and stored in the model; BMO always reads every object note, sticky and comment thread in scope. Not built; planned in [Wave 2](waves/wave-02-notes-context-help.md).
- Why: the owner wants stickies to be part of the architecture and analysed by BMO; COD-03 already treats all such text as data, never instructions.
- Technical Notes:
  - Stored as `dp.stickies` on the diagram's view (like linked work), so it goes through drafts, undo, `dp diff`, merge and the static export. A sticky stuck to an object is kept as an offset; a deleted object turns its stickies free, never deleted silently. Only people who edit the model write stickies (architects on main, engineers in a draft); placed comments (REC-02) stay in `comments.json` and an architect can turn one into a sticky. `dp.notes` is unchanged; the Overview lens still hides notes in the UI.
  - There is no "include notes" switch. Notes and comments go into BMO data blocks after redaction, comments labelled with their author and "not reviewed", with their share of the pack budget; whole notes are dropped, never cut, and the manifest lists any left out. Amends REC-02 and, for notes, COD-09.
- Non-Technical Notes:
  - Viewers cannot add stickies; their comments reach BMO unreviewed, labelled as such, and can mislead an answer (labels and checked `comment:<id>` cites make that visible, not impossible). A secret typed into a note reaches BMO unless redaction catches it; the preview shows the exact prompt first.
  - Moving a sticky appears in a draft's change list; two note-like things (sticky and comment pin) must be told apart in the menu.

## Decision records

### REC - 04 - Decision records: one Markdown file per decision, part of the model

- Decision: each decision is a Markdown file `architecture/decisions/NNNN-slug.md` with fixed front matter and sections, and is part of the model (undo, drafts, diffs, merge, git versions).
- Why: Markdown reads well in pull requests next to the model it explains; being model data, a decision is proposed and applied with the change it justifies; a small fixed grammar avoids a YAML dependency and keeps `git diff` clean; revisit triggers make "we would choose Q if X" watchable.
- Technical Notes:
  - **Files:** `core/decisions.ts`; the four-digit number is the id and the file keeps its name when the title changes; other files (a README) are ignored.
  - **Front matter** (not YAML; `key: value` or `key: [a, b]`): `status`, `kind`, `date`, `deciders`, `affects`, `supersedes`, `superseded-by`, `tags`, `review-by`, `decide-by`, `expires`, `applies-to`. **Body:** `# Title`, `## Context`, `## Decision`, `## Alternatives` (an `### Option` each with `- Why not now:` and `- Would choose if:`), `## Consequences`, `## Revisit triggers` (a `- [ ]` checklist; `(→ Option)` names the favoured alternative).
  - **Kept:** unknown sections, keys and text after the title. A file that breaks the format is a model error and never rewritten; a decision is written only when it changes.
  - **Kinds:** choice, conditional, deferred (`decide-by`), time-boxed (`expires`), policy (`applies-to`), reversal (`supersedes`). **Statuses:** proposed, accepted, rejected, deprecated, superseded; accepting a decision that replaces others marks them superseded in the same edit.
  - **Model unit:** `dec:<file>` in `modelUnits.ts`, read and written by `Project`; a "Decisions" group in the change list and `dp diff`. **Renumbering on apply:** when main and a draft both added the same number, the draft's gets the next free number and links are updated. **Checks:** unreadable file, duplicate number, link to a missing decision, bad date are errors; `dp check` warns about decisions on objects no longer in the model.
  - **Roles:** writing a decision is the `edit` action (engineers write them in a draft). **Routes:** `GET /api/decisions[/:id[/markdown]]`, `POST`, `PUT /:id`, `PATCH /:id/status`, `DELETE /:id`. **UI:** a Decisions page over the diagram (`p=decisions[/<id>]`) with filters and a form editor, and a Decisions section with "Record a decision" in element and relationship panels. "Needs a look": CAN-10.
  - YAML beyond the grammar is a load error, never silent loss; YAML comments are dropped on rewrite; a `## ` line typed in a section becomes `###`; unknown sections are written after the known ones on edit. Each request stats every decision file (fine for hundreds).
- Non-Technical Notes:
  - Renumbering on apply makes links to a draft decision's number from chat or tickets go stale. Engineers cannot file a proposed decision on main without a draft.

## Checklist

### REC - 05 - A checklist next to the model: starter lists, checks dp makes itself, and BMO's questions

- Decision: a checklist in `architecture/checklist.json`, beside the model, with two starter lists, 16 rules dp checks itself, and BMO's questions from an import.
- Why: the import asked BMO for questions and assumptions but dp dropped them, and the typed feedback that verifies notes was lost with its draft; a list that ticks itself where the model can answer turns "is the model done?" into something visible.
- Technical Notes:
  - **Storage:** not part of the model, like comments (no undo, not diffed or merged by drafts, one list per project, committed with the model). Items: task, question or assumption; section; open, done or skipped; answer or note; optional target; source (person, starter list, BMO). Stored in the sidecar was rejected (ticks would need edit rights and drafts would fork it). Handled by `core/checklist.ts`.
  - **Starter lists:** *Starting a project* (15 items) and *Importing a codebase* (14); shared items keep one key; adding a list again adds only what is missing.
  - **Rules** (`core/checklistRules.ts`): people, containers per system, descriptions, technology, labels, code paths, a decision, a flow, model problems, intake answered, code scanned, C1/C2/C3 final, unverified import items, unmapped files. Model rules read the version shown; import rules read `architecture/import/`. Such an item is done while its rule passes, shows the count and up to 50 failing ids, and can only be skipped by hand.
  - **Roles:** architects and engineers change it on any version (action `checklist`); viewers and a read-only server read it (PRO-16 confirms).
  - **BMO's questions:** an import puts the file's `questions` and `assumptions` under "Questions from BMO", linked to the draft, skipping text already there (ignoring case, spacing, closing full stop); a full checklist never fails an import. **Answers go back:** typed answers and person-added items are typed text for the import review (extends COD-03) and go into BMO's next import turn; a BMO item's own text never counts; a confirmed assumption with no typed words and a skipped question are told to BMO but are not evidence.
  - **UI:** a Checklist button with the open count and key L open a card over the canvas (filter, tick, skip, edit, answer, link to the selection, move, delete, clear done, add with Enter); "Add to checklist…" on the right-click menu; the bell lists open BMO questions. Assumptions: PRO-16.
- Non-Technical Notes:
  - A draft cannot carry its own checklist and ticks have no undo (git history is the record). A person cannot override a rule except by skipping. Re-worded repeats of BMO's questions stay until deleted. A viewer who knows an answer must comment. A click confirm does not verify notes: words must be typed.

# HUB - Hub, home and catalog

## Projects

### HUB - 01 - A new project starts empty; the sample model is opt-in

- Decision: `dp serve` and `dp init` create an empty model; `--demo` creates the sample model with its sample code (`--empty` is still accepted).
- Why: a new folder should not get sample files the user did not ask for.
- Technical Notes:
  - This changes the default of STK-01's one-command flow: one command still starts the app, but the model has no elements. A first-run card ("Start your architecture": add a person, add a software system) covers the first-time experience.
- Non-Technical Notes:
  - A first-time user sees an empty canvas rather than a worked example and must ask for the demo.

### HUB - 02 - New project asks before it uses a model that is already in the folder

- Decision: adding a folder that already holds `architecture/workspace.json` asks first; on yes the model is kept as it is (name included) and the chosen template is not used.
- Why: the folder's model used to become the project without a word, so "Blank model" could open a model with systems in it.
- Technical Notes:
  - `Hub.addProject` throws `ExistingModel` unless called with `adopt`; the route answers 409 with `existing: true`, the folder and the workspace name, and the New project dialog sends the request again with `adopt: true`. A script that relied on the silent take-over must now send `adopt: true`.

## Home and hub

### HUB - 03 - A home page above the diagrams

- Decision: a home page at `#/home`, outside the diagram workspace, shows a card per project, what needs a look, what is being watched, the latest decisions, and (in a hub) the shared catalog in numbers.
- Why: the owner asked for one place to track projects, models and decisions.
- Technical Notes:
  - **Cards:** a landscape thumbnail from stored positions (a grid where none), counts, drafts, model problems, last commit. **Needs a look:** model errors, `dp check` warnings, drafts behind main, decisions that are proposed, past review or decide-by, expired or with a met trigger, and catalog findings (HUB-06). **Watching:** open revisit triggers and review, decide-by and expiry dates within 120 days.
  - **Navigation:** a left rail to Home, the shared catalog (Data in a single project), Credentials (architects) and each project; every item links to its diagram, decision, draft or element (`reveal=`). Cards or list view, kept in the browser. In a hub an empty URL opens Home; a single project still opens the diagrams.
  - **API:** `GET /api/home` and `GET /api/hub` answer the same in both modes (a single project is a hub of one, so the UI has one code path). Results are cached by model revision, the git log for 30 seconds.
- Non-Technical Notes:
  - Counts and problems come from main only (drafts are a count). The page is read-only apart from "New project". `dp check` runs per project on the first load after a change, slow for large hubs. A never-laid-out landscape shows a grid thumbnail.

### HUB - 04 - A hub serves several projects: `dp serve --hub DIR`

- Decision: a hub folder with `hub.json` lets one server serve several projects, each an ordinary project folder, with one app built per project on first use.
- Why: a hub folder can be committed and shared so a team sees one list, and one app per project keeps every project rule and route unchanged; a header fits how the model version is already chosen.
- Technical Notes:
  - **`hub.json`:** projects (`{id, path, name?}`) and a `catalog` folder (HUB-06), re-read when it changes on disk. The hub app answers sign-in, `/api/hub`, `/api/home`, `/api/catalog*`, `/api/credentials*`, `POST /api/hub/projects` and the UI, and passes every other `/api/*` request to the project in `X-DP-Project` (422 without it, 404 if unknown). The UI keeps it in the URL (`pr=`).
  - **Sign-in:** one for all projects from `<hub>/.dp/users.json`; a project's own users file is not used. Roles became per project in HUB-07.
  - **Folders:** no project folder may hold the hub folder or another project's folder, so code routes cannot reach `hub.json`, the catalog or another model.
  - **New projects:** `POST /api/hub/projects` (architects) from a blank model or the demo. CLI: `dp init --hub DIR [--demo]`, `dp serve DIR --hub [--demo]`, `dp check DIR --hub`. The demo hub is generated into `demo/hub/`. `dp serve PATH` without `--hub` is unchanged.
- Non-Technical Notes:
  - Every loaded project stays in memory; request bodies are read twice; logs do not show the project. A project path outside the hub (`../x`) is allowed as long as it does not hold the hub, so `hub.json` must be trusted.

### HUB - 05 - A new hub starts with the demo project

- Decision: a new hub (`dp init --hub`, `dp serve --hub` on a folder with none) gets two projects: the empty shared catalog and `demo` ("Demo bank"), a copy of the sample model with its code, decisions and made-up git history.
- Why: a new hub's home screen was empty, so the first thing a person saw was nothing to open.
- Technical Notes:
  - `dp init --hub --demo` still copies the demo hub (two bank projects). A single-project `dp serve` has no list and gains no demo.
- Non-Technical Notes:
  - The person must delete the sample (remove it from `hub.json`) or leave it.

## Shared catalog

### HUB - 06 - Shared elements live once in a catalog; projects keep linked copies; data is listed with who reads and writes it

- Decision: a hub's catalog holds shared definitions once; each project keeps linked copies of what it uses, and data held by elements is listed with who reads and writes it.
- Why: linked copies keep each project a self-contained Structurizr file for export, history and `git diff`; data at table level answers "same database, different tables" without making every table a C4 component; several writers to one table is the coupling worth flagging.
- Technical Notes:
  - **Catalog:** a normal project folder `<hub>/catalog/` (people, systems, databases, brokers), edited and drafted like any project. **Copies:** marked `dp.catalog = <catalog element id>`; name, description and technology come from the catalog and cannot be changed in the project; owner, notes, cost and data are the project's. "Update from catalog" is an explicit edit (so roles, drafts and undo apply); "Add from the catalog" adds a copy inside a copy of its catalog parent; an element can be linked or unlinked to a catalog element of the same kind. Refines MOD-02: still no multi-parent elements.
  - **Data:** `dp.data` on an element lists tables, views, topics, queues, buckets, collections, files and indexes, each with an owner and sensitive flag; on a catalog element it is shared, on a copy private. `dp.data.access` on a relationship says which data at either end it reads or writes.
  - **Usage:** `GET /api/catalog/usage` computes across projects each catalog element and its users, drifted copies and copies of removed elements, each data asset with readers and writers (flagged "used by several projects" and "written by several projects"), and access to data the other end does not list. The home page lists findings; the Shared catalog page (Data in a single project) shows tables with update and add actions; panels have Shared catalog, Data and Data access sections. Kept in `core/catalog.ts` (kept in 1.0.0, PRO-20 B1).
- Non-Technical Notes:
  - A copy duplicates shared fields, so drift shows until each project updates (reduced by HUB-07). Tables are not boxes and do not show on component diagrams. A service that reaches a database without a modelled relationship is not counted. Without a hub there is no catalog. No marker on the canvas yet for a linked copy.

### HUB - 07 - In a hub, roles are per project, and catalog copies follow the catalog automatically

- Decision: a user can have a different role in each hub project, and linked copies take the catalog's name, description and technology as soon as the catalog's main model changes.
- Why: the owner wants per-project access in one hub and copies that never lag behind the shared definition; doing it in the hub on save needs no git hook and works outside a repository.
- Technical Notes:
  - **Roles:** `projects: {"<id>": "<role>"}` in `<hub>/.dp/users.json`; the project's app gives the request the user's role in that project, so every rule applies per project (the catalog is a project too). Adding projects and credentials follow the role everywhere. `dp users role NAME ROLE [--project ID]`; `default` with `--project` removes the project's own role. Project roles are read live; a change of the role everywhere signs the user out. `GET /api/hub` returns the role per project, shown on each card and in the rail. SEC-05 adds `none`.
  - **Copies follow:** after a change to the catalog's main model (edit, applied catalog draft, files changed on disk), linked copies update before each project request and after each catalog request, checked by revisions so nothing is done when nothing changed. A copy is not an undo step of the project; an undo of the project's own edit is followed by the copy again. A copy that cannot take the name (another element has it) stays and is listed as drift. Drafts get the change on apply. Not on a read-only server. The home page lists recent copies ("Catalog changes copied").
  - **dp does not commit the copies** (owner: "do what you think is best"): they show as "not committed yet" in History and git, because a tool that commits on its own surprises people, can land on any branch and would make DRF-05's read-only git read-write for one case.
- Non-Technical Notes:
  - A project's files can change on a request that only reads, shown as uncommitted. The list of copies made is in memory and lost on restart (git keeps the changes). A catalog architect changes names in copies in projects where they have a lower role (PRO-15).

# COD - Code import, code reading and BMO

## Import

### COD - 01 - Stage B (codebase to model) moves to the Future stage

- Decision: reverse engineering a C4 model from an existing codebase (`dp scan`) joined the MCP server in the Future stage, unscheduled. Superseded by COD-02 (built in 0.5.0).
- Why: it needed more review and planning, and deployment diagrams came first.
- Technical Notes:
  - Already built and kept then: mapping components to files, scanning Python/JS/TS imports and the code diagram. Refines PRO-12.

### COD - 02 - Stage B import: BMO, a purpose-built import file, one C4 level at a time, no inferred labels

- Decision: a codebase is brought in through a strict, checked import file that becomes a draft a person accepts, edits or rejects object by object; the agent is called BMO, off by default, and its output is always a proposal; import goes one C4 level at a time and imported objects carry no "inferred" or confidence label.
- Why: the dependable part of Structurizr is the workspace format dp already stores, and a strict schema is easier to keep stable than a DSL whose only reference parser is Java; handoff first keeps dp free of any model, so the same file always gives the same draft; computing the review level from checkable evidence keeps confidence from being an argument; no label keeps imported and hand-made objects the same.
- Technical Notes:
  - **Built in 0.5.0 as:** JSON only (no YAML); backends: handoff (dp writes `architecture/import/prompt.md` and the user runs BMO's turn in their own agent) and direct calls to the Claude API, the OpenAI API or Ollama. MCP and Structurizr DSL input are not built. The schema ships in the package and `dp import --check` validates. The design is in [import-design.md](import-design.md), rewritten around COD-06 and Waves 5 and 15; intake is `architecture/import/intake.json`.
  - **Levels:** C1, C2, C3; the user can stop at any; C4 (code level, files only) needs no BMO since a file maps to a component by path prefix. Evidence that is a real file path becomes the code mapping.
  - **Readiness analysis:** `dp scan --plan` (files and git only) counts candidates per level, reports done and left, estimates review effort and BMO's reading, and recommends step by step or one go by fixed rules; default depth is the whole project, core first.
  - **Review level** (verified, partly verified, unverified) is computed by the tool from checkable evidence, not reported by BMO; unverified items need an explicit accept, with ways to verify again, edit, tell BMO in typed text, or reject. The prompt ships in the package, versioned with it. Details: COD-03, COD-08.
- Non-Technical Notes:
  - One more format to document and version; with handoff the user copies a prompt to their own agent. The analysis counts only what the scan sees (people, manual steps and unreadable languages are not counted, so "100% decided" is not "complete"); its thresholds, the 20 s per item and the known-services list are guesses needing upkeep.
  - Without a label a reader cannot later tell which objects BMO first proposed (git history and the kept import folder are the only record). Full depth on a large repository may need one draft per container. A DSL file can reach dp only through conversion.

### COD - 03 - What an import file cannot vouch for itself, and what the import and BMO code will not read or keep

- Decision: review levels are computed from what a person typed, not what the file says, and a set of rules keeps untrusted input (a model's answer, a pasted file, a repository) from looking checked, leaving the machine or landing in git.
- Why: each rule closed a way for untrusted input to make output look checked, to leave the machine, or to be committed.
- Technical Notes:
  - **Typed text:** a `user` note verifies an item only when its words (at least 12 characters, ignoring case and spacing) are found in the intake, in the feedback stored for the item or draft, or in the description typed for describe-to-model (kept as `files/<draft>.source.txt`). A cited scan fact verifies only when about the item (its name or system, or a path under its code paths). Otherwise the check fails and the review says why (not found, too short, empty).
  - **Links** do not open what rules close: must-not-open globs, scope, deny-list and the hidden-path rule apply to where a symlink points. **Redaction:** one detection, `redactText`, before anything is sent, for handoff files, and to refuse an import file or decision holding a secret; secret names widened (`*_KEY`, `passphrase`, `pwd`, `credential`, `private`) with plain keys kept (`PRIMARY_KEY`, `partition_key`, a bare `key`); patterns are linear.
  - **Git:** `architecture/import/.gitignore` lists the handoff folder and typed descriptions (`handoff-description.txt`, `files/*.source.txt`); import files and reviews stay committable.
  - **Fail closed:** a draft with a missing or unreadable review is not applied ("Check again" remakes it with every item pending); with no accepted item nothing is applied; a code edit cannot be planned or saved under `architecture/` or `.dp/`.
  - **Who loosens limits:** an engineer may edit the intake and add to what is closed or lower a cap; only an architect removes or narrows `mustNotOpen` or `scope.exclude`, makes `scope.include` read more, or raises a cap. An empty `scope.include` means the whole code root.
  - **Run confirmation:** the hash covers provider, host and model as well as the prompt; the Ollama endpoint refuses link-local and cloud-metadata addresses; replies are read as a size-capped stream; a wrongly shaped reply is not repeated. BMO settings in a hub are read and written by the hub (an architect).
- Non-Technical Notes:
  - Notes that only paraphrase the description come out unverified and need an explicit accept, costing review time (accepted by the owner as long as the review UI is clear). The secret-name list over-masks some constants. A lost review loses its accept decisions. "Verify again" on another clone cannot use the git-ignored typed description.

## Code reading

### COD - 04 - Backtracking from a step: data, code, functions and history

- Decision: from a connector stage or flow step, `GET /api/backtrack` returns every step up to it with its sample, element, code, functions and git history, and the UI follows one field through every sample.
- Why: finding where a problem at step 8 came from needs the data at each step, what code does each step and what changed lately in one place; everything needed is already in the model and git.
- Technical Notes:
  - Per step: sample and format; the element doing it; its code (a stage: the element's code paths; a flow step: the relationship's and receiver's); functions in those files (found by pattern for TS/JS and Python, to be replaced by the generic reader of COD-06); the last 15 commits per file; uncommitted edits; and commits that changed the step in the model (found by comparing each `workspace.json` commit with the one before; linear history, at most 15 commits). A step is "recent" when any falls in the window (7, 14 default, 30 or 90 days). Changed functions are marked.
  - Field following matches names only (ignoring case and `_`) and lists related names. Function ranges are approximate. Without a repository the view still shows data, files and functions.
- Non-Technical Notes:
  - A renamed or computed field (amountMinor → amount) breaks the chain. Kept in 1.0.0 (PRO-20 B2).

### COD - 05 - The code level shows where a connection enters and leaves the code

- Decision: the code diagram of an element also shows each relationship to something outside it, as a line from the file where the call leaves or to the file where input arrives, ending at a faded box of the other element.
- Why: the files behind a component were drawn alone, so a code diagram could not show how calls from other parts reach them; plain `dp.*` properties need no new machinery in drafts, compare and merge.
- Technical Notes:
  - Set on the relationship (`dp.code.from` in the source's code, `dp.code.to` in the destination's; "Files at the ends" in the panel) and drawn solid; otherwise guessed from imports between the two elements' files (dashed); when neither is known the line ends at the element's own box (dotted). A file both elements map counts for a guess only when nothing else decides it. Each neighbour adds its files to the diagram's scan. The element's box is used because lines cannot end on a boundary.
- Non-Technical Notes:
  - A guess can be wrong where components share files; guessed lines are marked.

### COD - 06 - dp finds code by search, pins key code, and reads imports and definitions with one generic regex reader

- Decision: no code per language; dp finds code by plain-text search, components keep a short list of pinned key files and functions, and one table of regular expressions reads imports and definitions for all major languages. Not built; planned in [Wave 5](waves/wave-05-code-search.md) and [Wave 7](waves/wave-07-metrics.md).
- Why: the owner wants code reading that is simple and works for any major language; a pattern table grows by adding a line and a test string, instead of a reader per language to keep true.
- Technical Notes:
  - **Generic reader:** `codePatterns.ts` (Python, JS/TS, Java, Kotlin, Scala, C#, Go, Rust, C/C++, Ruby, PHP, Swift), one engine, one comment cut, one import-to-file match by path tail; results say they are approximate. The existing Python and JS/TS readers in `codeMap.ts` are to be removed (still there until Wave 5).
  - **Search:** BMO `where <name>` with the LLM off, `dp find <name> --code`, `GET /api/code/search`; reads only what the code viewer reads, shows masked lines; hits matching a definition pattern are marked "looks like a definition" and listed first.
  - **Key code:** `dp.code.key` `[{path, name?, line?, note?}]`; a person pins entries; dp checks the file exists and holds the name; heuristic hints with no LLM; BMO proposals are verified before they can be pinned.
  - **Not built:** Maven and Gradle reading, file roles, shared-helper hiding, settings-file facts, language mix per object, a hash cache. Metrics (Wave 7) come from the model's lines; complexity, LCOM and abstractness are not built (revisit once the reader has proved itself).
- Non-Technical Notes:
  - Regexes can read a commented-out or string-embedded import as real, miss dynamic imports and injected dependencies, and cannot resolve ambiguous path tails (dp draws no line and says so). Python and JS/TS results may differ slightly; Wave 5 records the differences and regenerates the demo. Key code is only as good as the person's pins.

### COD - 07 - Architecture drift is parked; Wave 6 builds findings and acknowledgements only

- Decision: drift detection (model against code, `dp drift`, a Drift page) is not built for 1.0.0; [Wave 6](waves/wave-06-findings.md) builds only one Finding shape and acknowledgements stored as `dp.acks`. Not built.
- Why: with code no longer read by language (COD-06), most drift checks have nothing to compare, and the owner wants to review what is left first.
- Technical Notes:
  - The design is in the owner's ideas list (I2.2). Warnings dp already makes become the first findings; an acknowledged warning no longer counts under `dp check --strict`. Waves 8, 11 and 13 build on the Finding shape; Wave 11's packs carry no drift. The shape ships with outcomes ("not found", "not checkable") only later waves use.
- Non-Technical Notes:
  - Nothing tells a team that code has moved from the model except existing checks (missing code paths, unmapped code, key code that no longer matches).

## BMO

### COD - 08 - BMO: where it runs, who may run it, and how an import draft is applied

- Decision: BMO is off by default with two backends (handoff, or direct calls to the Claude API, OpenAI API or Ollama); any signed-in role may run it unless settings restrict it; an import draft is applied for accepted items only, keeping the rest.
- Why: the owner asked for one round covering the whole project with two backend kinds and three providers, with teams able to limit who runs it; partial apply lets verified work reach the model without waiting for unverified items; keeping settings outside the sidecar and git means a draft cannot redirect the key or code to another host.
- Technical Notes:
  - **Backends:** handoff writes the prompt and files and calls no model; direct uses plain `fetch`, no SDK; cloud providers are pinned to their hosts (another address needs an explicit allow). Each direct run is logged in `.dp/bmo/runs/`.
  - **Who:** `allowedRoles` in the settings (per project in a hub); text tasks (explain, challenge, draft summary) need only that role; a task that makes a draft also needs the right to create one, so a viewer cannot.
  - **Settings:** `.dp/bmo.json` (in a hub, the hub's file), mode 0600, outside git, changed by architects only.
  - **Preview:** the server builds every prompt; a run needs the hash of its preview, which covers provider, host and model as well as the prompt.
  - **Size:** `passBudgetTokens` caps the code digest (the lower of settings and intake wins). A prompt larger than budget plus room (half the budget, at least 32,000 tokens; `runTokenLimit` in `src/assistant/settings.ts`; 150,000 at the default budget of 100,000) is refused before sending. To be replaced by a refusal only above the model's context window (PRO-16 Q-C1b, PRO-23). Measured on 2026-11-16: 3,000 to 10,000 estimated tokens outside the digest for the demo; 21,000 to 30,000 with 300 more containers and 600 relationships.
  - **Import drafts:** partial apply of accepted items, then a rebase of the draft onto main; a draft with no review file is not applied. **`via`:** a relationship through a broker is two relationships, source to broker and broker to target.
  - **Not built:** the MCP backend, Structurizr DSL input, YAML, multi-pass summarising.
- Non-Technical Notes:
  - Partial apply adds merge code on the data path where a bug could lose work (the smaller fallback is to block apply until every item is decided). Settings are per machine or hub, so each person redoes them. Viewers can run text tasks that cost money on direct runs unless restricted. Each brokered connection carries two labels to write. Three request shapes are ours to maintain instead of vendor SDKs. Redaction cannot catch a secret written as a plain word.

### COD - 09 - BMO chat: questions about named objects, every message previewed

- Decision: a text task `ask` takes a question, up to 10 referenced object ids (typing `[` suggests objects), an optional diagram and lens, and up to 6 earlier turns; every message shows a preview card and is sent with its hash.
- Why: the owner wanted to ask questions about specific objects, and the preview keeps "what was shown is what goes" so the chat adds no unseen way for text to leave.
- Technical Notes:
  - The server builds the prompt: each object's details for the lens, parents, contents, relationships and redacted code excerpts through the same file gate as the import digest. Without a reference it sends the viewed diagram or a short overview. Earlier turns go in a data block marked as earlier conversation; they come from the client so can be altered and carry the question's trust. The answer is shown, not stored; the conversation lives in the browser tab. The 24,000-token code cap is dropped (PRO-16). Amended by REC-03 and COD-11.
- Non-Technical Notes:
  - One extra keypress per message; the conversation is lost on reload; there is no handoff mode for chat yet.

### COD - 10 - BMO works without an LLM

- Decision: BMO's settings gain a clear "Use an LLM" switch; with it off BMO stays in the UI as a deterministic assistant that builds no prompt and sends nothing. Not built; planned in [Wave 2](waves/wave-02-notes-context-help.md).
- Why: the owner wants dp useful with no LLM and an LLM to be a called-out choice (determinism classes).
- Technical Notes:
  - It is the existing `enabled` flag (off by default, architects only). With it off, BMO answers a fixed command list from the model, notes, decisions, reference notes and docs (`find`, `help`, `show`, `notes`, `decisions about`); free text runs as a search and says so. Later waves add commands. The same functions are `dp find`, `dp help`, `dp context` (GET routes only). Results are class computed and carry no "BMO" label. With it on, handoff and direct runs work as before. Amends COD-02 and COD-08.
- Non-Technical Notes:
  - Free-text questions get a search, not an answer. "Enabled" now means "an LLM may be used", so the settings screen and docs must say so, and the BMO button no longer hides when off. Search quality is the word index's.

### COD - 11 - BMO can reach everything the UI shows

- Decision: every kind of thing the UI shows about a scope has a place in that scope's context pack, and the manifest says what was left out and why. Not built; planned in Waves 1, 2 and 16.
- Why: the owner wants BMO to work from what a person sees, so an answer cannot miss a comment or note that is on screen.
- Technical Notes:
  - New data kinds are added in one place in the pack builder; a computed test walks the fields the panels show and fails if one is neither in the pack nor named in the manifest (it only knows the fields it lists). Planned kinds: comments and sticky notes (Wave 2) and attachments (Wave 16: a list always, text files' content after redaction). Image, PDF and Office file contents are not sent because dp cannot scan them for secrets; they are listed (the assistant's exception, open to the owner). The rest of COD-03 stands. Builds on COD-03 and COD-09.
- Non-Technical Notes:
  - Bigger packs: whole items are dropped in a fixed order, so an answer can still miss something dropped. More text from more accounts reaches the model, labelled and redacted, not vetted.

# RUN - Runtime and System Testing

## Observed data

### RUN - 01 - Sample data on relationships and connector stages

- Decision: a relationship has an optional sample payload and format (`dp.example`, `dp.format`), and each connector stage has the same two fields inside `dp.stages`; a stage's sample is the data leaving that stage.
- Why: stage names say what happens, a sample shows it (for example "Mask PII" turning `email` into `user_ref`); keeping samples in the workspace means they are versioned, diffed and reviewed like the rest of the model, and work offline.
- Technical Notes:
  - Clicking a line shows the samples in order: what enters, what each stage produces, where it ends. For two neighbouring JSON-object samples the top-level fields added, removed or changed are marked; CSV, SQL and nested changes show as plain text. A sample is at most 8,000 characters. A relationship with no sample shows the examples of flow steps that use it; flow-step examples stay separate (`dp.stepData`) because one relationship can carry different data in different flows. Amended by RUN-06 (the mode can save an observed body as the example).
- Non-Technical Notes:
  - Samples are written by people or agents, are only as current as the last edit, and are not checked against real data. They live in git, so the writer must remove real personal data; the cap does not check content.

### RUN - 02 - Observed data stays masked, including personal financial data

- Decision: everywhere dp shows data observed in a running system, values of fields whose names look like secrets or personal financial data are replaced with "•••".
- Why: observed data can be saved into the model, which lives in git, so masked by default is the safe choice.
- Technical Notes:
  - One pattern (`src/shared/mask.ts`): passwords, tokens, keys, authorization, cookies, sessions, card numbers, CVV, PIN, SSN, IBAN. Amended by RUN-06: masking is done on the server, at every depth.
- Non-Technical Notes:
  - Masking is by field name, so a secret under an ordinary name shows; masked test data (a test IBAN) cannot be seen in dp.

### RUN - 03 - Trace files are read from a folder and laid over the model

- Decision: dp reads OpenTelemetry trace files in OTLP JSON from one folder and lays them over the model, matching spans to elements and hops to relationships. The viewer is part of System Testing's screens and behind the same switch (PRO-20, planned_features A8).
- Why: a model-only walk shows every way on from an element while a trace shows what one request did; files keep dp local and offline, and matching by code path reuses the code mapping so no extra setup is needed.
- Technical Notes:
  - Source: `dp serve --traces <folder>` (default `<project>/traces`); the Collector file exporter's format (one object per line, or a whole file). Files are re-read on change; the newest 2,000 traces from the last 20 MB of each file are kept.
  - A span matches an element by, in order: the `dp.element` attribute; its file (`code.filepath` / `code.file.path`) against code paths (a file mapped to several elements goes to the one that lists it first); its parent span's element when both run in one service; `service.name` against the element's `dp.otel.service`, id or name. `peer.service` on a client or producer span names the element called. A change of element from parent to child is a hop, matched to a relationship directly or between the elements' parents or children (the first found, which can be a sibling's). Hops with no relationship and names no element matches show as differences between system and model.
  - Routes `GET /api/traces`, `GET /api/traces/:id?ui=<element>` (read-only, every role). dp no longer adds a `traceparent` header (RUN-05). Large folders are read in full on change.
- Non-Technical Notes:
  - Traces are as fresh as the file; nothing is pushed. Matching by file assumes a component's first code path is its main file.

## Live testing

### RUN - 04 - Live UI inspector: the running app framed through a local proxy

- Decision: an element could have a live UI address and "Inspect live UI" opened the app inside dp through a local proxy that reported clicks and the calls made after each, matched to endpoints on relationships. Superseded by RUN-05 (removed).
- Why: the owner wanted to click in a real UI and see which calls it makes and which parts of the system they touch.
- Technical Notes:
  - Kept from it: API endpoints on relationships (`dp.endpoints`: method and path, `:name` for one segment, a final `*` for the rest, or a full URL), now matched by System Testing (RUN-06).
  - It was limited to fetch and XMLHttpRequest, attributed calls by a two-second window after a click, and ran the app without its own framing headers.

### RUN - 05 - The live UI inspector and the demo web app are removed

- Decision: the live UI inspector (the page, its proxy, the injected script, `POST /api/ui-proxy`, `POST /api/inspect`, `--allow-ui-host` and the CSP frame exception) and the demo web app (port 4200, `demo/web-app/`) are removed.
- Why: the inspector only watched, saw only the calls a browser makes and covered the diagram it was meant to explain; the owner wants testing on the diagrams themselves.
- Technical Notes:
  - Kept: `dp.endpoints` (matched by RUN-06), `dp.otel.service`, the trace reader and `GET /api/traces*` (RUN-03), sample data (RUN-01), backtracking (COD-04) and the demo's made-up git history (RUN-08). The demo ships one made-up trace file (`demo/traces/sample.jsonl`). Supersedes RUN-04 and the web-app half of RUN-08.
- Non-Technical Notes:
  - The view of which click caused which call is lost. The demo ran nothing until RUN-09.

### RUN - 06 - System Testing mode: pause and change live calls on the diagram

- Decision: a Test button turns on a mode (`t=1` in the URL, main model only, editing off) where dp opens intercept points on 127.0.0.1 that forward a caller's HTTP calls, pause them at breakpoints, and let a person change, drop, answer or resend them.
- Why: the owner wants to test and debug flows and pipelines where the architecture is drawn, with real data, and to change that data before an object receives it.
- Technical Notes:
  - **Intercept points:** a port forwards to the address of a relationship's destination (RUN-07); the caller's base URL is set to that port. One point covers every relationship from that caller to that target address; each call is put down to the relationship whose endpoint matches, and a call matching none is flagged with an endpoint to add. Ports are kept in `.dp/testing.json`; after a restart the person starts the saved points. Code: `core/testing.ts` (no server imports), `server/interceptProxy.ts`, `server/testSession.ts`, `server/routes/testing.ts`.
  - **Pausing:** breakpoints on a line, object, flow step or pipeline stage (optional method, path, conditions on `body.<field>`, `header.<name>`, `query.<name>`, `status`) pause at request, reply or both; Pause next and Step pause the next event. A paused request can be changed (method, path, headers, body), dropped, or answered by the person; a paused reply can be changed or dropped; a logged call can be resent. A call is released unchanged after 120 seconds (10 to 600); at most 20 are paused at once; all are released when no testing page has asked for state for 10 seconds or dp stops.
  - **Run log:** newest 200 calls, watched fields across calls, an observed body can be saved as the relationship's example. **Traces:** a trace file picked in the mode is drawn on the diagram (hops on lines as watched, missing hops on boxes). **Flows and pipelines:** the player follows the paused call, steps are marked live, watched or not live, a step can be stepped into and a stage linked to an element with an address can have its own point; others show hand-written samples labelled not live.
  - **Security:** a point forwards only to the address in the main model, never from a request or draft; the address must be this machine unless named with `--allow-target-host`; link-local and metadata addresses are always refused. Points listen on 127.0.0.1 and answer only requests addressed to themselves (another name gets 403); dp's session cookie is never forwarded. Action `testing`: architects and engineers on any version, refused for viewers and read-only servers; GET routes check it too; every route refuses a browser not on this machine.
  - **Masking:** real values stay in server memory; the browser gets secret-looking values as "•••" (RUN-02 names at every depth, plus `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` and the query). An edit that leaves "•••" keeps the real value; "•••" elsewhere is refused. Nothing of a call is written to disk; `.dp/testing.json` (mode 0600, outside git) holds ports, breakpoints, watches and hold time. Amends RUN-01, RUN-02, SEC-01 and SEC-04.
  - **Limits:** plain HTTP/1.1 only (no HTTPS, HTTP/2, gRPC); a caller in a container cannot reach 127.0.0.1 on the host; bodies over 1 MB, compressed request bodies, event streams, WebSocket upgrades and preflight requests pass through unpaused; `Accept-Encoding` is removed from forwarded requests; masking is by field name; a relationship used by two steps of one flow cannot be told apart, so a step breakpoint stops both; one session per project shared by everyone who may test (first release of a paused call wins); not against a draft; in a hub each project has its own session and file, the catalog none.
  - Later: saved test cases and a `dp test` runner (`TestCallDetail` is the shape a case would save).
  - Hidden by default for 1.0.0: off unless `dp serve --testing` (PRO-20, planned as [Wave 29](waves/wave-29-system-testing-switch.md)); its tests stay in CI and docs call it experimental.
- Non-Technical Notes:
  - dp can now change live requests, so an edit, a hand-written reply or a resend has real effects in the target.
  - A signed request fails at the target once edited. A call held longer than the caller's timeout fails at the caller, and a retrying caller creates a second paused call.
  - A secret inside a plain-text body, or under an ordinary field name, is shown.
  - Interpretation: one port per (caller, target) is what "an intercept point per line" means where lines share a base URL; viewers should see traces but no live calls.

### RUN - 07 - Where something runs: `dp.run.url`

- Decision: an element may carry the address it runs at (`dp.run.url`: http or https, host and port, no path); a relationship's target is its destination's address or the nearest parent's.
- Why: an intercept point needs to know where to forward, and one address per running thing avoids repeating it on every line.
- Technical Notes:
  - Shown as "Address it runs at" in the Running system section (API field `runUrl`). Endpoints sit on relationships into components while the address belongs to the hosting container, hence the parent lookup. The older `dp.ui.url` is read when the new key is absent; saving writes the new key and removes the old.
- Non-Technical Notes:
  - The address goes into git and is the same for everyone: use a local or test address. There is one address per element (no per-environment or per-person value) and a service reached by two addresses cannot be described. Whoever may change main decides where a point forwards; the target check of RUN-06 bounds that.

## Demo

### RUN - 08 - The demo gets a made-up git history and a running web app

- Decision: `dp serve --demo` and `dp init --demo` turn a new demo folder into a git repository with four dated commits made up from `demo/history.json`; the newest introduces the demo's bug (currency conversion rounds each amount). The web-app half was superseded by RUN-05.
- Why: backtracking needs recent history, so a new user could not otherwise see it in the demo.
- Technical Notes:
  - Made by `npm run make-demo` from the shipped files (older versions are derived, so they cannot drift). Skipped when the folder is already inside a repository or git is missing. `traces/` is ignored. The exchange-rates call reaches a provider the model lacks, and statements show the one-cent difference backtracking explains.
- Non-Technical Notes:
  - The demo folder gets a `.git` folder and commits the user did not make (dates relative to creation).

### RUN - 09 - The demo gets a small runnable system

- Decision: `dp serve --demo` starts five small real HTTP services on 127.0.0.1, ports 4200 to 4204 (the page of the web app, the API application, the payments service, and stand-ins for the mainframe and fraud detection), so System Testing can pause a real call between two services.
- Why: without a running system the mode's main feature could not be tried in the demo.
- Technical Notes:
  - The demo model carries their addresses (`dp.run.url`) and endpoints. Before each call a service asks dp whether an intercept point is open for its target and uses that port, else calls directly. Code: `src/demo/demoSystem.ts`. The made-up trace file of RUN-05 stays. The orchestrator-to-mainframe hop is a message queue in the model and stays not live. The services write no trace files.
  - Planned: the services start only with `--with-system` (PRO-20, Wave 29; not built).
- Non-Technical Notes:
  - Following open points automatically is something a real system does not do; there a person sets the caller's base URL to the port shown, and the tour says so. Five fixed ports can clash with something else; dp then says so and runs without them. More demo code to keep working.

# WRK - Linked work

## Work status and CI push

### WRK - 01 - First use of the credentials: linked work status from GitHub

- Decision: "Refresh status from GitHub" under Linked work reads every GitHub issue or pull request link in the shown version and updates its status, on request only.
- Why: linked work already holds GitHub links, so keeping their status current is the smallest useful integration; it shows the credentials working end to end and needs no new model data.
- Technical Notes:
  - `POST /api/work/refresh` (action `edit`); at most 100 links, 4 at a time, 10 seconds each. A closed issue or closed or merged pull request becomes "done"; an open one keeps "in-progress" or "blocked", else "open"; a "done" one that is open again becomes "open". It uses the first stored credential with provider `github` (SEC-06), or public repositories only at GitHub's lower rate. One undo step; nothing written when nothing changed; the answer lists changes and unreadable links (not found, refused token, rate limit), never the token. Extended by WRK-02.
- Non-Technical Notes:
  - On demand only: no schedule or polling (owner). Statuses are a snapshot. It reaches only api.github.com, only when asked.

### WRK - 02 - Linked work from GitHub, GitLab, SonarQube and Jira, pushed from CI, pinned anywhere

- Decision: linked work (`dp.work`) can be pinned to an element, relationship, diagram, flow or the project; status is refreshed on request from GitHub, GitLab, SonarQube/SonarCloud and Jira; and CI can push findings from report files with no network.
- Why: linked work already points at items in other tools, so current status and CI reports are the smallest useful next step; report files work offline so CI needs no tokens.
- Technical Notes:
  - **Pinning:** targets use the vocabulary of comments and checklist items, plus project (stored in the workspace properties); connector and code diagrams are refused with a hint. An item has the existing fields plus `key` (stable tool id), `remote` (the tool's status words) and `checked`; a new type `quality` (a SonarQube quality gate); at most 500 items per object, 5,000 per model.
  - **Live status** (`POST /api/work/refresh`, on request): GitHub (github.com and Enterprise), GitLab (gitlab.com and self-hosted; issues and merge requests), SonarQube and SonarCloud (issues, hotspots, quality gate with counts), Jira (status category gives open, in progress or done; priority gives severity). The tool says done: done; open on a done item: open; in progress: in progress; otherwise kept (a manual "blocked" stays). A change is written only when status, tool words or severity changed; a refresh finding nothing writes nothing and adds no undo step. At most 200 links per refresh.
  - **Connections:** built in: github.com, gitlab.com, sonarcloud.io. Others in `.dp/integrations.json` (mode 0600, git-ignored; the hub's own in a hub), architects only, via the Credentials page, `dp integrations list|set|remove`, or `GET/PUT /api/integrations` and `DELETE /api/integrations/:id`. A connection names a stored credential; `auth` is `bearer` (default) or `basic` (`user:token`, such as Jira Cloud's email and API token). A built-in connection uses the first credential of its provider (github, gitlab, sonarqube) that no connection names, so a team server's token never goes to a public host. Hosts are not in the sidecar because an engineer could edit a draft's sidecar and point a token elsewhere.
  - **Push:** `dp work list|add|import`, `GET /api/work`, `PUT /api/work/target`, `POST /api/work/items`, `POST /api/work/import`. Formats: SARIF 2.1.0, GitLab Code Quality JSON, SonarQube issues search JSON, and a small dp JSON (`dp work import --schema`). Each finding goes to the element whose `dp.code.paths` hold its file (longest path match, then the deeper element), else the project; a file shared by several components goes to the first in model order. `--source NAME` keys items under `NAME:`; `--close-missing` sets that source's unreported items to done; `--draft ID` writes into a draft; `--check` writes nothing; a push that changes nothing writes nothing. CI pattern: run the scanner, then `dp work import results.sarif . --format sarif --source codeql --close-missing`, and commit the model.
  - **A push goes to the main model by default** (owner: "whatever you think is best"); in CI that is the CI branch and the pull request is the review. A default draft would keep findings out of the model until someone applies it after every scan. `--draft ID` lets a team have an architect accept findings first.
  - Unlike the checklist (REC-05, a modelling to-do list outside the model), linked work stays in the model so it goes through drafts, diffs and merges. Outbound calls and limits: [CONTRIBUTING.md](CONTRIBUTING.md#linked-work-status-dec-085).
  - Rejected: live API sync on a schedule (needs tokens and network in CI); a separate work file (items belong to objects and should follow drafts).
- Non-Technical Notes:
  - A status is a snapshot: no polling or webhooks. Unattended pushes from outside are not built; the server binds to 127.0.0.1 with session sign-in only, so CI uses the CLI and commits the model. SonarQube bearer tokens need SonarQube 10 or later (older servers use `basic` with the token as user name).

## Work page and severity

### WRK - 03 - A Work page for every pinned item

- Decision: a Work page over the diagram (`p=work`, the Work toolbar button) lists every linked work item in the model with what it is pinned to.
- Why: a checklist card suits a short list; linked work can be long and needs a table with filters.
- Technical Notes:
  - Columns: title (link), tool, type, status (editable), severity, pinned to (a click reveals the box or line, or opens the diagram or flow), the tool's status and when checked, note. Filters: text, tool, type, status (done hidden by default), severity, kind of target; group by target. **Add item** has a target picker (default Project); **Refresh status** (WRK-02). Entry points: "Link work…" in the right-click menu of a box, line or diagram background; a "Linked work" section in diagram and flow panels; a count beside diagrams and flows with open items of their own. No key (owner chose the button only).
- Non-Technical Notes:
  - The page is per project; across a hub it is WRK-05.

### WRK - 04 - The severity mapping is a model setting, explained and edited on the Work page

- Decision: how tools' severities map to dp's is a setting in the sidecar (`work.severity`), with a "How it works" view on the Work page that explains linked work and lets people edit the mapping.
- Why: a tool's severities do not match every team's sense of urgency and Jira sites rename priorities; the owner wanted the rules visible and changeable. In the sidecar the mapping follows the model's review flow and holds no host or token, so an engineer can safely edit it.
- Technical Notes:
  - `work.severity` holds the SARIF `security-severity` thresholds (critical, high, medium from 9, 7, 4) and four name tables: SARIF levels, GitLab Code Quality severities, SonarQube severities (issues, impacts, hotspot probability) and Jira priorities. Names match in lower case; unlisted or "none" gives no severity. Defaults write nothing. Used by `dp work import`, `POST /api/work/import` and Refresh status (SonarQube, Jira). Edited with `PUT /api/work-settings` (`{severity}`, or `null` for defaults; role `edit`); a draft can change it ("Linked work settings" in the change list). Code: `cleanWorkSeverity` in `designPerspectivesFile.ts`, `severityOf` in `workLinks.ts`.
  - "How it works" explains linked work against the checklist, which servers and links give live status, the status rule, how CI brings findings in, and the editable tables (duplicates and non-descending scores refused; "Use dp's defaults" resets).
  - Rejected: `.dp/integrations.json` (architects only, not reviewed with the model, restriction not needed); fixed in code with help text.
- Non-Technical Notes:
  - A changed mapping does not rewrite items already in the model; the next import or refresh does. GitHub and GitLab give no severity, so they have no table.

## Across projects

### WRK - 05 - Work across projects on the hub pages

- Decision: a read-only Work page on the hub pages (`#/work`) lists linked work from every project the person may see, with filters and totals.
- Why: someone who looks after several projects wants to see what is open, especially security findings and failed quality gates, without opening each project.
- Technical Notes:
  - `GET /api/hub/work` reads each project's main model (skipping projects a user has `none` in, SEC-05); each row has its project, each project reports open and total counts or its load error, and it returns the tool connections, types and statuses. In a single project it lists that project. The page shows totals (open, critical or high, security, projects with open work), a chip per project (filters to it), filters (text, status not done by default, type, severity, tool, target kind) and grouping by project (on in a hub). Rows link to the tool, the project's Work page, and the target's box, diagram or flow.
- Non-Technical Notes:
  - Read-only: items are added, changed and refreshed in a project's own Work page where version and role are clear. Main models only (no drafts). The list is built on each request and reloaded on window focus, not live; a status is as fresh as each project's last refresh.

