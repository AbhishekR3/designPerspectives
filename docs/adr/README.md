# ADR status for designPerspectives (Wave 0)

The ADR texts live in the spec bundle (`designPerspectives-spec-v0.2-bundle.md`, section `adr/`, kept in the owner's claude.ai project). This file records **status changes** and the **conditions** attached to them. A later change supersedes the ADR with a new one [FoSA p.393].

| ADR | Title | Status before Wave 0 | Status after Wave 0a | Decided by | Evidence |
|---|---|---|---|---|---|
| 0001 | MIT licence and dependency licence policy | Accepted | Accepted | Owner | — |
| 0002 | Local-first single-user desktop app + CLI | Accepted | Accepted | Owner | — |
| 0003 | Electron shell with a shared headless TypeScript core | Proposed | **Accepted, with conditions C3.1–C3.3** | Agent under delegated authority (plan Q3) | W0-SPIKE-SHELL |
| 0004 | LikeC4 as native DSL; Structurizr import/export | Proposed | **Accepted, with conditions C4.1–C4.7** | Agent under delegated authority (plan Q3) | W0-SPIKE-LIKEC4, W0-SPIKE-STRUCTURIZR |
| 0005 | Microkernel style; modular-monolith core; pipeline ingestion | Proposed | **Accepted** | Agent under delegated authority (plan Q3) | No spike contradicted it; the Wave 0 skeleton (contracts + plug-in host) implements it |
| 0006 | Hand-off to external coding agents | Accepted | Accepted | Owner | — |
| 0007 | Lenses + decision rights; honest local enforcement | Proposed | Proposed (Wave 1) | — | — |
| 0008 | Two-tier code analysis | Proposed | Proposed (Wave 3); spike supports web-tree-sitter for tier 1 | — | W0-SPIKE-TREESITTER, W0-SPIKE-SCIP |
| 0009 | IaC-first; live cloud later | Accepted | Accepted | Owner | — |
| 0010 | OpenTelemetry trace support | Accepted | Accepted (attribute names to update, see W0-SPIKE-OTEL) | Owner | W0-SPIKE-OTEL |
| 0011 | Bounded LLM role; typed proposals | Proposed | Proposed (Wave 2) | — | — |
| 0012 | Synchronous by default; async jobs | Proposed | **Accepted, with condition C12.1** | Agent under delegated authority (plan Q3) | Job Scheduler tests; W0-SPIKE-SHELL (`utilityProcess`) |
| 0013 | Text files as source of truth; SQLite derived cache | Proposed | **Accepted, with condition C13.1** | Agent under delegated authority (plan Q3) | W0-SPIKE-SHELL (better-sqlite3 13.1.1 loads in Node 22, Electron main and utility process); FF6 round-trip tests |
| 0014 | Design process with gates | Proposed | Proposed (Wave 2) | — | — |

## Conditions

**ADR-0003 (Electron)**
- C3.1 Electron bundles Node 24 while the CLI targets Node 22: CI tests the core on both majors (Node 24 job added in Wave 0, `.github/workflows/ci.yml`).
- C3.2 Not verified on macOS: run the hardened shell on the owner's Mac **without** `--no-sandbox` (the Linux sandbox evidence needed it because the agent ran as root).
- C3.3 Packaging/signing/notarisation is unverified; one packaged build before Wave 1 ends.

**ADR-0004 (LikeC4)**
- C4.1 Depend on `@likec4/language-services@1.60.0` (pinned), not `likec4` (128 MB incl. Vite/Playwright), with the pnpm override `remeda@2.51.0` and the optional peers `bundle-require` + `esbuild` installed (observed missing-module failure without them).
- C4.2 Write path = our own canonical printer (plan Q6). Upstream `toDSL` / `generators/likec4` considered and rejected: documented as lossy; output re-parsed with 2 errors in the spike.
- C4.3 The core keeps its own relationship identity (`source->target#kind[:key]`, key in `metadata { dpKey }`); LikeC4 relationship ids are never persisted.
- C4.4 Strings are trimmed by the printer (the parser trims leading/trailing whitespace).
- C4.5 Canonical sorting affects layout geometry; sorting is the tool's rule (files are tool-owned).
- C4.6 Layout engine fixed to Graphviz WASM (the `dot` binary gives different geometry).
- C4.7 LikeC4 lacks fields for some view data; view type, dynamic-view scope and deployment environment are carried in reserved view tags `dp-type-*`, `dp-scope-*`, `dp-env-*`. Context views are printed as `S, * -> S, S -> *`; deployment views list nodes/instances explicitly (probe evidence in the adapter's `view-rules.ts`).

**ADR-0012** — C12.1 Wave 0 runs jobs in Node `worker_threads` (works in CLI and Electron main). Moving desktop jobs to `utilityProcess` is a Wave 1 option behind the same `JobScheduler` API.

**ADR-0013** — C13.1 Pin better-sqlite3 exactly and keep it behind a storage interface so `node:sqlite` (experimental in Node 22, unflagged in Electron's Node 24) can replace it later. The cache itself is first used in Wave 3.
