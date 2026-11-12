# designPerspectives

An open-source (MIT), local-first desktop app and CLI for designing and understanding software architecture with the [C4 model](https://c4model.com/). The model lives as text files in your repository (`architecture/`), every diagram is a view of that one model, decisions are recorded as ADRs, and implementation is handed off to external coding agents.

> **Status: Wave 0 (foundations).** What exists today: the model format, validation, a CLI, plug-in host, job scheduler, exporters, and a minimal desktop shell that renders one view. See [`docs/wave-views/wave-0_view.md`](docs/wave-views/wave-0_view.md) for what was built and how to check it.

## Quick start

Requirements: Node.js ≥ 22.22, pnpm 10.

```sh
pnpm install
pnpm build

# CLI
node apps/cli/dist/bin.js init my-system --name "My System"
node apps/cli/dist/bin.js validate my-system
node apps/cli/dist/bin.js validate examples/internet-banking
node apps/cli/dist/bin.js export examples/internet-banking --format mermaid --out /tmp/ibs-mermaid

# Desktop app (opens the Internet Banking demo)
pnpm desktop

# All checks run by CI
pnpm check
```

## Repository layout

| Path | What |
|---|---|
| `packages/contracts` | Domain types, ports (plug-in contracts), on-disk schemas (Zod), contract test suites |
| `packages/core` | Headless core: Model Store, Model Validation, sidecars, Plug-in Host, Job Scheduler |
| `packages/plugins/*` | Plug-ins: LikeC4 model adapter, exporters |
| `apps/cli` | `dp` command-line tool |
| `apps/desktop` | Electron desktop app |
| `examples/` | Demo workspaces (Internet Banking System from *The C4 Model*) |
| `fixtures/` | Pinned public repositories used as test fixtures (cloned, never vendored) |
| `docs/spikes/` | Wave 0 verification spike reports |
| `docs/adr/` | ADR status changes |
| `docs/wave-views/` | One review document per completed wave |
| `tools/ff/` | Fitness functions (architecture checks run in CI) |

## Licence

MIT. See [LICENSE](LICENSE). Dependencies are restricted to MIT/Apache-2.0/BSD/ISC/MPL-2.0/EPL-2.0-style licences (checked in CI, fitness function FF8).
