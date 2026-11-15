# Review: Stage P4 — optional sign-in with three roles

Date: 2026-11-15. Branch: `prod-p4-login`. Baseline: Stage P3 (commit cd79387). Decisions: [DEC-041](../decisions.md). Amends [DEC-001](../decisions.md) and [DEC-006](../decisions.md); DEC-008 is unchanged.

## What was built

| # | Item | Where |
|---|---|---|
| P4-1 | **Users file**: `.dp/users.json` with scrypt hashes, owner-only permissions, `.dp/` added to `.gitignore`. Off when the file is absent. A malformed file stops `dp serve`. | `src/core/users.ts`, `src/server/context.ts` |
| P4-2 | **`dp users`**: `init` (three users, random passwords printed once), `add --role`, `passwd`, `remove`, `list`; `--password-stdin`; `dp serve --users <file>`. | `src/cli.ts`, `src/core/users.ts` |
| P4-3 | **Sessions**: HttpOnly, SameSite=Strict cookie named per port; in-memory session, 12 hours idle; a restart signs everyone out. Five failed sign-ins lock a name for 30 seconds. | `src/server/auth.ts` |
| P4-4 | **Role rules on the server**: a rule for every changing route. A route with no rule is Architect-only, and a test fails for a new route with no rule. | `src/server/auth.ts`, `tests/auth.test.ts` |
| P4-5 | **Drafts record the signed-in user** as author. | `src/core/drafts.ts`, `ui/src/ChangesPanel.tsx` |
| P4-6 | **Sign-in page and user chip**: role and Sign out. | `ui/src/SignIn.tsx`, `ui/src/UserChip.tsx`, `ui/src/App.tsx` |
| P4-7 | **Role-based UI**: default lens by role (Architect, Engineer, Overview for viewers), remembered per user and project; anyone may still switch lens. Engineer on main sees "Start a draft". Viewer sees "View only". Controls a role cannot use are hidden. | `ui/src/useLens.ts`, `ui/src/Sidebar.tsx`, `ui/src/Dock.tsx`, `ui/src/menus.ts` |
| P4-8 | **Read-only side panels**: a real read-only mode, which was missing even for git versions. | `ui/src/panels/*.tsx`, `ui/src/fields.tsx`, `ui/src/FlowPanel.tsx` |
| P4-9 | **No dragging in read-only views**: boxes cannot be moved or resized when read-only. | `ui/src/Canvas.tsx` |
| P4-10 | **Session expiry**: an expired session returns to the sign-in page, then to the same diagram. | `ui/src/api.ts`, `ui/src/App.tsx` |
| P4-11 | **Hardening after code review**: nine weaknesses found and fixed, each with a test (see below). | `src/core/users.ts`, `src/server/auth.ts`, `src/server/context.ts` |

## How it works (one paragraph)

Sign-in is off unless `.dp/users.json` exists, so existing projects see no change. With the file, every request is checked against a role table on the server. The table has a rule for each changing route; a route with no rule is Architect-only. Engineers can create and edit drafts but cannot change the main model, write code files or apply a draft. They can discard only the drafts they started. Viewers change nothing. Lenses pick the default view and never hide data. The browser reads the role from the session and hides controls the role cannot use, but the server is the real check. Passwords are stored as scrypt hashes. Sessions are kept in memory.

## Hardening found in review

The code review of the sign-in code found nine weaknesses. All are fixed, each with a test, before the commit:

1. The lockout could be bypassed with parallel requests.
2. Repeated attempts could keep a user locked out.
3. Failures on other names could reset a lockout.
4. A users file made invalid while the server ran left sign-in off.
5. A half-saved users file signed everyone out for good.
6. One user signing in repeatedly could evict other users' sessions.
7. Unknown API paths returned 403 instead of 404.
8. The check that the users file is outside the code folder could be bypassed with a symlink.
9. Oversized hash parameters could exhaust memory.

## How it was checked

- Lint and typecheck are clean.
- 229 vitest tests pass (194 before). They include the full role table for the three roles on main and in a draft.
- 88 browser tests pass (78 before), run twice. They cover the sign-in flow, a viewer tour that sends no changing request, the engineer and architect flows, session expiry and the per-user lens.
- The demo model is unchanged by `npm run make-demo`.
- The UI build is committed.

## Limits

- Not real-time. If two users edit the same thing, the last write wins. The other user sees it when their window regains focus (DEC-039).
- Undo history is per model version, not per user. An architect's undo can undo another architect's edit.
- Sessions are lost on restart.
- Passwords travel in clear text unless the server is behind HTTPS. On a network, use a TLS proxy.
- Lenses do not hide data. A viewer can read costs and notes through the API.
- `dp users` commands must not run in parallel.
- Roles are fixed. There are no custom roles.

## Questions for the owner

1. Should engineers be limited to editing only their own drafts?
2. Should a viewer's lens hide sensitive sections on the server? This would change DEC-008.
3. Is a 12-hour idle session right?

## Owner feedback

<!-- Please add feedback here. -->
