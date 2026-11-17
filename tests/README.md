# Tests

There are two kinds of tests. Both check the same product, but they run in different ways, so each has its own folder and runner.

| Folder | Runner | What it runs | Speed | Needs |
|---|---|---|---|---|
| `unit/` | Vitest (`npm test`) | The code in Node, with no browser: model rules, diagrams, drafts and merges, the HTTP API (called in-process with `createApp(...).request()`, no network), and the `dp` command line | About 15 seconds | Node; `git` for the tests that compare versions (they skip themselves without it) |
| `browser/` | Playwright (`npm run test:browser`) | The real app: each test starts a server on a free port, opens Chromium and clicks through the UI like a person would | Several minutes | The built UI in `static/` (`cd ui && npm run build`) and Chromium (`npx playwright install chromium`); the tests skip themselves without the built UI |

Shared helpers: `unit/helpers.ts` (a copy of the demo project, an API client), `unit/importFixture.ts` (a small codebase for the code import tests), and `browser/fixtures.ts` (the `server` and `page` fixtures, `openDiagram`, `waitUntil`).

## The list of every test: `TESTS.csv`

[`TESTS.csv`](TESTS.csv) has one row per test, and opens in Excel, Numbers or Google Sheets. Its columns:

- **File**, **Kind** (Unit, API, CLI or Browser), **Area** and **Group** (the `describe` block).
- **Test (what it checks)**: the test's title, written as a sentence.
- **Runs when**: `always`, or the condition (for example, only when git is installed), or the list a test repeats over. A test written once inside a loop runs once per item, so the runners count more tests than the sheet has rows.
- **File purpose**: the one-line comment at the top of the test file.
- **Source files covered**: the files under `src/` and `ui/src/` that the test file imports.
- **Needs** and **Run this test alone** (a command you can paste).

The sheet is generated from the test files, so do not edit it by hand. After you add, rename or remove a test, run `npm run test:list` and commit the result. CI fails when it is out of date. Every test file must start with a `/** ... */` comment that says what it covers.

## Running tests

```bash
npm test                                             # every unit, API and CLI test
npm test -- tests/unit/drafts.test.ts                # one file
npm test -- tests/unit/drafts.test.ts -t 'renames'   # tests whose title matches
npm run test:browser                                 # every browser test
npm run test:browser -- tests/browser/drafts.spec.ts -g 'apply'
```

The runners' settings are in `config/vitest.config.ts` and `config/playwright.config.ts`.
