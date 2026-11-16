# Open questions for the owner

Written 2026-11-16 for the 1.0.0 release work (branch `release/1.0`). This file collects every question still open in the stage reviews and in `backlog.md`, once each.

How to use it:

- Each question has a **Recommended** answer and its trade-off. The recommendations are interpretation, not sourced facts.
- Write under `Answer:` only where you disagree or want to add something. **An empty answer means the recommendation is used.**
- Part A changes code and is built in the next stage. Parts B to D are recorded in `decisions.md` and need no code.
- When the answers are applied this file is deleted; the outcomes live in `decisions.md`.

## A. Recommended answers that change the tool

### A1. Should a server on a network address refuse to start without sign-in? (Stage P1, question 3)
Today `dp serve --host 0.0.0.0` only prints a warning, and anyone who can reach the port can edit the model.
**Recommended:** yes. With a non-loopback `--host`, the server starts only if users exist (`dp users init`), or `--read-only` is given, or the new flag `--insecure` is given on purpose.
Trade-off: one more step for a quick demo on a trusted network; in return a stranger's first network deployment is not open by accident.
Answer:

### A2. Should mapping a component to a dot folder be refused when it is typed? (Stage P1, question 2)
Today a path such as `.github/workflows` is accepted and then silently finds no files, because hidden paths are off limits (DEC-031).
**Recommended:** yes, refuse with a clear message.
Trade-off: none of note; a model imported with such a path still loads, and `dp check` warns.
Answer:

### A3. Should engineers edit only the drafts they started? (Stage P4, question 1)
Today any engineer can edit or discard any draft.
**Recommended:** yes. Engineers edit and discard their own drafts and read all others; architects edit any. Without sign-in nothing changes.
Trade-off: two engineers cannot work in one draft; one of them asks an architect, or starts a second draft.
Answer:

### A4. Should accepted decisions be locked? (Decision records, question 3)
Today an accepted decision stays fully editable.
**Recommended:** yes. Once accepted, only the status, the supersede links, review dates and trigger ticks can change. Changing the substance means a new decision that supersedes the old one.
Trade-off: fixing a typo in an accepted decision needs an architect to set it back to proposed first; in return the record of what was agreed cannot change quietly.
Answer:

### A5. Should Ctrl/Cmd+click also add to the selection? (Stage P2, question 2)
Today only Shift does.
**Recommended:** yes, both.
Trade-off: none.
Answer:

### A6. Should a draft be comparable with the current main model, not only with its base? (Stage C, question 1)
**Recommended:** yes, a toggle on the draft strip: "against where it started" (default) or "against main now". The server already supports both.
Trade-off: one more control on the strip.
Answer:

### A7. Should the demo ship a sample draft and an example tag group? (Stage C, question 3; Stage A, question 4)
**Recommended:** yes to both, so drafts and tag overlays are visible on first run.
Trade-off: the demo folder is a little larger, and the tour gets two short steps.
Answer:

### A8. Should this repository's own CI run `dp check --strict` on the demo? (Stage C, question 5)
**Recommended:** yes.
Trade-off: a demo change that introduces a warning fails CI, which is the point.
Answer:

### A9. Should "Also write the planned code edits" be off by default when the draft has a branch? (Stage C4, question 1)
**Recommended:** yes. A draft with a branch means the code is being written there, so writing the planned edits into the working copy is usually wrong.
Trade-off: one extra tick for the person who does want it.
Answer:

### A10. Should the demo's made-up git history be optional? (Live data round 2, question 3)
Today it is written unless the folder is already inside a repository.
**Recommended:** add `dp serve --demo --no-history` and `dp init --demo --no-history`; the default stays as it is.
Trade-off: one more flag.
Answer:

### A11. Should the test runner get its major upgrade to clear the audit findings? (Stage P6 limits)
The findings are in development tools only and are not shipped.
**Recommended:** yes, before the release, so `npm audit` is clean for a contributor too.
Trade-off: a small risk of test-runner behaviour changes; the test suite itself shows them.
Answer:

### A12. Which version number does the first public release get? (new)
`package.json` says 1.0.0, but nothing was tagged or published, and a lot was added since.
**Recommended:** stay at 1.0.0 and fold everything on the branch into that changelog entry.
Trade-off: commit messages that say "release 1.0.0" refer to an earlier state than the tag.
Answer:

## B. Recommended "keep as it is"

Each line: the question, the recommendation, the trade-off.

1. **Allow the app to be framed in editor preview panes?** (P1 q1) No. Trade-off: no preview pane; clickjacking protection stays simple.
2. **Engineers file a proposed decision on main without a draft?** (Decisions q1) No; a decision is a model edit like any other. Trade-off: one more step for an engineer.
3. **Read full YAML in decision front matter?** (Decisions q2) No; keep the small fixed grammar with no dependency. Trade-off: hand-written files must follow it, and a file that does not is a load error.
4. **First run asks "empty or sample"?** (P2 q1) No; `dp serve` starts empty, `--demo` gives the sample, and the first-run card says so.
5. **List an empty system's context diagram in the sidebar?** (P2 q3) No; it is reached from the panel, the breadcrumb and double-click.
6. **Rebase a draft onto a newer main, and a merge editor?** (P3 q1, P4, Stage C) Not for 1.0.0; stays in the backlog. Trade-off: a conflict is fixed by changing one side by hand.
7. **`git config user.name` as the author without sign-in?** (P3 q2) Yes, it is a label, not an identity.
8. **12-hour idle session?** (P4 q3) Yes.
9. **Hide sensitive sections from viewers on the server?** (P4 q2) No; a lens stays a default view (DEC-008). Trade-off: a viewer can read costs and notes; teams that need secrecy keep such data out of the model. Stays in the backlog.
10. **Add palette collapsed at 1280 px?** (P5 q1) Yes, as now.
11. **Light theme?** (P5 q2, A3 q3) Not for 1.0.0; backlog. Trade-off: exports have a dark background.
12. **Rating targets, one-off and per-environment cost, a separate Status tab?** (A3 q1, q2, q4) Not for 1.0.0; backlog. The Lifecycle tag group covers status.
13. **Report layout conflicts in drafts?** (Stage C q2) No; the draft's layout wins.
14. **Is comparing stored models at git refs enough?** (Stage C q4) Yes, until the code import exists.
15. **Roll the model back when a code write fails on apply?** (C4 q2) Already so since Stage P1 (DEC-032).
16. **Own undo history for planned code edits?** (C4 q3) No; they are saved on every edit.
17. **"Update every copy" from the catalog page?** (Hub q2) Superseded: copies follow the catalog on their own (DEC-057).
18. **Require `DP_SECRET_KEY` before storing a credential?** (Hub q3) No, optional with a warning. Owner already said so on 2026-11-15.
19. **Tables drawable as components?** (Hub q5) No, a list. Owner already said so.
20. **Per-diagram hiding of elements?** (Stage A q2) Not for 1.0.0; backlog (DEC-010 is "open to revisit").
21. **Keep committing the built UI?** (Stage A q3) Yes. Settled by the choice to install from GitHub, which needs it.
22. **Linked work synced from GitHub?** (Release 0.2 q1) Built as an on-demand refresh (DEC-059).
23. **Add a connector from the palette by picking two ends?** (Release 0.2 q2) Backlog.
24. **Backtrack from real traces, explicit field lineage, a live trace collector?** (Live data round 2, q1, q2, q4) Backlog.
25. **Dialog button labels and wording right?** (Stage R q2) Kept unless you name one to change.
26. **Apply Prettier?** (Stage R q1, P6 q3) Done (commit 89fc176). Enforcing it in CI is added with A8.

## C. Stays in the backlog, no decision needed now

1. **Integrations from report files** (backlog section 3: CODEOWNERS, SARIF, coverage). Kept as planned items; none is built for 1.0.0.
2. **Jira or any tracker?** Any tracker: free-form links, with GitHub status as the one live integration. Revisit when a second tracker is asked for.
3. **GitLab or GitHub first for CI samples?** GitHub first; the GitLab sample stays, marked "not run".
4. **Code import (Stage B, DEC-051), the four "still open" items** (thresholds, who maintains the lookup list, where the ignore list is stored, one draft per container). Stay open until that stage is scheduled.
5. **Group storage and several groups per element** (DEC-021, DEC-025). Stay open with the groups work.

## D. Process and things only you can do

### D1. Git process for this repository (backlog, "Git process")
**Recommended:** branch from `main` for each change; one pull request per change, no stacks; a change that touches the UI rebuilds `static/` in the same commit, and one that touches the model or demo code regenerates `demo/` in the same commit (CI fails otherwise); commit messages say what changed in one line; the owner merges; releases are a `vX.Y.Z` tag on `main` plus a GitHub release.
Trade-off: large features wait in one long-lived branch instead of several reviewable ones.
Answer:

### D2. Checks that cannot be run here
- **Structurizr round trip** (Stage A q1): open `demo/architecture/workspace.json` in Structurizr's own tool and confirm elements, relationships and layout appear. Needs Docker or Java.
- **Windows**: `npm i -g github:AbhishekR3/designPerspectives`, then `dp serve --demo` in an empty folder.
- **CI on GitHub**: it did not start once because of an account billing lock; it must run green on the pull request.

Results or "skip for 1.0.0":

### D3. Anything else
Questions, or features you expected in 1.0.0 that are not listed in part A:
