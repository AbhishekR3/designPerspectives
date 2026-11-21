# Wave 28: Quality for 1.0.0

| | |
|---|---|
| **Status** | Added 2026-11-20 in the second look at the waves. The 1.0.0 checklist ([../release-1.0.0-checklist.md](../release-1.0.0-checklist.md), sections 3, 6, 7 and 9) names work that no wave carried: an accessibility audit, a scale check, models from older versions that must still open, a statement of what 1.0.0 keeps stable, and a check of what the package contains. PRO-22 left them off the wave list because they depend on the final UI; the owner then chose to add this wave, **without the light theme** (the app stays dark only, and the README says so). The design is a Proposal. The three questions below were settled on 2026-11-20 by the assistant's reasoning at the owner's request. **Two runs: 28a (guard rails) runs early; 28b (accessibility and the stable surface) runs last** |
| **Branch** | `feat/w28a-guard-rails`, from `main` after the 0.6.0 release change; and, later, `feat/w28b-accessibility`, from `main` after Wave 21 |
| **Size** | M in all. 28a S–M (steps 2 to 5), 28b S–M (steps 6 to 8). The file stays until both parts are built; write "28a built" in the README table in between |
| **Release** | **28a: none of its own** (tests and scripts only): it ships with the first release after it is merged (0.6.1 if it is merged before Wave 23's release change, otherwise 0.7.0). **28b: 0.14.0**, the 1.0.0 candidate, after Wave 21's 0.13.0 |
| **Depends on** | **28a:** the 0.6.0 release change only (its fixtures are the 0.6.0 state). **28b:** every other wave that changes the UI, the routes or the files, so it runs after Wave 21. Wave 7 reuses 28a's generated large model |
| **Owner items** | The 1.0.0 checklist; PRO-22 ("Left unplaced on purpose": the light theme and the accessibility audit); the former backlog B5 (now in the wave files) ("Light theme", "Automated accessibility audit") |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Make the quality checks of the 1.0.0 checklist that can be repeated into checks that run, and run the ones that protect later work **early**:

- **28a, guard rails (early).** Models made by an older version must still open and save the same bytes. A change to the public surface (commands, routes, exit codes, file keys) cannot happen without someone noticing. A model of 100+ containers is a test, not a hope. The package contains what it should and nothing else. Every wave after 28a is built with these guards on, so a break is found in the wave that caused it, not at the end.
- **28b, accessibility and the promise (last).** An automated accessibility audit over every screen that exists by then, a keyboard-only walk of the main tasks, the fixes, and the written statement of what 1.0.0 promises to keep stable.

## What exists today [Fact; anchors to be confirmed by the re-anchor step]

- The 1.0.0 checklist lists these as unticked: format compatibility (section 7), scale (section 6, "100+ container model", U24), accessibility (section 6, U18), a package-contents check (section 7), the stable-surface decision (section 1).
- Light theme: the app is dark only (`color-scheme: dark` in `ui/src/styles/tokens.css`); narrow widths under 760 px are unsupported (checklist section 6, MOD-14, CAN-05).
- `npm run ci` typechecks, lints, checks formatting, runs Vitest and the browser tests, and checks that `static/`, `demo/` and `tests/TESTS.csv` are unchanged (CLAUDE.md, Commands). There is no check on the package contents, no snapshot of the public surface, no fixture from an older version and no large-model test.
- `ROUTE_RULES` in `src/server/auth.ts` lists every non-GET route with its role, and a test fails for a route without an entry (`tests/unit/auth.test.ts`); the command tree is built in `src/cli.ts` with commander; the `dp.*` property list is in the header of `src/core/modelEdits.ts`; the import schema has a version (`src/import/schema.ts`, `IMPORT_SCHEMA`).
- The README promises that files from the Python 0.2 version open unchanged; the checklist (section 7) says to keep or retract the claim. No fixture from that version exists.
- Wave 7 plans a performance test on a generated model of 5,000 elements and 20,000 lines.

## Design [Proposal]

### Part 28a. Guard rails (run early)

1. **Compatibility fixtures.** `tests/fixtures/compat/<version>/` holds a whole project folder as that version wrote it: `workspace.json`, `designperspectives.json`, a decision file, `comments.json`, `checklist.json`. The first one is **0.6.0**, taken from the demo and a small hand-made model at the commit of the 0.6.0 release change (`git show`, not rewritten). A test, for every folder, checks that: the project opens; `dp check` gives the same result as recorded; loading and saving with no edit writes the same bytes; unknown fields survive an edit; `dp diff` of the folder against itself is empty. **Rule for every later wave and release:** a change to a file format is additive (unknown fields are kept) or has a tested migration, and the release change adds a fixture folder for the version it releases.
2. **The public surface snapshot.** One committed file, `tests/fixtures/surface.json`, written by a script and read by a test. It lists: the `dp` command tree with each command's flags (from commander); the HTTP routes with method, path and the role from `ROUTE_RULES`; the exit codes of `dp check`; the import schema version; the `dp.*` property keys. The test fails with "the public surface changed" when the live list differs from the file, and the fix is `npm run surface:update` plus a line in the wave's review file saying why. Before 1.0.0 the test only makes change visible; after 1.0.0 it enforces SemVer.
   - **Cost, stated plainly:** every wave that adds a route, a command or a flag updates the file. That is one command and a diff that a reviewer can read, and it is the point.
3. **A generated large model.** `tests/unit/largeModel.ts` builds a deterministic model (no random numbers; the same arguments give the same bytes): for example 5 systems, 100 containers, 1,000 components and 5,000 lines, and a bigger one for [Wave 7](wave-07-metrics.md)'s 5,000 elements and 20,000 lines. Tests open it, compute every diagram, run `dp check` and the checklist rules, make an edit, undo it and save. Each has a time budget; the budget is **three times the time measured on the first run on the reference machine**, written in the review file, so a slow machine does not fail and a real slowdown does. One browser test opens a container diagram of the 100-container model and checks that it draws within its budget, so the first load of a big model is a number (checklist, section 6).
4. **The package contents.** `scripts/check-package.ts`, run by `npm run ci`: it runs `npm pack --dry-run --json` and fails if the file list holds a path outside an allowlist (`dist/`, `static/`, `demo/`, `docs/` as `package.json` says, the README, the LICENSE) or lacks `static/index.html`, `demo/` and the CLI entry. It names `local/`, `.dp/`, test results and PDFs as forbidden paths.
5. **Docs.** `docs/README.md` index, `tests/README.md` (what the fixtures and the snapshot are for and how to update them), the line "update the surface snapshot" in the list "Required in every wave" in [README.md](README.md), and CONTRIBUTING's "Making a release" (add the fixture folder for the released version).

### Part 28b. Accessibility and the promise (run last)

6. **An automated audit.** Playwright tests open every screen that exists by then (the home page, a diagram with a panel open, Decisions, Import, Work, History, and the pages the other waves added: Notes, Reference, Users, Rules, the access matrix, Findings, characteristics, the export dialog) and run an accessibility checker over each. **The exported single file of Wave 21 is audited too.** Violations are fixed or listed in the README under "Known limits"; a listed limit has a test marker so it cannot grow silently (see Q28.1 for the checker).
7. **A keyboard-only walk.** One Playwright script per main task (model an element, make and apply a draft, write a decision, run the import interview, attach a file, export) that uses only the keyboard, as far as the canvas allows; what cannot be reached is fixed or written down as a limit. Focus traps in dialogs and Escape to close are checked on every dialog.
8. **The stable surface, written down.** A decision entry (a Proposal for the owner to accept or change) and a section in CONTRIBUTING say what 1.0.0 keeps stable: the formats under `architecture/` (including the `dp.*` property keys, decision files, `comments.json`, `checklist.json`), the import file schema v1, the `dp` commands, flags and exit codes, and the `/api/*` routes. Not promised: the look of the UI, `architecture/import/` review data, `.dp/` files, BMO prompts and the inside of an exported page. The snapshot of 28a is its enforcement; the file is regenerated once, here, and committed as the 1.0.0 baseline.
9. **Known limits in the README** (the owner chose no light theme): dark only; widths under 760 px unsupported; screen-reader support as far as the audit shows. Nothing in the README claims more than the audit found.

## Determinism

All computed: fixtures, snapshot, budgets and audits give the same result on the same input. Budgets are relative to a measured run, so they are stable across machines within a factor. Add rows to `docs/determinism.md`.

## Owner answers

- **2026-11-20:** add this wave, without the light theme (the second look at the waves).
- **Questions Q28.1 to Q28.3** were left to the assistant ("go with best reasoning for the rest", 2026-11-20): the recommendations below are adopted. Q28.1: a development-only accessibility checker plus a computed contrast check of the token pairs; Q28.2: budgets three times the first measured run; Q28.3: retract the Python 0.2 sentence unless a real 0.2 file turns up.

## Questions, options and answers

### Q28.1. Which accessibility checker?

**Options**
1. A development dependency that runs a well-known rule set inside Playwright (`@axe-core/playwright`). Development only: the server keeps its three runtime dependencies.
2. Hand-written checks: every button and field has a name, every dialog traps focus, landmarks exist, and the contrast of every colour pair in `tokens.css` is computed.

**Analysis.** Option 1 covers hundreds of rules and keeps up with them; it adds a development dependency (CI installs it, nothing ships). Option 2 has no dependency but covers a handful of rules and nobody keeps it up.

**Recommended.** Option 1, as a development dependency only, plus the contrast computation from option 2 for the token pairs (the rule set cannot see a colour that is set in a token file in every state). Stop and ask first if the owner reads "no new dependency" as including development dependencies.

**Owner's thinking:** *(delegated, 2026-11-20: the recommendation is adopted)*

### Q28.2. How are the time budgets set?

**Options**
1. Fixed numbers written into the tests.
2. Three times the time measured on the first run on the reference machine, written into the review file and into the test.

**Recommended.** Option 2: a fixed number fails on a slow CI machine and teaches people to ignore the test.

**Owner's thinking:** *(delegated, 2026-11-20: the recommendation is adopted)*

### Q28.3. The "files from the Python 0.2 version open unchanged" claim

**Options**
1. Keep it, and add a fixture folder from that version (the owner supplies one, or it is rebuilt from the old repository history).
2. Retract the sentence from the README.

**Recommended.** Option 2 unless a real 0.2 file is at hand. A promise without a fixture is the kind of claim the checklist exists to remove.

**Owner's thinking:** *(delegated, 2026-11-20: the recommendation is adopted)*

## Carried from the backlog (moved from planned_features.md, 2026-11-21)

- **Automated accessibility audit** (was B5; small to medium). Labels, focus and keyboard reach were checked by hand and only partly by tests. Part b of this wave, run after Wave 21 (0.14.0). [Source: review prod-p5.]
- **Light theme** (was B5; medium). The app is dark only (`color-scheme: dark` in `ui/src/styles/tokens.css`). Owner, 2026-11-20 (PRO-23): not in 1.0.0; the README says "dark only" (part b). The light theme stays later work. [Source: review prod-p5.]

## Stop and ask if

- A time budget fails because of a slow algorithm rather than a slow machine and the fix touches more than a few files (a separate plan, not a quiet rewrite inside this wave).
- The accessibility audit finds that canvas editing cannot be done by keyboard at all (that is a design question, not a fix).
- The audit needs a runtime dependency, or the owner reads the answer to Q28.1 as "no new dependency of any kind".
- A compatibility fixture does not round-trip byte for byte and the cause is a format change another wave made without a migration. Name the wave and the file; do not "fix" the fixture.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor (at the start of each part) | Explore · Haiku | `src/server/auth.ts` (`ROUTE_RULES`), `src/cli.ts`, `src/core/modelEdits.ts` header, `package.json` (`files`), `config/playwright.config.ts`, `tests/browser/fixtures.ts`, `ui/src/styles/tokens.css` | Anchors confirmed |
| 2 | **28a.** Compatibility fixtures and their test | general-purpose · Sonnet | `tests/fixtures/compat/0.6.0/` (from `git show` of the 0.6.0 release commit), `tests/unit/compat.test.ts` | Opens, checks, saves the same bytes, keeps unknown fields |
| 3 | **28a.** The public surface snapshot, its script and test | general-purpose · Opus | `scripts/surface.ts`, `tests/fixtures/surface.json`, `tests/unit/surface.test.ts`, `package.json` (script) | A new route or flag fails the test until the file is updated on purpose |
| 4 | **28a.** The large model, the budgets, one browser test | general-purpose · Sonnet | `tests/unit/largeModel.ts`, `tests/unit/scale.test.ts`, `tests/browser/scale.spec.ts` | Same model twice gives the same bytes; budgets set per Q28.2 and written down |
| 5 | **28a.** `scripts/check-package.ts` in `npm run ci`, and the docs of this part | general-purpose · Sonnet; docs by Haiku | `scripts/check-package.ts`, `scripts/ci-local.ts`, `.gitlab-ci.yml` (the same step), `tests/README.md`, README (Required in every wave), CONTRIBUTING | The check fails on a planted forbidden path and passes on the real package |
| 6 | **28b.** Automated audit over every screen and the exported file | general-purpose · Sonnet | `tests/browser/a11y.spec.ts`, `package.json` (dev dependency, Q28.1) | Every screen is audited; violations are fixed or listed with a test marker |
| 7 | **28b.** Fixes and the keyboard-only walk | general-purpose · Sonnet (Opus for canvas keyboard editing) | `ui/src/` as the findings say, `tests/browser/keyboard.spec.ts` | The main tasks run with the keyboard; focus traps hold; what cannot be reached is listed |
| 8 | **28b.** The stable surface: decision entry, CONTRIBUTING, regenerated snapshot, README known limits | general-purpose · Opus (the decision entry); Haiku (docs) | `docs/decisions.md`, `docs/CONTRIBUTING.md`, `tests/fixtures/surface.json`, `README.md` | The owner reads the decision entry; the snapshot is the 1.0.0 baseline |
| 9 | Tests by another agent for steps 3 and 5 | general-purpose · Sonnet | `tests/unit/` | Each guard is shown to fail when it should (a planted route, a planted path, a changed byte in a fixture copy) |
| 10 | Review, per part | main session | — | `/code-review` (high); `/security-review` for step 5 (what the package ships) |

Only one agent builds the UI or runs `cd ui && npm run build` at a time. Step 7 is the only step that changes `ui/`.

## Required in this wave

- **Routes.** None. The snapshot lists the routes that exist; it adds none.
- **Hub and read-only mode.** Not affected (tests and scripts).
- **Model data.** None. The fixtures are read-only copies; the test never writes into `tests/fixtures/` (it copies to a temporary folder first).
- **Windows.** The snapshot and the package check must give the same result on Windows (forward slashes in every path they print). Running on Windows stays an owner step (manual test plan U15; GitLab CI is Linux only, PRO-10).
- **Static export.** Not affected, except that 28b audits the exported page.
- **Security model.** Step 5 closes a gap: nothing outside the allowlist ships in the package.

## Tests

- **Fixtures.** Opens; `dp check` as recorded; no-op save is byte-identical; an unknown field survives an edit; self-diff is empty; the test works on a copy.
- **Surface.** The file matches on a clean tree; a planted route, a planted flag and a changed exit code each fail with the right message; `npm run surface:update` rewrites the file to the live state.
- **Scale.** The same arguments give the same model bytes; each operation is under its budget; the budgets are in the review file.
- **Package check.** Fails on a planted `local/` path and on a missing `static/index.html`; passes on the real package.
- **Audit and keyboard.** Every audited screen has no unlisted violation; each listed limit has its marker; each main task completes by keyboard; every dialog traps focus and closes with Escape.

## Docs

- **A new decision entry** (STK topic) for the stable surface and one for the compatibility rule, written in step 8 and step 2 (Proposals for the owner).
- **README:** known limits; **CONTRIBUTING:** the compatibility rule, the snapshot, the fixture per release, the package check; **`tests/README.md`**.
- **The 1.0.0 checklist:** tick only the boxes whose check ran, with the date and the result next to them; never on trust.
- **The review file** (not the CHANGELOG, which the release change writes): notes for the release entry, the measured times and budgets, and the audit's listed limits.
- **`docs/determinism.md`:** rows for this wave. **Manual test plan:** rows for U18 and U24 point at the new tests.

## Out of scope

- A light theme (the owner's answer, 2026-11-20: not in 1.0.0). A narrow-screen layout under 760 px.
- Windows CI, a hosted pipeline run (the checklist's items for the owner: manual test plan U7, U15, U16, U17).
- Real-world checks: a real provider run (Wave 1's gate), real tool links, real repositories (checklist section 4).
- Fixing a slow algorithm found by a budget, beyond a few files (a plan of its own).
- A screen-reader walkthrough by a person (the audit finds what a tool can find; the README says so).

## Start prompt

```
Run part <28a | 28b> of Wave 28 of the designPerspectives plan (28a is the guard rails:
fixtures, the public surface snapshot, the large model, the package check; 28b is the
accessibility audit and the stable-surface decision). Read docs/waves/README.md, then
docs/waves/wave-28-quality-for-1-0.md, and follow them for that part only: branch from main
as the header says, run the steps with the agents and models in the table, brief each
subagent with files and line ranges and the words "never run git stash, never push", run
the checks, update the docs, and commit by path. Stop and ask me if a "Stop and ask if"
condition is met or an answer this wave needs is missing.
```
