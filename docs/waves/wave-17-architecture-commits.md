# Wave 17: Architecture commits

| | |
|---|---|
| **Status** | Owner answer applied (questions C1, 2026-11-19: yes, opt-in commit on apply). Ready to run |
| **Branch** | `feat/w17-architecture-commits`, from `main` |
| **Size** | M |
| **Release** | 0.11.0 (with Waves 9, 11, 18, 19) |
| **Depends on** | Nothing hard. **Run after [Wave 18](wave-18-drafts-keep-up.md)** (the second look at the waves, 2026-11-20, made this the rule; the old run order had 17 first). Both change `Drafts.apply` (`src/core/drafts.ts`): Wave 18b changes what undo of an apply does (it brings the draft back), and this wave's commit-on-apply hook and its undo notice (design item 10) describe that behaviour. Built in this order, the hook and the notice are written once against the final undo; built the other way round, Wave 18b rewrites them. A draft that was rebased (18a) must still build a commit message from its title and description |
| **Owner items** | Feature I of [../product-vision.md](../product-vision.md): "git-style commits for software architecture" |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

An architect can turn an architecture change into a git commit from inside dp, with a message that says what changed, and can switch on "commit when a draft is applied". Branch, diff, merge and log already exist in dp (drafts, the change list, apply, History); this adds the missing "commit with a message". dp never pushes.

## Owner request covered

> I. Git style commits for software architecture
> C1: Yes [option 2: commit on apply, opt-in, off by default]

## What exists today [Fact]

- **dp only reads git** (DRF-05). `src/core/git.ts` has read functions: `findRepo`, `resolveRef`, `GitModels`, `logFor`, `uncommitted`, `gitUserName` (`:20-303`). The History page and `dp diff --base` use them (DRF-06, `src/core/history.ts`).
- **A draft is the branch, apply is the merge** (DRF-01). `Drafts.apply` (`src/core/drafts.ts:336`) merges, writes code files first and the model second, with rollback (DRF-02), and is one undo step on main. A draft records its author (DRF-03). Drafts are folders meant to be committed.
- **`uncommitted(project, models)`** (`history.ts:35`) already summarises what is not committed.
- **`dp diff`** writes a Markdown summary of model changes (`src/core/cliReports.ts`).
- **Roles.** Apply is architect-only (`src/server/auth.ts`). A route with no `ROUTE_RULES` entry is architect-only.
- **dp never commits catalog copies** (owner choice, HUB-07).

## Design [Proposal]

1. **A write module, kept apart from the readers** (`src/core/gitCommit.ts`, new). One function: commit given paths with a given message. `git.ts` stays read-only, so DRF-05's reading code keeps its guarantee. DRF-07 (already written) amends DRF-05: dp may commit, on request or by a setting, and nothing else.
2. **What is committed.** Only paths under the project's model folder (`architecture/`), as `git commit -m … -- <paths>` through `execFile` with an argument list (no shell). That commits those paths only, whatever else is staged. Nothing outside the folder; never `git add -A`.
3. **What is never done.** No push, no amend, no `--no-verify`, no branch switch, no reset, no stash. The repository's own hooks run, as for any commit; a failing hook is reported as the reason, and nothing is retried.
4. **Refusals, each with a plain reason:** no repository; a merge, rebase or cherry-pick in progress; nothing to commit; git or its identity (`user.name`, `user.email`) missing; the folder not inside the repository's work tree; read-only mode.
5. **The message** is built in code from fixed parts, so it is byte-stable:
   - first line: `Architecture: <draft title>` (or `Architecture: <your text>` for a manual commit), cut to 72 characters, control characters removed;
   - a body: the draft's description, then the change list as a short summary (counts by kind, and each changed object's name), like `dp diff`;
   - trailers: `Draft: <id>` and `Applied-by: <signed-in user>` when sign-in is on.
   - The suggested message is shown and can be edited before a manual commit.
6. **Commit when a draft is applied** (setting, off by default). After a successful apply, dp commits the files the apply wrote under `architecture/` (and nothing else; code files are never committed by dp). If the commit is refused, the apply still stands; the refusal is shown, and the changes stay uncommitted.
7. **A manual commit.** A "Commit…" button on the History page, next to the "not committed yet" summary: shows the summary and the suggested message, commits on Enter or click. Architects only.
8. **Settings.** `.dp/commit.json` (mode 0600, outside git, changed by architects only, like `.dp/bmo.json`): `{commitOnApply: false}`. It is per machine because identity and habits are.
9. **CLI.** `dp commit [-m MESSAGE] [PATH]` (refuses with the same reasons) and `dp commit --on-apply on|off`.
10. **Undo.** Undo after a committed apply changes the working files and leaves the commit alone. The UI says so ("this change is committed; undo makes a new uncommitted change"). dp does not rewrite history.
11. **Hub.** Per project; roles are per project (HUB-07).

## Determinism

| Output | Class |
|---|---|
| The message, the paths, the refusals | computed |
| Nothing here uses BMO | — |

## Owner answers

- **C1:** yes. Option 2: commit on apply, opt-in, off by default, amending DRF-05. A manual commit is included.
- Open (assumed, change if wrong): the commit covers the whole `architecture/` folder (model, decisions, drafts, reference, attachments, import review files), not `.dp/`.

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in PRO-20.*

### ★C1. What are "git-style commits for software architecture"?

**Analysis** [Fact]
- dp reads git and never writes it (DRF-05). The History page lists the commits that changed a model and what each changed (DRF-06, `src/core/history.ts`). `dp diff --base <ref>` summarises changes since a ref.
- A draft is a copy of the model (like a branch). Applying it is a three-way merge and one undo step on main (DRF-01, DRF-02). A draft records its author (DRF-03).
- So today: branches (drafts), diff, merge (apply) and log (History) exist. A commit with a message, made by dp, does not. Making one means changing DRF-05.

**Options**
1. **Keep git read-only.** History stays as built. Add a suggested commit message from the change list, so a person commits with git themselves. Nothing in DRF-05 changes.
2. **Commit on apply, opt-in.** An architect can switch on "commit when a draft is applied". dp commits only `architecture/` with a message built from the draft's title and description, never pushes, never touches other files. Off by default.
3. **dp's own commit log, separate from git.** A message, an author and a date kept in the model, with revert. This duplicates git and drifts from it.

**Recommended.** Option 2. It makes "draft → apply" read as "branch → commit" without a second history. It needs a decision entry that amends DRF-05, a check that the working tree has no other staged changes, and a refusal when git is missing or the folder is not a repository. If you want git to stay read-only, take option 1.

**Owner's thinking:** Yes.

**Applied [2026-11-19].** Option 2. New [Wave 17](wave-17-architecture-commits.md): an opt-in "commit when a draft is applied", plus a manual Commit button and `dp commit`. dp commits only `architecture/`, never pushes, amends or skips hooks. DRF-07 amends DRF-05.

## Stop and ask if

- Anyone asks for push, amend, rebase, branch creation or revert.
- The commit would need to include anything outside the model folder.
- A signed-in user's identity should become the git author (it needs a way to prove it; today it is a trailer only).

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files in "What exists today" | Anchors confirmed or corrected |
| 2 | `gitCommit.ts`, refusals, message builder | general-purpose · Opus | `src/core/gitCommit.ts` (new), `history.ts` (summary reuse), `cliReports.ts` | No shell; paths confined; every refusal tested against a real temporary repository |
| 3 | Routes, settings, apply hook, `dp commit` | general-purpose · Opus | `src/server/routes/` (a `commit` area), `src/server/auth.ts`, `drafts.ts` apply, `src/cli.ts`, settings reader | Apply commits only when set; a refusal never undoes an apply |
| 4 | UI: Commit button, setting, undo notice | general-purpose · Sonnet | `ui/src/pages/HistoryPage.tsx`, the settings page, `ApplyDialog.tsx` | Keyboard reachable; refusals shown in words |
| 5 | Tests (not the authors of 2 to 4) | general-purpose · Sonnet | `tests/unit/git-commit*.test.ts`, `cli-commit.test.ts`, `tests/browser/commit.spec.ts` | As listed below |
| 6 | Docs | general-purpose · Haiku | decisions.md, the review file (notes for the release entry, not the CHANGELOG), CONTRIBUTING (security model), CLAUDE.md, README | All docs updated |
| 7 | Review | main session | — | `/code-review` (high) and `/security-review` findings fixed |

## Required in this wave

- **Routes.** Each new non-GET route has a `ROUTE_RULES` entry (architect). A test fails otherwise.
- **Hub and read-only.** Per-project roles apply; read-only refuses.
- **Security model.** In CONTRIBUTING: dp may run `git commit` on request, never push, uses argument lists, and respects hooks.
- **Model data.** None added, so no units or diff labels.
- **Windows.** The git CLI is used as for reading; paths are passed as arguments.
- **Static export.** Not affected.

## Tests

- In a temporary repository: a manual commit contains only `architecture/` paths even when another file is staged.
- Refusals: no repo, nothing to commit, merge in progress, missing identity, read-only, an engineer.
- A hostile draft title (newlines, `--flags`, very long) gives a safe, cut message; no argument injection.
- A failing pre-commit hook is reported and the apply stands.
- The message is byte-identical for the same input.
- Commit-on-apply off by default; on, one commit per apply with the trailers.
- `dp commit` matches the route's behaviour.

## Docs

- **decision entry:** DRF-07 already records the decision. Add a new entry only if the build changes it.
- **The review file** (not the CHANGELOG, which the release change writes): entries. **README:** the History paragraph. **CLAUDE.md:** `gitCommit.ts`.
- **docs/determinism.md:** a row.

## Out of scope

- Push, amend, revert, branches, tags.
- Signing commits.
- Committing code files.

## Start prompt

```
Run Wave 17 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-17-architecture-commits.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
