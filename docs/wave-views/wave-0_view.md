# Wave 0 view — Foundations and verification spikes

Branch `wave-0` · Date 2026-11-12 · Plan: `implementation-plan-v0.2.md` · Spec: `designPerspectives-spec-v0.2-bundle.md` (both in the claude.ai project; see `docs/spec/README.md`)

How to read this document: facts are stated with their evidence (test name, command, file). Statements marked **Interpretation** are my judgement, not tested facts. Everything ran on Linux x64 in a sandbox; **nothing has run on your Mac yet** (§9).

---

## 1. What was built

Wave 0 delivers a buildable, tested skeleton of the architecture in spec file 01 and verifies the third-party facts that later waves depend on. Out of scope (per the Wave 0 file): Design Studio, ingestion, LLM features, perspectives.

| Package / app | What it contains |
|---|---|
| `packages/contracts` | Domain model (C4 kinds, relationship kinds, views, deployment), ports (`ModelPort`, `Exporter`, `JobHandler`, `PluginModule`), Zod schemas for every on-disk file of spec 04 §1/§4–§7, generated JSON Schemas (`schemas/`, 12 files), diagnostics, contract test suites |
| `packages/core` | Model Store (load/save via ModelPort + sidecars, canonical save plan, atomic writes, element-id refactor, file:line location of rule errors), Model Validation v1 (19 rules), sidecar loader + canonical printer, Plug-in Host, Job Scheduler (worker threads, progress, cancel) |
| `packages/plugins/model-likec4` | LikeC4 adapter: canonical `.c4` printer, reader, layout via Graphviz WASM. Only package allowed to import LikeC4 (FF1) |
| `packages/plugins/export-mermaid` | Mermaid flowchart, one `.mmd` per view |
| `packages/plugins/export-svg` | SVG from laid-out views, with title and auto-generated key |
| `packages/plugins/export-structurizr` | Structurizr DSL (`structurizr-dsl`) and JSON (`structurizr-json`) |
| `apps/cli` | `dp init`, `validate [--json]`, `format [--check]`, `export --format <fmt>`, `version` |
| `apps/desktop` | Hardened Electron app: element list, view selector, canvas (React Flow) with title and key, demo background job with progress and Cancel |
| `examples/internet-banking` | Demo 1, the Internet Banking System from *The C4 Model*: 16 elements, 25 relationships, 7 views, 2 deployment environments |
| `fixtures/` | Manifest of 9 pinned public repositories + idempotent clone script (never vendored) |
| `tools/` | Fitness-function harnesses, JSON Schema generator |
| `docs/spikes/` | 12 spike reports (+ template) |
| `docs/adr/README.md` | ADR status changes and the conditions attached |

Totals: 23 test files, 251 tests, all passing (`pnpm test`).

## 2. How to run it (macOS)

```sh
git checkout wave-0
pnpm install                 # pnpm 10, Node >= 22.22.3
pnpm build

# CLI
node apps/cli/dist/bin.js version
node apps/cli/dist/bin.js init /tmp/my-system --name "My System"
node apps/cli/dist/bin.js validate /tmp/my-system
node apps/cli/dist/bin.js validate examples/internet-banking
node apps/cli/dist/bin.js export examples/internet-banking --format svg --out /tmp/ibs
node apps/cli/dist/bin.js export examples/internet-banking --format mermaid --out /tmp/ibs
node apps/cli/dist/bin.js export examples/internet-banking --format structurizr-dsl --out /tmp/ibs

# Desktop app (opens the Internet Banking demo; fetches the Electron binary on first run)
pnpm desktop

# Desktop smoke test (screenshots go to a temp folder)
pnpm desktop:build && pnpm desktop:smoke

# Everything CI runs
pnpm check

# Optional: clone the small fixture repositories into fixtures/repos/
pnpm fixtures
```

## 3. What to look at

| What | Where |
|---|---|
| Desktop app, Container View of the demo | `assets/wave-0/desktop-container-view.png` |
| Desktop app after the demo job was cancelled | `assets/wave-0/desktop-demo-job.png` |
| SVG exporter output (rendered to PNG) | `assets/wave-0/export-svg-container-view.png`, `export-svg-deployment-live.png` |
| Raw SVG and Mermaid output | `assets/wave-0/export/` |
| A workspace as it sits in a repository | `examples/internet-banking/architecture/` (generated `.c4` files, sidecars, ADR, permissions) |
| The most consequential spike | `docs/spikes/W0-SPIKE-LIKEC4.md` |
| ADRs accepted and their conditions | `docs/adr/README.md` |

## 4. Acceptance criteria (Wave 0 file)

Checked by an independent reviewer agent that did not build the code, then re-checked by me after the fixes in §7. Commands and outputs are in the reviewer's notes; the main evidence is listed here.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| A1 | `dp init && dp validate` succeeds on a fresh folder; invalid files produce precise errors | **Pass** | Test `dp init && dp validate succeeds on a fresh folder` (exit 0, "0 error(s), 0 warning(s), 0 info(s)"). Precise errors: tests `invalid files produce precise file:line errors` (sidecar schema error at `x.yaml:2`, `.c4` syntax error at `views.c4:<line>`) and `reports model-rule errors at the line in the hand-edited file`. The reviewer also tried a YAML syntax error, a wrong enum, a file-name mismatch and a vague "uses" label; each pointed at the right file. |
| A2 | Load → save of the sample model and sidecars yields zero diff (FF6) | **Pass** | Tests `load → save without edits produces zero diff in architecture/` (demo workspace) and `an element rename … still round-trips`; reviewer: `dp format --check` exit 0 and `diff -r` empty on a copy |
| A3 | Desktop app opens a sample workspace and renders the Container View with title and key | **Pass on Linux** (not run on macOS) | `xvfb-run -a node apps/desktop/e2e/smoke.mjs` → `smoke: PASS`: title "Container View: Internet Banking System", 6 key entries, 8 cards, 1 boundary, 7 edges, 16 element rows, job start + cancel. First view about 2.0–2.3 s after launch on warm runs; the first cold run took 14 s |
| A4 | CI fitness functions FF1–FF4, FF6, FF8, FF11, FF12 run and pass | **Pass** | Table in §5. The reviewer broke each rule in a scratch copy and confirmed it fails |
| A5 | Every spike report exists with a recommendation; ADR statuses updated | **Pass** | 12 reports in `docs/spikes/`, each with a Recommendation section; `docs/adr/README.md` |
| DoD | Plug-ins pass their port contract suite | **Pass** | `runModelPortContract`: model-likec4. `runExporterContract`: mermaid, svg, structurizr-dsl, structurizr-json |
| DoD | No new lint warnings | **Pass** | `pnpm lint`: 0 problems (6 complexity warnings fixed after review) |
| DoD | Golden files updated only with a reviewed reason | **N/A** | No golden extraction files in Wave 0 |
| DoD | Wave file "Open questions" updated | **Partial** | The spec bundle lives in the claude.ai project, so I could not append there; open questions are in §10 of this file |

## 5. Fitness functions

| FF | Rule | Where | Result |
|---|---|---|---|
| FF1 | Only the LikeC4 adapter imports LikeC4 | `.dependency-cruiser.cjs` (now also covers test files) | Pass |
| FF2 | No plug-in imports another plug-in | `.dependency-cruiser.cjs` | Pass |
| FF3 | Electron: contextIsolation, no nodeIntegration, sandbox, webSecurity, strict CSP | `apps/desktop/src/main/window-options.test.ts` + live check in the smoke test | Pass |
| FF4 | No network egress in tests | `tools/ff/block-network.mjs`, loaded with `--import` into test processes, wrapped into every worker thread, set via `NODE_OPTIONS` for child processes; covers fetch, TCP, TLS, UDP | Pass (6 tests) |
| FF6 | Load → save gives zero diff | CLI and Model Store tests on the demo; `pnpm examples:check` | Pass |
| FF8 | Licence policy | `tools/ff/licences.mjs` over `pnpm licenses list --prod` | Pass: 141 production packages; 1 reviewed exception (`khroma`: no licence field, MIT LICENSE file) |
| FF11 | Complexity: warn > 5, fail ≥ 10 in core and contracts | `eslint.config.js`, `eslint.ff11.config.js` | Pass, 0 warnings |
| FF12 | Renderer imports no core, plug-in, main/preload or Node built-ins | `.dependency-cruiser.cjs` | Pass |
| — | No import cycles | `.dependency-cruiser.cjs` | Pass |
| FF5, FF7, FF9, FF10 | Determinism of ingestion, performance, core churn, LLM provenance | — | Not in Wave 0 scope (FF10's schema rule exists: `llm` provenance requires `confirmedBy`) |

CI (`.github/workflows/ci.yml`): build, lint, test, ff, demo and schema freshness, desktop build on macOS/Node 22, Linux/Node 22 and Linux/Node 24; a separate job runs the desktop smoke test under xvfb and uploads the screenshots. **The workflow has not run**: GitHub refused to start the jobs because of an account billing lock (§9).

## 6. Decisions made under delegated authority

| Decision | Reason | Reversibility |
|---|---|---|
| Accepted ADR-0003, 0004, 0005, 0012, 0013 with conditions (`docs/adr/README.md`) | Plan Q3: the spikes supported them and none contradicted them | Medium. ADR-0004 (on-disk format) is the hard one; the ModelPort adapter contains it |
| `.c4` files are tool-owned and written by our own canonical printer (plan Q6) | FF6 holds by construction. Spike: upstream `toDSL` is documented as lossy and its output re-parsed with 2 errors | Medium. Hand edits are reformatted on save, and comments in `.c4` files are lost (§10 Q1) |
| Depend on `@likec4/language-services@1.60.0`, not `likec4` | 48 MB vs 128 MB (the full package pulls Vite and Playwright) | Easy |
| pnpm override `remeda@2.51.0`; install LikeC4's optional peers `bundle-require` and `esbuild` | Spike: crash with remeda 2.59.0. Observed missing-module failure without the peers | Easy; revisit on each LikeC4 upgrade |
| LikeC4 kind `grouping` for our `group`; deployment kinds `node`/`infra` | `group` and `deploymentNode` are LikeC4 keywords | Internal to the adapter |
| View type, dynamic-view scope and deployment environment stored as view tags `dp-type-*`, `dp-scope-*`, `dp-env-*` | LikeC4 has no field for them | Internal to the adapter |
| Context views printed as `S, * -> S, S -> *`; deployment views list every node and instance | Probes: `-> S ->` and `E.**` did not give the expected content in LikeC4 1.60.0 | Internal to the adapter |
| Merged LikeC4 edges show the direct relationship's label (or first + "(+N more)") instead of `[...]` | `[...]` tells a reader nothing | Easy |
| Relationship id `source->target#kind[:key]`, key stored as `metadata { dpKey }` (plan F4) | LikeC4 relationship ids are hashes that change on re-print (spike: 0 of 14 survived) | Hard once sidecars reference ids; fixed now on purpose |
| Sidecar values equal to a schema default are omitted from printed files | Byte-identical round trip | Easy |
| Groups don't count as parents in the allowed-parent rule; relationships to/from a person don't need a technology | Without these, valid models (including the book example) fail validation | Easy |
| Glossary includes HTML, CSS, MVC | Technologies in the book example | Easy |
| Static Content is a `dataStore` (a directory of files); SPA → Static Content is `readsFrom` | There is no "delivers" kind; this is my interpretation of the book's container diagram | Easy |
| CI: macOS + Linux on Node 22, plus Linux on Node 24 | Electron bundles Node 24 (spike), the CLI targets 22 | Easy |
| Node engine floor `>=22.22.3` | LikeC4's engines field | Easy |
| JSON Schema `$id` values are URNs (`urn:designperspectives:schema:<name>`) | No domain is owned for the project | Easy |
| Isoflow not bundled | Spike: depends on `gsap` (licence outside the allow-list); no release for 25 months | Affects Wave 6 |

## 7. Deviations from the spec or plan

- **Spec not copied into the repo.** Plan §1.2 said to copy the spec and plan into `docs/spec/`. I left a pointer instead (`docs/spec/README.md`): the spec cites book pages and summaries, and whether that belongs in a public repository is your call.
- **Export format names.** The Wave 0 file says `dp export --format structurizr`; the formats are `structurizr-dsl` and `structurizr-json`, because there are two outputs.
- **Job workers use Node `worker_threads`**, not Electron `utilityProcess` (ADR-0012 condition C12.1). Same API; `utilityProcess` is a Wave 1 option.
- **Plug-in worker isolation applies to Job plug-ins only.** Other plug-in types are rejected if they ask for `isolation: "worker"`. Running exporters or ModelPorts in workers needs an async proxy; Wave 1 or later.
- **Added beyond scope:** `dp format [--check]` (brings hand-edited files back to canonical form) and `examples/build.mjs` (regenerates the demo's `.c4` files from `model.ts`).
- **Subagent worktrees** were created by me with `git worktree`, because the agent tool's own worktree isolation was not permitted in this session. Same effect.
- **Fixed after the independent review** (all with tests):
  - Model-rule errors pointed at lines in a re-printed copy, not the file on disk (wrong line for hand-edited files).
  - FF4 did not apply inside worker threads, child processes or UDP.
  - FF1 skipped test files.
  - CI did not build or smoke-test the desktop app.
  - The smoke test overwrote the committed screenshots on every run.
  - No JSON Schemas were generated.
  - `dp export --help` crashed.
  - A `.c4` parse error was followed by misleading "element does not exist" warnings.
  - There were 6 lint warnings.

## 8. Spike outcomes

Facts are from the spike reports; each report gives commands and evidence.

| Spike | Result | Contradictions of the spec's [Training] assumptions |
|---|---|---|
| LIKEC4 | 1.60.0, MIT, 8 releases in 6 months. Headless parse and layout work; layout byte-identical across runs with Graphviz WASM. Own printer + re-parse round-tripped 18 elements / 14 relationships / 5 views with 0 differences | A model-to-DSL writer does exist (`toDSL`), but it is documented as lossy. LikeC4 relationship ids are unstable. Canonical sort order changes layout geometry |
| SHELL | Electron 45.3.0: hardened window, CSP, blocked navigation, IPC and `utilityProcess` all worked under xvfb. better-sqlite3 13.1.1 loads in Node 22, Electron main and utility process without a rebuild | Electron bundles **Node 24**. better-sqlite3 no longer ships per-ABI prebuilds. The evidence ran with `--no-sandbox` (root on Linux), so the OS-level sandbox is unverified |
| STRUCTURIZR | Current source is `structurizr/structurizr` (Apache-2.0); the JSON contract is an OpenAPI file; the DSL parser is Java-only | `structurizr/json` and `structurizr/dsl` are not publicly reachable. No clean equivalent for dataStore/queue/topic, relationship kind, or many-to-many ADR links |
| FIXTURES | 8 named repositories + 2 TypeScript-monorepo candidates checked; 9 pinned in `fixtures/manifest.json` (all Apache-2.0 or MIT, each ≤ 22 MB) | eShop has no compose/Kubernetes (uses Aspire); opentelemetry-demo has no K8s/Helm in-repo; only trpc has OpenAPI files |
| TREESITTER | web-tree-sitter 0.27.2 with the official grammar `.wasm` files works for all 7 languages; output identical to native | `tree-sitter-wasms` does not load; native grammars have conflicting peer ranges |
| SCIP | All five indexers exist; TypeScript recommended first | Org renamed to `scip-code`; reader is `@scip-code/scip`; scip-typescript needs Node ≥ 22.23.4 |
| FF | dependency-cruiser, ArchUnit, ArchUnitNET, PyTestArch, import-linter, go-arch-lint are maintained | NetArchTest's last tag is from 2021; tsarch last published 2024 |
| AISDK (docs only) | `ai` 7.x, Apache-2.0; `ai/test` ships a mock model for replay tests | `generateObject` is deprecated (use `generateText` + `Output.object`); no official Ollama provider |
| MCP | SDK 1.32.2, MIT; stdio prototype passed | SSE and `server.tool()` are deprecated; a 2.x package family exists |
| OTEL | OTLP JSON shape, port 4318 and `/v1/traces` confirmed | Many attributes renamed (`db.system` → `db.system.name`, `http.method` → `http.request.method`, `peer.service` deprecated, …) |
| ISOFLOW | MIT licence | No release for 25 months; depends on `gsap` (licence outside the allow-list); icon packs declare "Varies" |
| PERF | Reference machine = your Mac (arm64); the device info reported no core count or RAM | A 610-element model parsed and laid out in about 1.8 s on a 2-core Linux box; the 2,000/5,000 size was not measured |

## 9. Not verified

- **Nothing ran on macOS.** All runs were on Linux x64.
- **GitHub Actions has not run.** On the first push (run 43176177325) GitHub did not start the jobs. Its annotation says: "The job was not started because your account is locked due to a billing issue." No code ran there. A second annotation says `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19, so the sysctl the smoke job uses to allow Chromium's sandbox (written for Ubuntu 24.04) is unverified too.
- **Electron's OS-level sandbox.** Local runs needed `--no-sandbox` because the sandbox user was root. The smoke test adds it only when running as root.
- **Whether the CSP response header applies to `file://` pages.** The CSP meta tag is in force, and the smoke test confirms inline scripts are blocked.
- **Dashed (async) edges in the desktop app.** The demo's Container View has no async edge.
- **Structurizr upstream parsing.** No DSL or JSON export was parsed by Structurizr itself; I could not download it from this session. The output passes the spike's schema check.
- **Mermaid output** was not rendered by Mermaid itself.
- **Not yet started:** packaging, signing and notarisation; performance budgets (FF7).
- **LLM behaviour:** none (plan Q5).

### Manual checks for you (on the Mac)

1. `pnpm install && pnpm check`. All steps should pass.
2. `pnpm desktop`. The Internet Banking demo should open on the Container View with its title and key. Switch views, then start and cancel the demo job.
3. Confirm the app starts **without** `--no-sandbox`. `pnpm desktop` never adds it on macOS.
4. Run `pnpm desktop:build && pnpm desktop:smoke` and note the "first view rendered … ms" line. That is the first macOS performance data point.
5. Paste `assets/wave-0/export/containers.mmd` into a Mermaid viewer, for example a GitHub Markdown preview.

## 10. Open questions

1. **Hand edits to `.c4` files.** The files are tool-owned (plan Q6), so on save they are reformatted and comments are lost. The options are:
   - (a) Accept this.
   - (b) Keep a separate hand-written `.c4` folder that the tool reads but never writes.
   - (c) Format-preserving edits, which is more work.

   **Interpretation:** (a) for Wave 1, then (b) if you want comments.
2. **Demo 2.** I planned "Going, Going, Gone" from *Fundamentals of Software Architecture* for Wave 1 (plan Q9). Confirm it or name another book example.
3. **Spec in the repository.** Should `docs/spec/` hold a copy of the spec bundle? It cites book page numbers and summarises book content (§7).
4. **MCP SDK 1.x vs 2.x.** This needs a decision before Wave 5; it is not urgent.

## 11. Proposed changes to the Wave 1 plan

- **Desktop readability.** At the default fit-to-view zoom, card text and edge labels are about 6 px, and labels overlap near the API Application (reviewer, from the screenshot). Add a minimum zoom on open and label placement that avoids overlaps.
- **Key shapes.** In the desktop key, Container, Data store and Software system have the same shape and differ only by colour. The cards carry "[Kind]" text, so meaning isn't colour-only on the canvas, but the key should use distinct shapes (cylinder for data stores), as the SVG exporter does.
- **Shared card model.** Extract one pure "card + key" model into contracts, so the desktop canvas and the SVG exporter stay consistent.
- **Desktop jobs.** Add the `utilityProcess` runner (ADR-0012 C12.1).
- **Performance.** Start the FF7 benchmarks on your Mac and record its core count and RAM.
- **Structurizr importer** (Wave 1 scope): JSON first, preserving unknown keys (spike).
- **Minor items** from the review:
  - YAML syntax errors are reported one line late.
  - The status-bar text runs together ("0 infoIPC v1").
  - Add a `structurizr` alias for the export format.
- **Spec file 07** (R7, R10, R11, R12) needs the spike corrections:
  - Electron bundles Node 24.
  - The SCIP organisation is now `scip-code`.
  - AI SDK uses `Output.object`.
  - MCP uses `registerTool`.
  - OpenTelemetry attribute renames.

## 12. Owner feedback

_(for you)_
