# Review: Stage P1 — security and core fixes

Date: 2026-11-14. Branch: `prod-p1-security-and-core-fixes`. Baseline: Stage C4 (commit c6db32f). Decisions: [DEC-030](../decisions.md), [DEC-031](../decisions.md), [DEC-032](../decisions.md).

## What was built

| # | Item | Where |
|---|---|---|
| P1 | **Host check**: when bound to loopback, the Host header must be `localhost`, `127.0.0.1` or `[::1]`. `dp serve --allow-host <name>` adds names. A non-loopback `--host` turns the check off and prints a warning. | `src/server/app.ts`, `src/cli.ts` |
| P1 | **Change protection on `/api/*`**: changes are refused (403) when Origin is not the server's own or Sec-Fetch-Site is cross-site. A body must be JSON (415 otherwise) and at most 5 MB (413 otherwise). | `src/server/app.ts` |
| P1 | **Response headers**: Content-Security-Policy (own origin, inline styles allowed), X-Frame-Options DENY, nosniff, no-referrer. | `src/server/app.ts` |
| P1 | **Error handling**: unexpected errors return "Internal error. See the server log."; the detail goes to the log. A malformed `%` in a static path returns 400. | `src/server/app.ts` |
| P1 | **Hidden paths**: names starting with a dot are never read, written, listed or planned, in the code folder, in drafts or in git versions. Symlinks to them are refused. Code writes are capped at 1 MB. | `src/core/codefs.ts`, `src/core/code.ts`, `src/core/drafts.ts`, `src/core/plan.ts` |
| P1 | **All-or-nothing apply with code**: code files are written first with a backup of each, then the model, then the draft is deleted. A failed write or model step restores everything and keeps the draft. | `src/core/drafts.ts` |
| P1 | **Duplicates**: a model that already has duplicates accepts edits that do not add one. `addedErrors` compares counts; validation messages carry a count from three up. | `src/core/validate.ts`, `src/core/ops.ts` |
| P1 | **Copying an element** no longer copies code paths or work items. | `src/core/ops.ts` |
| P1 | **Pruning**: styles and layout entries for `file:` keys are removed when no object maps that path. | `src/core/store.ts` |
| P1 | **Parent/child relationships**: validation reports a relationship between an element and its own parent or child. | `src/core/validate.ts` |
| P1 | Tests: `tests/security.test.ts` (14 tests), two apply-rollback tests, and updates to existing unit tests. | `tests/security.test.ts`, `tests/*.test.ts` |

## How it works (one paragraph)

Every request passes through one middleware in `src/server/app.ts`. When the server is bound to loopback, the Host header must name a loopback address or a name added with `--allow-host`. Requests that change `/api/*` must come from the server's own origin, must not be cross-site, and must carry a JSON body within 5 MB. Every response gets the same security headers. Hidden paths are blocked in one place, the code reader and writer in `src/core/codefs.ts`, so the code diagram, drafts, the coding plan and git versions all share the rule. Apply in `src/core/drafts.ts` keeps a backup of each code file, writes the code, writes the model, and deletes the draft last; any failure before the draft is deleted restores the backups.

## How it was checked

- Tests: 160 vitest tests pass (138 before), including the 14 new security tests and the two apply-rollback tests.
- 32 browser tests pass.
- `npm run typecheck` is clean.
- `npm run make-demo` leaves `demo/` unchanged. There is no UI change, so `static/` is unchanged.
- A code review pass found three problems, fixed before commit: the duplicate wording refused edits that reduced duplicates; non-normalised mapped paths (`./src/api`) lost their code-diagram layout; there was no way to allow extra host names (added as `--allow-host`).

## Limits

- No login. A non-loopback bind is only protected by the warning.
- The Host check and the origin check do not stop a local program or a user on the same machine.
- Hidden paths are blocked by name only. Secrets with ordinary names (for example `config/secrets.yaml`) are not covered.
- A component cannot be mapped to a dot folder such as `.github/workflows`.
- Apply restore is best effort: content and permissions come back, modification times do not, and a failed restore is logged. A crash between the steps is not covered. Deleting the draft is not rolled back.
- Duplicates can be repaired only one at a time.
- Self-relationships are not flagged, because imported workspaces may contain them.
- No kind or nesting check. The file format already makes that impossible.
- Scripts that call the API must send `Content-Type: application/json`.
- The UI cannot be embedded in a frame, including editor preview panes.

## Questions for the owner

1. Should framing be allowed for editor preview panes? That would mean relaxing `X-Frame-Options` and the CSP for those hosts only.
2. Should mapping a component to a dot folder be refused at edit time, instead of silently finding no files?
3. Should a non-loopback `--host` require a login before it starts, rather than only printing a warning?

## Owner feedback

<!-- Please add feedback here. -->
