# Review: Stage P6 — open-source readiness and release 1.0.0

Date: 2026-11-15. Branch: `prod-p6-release`. Baseline: Stage P5 (commit 1f36a45). Decisions: none new.

## What was built

| # | Item | Where |
|---|---|---|
| P6-1 | **Project files**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` (how to report a problem, and the threat model). | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` |
| P6-2 | **Issue templates** for bug, feature and config, and a **pull request template**. | `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md` |
| P6-3 | **README front page** rewritten: what it is, two screenshots, a three-command quick start from an empty folder, then the features. The screenshots are made from the demo model. | `README.md`, `docs/images/canvas.png`, `docs/images/draft-changes.png` |
| P6-4 | **Version 1.0.0**. The CHANGELOG `Unreleased` section becomes `1.0.0 — 2026-11-15`. | `package.json`, `CHANGELOG.md` |
| P6-5 | **Repo check**: the reference books and the research notes that name other tools are ignored by git, not tracked. The npm package ships only `dist`, `static`, `demo`, `README`, `LICENSE` and `NOTICE`. | `package.json` |

## How it works (one paragraph)

Version 1.0.0 is the first release for people outside the team. The project files, the issue and pull request templates, and the new README tell a new reader what the tool is, how to start it, and how to report a problem or send a change. The npm package holds only what a user runs. The reference books and the notes that name other tools stay out of git. Nothing has been pushed or published yet.

## How it was checked

- Since 0.3.0, the whole programme (stages C4, P1, R, P2, P3, P4, P5, P6) has taken vitest from 137 to 229 tests, and browser tests from 32 to 112.
- Lint was added and is clean. Typecheck is clean.
- Each stage has a review file in `docs/reviews/`.
- The same commands were run locally on macOS only. CI was not run on GitHub for these branches. Linux and Node 20 were not exercised.

## Limits

- `npm audit` is clean for the shipped dependencies. It still reports advisories in the test toolchain (development only, not shipped); fixing them needs a major upgrade of the test runner.
- Nothing is pushed or published. The branches are local and stacked: `stage-c4-code-changes` → `prod-p1-security-and-core-fixes` → `prod-r-refactor` → `prod-p2-from-scratch` → `prod-p3-drafts` → `prod-p4-login` → `prod-p5-layout-polish` → `prod-p6-release`. Pull requests, the npm publish and the git tag are the owner's steps.
- CI was not run on GitHub. Linux and Node 20 were not exercised.
- The sample CI jobs in `docs/examples/ci/` have not been run.
- Prettier is configured but not applied.
- Real-time collaboration is deferred by the owner.

## Questions for the owner

1. Should the work be merged as eight stacked pull requests, or as one?
2. Should 1.0.0 go to npm now, or first as a release candidate?
3. Should Prettier be applied before the release?

## Owner feedback

<!-- Please add feedback here. -->
