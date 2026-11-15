# Contributing to designPerspectives

Thanks for looking at the project. This file explains how to set up, check and send a change.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Read `docs/decisions.md` before you change a design choice. It records each decision and its trade-off. If your change makes a new choice, add an entry at the bottom.

## Setup

You need Node.js 20.11 or later.

```bash
npm ci
cd ui && npm ci
```

`npm ci` also builds `dist/` (the `prepare` script).

## Run it

Start the server on a sample model:

```bash
npm run dp -- serve --demo /tmp/dp-demo
```

To work on the browser UI, run the server and the UI dev server in two terminals:

```bash
npm run dp -- serve --demo /tmp/dp-demo   # terminal 1: API on 127.0.0.1:8765
cd ui && npm run dev                      # terminal 2: UI on :5173, proxies /api to the server
```

## Checks to run before a pull request

Run these from the repository root unless a line says otherwise.

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `cd ui && npm run build`
- [ ] `npx playwright install chromium` (once per machine)
- [ ] `npm run test:e2e`
- [ ] `npm run make-demo` (then commit any change in `demo/`)

CI runs the same checks on Ubuntu and macOS with Node 20 and 22.

## Rules that surprise people

- The built UI in `static/` is committed. After a UI change, run `cd ui && npm run build` and commit the new `static/` files, including the removal of old hashed files. CI fails if `static/` is out of date.
- `demo/` must be regenerated (`npm run make-demo`) when model code changes. CI fails if it is out of date.
- Everything is TypeScript. Do not add code in other languages.
- All edits to the model go through `src/core/ops.ts`. Routes in `src/server/app.ts` call it.
- New per-object data is stored as `dp.*` properties in the workspace file, not in new files.
- API response shapes live in `src/shared/types.ts`. The UI re-exports them, so `tsc` checks both sides.
- Do not name or compare other tools or products in repository files, commit messages or pull requests. Describe ideas in our own terms.
- Branch from `main`. Do not commit to `main`.

## Pull requests

Describe:

- what changed,
- why it changed,
- how you checked it (the commands above),
- screenshots or a short recording for any UI change,
- the decision entry in `docs/decisions.md`, if you made a design choice.

The pull request template lists these items.

## Where things are

`CLAUDE.md` has an Architecture section that maps each source folder and file to its job. `docs/README.md` indexes the rest of the documentation, including the decisions, the backlog and the stage reviews in `docs/reviews/`.
