# Wave 24: Remove a project from a hub

| | |
|---|---|
| **Status** | Planned 2026-11-20 from planned_features A3 (owner choice: "Remove from hub, plus an optional, separately confirmed step that also deletes the files"). The design is a Proposal. One question below carries a recommendation that holds if left blank. Ready to run |
| **Branch** | `feat/w24-remove-project`, from `main` |
| **Size** | M |
| **Release** | 0.7.0 (with Waves 1, 2, 25, 29) |
| **Depends on** | Nothing |
| **Owner items** | A new hub includes the demo project (DEC-082) and a person must be able to remove it, or any project, without editing a file by hand. [../planned_features.md](../planned_features.md) A3. Amends DEC-082 |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

An architect can remove a project from a hub in the UI: first "Remove from this hub" (unlisting, reversible), and, as a separate confirmation that names the folder, "also delete the files". The shared catalog and any unknown project cannot be removed. A removed demo can be added again from the new-project dialog.

## What exists today [Fact; anchors from planned_features A3, re-anchor first]

- `initHub` adds the demo project to a new hub (`src/server/hub.ts`, near lines 172 to 193). A single-project `dp serve` starts empty unless `--demo` is given (`src/cli.ts`, DEC-036).
- No `Hub` method, route, button or command removes a project. DEC-082 says it "can be removed by hand from `hub.json`".
- `Hub.addProject` and `POST /api/hub/projects` add one; the new-project dialog offers "Demo bank" as a template.
- The hub keeps one app per project (`apps` in `src/server/hub.ts`), each with a System Testing session that must be closed.
- Per-project roles are `Auth.projectRole` (users file `projects`, DEC-057); BMO settings have a per-project `projects` part in `.dp/bmo.json`.

## Design [Proposal]

1. **`Hub.removeProject(id, {deleteFolder})`.** Refuse the shared catalog and an unknown id. Close the project's app and System Testing session, drop its sync keys, rewrite `hub.json` (`writeHubFile`).
2. **`DELETE /api/hub/projects/:id`**, architects only, with a `ROUTE_RULES` entry in `src/server/auth.ts`.
3. **A Remove action on the home-page project cards**, with two confirmations ("Remove from this hub", then separately "also delete the files", which names the folder), using the `confirmDialog` pattern in `ui/src/pages/HomePage.tsx`.
4. **Guards for deleting files.** Only a folder inside the hub or the exact folder listed in `hub.json`; never follow a symlink; the folder must contain `architecture/`.
5. **Stale entries** in the users file and `.dp/bmo.json` (see Q24.1).

## Determinism

Computed: the guards are fixed rules and the result is listed before it happens. Nothing here is BMO's.

## Owner answers

The unlist-plus-optional-delete choice (planned_features A3, 2026-11-20).

## Questions, options and answers

### Q24.1. What happens to a removed project's entries in the users file and `.dp/bmo.json`?

**Options**
1. Leave them: harmless and stale; adding the project again with the same id picks up the old roles.
2. Clean them when the project is removed: more code and a second write that can fail half-way.
3. Leave them, and list them as "stale" in `dp check`.

**Recommended.** Option 1. A re-added project keeping its roles is a feature; the entries hold no secret.

**Owner's thinking:** *(blank: the recommendation holds)*

## Stop and ask if

- A project's folder is outside the hub and not the exact folder in `hub.json` (the delete step must refuse, not guess).
- A single-project server should also offer the demo from its home page (that is a different change).

## Steps and agents

| Step | Agent | Work |
|---|---|---|
| 1 | Explore · Haiku | Re-anchor `hub.ts`, `auth.ts`, `HomePage.tsx`; list tests that touch `hub.json` |
| 2 | general-purpose · Opus | `Hub.removeProject` and the file-deletion guards (data-loss logic) |
| 3 | general-purpose · Sonnet | The route, `ROUTE_RULES`, the UI action and dialogs; docs |
| 4 | general-purpose · Sonnet (a different agent from 3) | Tests; one agent builds the UI and runs browser tests |
| 5 | the wave agent | `/code-review` (high) and `/security-review`; fix findings |

## Required in this wave

- The `ROUTE_RULES` entry: architects only; viewers and engineers are refused.
- Works in a hub with per-project roles and refuses with `--read-only`.
- Deleting files never follows a symlink and never leaves the allowed folder; paths work on Windows.
- New UI can be reached with the keyboard.

## Tests

- Remove (files kept); remove with files deleted; the catalog refused; an unknown id; a folder outside the hub kept; a symlink not followed; a folder with no `architecture/` kept.
- Viewers and engineers are refused; `--read-only` refuses.
- After removing the demo, the new-project dialog adds it again.
- The removed project's testing session is closed (no listener left).
- Browser: remove from a project card, both confirmations, the card disappears.

## Docs

- **New DEC** (HUB topic, Projects): amends DEC-082 ("Now:" line). **README**, **CLAUDE.md** code map (`hub.ts`), **manual-test-plan**, **planned_features.md** A3: mark built.

## Out of scope

- Removing the shared catalog.
- Deleting a project from a single-project server.
- Moving or renaming a project.

## Start prompt

```
Run Wave 24 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-24-remove-project-from-hub.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
