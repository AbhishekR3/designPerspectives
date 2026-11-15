# Working with planned changes (model first, then code)

How to plan an architecture change, agree it, build it, check the code against the plan, and
land model and code together. Everything here runs locally; git is the only collaboration tool.

## The pieces

| Piece | What it is | Where |
|---|---|---|
| **Draft** | A copy of the model you edit without touching the main model. Holds the planned model and, optionally, planned code edits. | `architecture/drafts/<id>/` (`workspace.json`, `designperspectives.json`, `base/`, `draft.json`, `code.json` + `code/`) |
| **Changes overlay** | Colours what a draft (or a git version) adds, changes and removes, down to code files and imports. | Dock → Changes; the strip above the canvas |
| **Coding plan** | The work the draft implies, per system and container, with an automatic progress check where the code can show it. | Strip → Coding plan…; `dp plan <draft>` |
| **Apply** | Merges the draft into the main model (and, if you want, writes its planned code edits). Undo restores the model only. | Strip → Apply… |
| **`dp diff`** | What changed in the model and in mapped code since a git ref, as Markdown for a pull request. | CLI / CI |

## The workflow

### 1. Plan the change in a draft

1. Sidebar → **Drafts → + New draft**. Give it a title after the change ("Add audit log") and, if you
   like, a description. The draft remembers who started it (your git `user.name`) and the date; both
   show in the list. The **⋯** menu on a draft (or right-click) renames it, edits its description or
   discards it.
2. Edit the diagrams as usual: add, connect, change technology, remove. The strip shows `+added ~changed −removed`.
3. **Map new objects to code**: in the object panel, add the code paths the new component or container
   will live in (a file or a folder, even if it does not exist yet). Without code paths, the plan can
   only list the step; with them, it can check it.
4. Optional: **sketch code inside the draft**. Open a mapped file from a code diagram (double-click a
   file box) and edit it, or use **+ New planned file** in the code panel or in the object panel's
   Code section (for a new component with no code path yet: the file is planned and its path added to the
   object in one step). These edits are saved in the draft (`code/`), not in your code folder. They show as changed/added files on the code diagram.
   Use this for interfaces, skeletons or examples, not for whole features.

### 2. Agree it

- Commit the draft folder on a branch and open a pull request: reviewers see the draft's files, and
  can open the draft in the app (Drafts → the draft) to see the overlay.
- Or share the coding plan: strip → **Coding plan… → Copy Markdown**, or
  `dp plan <draft> --out PLAN.md`.

### 3. Build it

1. In the coding plan, set the **Branch** the code will be written on (e.g. `feature/audit-log`).
   It is saved in `draft.json`.
2. Write the code on that branch, by hand or with a coding agent; the plan's Markdown is a good brief.

### 4. Check the code against the plan

- In the app: **Coding plan… → Check against: Branch …** (or the code folder, if the branch is checked out).
- On the command line: `dp plan <draft> --against feature/audit-log`, or `dp plan <draft> --check`
  for the working copy. Exit code 1 while steps are open, so it can run in CI.

What is checked automatically:

| Step | Done when |
|---|---|
| Build a mapped object | its code paths exist (a folder needs at least one source file) |
| Remove a mapped object | its code paths are gone |
| Connect A → B (both mapped) | some file of A imports some file of B (Python and JS/TS relative imports) |
| Disconnect A → B | no such import is left |
| Planned code edit | the file exists / was changed / is gone (matching the planned content is reported, not required) |

Technology changes, protocols, flows and unmapped objects are listed **to check by hand**. Model-only
changes (descriptions, tags, cost, ratings, owners) need no code work and are listed separately.

### 5. Land model and code together

1. When the plan is done, open the draft and **Apply…**.
   - If you wrote the code on the branch, **untick "Also write the planned code edits"**: only the
     model changes are applied. (Planned edits whose files you already changed would otherwise be
     reported as conflicts.)
   - If the draft's planned code edits are the code (small changes), leave it ticked: the files are
     written to the code folder. A file changed in the code folder since it was planned is a conflict
     and nothing is applied.
2. Commit `architecture/` with the code. Applying removes the draft folder, so the commit shows the
   draft disappearing and the model changing.
3. In the pull request, `dp diff --base origin/main` (see `docs/examples/ci/`) summarises the model
   and code changes for reviewers; `dp check` fails the build on model problems.

## Rules of thumb

- **One draft per change.** Drafts merge object by object; two drafts touching the same object
  conflict when the second is applied.
- **Keep the main model current.** The draft remembers the main model it started from (`base/`), so
  main can keep changing; only objects changed on both sides conflict. A muted **main +N** next to a
  draft (in the list and on the strip) says main changed N objects since the draft started; Apply merges
  them and shows conflicts first.
- **Map early.** Code paths on new objects are what turn plan steps from "check by hand" into checked.
- **Draft code is a sketch.** Real implementation belongs on the branch; the plan checks the branch.

## Limits

- The check sees files and imports only (no deeper code scan until Stage B). Calls through HTTP,
  queues or dependency injection are not imports, so such connections are checked by hand.
- A draft's planned code edits are compared with the code folder as it is now, not as it was when the
  draft started.
- Undoing an apply restores the model, not the code files it wrote, and not the deleted draft.
