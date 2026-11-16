# Review: sample data, the live UI inspector, traces and backtracking

Date: 2026-11-15. Branch: `demo-prod-model` (uncommitted, on top of the demo work in progress). Baseline: commit 89fc176. Decisions: DEC-043 to DEC-048. Two rounds: round 1 (sample data, the inspector) comes first; round 2 (owner feedback, traces, backtracking, demo) is at the end.

## What was built

| # | Item | Where |
|---|---|---|
| L1 | **Sample data on relationships and stages.** `dp.example` and `dp.format` on a relationship, `example` and `format` on each stage in `dp.stages` (the data leaving that stage). Blank lines at the ends are dropped. At most 8,000 characters. Drafts list them as "Example data" and "Data format". | `src/core/ops.ts`, `src/core/diff.ts`, `src/shared/types.ts` |
| L2 | **Data through a connector.** Clicking a line (relationship panel) or opening the connector shows the samples in order: what enters, what leaves each stage, where it ends. JSON is pretty-printed. When two neighbouring samples are JSON objects, fields the stage added, removed or changed are marked, with a one-line summary. A relationship without samples shows the examples of flow steps that use it. The stage panel shows its own sample against the one before it. | `ui/src/SamplePayload.tsx`, `ui/src/panels/ConnectorPanel.tsx`, `EdgePanel.tsx`, `StagePanel.tsx`, `ExampleFields.tsx` |
| L3 | **Live UI address and endpoints.** `dp.ui.url` on elements (http/https, no user name or password) and `dp.endpoints` on relationships (`GET /api/accounts/:id`, `*` for any method, a final `*` for the rest of a path, or a full URL). Edited in the element and relationship panels. | `src/core/ops.ts`, `ui/src/panels/ElementPanel.tsx`, `EdgePanel.tsx` |
| L4 | **UI proxy.** One listener on 127.0.0.1 per app origin. It forwards to that origin only, removes framing headers, adds the inspector script to HTML pages, and passes WebSocket upgrades through. It removes dp's session cookie from forwarded requests and rewrites redirects and cookies so they work on the proxy. | `src/server/uiProxy.ts`, `src/server/inspectScript.ts` |
| L5 | **Matching and the walk.** `POST /api/inspect` matches calls to relationships from the UI element (or its children) and walks on through outgoing relationships, each element once, up to three steps. It also returns the flows involved and a suggested endpoint for unmatched calls (ID-like segments become `:id`). `POST /api/ui-proxy` starts or reuses the proxy for an element. Both are `open` in the route rules. | `src/core/inspect.ts`, `src/server/routes/inspect.ts`, `src/server/auth.ts` |
| L6 | **Inspector screen.** The app on the left, clicks and their calls on the right. Each call shows the matched relationship, what was sent and returned, the documented example, "save as the example", and what follows in the model, with each relationship's samples on demand. Elements reached show as chips (click: show in the diagram), and the flows involved as links. Calls not caused by a click are listed apart. | `ui/src/LiveUiInspector.tsx`, `ui/src/styles/dialogs.css`, `ui/src/App.tsx` |
| L7 | **CLI and security headers.** `dp serve --allow-ui-host <name>` (repeatable). dp's own CSP allows frames from `http://127.0.0.1:*`. | `src/cli.ts`, `src/server/protect.ts` |
| L8 | **Demo.** The usage-event pipeline has a sample entering it and one per stage (Mask PII drops `email` and `user_id`, adds `user_ref`, masks `account`). The web app's four API relationships list their endpoints. The payment call has a documented example. | `scripts/make-demo.ts`, `demo/` |

## How it works (one paragraph)

Samples are plain fields in the model, so they are versioned, diffed and merged like everything else. The inspector observes calls in the browser and asks the server what they mean. The meaning comes from endpoints written on relationships, so the model stays the only source of what calls exist. Everything after the first relationship is read from the model, not observed.

## How it was checked

- vitest: 231 → 245 tests. New: sample fields round-trip, size cap, stage edits keep samples, drafts list the fields (`tests/features.test.ts`). Endpoint cleaning and matching, ID suggestion, live UI address rules, the walk (order, depth limit, each element once), the routes, and the proxy against a stand-in app (`tests/inspect.test.ts`). The proxy tests cover header removal, script insertion, cookie rewrite, dp's session cookie removal, Origin rewrite, redirects, the Host check, refused remote targets, and an app that is down. The route-rules test covers the two new routes.
- Browser tests: 2 new. Clicking the demo pipeline shows the samples and the marks (`e2e/features.spec.ts`). Clicking in a stand-in app framed through the proxy shows the call, the masked password, the match, the chain and the touched elements, and adding an endpoint for an unknown call makes it match (`e2e/inspector.spec.ts`).
- Typecheck, lint and the UI build are clean. Screenshots of both screens were checked by eye at 1280 and 1440 px.
- One existing browser test (`drafts-ui.spec.ts`, "a draft with only a planned code edit…") fails in most full runs here: 113 of 114 pass. Repeated on its own under load it fails about 1 time in 24, and it fails the same way on a clean checkout of commit 89fc176 (5 of 48), so it is an existing race in the apply dialog, not caused by this work.

## Limits

- Samples are written by people; nothing checks them against real data. Field marks compare top-level JSON fields only.
- The inspector sees fetch and XMLHttpRequest only (plus forms that navigate). It does not see WebSocket messages, server-sent events, `sendBeacon` or worker calls.
- A call belongs to a click if it starts within two seconds of it. Polling in that window is counted; a slow chain started later is not.
- Secrets are masked by field name only. IBANs are masked too, which hides them in observed data even when they are test data.
- The proxy is on 127.0.0.1: the inspector works only in a browser on the machine running `dp serve`. Not tried with a real dev server (Vite, webpack, Next.js) and its hot-reload socket, with HTTPS targets, or with an app that uses a service worker.
- The walk after the matched relationship shows every way on in the model, up to three steps. It is wider than what one request does; flows are the precise path.
- The inspected app runs without its framing and content-security headers inside dp.

## Questions for the owner

1. Should IBANs (and similar personal data) stay masked in observed data, or only secrets such as passwords and tokens?
2. Is two seconds the right window for linking calls to a click? Should it be a setting?
3. Should the inspector also read OpenTelemetry trace files, so the chain after the API is observed rather than read from the model?
4. Should the demo ship a small sample web app, so the inspector can be tried with `dp serve --demo` alone?

## Owner feedback (round 1)

- Q1: keep masking personal data → DEC-045.
- Q2: two seconds is right → unchanged.
- Q3: read trace files → built (round 2).
- Q4: a demo app, and a demo for backtracking → built (round 2).
- New: backtrack from a step of a ten-step process to where its data came from, how it changed, the functions and processes around it, and what changed recently → built (round 2).

## Round 2: what was built

| # | Item | Where |
|---|---|---|
| T1 | **Trace files.** OTLP JSON (lines or whole files) from `traces/` or `dp serve --traces <folder>`, re-read on change. Spans matched to elements by `dp.element`, code file, parent span, or service name (`dp.otel.service`, ID or name); `peer.service` for what a client span calls. Hops matched to relationships; missing ones and unknown services reported. Span attributes masked. | `src/core/traces.ts`, `src/server/routes/inspect.ts`, `src/shared/mask.ts` |
| T2 | **Traces in the inspector.** The script tags the app's own calls with `traceparent`; each call shows "Observed in traces" (the hops, drift, a span waterfall), retried while the exporter catches up. "Recent traces" lists the newest. Element panel: "Service name in trace files". | `src/server/inspectScript.ts`, `ui/src/ObservedTrace.tsx`, `ui/src/LiveUiInspector.tsx`, `ui/src/panels/ElementPanel.tsx` |
| B1 | **Backtrack.** `GET /api/backtrack` from a connector stage or flow step: each step's data, element, files, functions, commits, uncommitted edits and model changes; recent steps marked. | `src/core/backtrack.ts`, `src/core/functions.ts`, `src/core/git.ts` (log, diff, status), `src/server/routes/backtrack.ts` |
| B2 | **Backtrack screen.** Steps from the chosen one back to the first, a "changed in the last N days" box, the step's data against the step before, one field followed through every step, code with changed functions marked (a file opens in the editor), commits and model history. Opened from `↶ backtrack` on pipeline stages, the stage panel, and the flow step card. | `ui/src/Backtrack.tsx`, `ui/src/SamplePayload.tsx`, panels, `ui/src/FlowPanel.tsx` |
| D1 | **Demo pipeline.** Statement Job container with ten components (one TypeScript file each) behind a ten-stage connector, with samples at every stage and a high-severity known issue. | `scripts/make-demo.ts`, `demo/sample_code/statements/` |
| D2 | **Demo history.** `demo/history.json` replayed as four dated commits into a new demo folder (skipped inside a repository). | `src/core/demoHistory.ts`, `src/cli.ts` |
| D3 | **Demo web app** on 127.0.0.1:4200 with `dp serve --demo`, writing traces; the demo model's Single-Page Application points at it. | `src/server/demoApp.ts`, `demo/web-app/` |

## Round 2: how it was checked

- vitest: 245 → 258 tests. `tests/backtrack.test.ts`: function finder; demo history dates, authors and a clean tree; skipped inside a repository; backtrack steps, recent flags, changed functions, model changes, uncommitted edits; without git; flow steps; bad input. `tests/traces.test.ts`: parsing lines, whole files and base64 ids; matching by file, main file, parent, peer and `dp.otel.service`; masking; drift; the store re-reading files; `--traces`; the demo app's API and the traces it writes, including a held payment and a failed one.
- Browser tests: 2 new. Backtrack from stage 8 of the demo (suspects, field history, changed functions, model change, the file editor on top, Escape order). The demo app in the inspector (observed hops, drift for the exchange-rates call, recent traces). 115 of 116 browser tests pass; the one failure is the drafts-dialog race described above, which also fails on a clean checkout.
- `dp serve --demo` run by hand: history written, demo app on 4200, traces read. Screenshots of the backtrack screen and of the inspector with a trace checked by eye at 1440 px.
- Typecheck, lint and the UI build are clean; `npm run make-demo` regenerates the same files.

## Round 2: limits

- Fields are followed by name only; a renamed or computed field breaks the chain (related names are listed).
- Function ranges are approximate; Python and TypeScript/JavaScript only.
- Model history reads the last 15 commits of the model file and assumes linear history.
- Trace files only (no live collector); other exporters' formats (Jaeger, Zipkin) are not read. Cross-origin calls from the app are not tagged with a trace ID.
- The demo folder becomes a git repository with made-up commits; the demo app needs port 4200 free.
- Not tried with a real OpenTelemetry Collector output file, only with files in its documented format.

## Round 2: questions for the owner

1. Should backtracking also use traces (what a real run of each step did), once pipelines emit spans?
2. Is "same field name" enough for following data, or should a stage be able to say which input field each output field comes from (explicit lineage in the model)?
3. Should the demo's made-up git history be opt-out (`--no-history`), or is "skipped inside an existing repository" enough?
4. Should dp read traces from a running collector (OTLP over HTTP) in a later stage?

## Owner feedback (round 2)

(empty)
