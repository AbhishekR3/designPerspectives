# Review: rewrite in TypeScript (0.3.0)

Date: 2026-11-14. Baseline: Release 0.2.0 (`stage-a3-ui`, commit 6907105), Python 3.11+ / FastAPI backend, React UI.

## Decision

The owner asked for the project to be recreated in whichever language suits it best, at feature parity.
Chosen: **one TypeScript stack** — Node.js server ([Hono](https://hono.dev)), `dp` CLI ([commander](https://github.com/tj/commander.js)),
the existing React UI, and one shared API-types file (`src/shared/types.ts`).

| | TypeScript everywhere (chosen) | Keep Python + TypeScript UI | Rust (Tauri) + TypeScript UI |
|---|---|---|---|
| Languages in the repo | 1 | 2 | 2 |
| API contract | one file, checked by `tsc` on both sides | `ui/src/types.ts` copied by hand from Python responses | hand-copied or generated |
| Model rules usable in the browser later (offline, desktop) | yes, same code | no | via WASM |
| Code-level import scanning | Python imports need a hand-written scanner (no `ast`) | Python `ast` available | hand-written |
| Install | `npm install -g` (Node 20.11+) | `pipx install` (Python 3.11+) | native binary |
| Cost of the change | full backend rewrite | none | full rewrite, slower iteration |

The reasoning above is the author's assessment (not measured): the deciding factors were removing the hand-copied
API types and keeping the model rules reusable on the client.

## Module map

| Python (0.2) | TypeScript (0.3) |
|---|---|
| `workspace.py` (pydantic models) | `src/core/workspace.ts` (plain JSON + `toWorkspace` checks + ordered `dumpWorkspace`) |
| `sidecar.py` | `src/core/sidecar.ts` |
| `ops.py` | `src/core/ops.ts` (`prune` moved to `diagrams.ts`) |
| `diagrams.py`, `connectors.py`, `flows.py`, `validate.py` | same names under `src/core/` |
| `code.py` | `src/core/code.ts` (Python imports: tokenizer instead of `ast`) |
| `store.py` | `src/core/store.ts` |
| `server.py` (FastAPI) | `src/server/app.ts` (Hono) |
| `cli.py` (Typer) | `src/cli.ts` (commander) |
| `scripts/make_demo.py` | `scripts/make-demo.ts` |
| `src/designperspectives/demo/`, `static/` | `demo/`, `static/` |
| `tests/*.py` (pytest), `e2e/*.py` (pytest-playwright) | `tests/*.test.ts` (vitest), `e2e/*.spec.ts` (Playwright Test) |

## Parity evidence

1. **Ported tests.** Every pytest test was ported with the same assertions (one exception below), plus new ones:
   100 vitest tests pass (was 84 pytest tests); 22 browser tests pass (same 22 as before), 3 repeated runs in parallel, no failures.
2. **Side-by-side run.** The Python 0.2 server and the new server were started on two copies of the same demo
   project and given the same 39 requests (creates, renames, conflicting names, stages, styles, positions, layouts,
   tag-group renames, lenses, flows, characteristic renames, cost settings, duplicate, deletes, undo/redo, and requests
   that must fail), then every diagram was fetched. Every status code and response body matched, including the 422
   messages. Differences found, all expected: the project path in `/api/state`; stage and file boxes now include empty
   `cost`/`characteristics`/`work`/`costTotal`/`costRollup` fields; the saved files differ only in number formatting
   (`40` instead of `40.0`).
3. **Demo model.** `npm run make-demo` regenerates `demo/workspace.json` and `demo/designperspectives.json`
   byte-identical to the Python output apart from the same number formatting.
4. **UI bundle.** Moving the API types to `src/shared/types.ts` produced the same hashed bundle as before (type-only change).

The one test changed in meaning: `test_cli_validate` called the installed `dp`; it now runs the CLI from source and
also checks the exit code for a missing model (2).

## Behaviour changes

- Python import scanning uses a tokenizer (skips comments and string literals, handles parentheses, `;`, `\` line
  continuations and relative imports). Unlike `ast`, a file with a syntax error still shows its imports.
- Numbers are written as JavaScript writes them (`40`, `3`), so a project saved by 0.2 gets a one-time diff in
  `dp.cost` values, cost band limits and style widths the next time those objects are saved.
- Requests with a missing or malformed body return 422 `{"detail": "<message>"}`; FastAPI returned its own list format.
- `/api/docs` (FastAPI's generated page) is gone.

## Bugs found while testing, fixed

- **Row editors could drop typed input** (`ui/src/ObjectPanel.tsx`): the refresh after one row's save replaced the rows
  while the next field was being typed in, so the next save was skipped. Rows are no longer replaced while a text
  field or dropdown inside them has focus. Found because the faster server made the browser test fail intermittently.
- **Code-file conflict check** (`src/core/code.ts`): the file's modification time is the version token, compared with
  1 ms tolerance; two saves within 1 ms shared a token, so a stale editor could overwrite newer content. Each save now
  moves the time on by at least 10 ms when needed.
- **Browser-test race** (`e2e/fixtures.ts`): `openDiagram` could switch diagrams before the app's own first navigation
  and be overridden under load. It now waits for the app to be ready.

## Not verified here

- Windows (no Windows machine; the CLI's browser opening and paths were written for it but not run).
- Installing straight from GitHub (`npm install -g github:AbhishekR3/designPerspectives`) before the branch is merged;
  installing the packed tarball (`npm pack`) was tested, and CI repeats that on every run.
