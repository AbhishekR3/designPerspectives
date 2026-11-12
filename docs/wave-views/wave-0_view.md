# Wave 0 view — Foundations and verification spikes

Branch `wave-0` · Date 2026-11-12 · Plan: `implementation-plan-v0.2.md` (claude.ai project) · Spec: `designPerspectives-spec-v0.2-bundle.md`

How to read this document: facts are stated with their evidence (test name, command, file). Statements marked **Interpretation** are my judgement, not tested facts.

---

## 1. What was built

Wave 0 delivers a buildable, tested skeleton of the architecture in spec file 01 and verifies the third-party facts the later waves depend on. There is no Design Studio, ingestion, LLM feature or perspective yet (out of scope per the Wave 0 file).

| Package / app | What it contains |
|---|---|
| `packages/contracts` | Domain model (C4 element kinds, relationship kinds, views, deployment), ports (`ModelPort`, `Exporter`, `JobHandler`, `PluginModule`), Zod schemas for every on-disk file in spec 04 §1/§4–§7, diagnostics, contract test suites for `ModelPort` and `Exporter` |
| `packages/core` | Model Store (load/save through the ModelPort + sidecars, canonical save plan, atomic writes, element-id refactor), Model Validation v1 (19 rules), sidecar loader/canonical printer, Plug-in Host (registry + contract version checks), Job Scheduler (worker threads, progress, cancel) |
| `packages/plugins/model-likec4` | LikeC4 adapter: canonical `.c4` printer, reader, layout (Graphviz WASM via LikeC4). The only package allowed to import LikeC4 (FF1) |
| `packages/plugins/export-mermaid` | Mermaid flowchart export, one `.mmd` per view |
| `packages/plugins/export-svg` | SVG export from laid-out views, with title and auto-generated key |
| `packages/plugins/export-structurizr` | _see §7 — filled in at merge_ |
| `apps/cli` | `dp init`, `dp validate [--json]`, `dp format [--check]`, `dp export --format <fmt>`, `dp version` |
| `apps/desktop` | _see §7 — filled in at merge_ |
| `examples/internet-banking` | Demo 1: Internet Banking System (16 elements, 25 relationships, 7 views, 2 deployment environments) |
| `fixtures/` | Manifest of 9 pinned public repositories + idempotent clone script (never vendored) |
| `tools/ff/` | Fitness-function harnesses (FF4 network block, FF8 licences, runner) |
| `docs/spikes/` | 13 spike reports |
| `docs/adr/README.md` | ADR status changes and conditions |

## 2. How to run it (macOS)

```sh
git checkout wave-0
pnpm install          # pnpm 10, Node >= 22.22
pnpm build

# CLI
node apps/cli/dist/bin.js version
node apps/cli/dist/bin.js init /tmp/my-system --name "My System"
node apps/cli/dist/bin.js validate /tmp/my-system
node apps/cli/dist/bin.js validate examples/internet-banking
node apps/cli/dist/bin.js export examples/internet-banking --format svg --out /tmp/ibs
node apps/cli/dist/bin.js export examples/internet-banking --format mermaid --out /tmp/ibs

# Desktop app (opens the Internet Banking demo)
pnpm desktop

# Everything CI runs
pnpm check

# Optional: clone the small fixture repositories
pnpm fixtures
```

## 3. What to look at

- `examples/internet-banking/architecture/` — a full workspace as it sits in a repository: generated `.c4` files, sidecars, an ADR, permissions.
- `docs/wave-views/assets/wave-0/export-svg-container-view.png` and `export-svg-deployment-live.png` — SVG exporter output for the demo, rendered to PNG.
- `docs/wave-views/assets/wave-0/export/` — raw SVG and Mermaid output.
- `docs/wave-views/assets/wave-0/desktop-*.png` — desktop app screenshots (_see §7_).
- `docs/spikes/W0-SPIKE-LIKEC4.md` — the most consequential spike.
- `docs/adr/README.md` — which ADRs I accepted and the conditions attached.

## 4. Acceptance criteria (Wave 0 file)

_Filled in after the independent acceptance check (task 0b-16)._

## 5. Fitness functions

_Filled in after the independent acceptance check._

## 6. Decisions made under delegated authority

| Decision | Reason | Reversibility |
|---|---|---|
| Accepted ADR-0003, 0004, 0005, 0012, 0013 with conditions (`docs/adr/README.md`) | Plan Q3: spikes confirmed them; none contradicted | Medium. ADR-0004 is the hard one: on-disk format. Mitigated by the ModelPort adapter |
| `.c4` files are tool-owned, written by our own canonical printer (plan Q6) | Determinism (FF6 by construction). Spike: upstream `toDSL` is documented as lossy and its output re-parsed with 2 errors | Medium. Hand edits are re-formatted on save; comments in `.c4` files are lost |
| Depend on `@likec4/language-services@1.60.0` instead of `likec4` | 48 MB vs 128 MB (the full package pulls Vite and Playwright) | Easy |
| pnpm override `remeda@2.51.0`; add LikeC4's optional peers `bundle-require` and `esbuild` | Spike: language-services crashed with remeda 2.59.0; I observed a missing-module failure without the optional peers | Easy; revisit on each LikeC4 upgrade |
| LikeC4 element kind `grouping` for our `group`; deployment kinds `node`/`infra` | `group` and `deploymentNode` are LikeC4 keywords | Internal to the adapter |
| View type, dynamic-view scope and deployment environment stored as view tags `dp-type-*`, `dp-scope-*`, `dp-env-*` | LikeC4 has no field for them | Internal to the adapter |
| Context views printed as `S, * -> S, S -> *`; deployment views list every node and instance explicitly | Probes: `-> S ->` and `E.**` did not produce the expected content in LikeC4 1.60.0 | Internal to the adapter |
| Merged LikeC4 edges labelled with the direct relationship (or first + "(+N more)") instead of `[...]` | `[...]` carries no meaning for a reader | Easy |
| Relationship id `source->target#kind[:key]`, key stored as `metadata { dpKey }` (plan F4) | LikeC4 relationship ids are hashes that change on re-print (spike: 0 of 14 survived) | Hard once sidecars reference ids; defined now on purpose |
| Sidecar default rule: values equal to a schema default are omitted from printed files | Makes the round trip byte-identical | Easy |
| Groups do not count as parents for the allowed-parent rule; relationships to/from a person do not need a technology | Without these, valid models (and the C4 book example) fail validation | Easy |
| Glossary includes HTML, CSS, MVC | Technologies used by the book example | Easy |
| CI: macOS + Linux on Node 22, plus Linux on Node 24 | Electron bundles Node 24 (spike) while the CLI targets 22 | Easy |
| Isoflow not bundled | Spike: depends on `gsap` (licence outside the allow-list); no release for 25 months | Affects Wave 6 |

## 7. Deviations from the spec or plan

_Completed at merge._

- Job workers use Node `worker_threads`, not Electron `utilityProcess` (ADR-0012 condition C12.1). Same API; `utilityProcess` is a Wave 1 option.
- `dp format [--check]` was added (not in the Wave 0 scope); it is how hand-edited files are brought back to canonical form.
- Wave 0b's subagent tasks ran in git worktrees I created, because the agent tool's own worktree isolation was not permitted in this session. Same effect.

## 8. Spike outcomes and ADR status changes

See `docs/adr/README.md` for the full table. Facts below are from the spike reports; each report gives commands and evidence.

| Spike | Result | Contradictions of the spec's [Training] assumptions |
|---|---|---|
| LIKEC4 | LikeC4 1.60.0, MIT, 8 releases in 6 months. Headless parse and layout work; layout byte-identical across runs with Graphviz WASM. Own printer + re-parse round-trips 18 elements / 14 relationships / 5 views with 0 differences | A model-to-DSL writer does exist (`toDSL`), but it is documented as lossy. LikeC4 relationship ids are unstable. Canonical sort order changes layout geometry |
| SHELL | Electron 45.3.0 hardened window, CSP, blocked navigation, IPC and `utilityProcess` all worked under xvfb. better-sqlite3 13.1.1 loads in Node 22, Electron main and utility process with no rebuild | Electron bundles **Node 24**. better-sqlite3 no longer uses per-ABI prebuilds. Evidence ran with `--no-sandbox` (root on Linux), so the OS-level sandbox is unverified |
| STRUCTURIZR | Current source is `structurizr/structurizr` (Apache-2.0); JSON contract is an OpenAPI file; DSL parser is Java-only | `structurizr/json` and `structurizr/dsl` repos are not publicly reachable. No clean equivalent for dataStore/queue/topic, relationship kind or many-to-many ADR links |
| FIXTURES | 9 repositories pinned (Apache-2.0 / MIT), each ≤ 22 MB | eShop has no compose/Kubernetes (Aspire); opentelemetry-demo has no K8s/Helm in-repo; only trpc has OpenAPI files |
| TREESITTER | web-tree-sitter 0.27.2 with official grammar `.wasm` files works for all 7 languages; output identical to native | `tree-sitter-wasms` does not load; native grammars have conflicting peer ranges |
| SCIP | All five indexers exist; TypeScript recommended first | Org renamed to `scip-code`; reader is `@scip-code/scip`; scip-typescript needs Node ≥ 22.23.4 |
| FF | dependency-cruiser, ArchUnit, ArchUnitNET, PyTestArch, import-linter, go-arch-lint are maintained | NetArchTest last tag 2021; tsarch last publish 2024 |
| AISDK | `ai` 7.x, Apache-2.0; `ai/test` ships a mock model for replay tests | `generateObject` is deprecated (use `generateText` + `Output.object`); no official Ollama provider |
| MCP | SDK 1.32.2, MIT; stdio prototype passed | SSE and `server.tool()` are deprecated; a 2.x package family exists (decision needed before Wave 5) |
| OTEL | OTLP JSON shape, port 4318, `/v1/traces` confirmed | Many attributes renamed (`db.system` → `db.system.name`, `http.method` → `http.request.method`, `peer.service` deprecated …) |
| ISOFLOW | MIT, but see contradictions | No release for 25 months; depends on `gsap` (licence outside allow-list); icon packs "Varies" |
| PERF | Reference machine = your Mac (arm64); core count and RAM not reported | 610-element model parsed + laid out in about 1.8 s on a 2-core Linux box; 2,000/5,000 not measured |

## 9. Not verified

_Completed at merge._

- Nothing was run on macOS. All runs were on Linux x64 in a sandbox. Your Mac is the acceptance machine (plan Q1).
- Electron's OS-level sandbox (evidence needed `--no-sandbox` because the sandbox user was root).
- Packaging, signing, notarisation.
- Structurizr exports were not parsed by the upstream Java tooling (no JVM).
- Performance budgets (FF7) — benchmark starts in Wave 1.
- Any LLM behaviour (plan Q5).

### Manual checks for you

1. On the Mac: `pnpm install && pnpm check` — all green expected.
2. `pnpm desktop` — the app opens the Internet Banking demo, shows the Container View with title and key; start and cancel the demo job.
3. Confirm the app starts **without** `--no-sandbox` on macOS.
4. Open `docs/wave-views/assets/wave-0/export/containers.mmd` in a Mermaid viewer (e.g. GitHub preview).

## 10. Open questions

1. **Hand edits to `.c4` files.** Files are tool-owned (plan Q6). The Wave 1 DSL editor will let you edit them; on save they are reformatted and comments are lost. Options: (a) accept; (b) keep a separate hand-written `.c4` folder the tool reads but never writes; (c) format-preserving edits (more work). My recommendation is (a) for Wave 1 and (b) if you find you want comments.
2. **Demo 2.** I planned "Going, Going, Gone" from *Fundamentals of Software Architecture* for Wave 1 (plan §0, Q9). Confirm or name another book example.
3. **MCP 1.x vs 2.x** — needs a decision before Wave 5 (not urgent).

## 11. Proposed changes to the Wave 1 plan

- Add a Node 24 + `utilityProcess` path for desktop jobs (ADR-0012 C12.1).
- Start FF7 benchmarks on your Mac; record core count and RAM.
- The SVG exporter and the desktop canvas both draw cards and keys; extract a shared, pure "card model" into contracts so both stay consistent.
- Structurizr JSON importer (Wave 1 scope) should preserve unknown keys (spike: the schema omits fields the Java model writes).
- Update spec file 07 R7/R10/R11/R12 with the spike contradictions (Node 24, `scip-code`, AI SDK `Output.object`, MCP `registerTool`, OTel attribute renames).

## 12. Owner feedback

_(for you)_
