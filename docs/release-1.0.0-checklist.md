# Checklist before release 1.0.0

Status: written 2026-11-20. This is the "1.0.0 checklist" that [CONTRIBUTING.md](CONTRIBUTING.md#making-a-release) and the ideas list (I2.0) refer to. Tick a box only when the check was made, and write the date and the result next to it. A box that cannot be ticked is either fixed or named in the release notes; it is never ticked on trust.

**Reading the marks.** *Fact* items cite where the requirement comes from (a DEC, a file or a wave). [Proposal] items are my reading of what 1.0.0 should mean and are the owner's to accept, change or drop.

**Where things stand on 2026-11-20** (sources: [waves/README.md](waves/README.md), `package.json`, `git tag`): `package.json` and the README say 0.5.0; there are no git tags; 0.6.0 is built but its release change is not made; no wave is built. Everything below is therefore still ahead.

---

## 1. Decisions the owner still owes

- [x] **Scope of 1.0.0 (D4)**, decided 2026-11-20 item by item: DEC-104 (the review file is deleted; the summary is in [product-vision.md](product-vision.md), "The line, item by item"). *Fact:* decisions.md, DEC-104.
- [ ] Apply the answers: the waves, the product vision and the manual test plan match the decided scope (items hidden or marked "later" are hidden, not deleted). [Proposal] *Done 2026-11-20 for the waves, the vision, the decisions and planned_features; **not done** for the manual test plan beyond section 27, and the code change (A8, now [Wave 29](waves/wave-29-system-testing-switch.md)) is not built. The waves were re-planned again on the same day (DEC-107): Waves 28 and 29 were added and the release groups changed.*
- [ ] **What 1.0.0 promises to keep stable** [Proposal]. SemVer says 1.0.0 is the point where the public surface stops changing without a major version. Decide and write down which of these are in that promise: the `architecture/` file formats (`workspace.json`, `designperspectives.json`, `dp.*` properties, decision files, `comments.json`, `checklist.json`), the import file schema v1, the `dp` command names and flags, the `/api/*` routes, and the exit codes of `dp check`. Put the answer in `docs/decisions.md` as a DEC and in CONTRIBUTING.md. **Written as a Proposal by [Wave 28b](waves/wave-28-quality-for-1-0.md) for the owner to accept; its enforcement is the public-surface snapshot of Wave 28a.**
- [ ] Answer or consciously defer every open item in [decisions.md](decisions.md#open-questions-and-the-ids-of-answered-ones). *Fact:* it holds no open question today (D4 was answered, DEC-104); U26 (the BMO check of the folder-skip list) is a check, not a question.

## 2. Everything in scope is built, tested and released

*Fact:* the twelve features A to L of [product-vision.md](product-vision.md), the waves in [waves/README.md](waves/README.md), and the releases it lists (0.6.1 to 0.14.0).

- [ ] 0.6.0 released: version bump in `package.json` and the README, changelog section, tag, GitHub release (DEC-098, "Making a release").
- [ ] Waves of each group built, merged to `main`, with a review file `docs/waves/wave-NN-review.md` and the wave file deleted ([waves/README.md](waves/README.md#closing-a-wave)): 0.6.1 (23, 28a), 0.7.0 (24, 1, 2, 25, 29), 0.8.0 (3, 26, 16, 4, 27), 0.9.0 (5, 14a, 15), 0.10.0 (6, 7, 8), 0.11.0 (9, 11, 18, 17, 19), 0.12.0 (14b, 13, 22, 20), 0.13.0 (21), 0.14.0 (28b) (DEC-107). Wave 28a has no release of its own: it ships with the next release after it is merged.
- [ ] 0.6.1, 0.7.0, 0.8.0, 0.9.0, 0.10.0, 0.11.0, 0.12.0, 0.13.0 and 0.14.0 each released the same way, in order.
- [ ] Each feature, one line each, works end to end on the demo and on a real project:
  - [ ] A C4 modelling (five levels, flows, conditions and variants)
  - [ ] B Single source of truth (every diagram computed from the one model)
  - [ ] C Change proposals (drafts, apply, rebase and merge editor, coding plan)
  - [ ] D Lenses (Engineer, Architect, Overview, DevOps, Security, Business)
  - [ ] E Collaboration (local accounts and roles, notes, comments, images and files)
  - [ ] F Contracts between services
  - [ ] G Decisions (ADR page)
  - [ ] H Codebase import (scan, search, key code, guided interview)
  - [ ] I Architecture commits (History, Commit button, `dp commit`)
  - [ ] J External services linking (GitHub, GitLab, SonarQube, Jira)
  - [ ] K Shared catalog and reference library
  - [ ] L BMO (cited answers, findings, metrics, rules, reviews)
- [ ] The static HTML export works on the demo: a folder opens from disk and from a web host, the single file opens by itself, the review report lists what leaves the machine and refuses secret-looking values, the output is byte-stable. *Fact:* DEC-100 puts it in 1.0.0; [Wave 21](waves/wave-21-static-export.md).
- [ ] System Testing, traces and the demo system are off by default and called experimental (DEC-104, [planned_features.md](planned_features.md) A8): `dp serve` shows no **Test** button and starts no intercept listener without `--testing`; `dp serve --demo` starts no demo services without `--with-system`; the README, the demo tour and the security model say so. Built as [Wave 29](waves/wave-29-system-testing-switch.md).
- [ ] Nothing parked or "not built yet" is described as working anywhere: README, in-app text, manual test plan section 27. *Fact:* risk storming, runtime telemetry (the former Waves 10 and 12, now designs in the ideas list) and architecture drift are parked.

## 3. Automated gates

- [ ] `npm run ci` ends with "All CI checks passed" on the release commit, and `static/`, `demo/` and `tests/TESTS.csv` are unchanged from what is committed. *Fact:* CONTRIBUTING.md, "Making a release", step 3.
- [ ] **The GitLab pipeline has run at least once and passed, on Node 20 and Node 22 on Linux.** It never has. *Fact:* `.gitlab-ci.yml` says "NOT RUN YET"; manual test plan U7, U16.
- [ ] No test is skipped or marked flaky without a written reason. Browser tests run on a machine with Chromium (`npm run test:browser`).
- [ ] `npm audit` (production and dev dependencies) has no high or critical finding, or each one is explained. Dependencies are pinned by `package-lock.json`. [Proposal]
- [ ] The test list `tests/TESTS.csv` is current and every test file starts with its one-line purpose comment. *Fact:* CLAUDE.md, Tests.

## 4. Real-world checks that have never been run

*Fact:* these are in the manual test plan, section 29 ("Unverified facts"), and section 19 ("Install checks that only the owner can run"). Write each result in the plan's Result column. Which ones **block** 1.0.0 is a [Proposal]: those marked "blocks".

**Install and platforms**
- [ ] **Blocks.** Install from the release tag on a clean machine: `npm install -g github:AbhishekR3/designPerspectives#v1.0.0`, then `dp --version`, `dp init --demo demo-check`, `dp serve demo-check`. Never run (U17; the only install route, DEC-063).
- [ ] **Blocks.** One run on Windows: `dp serve --demo`, paths, line endings, opening the browser (U15, DEC-095).
- [ ] macOS and one Linux machine, the latest Chrome, Firefox and Safari for the UI (manual test plan section 25).

**BMO**
- [ ] **Blocks.** One real run with each backend you ship: the Claude API, the OpenAI API and Ollama (U1, U3). Check the default model ids against each provider's current list first (U2). **The first of these runs is the real-run gate of [Wave 1](waves/wave-01-grounded-bmo.md)** (one route the owner uses, before the wave closes); the other providers stay here.
- [ ] Run the C3 candidate task on a real repository to check the folder-skip list, and record whether BMO was on (U26).
- [ ] Read the context window from a running Ollama server before dp relies on it (U27).

**Linked work**
- [ ] One real link per tool: GitHub (including a private repository and Enterprise), GitLab (including self-hosted), SonarQube 10 or later, Jira Cloud (U4).
- [ ] Import a real report from each scanner format: SARIF, GitLab Code Quality, SonarQube issues (U5).
- [ ] Run the three sample CI jobs in `demo/ci-examples/` once in a scratch repository (U6).

**Import at scale**
- [ ] `dp scan --plan` on three real repositories of different sizes; compare the guessed limits with the effort you actually spend (U10, U13, U14).
- [ ] A real large model through the BMO preview, to test the context limits (U11, U12, U24).

**System Testing and traces** (hidden by default in 1.0.0, DEC-104: these checks run with `dp serve --testing`; skip them only if the release notes say the mode is removed)
- [ ] A real OpenTelemetry Collector file (U8), and one run against a service of your own for the cases dp passes through unverified: HTTPS, HTTP/2, gRPC, WebSocket, large and compressed bodies (U9).

## 5. Security

*Fact:* the security model is in [CONTRIBUTING.md](CONTRIBUTING.md); manual test plan sections 16 and 20.

- [ ] `/security-review` run on the whole of `main`, not only on the last branch. Every finding is fixed or named in the notes. [Proposal]
- [ ] Credentials are always encrypted at rest (DEC-101, planned as [planned_features.md](planned_features.md) A7): built and tested, or the release notes say plainly that they are not.
- [ ] Every non-GET route has a `ROUTE_RULES` entry in `src/server/auth.ts` (a test enforces it). Every new route and outbound call is in the security model section. *Fact:* waves/README.md, "Required in every wave".
- [ ] Defaults: the server binds `127.0.0.1`; sign-in, sessions, roles and `--read-only` behave as documented; the Host and cross-site checks and the JSON-only rule hold.
- [ ] Outbound calls go only to pinned hosts (BMO providers, work tools); the System Testing target allow-list is loopback by default.
- [ ] Masking limits are stated where a person can see them: values are hidden by field name only (U20). A hand-written `hub.json` is trusted (U21): accept in writing, or add the check.
- [ ] No secret in the repository or its history (`git log -p` search for keys and tokens); `.dp/` and `local/` are git-ignored; the static export review refuses secret-looking values.
- [ ] How to report a security problem is in CONTRIBUTING.md and the supported-versions rule names 1.0.x.

## 6. Quality of use

- [ ] **Accessibility.** One keyboard-only walkthrough of the main tasks (model, draft, decision, import) and one automated audit. Screen-reader names, focus traps in dialogs, canvas editing by keyboard and colour contrast are unchecked; narrow widths under 760 px and the light theme are unsupported (U18, DEC-013, DEC-042). Either fix or state the limits in the README. [Proposal] **Built as [Wave 28b](waves/wave-28-quality-for-1-0.md)** (an automated audit of every screen and of the exported file, a keyboard-only walk, fixes, the known limits stated in the README). The light theme is not in 1.0.0 (owner, 2026-11-20, DEC-107): the README says "dark only".
- [ ] **Scale** (the test is [Wave 28a](waves/wave-28-quality-for-1-0.md): a generated model with time budgets; this item is the number written down). A 100+ container model: open, edit, undo, check, the checklist rules and the first load stay usable (U24, manual test plan section 23). Number written down.
- [ ] **Failure modes** in manual test plan section 22 and **concurrency** in section 21 are walked, including two browser tabs and a change on disk while the server runs.
- [ ] The demo tour runs from a fresh install without a step that needs a file outside the package (`npm run dp -- serve --demo`).
- [ ] Open the demo on two machines and look at the diagrams: label sizes and line routing are estimates and fonts differ (U19).
- [ ] The "0 projects" screen seen once is understood or confirmed gone (U22). The demo's checklist rule that fails on purpose is decided (U23).

## 7. Compatibility and upgrade

- [ ] (The compatibility fixtures and their test are [Wave 28a](waves/wave-28-quality-for-1-0.md); the release change adds the fixture folder for each released version.) A model made by the oldest supported version opens in 1.0.0 unchanged, and a model saved by 1.0.0 still reads in Structurizr's tools where it should (manual test plan section 30). **The tools of that format changed in 2026 (researched 2026-11-20, second-hand: one competitor's blog quoting the format's own pages, which did not load): its hosted service closes on 30 September 2026, and the successor "local" viewer looks for a `workspace.dsl` before a `workspace.json`, while dp writes only the JSON. Test against that current viewer, not the old Lite, and read the format's end-of-life page first-hand before writing the result.** *Fact:* the README promises that files from the Python 0.2 version open unchanged; keep or retract that claim.
- [ ] Every format change since 0.6.0 is either additive (unknown fields kept) or has a migration, and the migration is tested. [Proposal]
- [ ] Hubs, linked catalog copies, drafts and `architecture/import/` data from older versions open and behave.
- [ ] (Automated by `scripts/check-package.ts`, [Wave 28a](waves/wave-28-quality-for-1-0.md).) The package contains what it should and nothing else: `npm pack --dry-run`; `static/` and `demo/` included, `dist/` built by `prepare`, no `local/`, no test results, no reference books.

## 8. Documentation

- [ ] README: version line says 1.0.0; the feature list matches what is built (no planned feature listed as working); install steps are the ones tested in section 4.
- [ ] [CHANGELOG.md](CHANGELOG.md) has a `## [1.0.0] - Month - DD - YYYY` section in the DEC-098 format, written from what shipped (see the wave review files, `docs/waves/wave-NN-review.md`, DEC-105), with no planned or unreleased work.
- [ ] [docs/README.md](README.md) index lists every file in `docs/`, including this checklist and `docs/determinism.md` (written by Wave 1).
- [ ] [decisions.md](decisions.md): every design choice made for 1.0.0 has a DEC; the index is current; no entry contradicts the shipped behaviour.
- [ ] [planned_features.md](planned_features.md): built items removed or marked built; what remains is "after 1.0.0" (data architecture, infrastructure, hosted accounts A6, parked waves).
- [ ] [manual-test-plan.md](manual-test-plan.md): every row for the final scope has a Result (pass, fail with a reason, or "not run" with a reason); section 27 ("Not built yet: do not test") is current.
- [ ] [product-vision.md](product-vision.md) status table says "built" for each feature, or says what is not.
- [ ] `.claude/CLAUDE.md` code map matches the source tree (new folders and files are listed).
- [ ] **[architecture.md](architecture.md) is brought up to date and matches the code at the release commit.** It is a hand-written overview and goes stale: it was last checked on 2026-11-20 (six unconfirmed items resolved), before any wave in [waves/README.md](waves/README.md) was built. Before the tag: (a) every folder, container, route module and `dp` command added since is in the diagrams and the text; (b) each remaining "(unconfirmed)" in its section 6 is checked against the source and either stated as fact with its file or removed; (c) the context diagram lists only outside systems that 1.0.0 really touches (the static export, contracts, attachments, local models, the new lenses); (d) its draft banner is changed to a date and "checked against commit <hash>", or the page is replaced by a real dp model of this repository (its question 1 for the owner); (e) the owner's open questions at its end are answered or dropped. [Proposal for the exact list; the owner asked on 2026-11-20 that this page be kept updated and checked at release.]
- [ ] **Position against alternatives is researched, written down and current.** The owner asked for this on 2026-11-20 (ideas entry E2). The research names other products, so it lives in the git-ignored `local/` folder (a note dated 2026-11-20 exists there: other modelling and diagramming tools, enterprise-architecture and UML-era tools, and C4 against other notations). Before the tag, in this order: (a) re-read the note's sources and update every statement older than 30 days, because the field moved in 2026 (standards, hosted services and open-source tools all changed); the pages that did not load on 2026-11-20 are read first-hand; (b) check each claim the README or in-app text makes about what dp is and is not (for example: files in your own git repository, no account needed, drafts, lenses, optional assistant, software architecture only, no real-time co-editing, no hosted service) against the note and the built features; (c) say where dp is not the right tool (enterprise-wide architecture, detailed class-level design, live cloud inventory, real-time multi-user editing) in the README in our own terms; (d) the decisions page of the product answers "C4 does not say why" (feature G) and the README says so; (e) **no other product is named or compared in any repository file, commit message or pull request** (the search in section 9 covers this). Result written next to the box. [Proposal for the exact steps.]
- [ ] `demo/README.md` still carries the demo model's credits (Apache-2.0 attribution; keep it). *Fact:* CLAUDE.md, Repo notes.
- [ ] **The owner deletes the planning files** in `docs/waves/` (the review files and the README; the parked waves 10 and 12 were deleted on 2026-11-20 and their designs moved to the ideas list; the wave files of built waves are deleted when each wave closes, and `questions.md` and `v1-scope-review.md` are already deleted) and the links to them are fixed. *Fact:* DEC-090; waves/README.md, "How to use this folder". No agent deletes them.

## 9. Repository and legal

- [ ] `LICENSE` is MIT and the `package.json` license field agrees; third-party licences of bundled code (UI build, demo model) are compatible and credited. [Proposal: run a licence listing over production dependencies.]
- [ ] No reference book (PDF) and no superseded plan is committed. *Fact:* CLAUDE.md, Working rules.
- [ ] No other product is named or compared in repository files, commit messages or pull requests (search the repository before the tag). *Fact:* CLAUDE.md, Working rules.
- [ ] The pull-request template and the issue templates in `.github/` are current; the code of conduct and contribution steps match how 1.0.0 is actually run.
- [ ] `git status` is clean; local `main` equals `origin/main`; no stray branches that hold unmerged work; no uncommitted edits from another session. *Fact:* DEC-100.

## 10. The release itself

*Fact:* every step follows [Making a release](CONTRIBUTING.md#making-a-release) in CONTRIBUTING.md. **Nothing is pushed, merged or tagged until the owner says go.**

- [ ] The owner has said go, in this session, for 1.0.0.
- [ ] Branch `release/1.0.0` from `main`; one small commit with `npm version 1.0.0 --no-git-tag-version`, the README version line and the changelog section. Nothing else in it.
- [ ] `npm run ci` passes on that branch; GitLab pipeline passes (section 3).
- [ ] Manual test plan walked for the final scope and the demo tour (section 4); results written.
- [ ] Pull request opened with the changelog section as its body; the owner reviews and merges with a merge commit.
- [ ] Tag `v1.0.0` on `main` (annotated), pushed once. A tag is never moved or re-made.
- [ ] GitHub release `1.0.0` with the changelog section word for word (not generated notes); a normal release, no pre-release flag.
- [ ] Install check from the tag in an empty folder (section 4), result written in the release's review file (DEC-105).
- [ ] Close: delete the release branch, mark the waves done in `docs/waves/README.md` (or the owner has removed that folder), and note what the first fix release (1.0.1) should look at.

---

## What I could not confirm from the files

- Whether the GitHub repository has branch protection, and whether the README badges, repository description and topics are set. These live on GitHub, not in the files.
- Whether DEC-101 (always-encrypted credentials) is built: it is planned as A7 and built by [Wave 23](waves/wave-23-sealed-credentials.md) (0.6.1); the box in section 5 stays unticked until it is.
- Which of section 4's checks truly block 1.0.0. I marked three as blocking (install from the tag, Windows, one real run per BMO backend) because the README and CONTRIBUTING promise them and nothing has ever run them; that is a judgement, and the owner may relax it.
