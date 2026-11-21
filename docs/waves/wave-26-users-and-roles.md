# Wave 26: Users and roles in the UI

| | |
|---|---|
| **Status** | Planned 2026-11-20 from planned_features A5. The design is a Proposal. Three questions below carry recommendations that hold if left blank. Ready to run |
| **Branch** | `feat/w26-users-page`, from `main` |
| **Size** | M |
| **Release** | 0.8.0 (with Waves 3, 16, 4, 27); run **before Wave 16**, so "anyone can attach" has people to attach |
| **Depends on** | Nothing |
| **Owner items** | Feature E of [../product-vision.md](../product-vision.md) ("different accounts adding notes, images and files"): only architects change things by default, and architects must be able to give other people other roles, which today works only on the command line. Local accounts for 1.0.0 (D2, DEC-100). [../planned_features.md](../planned_features.md) A5 |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

An architect manages users from a Users page: add, set a role, set a role per hub project, remove, with the same rules as `dp users`. The command line stays for first set-up and CI.

## What exists today [Fact; anchors from planned_features A5, re-anchor first]

- With sign-in off, every request acts as architect (`src/server/auth.ts`). With sign-in on there are three roles: architect, engineer and viewer (DEC-041). In a hub there is also a role per project, which can be `none` (the project is hidden; DEC-057).
- Users are managed only with `dp users init|add|passwd|remove|role|list`. `dp users add` requires `--role`; there is no default.
- BMO settings and integration settings are changed by architects only.
- There is no users route in the API and no Users page in the UI. The users file is read by `src/core/users.ts`.

## Design [Proposal]

1. **Users routes** (architects only): list, add, set role, set project roles, set password, remove. They call the same functions as `dp users`, so the rules (last architect cannot be removed or demoted, valid roles, password rules) live in one place.
2. **A Users page** (architects only), reached from the user chip and the Credentials page area.
3. **A guard** that an architect cannot remove or demote the last architect, in the core function and in the UI.
4. **Passwords** are set through the page and never returned or logged; hashes stay scrypt (DEC-041).

## Determinism

Computed: roles and rules are fixed. Nothing here is BMO's.

## Owner answers

Local accounts now, hosted later (D2, DEC-100).

## Questions, options and answers

### Q26.1. Default role for a new user

**Options**
1. Viewer.
2. Engineer.
3. No default: the page makes the architect choose (as `dp users add` does).

**Recommended.** Option 3 on the command line (unchanged) and **viewer preselected** on the page: the safe choice, still visible and one click to change.

**Owner's thinking:** *(blank: the recommendation holds)*

### Q26.2. What does the page show when sign-in is off?

**Options**
1. A short explanation and a button that creates the first architect and turns sign-in on.
2. Only an explanation that points to `dp users init`.

**Recommended.** Option 2 for now: turning sign-in on from the page is a lock-out risk on a remote host (DEC-063); the command keeps it deliberate.

**Owner's thinking:** *(blank: the recommendation holds)*

### Q26.3. Should sign-in be on by default?

**Recommended.** No. It stays off for a local, loopback-only server (DEC-041, DEC-063) and is required for a non-loopback host, as today.

**Owner's thinking:** *(blank: the recommendation holds)*

## Stop and ask if

- The page would let someone lock themselves out (no architect left) in a way the guard cannot prevent.
- A route would return a password, a hash or a session.

## Steps and agents

| Step | Agent | Work |
|---|---|---|
| 1 | Explore · Haiku | Re-anchor `auth.ts`, `users.ts`, the `dp users` code in `cli.ts` |
| 2 | general-purpose · Opus | The routes and `ROUTE_RULES` (sign-in and roles are a hard part), the last-architect guard |
| 3 | general-purpose · Sonnet | The Users page, dialogs, the hub-project role editor |
| 4 | general-purpose · Sonnet (a different agent from 2 and 3) | Tests |
| 5 | the wave agent | `/code-review` (high) and `/security-review`; fix findings |

## Required in this wave

- Every route has a `ROUTE_RULES` entry; all of them are architects only.
- Works in a hub with per-project roles (DEC-057) and refuses with `--read-only`.
- No response, log line or error contains a password or hash.
- New UI is keyboard reachable; the page is hidden for non-architects.

## Tests

- Each route: architect allowed, engineer and viewer refused, sign-in off handled as in Q26.2.
- The last architect cannot be removed or demoted, by route or by the page.
- Role per project including `none`; a user with `none` does not see the project.
- A password set on the page signs in; no response carries the password or hash.
- The page and `dp users` give the same result on the same input (shared function).
- Browser: add a user, change a role, remove a user.

## Docs

- **New DEC** (SEC topic, Sign-in and roles). **README**, **CONTRIBUTING** security model, **CLAUDE.md** code map, **manual-test-plan**, **planned_features.md** A5: mark built; A6 stays the later hosted entry.

## Out of scope

- Hosted accounts and OpenID Connect (A6, after 1.0.0).
- Password reset by e-mail, sign-up, organisations.
- Turning sign-in on from the page (Q26.2, unless the owner chooses option 1).

## Start prompt

```
Run Wave 26 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-26-users-and-roles.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
