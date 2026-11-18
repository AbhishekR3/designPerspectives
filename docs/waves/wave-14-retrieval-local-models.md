# Wave 14: Retrieval and local models

| | |
|---|---|
| **Status** | **Gated** (★Q14.1). Start only if Wave 1's evaluation shows BMO missing context it needed, or if the owner says go. Waiting for owner answers: ★Q14.1, ★Q14.2, ★Q14.3, ★Q14.4, Q14.5 ([questions.md](questions.md)) |
| **Branch** | `feat/w14-retrieval-local-models`, from `main` after Wave 13 is merged |
| **Size** | M |
| **Depends on** | Wave 1 (packs, evaluation), Wave 2 (the help search index), Wave 5 (language modules, to split code into chunks) |
| **Owner items** | 16, 15 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

1. **Better context for big codebases.** BMO picks context better, using a word index over code and docs, and optional local embeddings, with no database server. Every pick is shown in the manifest.
2. **Local runtimes.** Local model runtimes are first-class: dp shows whether the model runs on the GPU, offers bounded runtime settings, and supports local servers that speak the OpenAI chat API.

dp itself gets no CUDA or MPS code. The reasons are in [questions.md](questions.md) 0.4 and 0.5.

## Owner requests covered

> - Implement GPU acceleration for tasks such as LLMs or things where it is applicable with cuda/mps or commonly used things
> - What about allowing users to leverage a vector DB for faster processing of LLMs

## What exists today [Fact]

**Context selection**
- No retrieval or embedding code exists.
- Context is chosen by fixed rules: `planAsk` (`src/assistant/runTask.ts:375-474`) and `objectExcerpts` (`src/assistant/codeExcerpts.ts:272-345`).

**Providers** (`src/assistant/settings.ts`)
- Three providers: `anthropic`, `openai` and `ollama` (`:30`).
- The cloud hosts are pinned (`:37-41`, `:132-143`). Another address needs `allowCustomEndpoint`. Model names are checked against `MODEL_RE` (`:122`).
- Ollama is called at `/api/chat` with `num_ctx` and `num_predict` only, and no GPU option (`src/assistant/providerBackend.ts:475-491`).
- Host checks refuse link-local and cloud-metadata addresses, and remote hosts need https (`src/core/hosts.ts:33-51`).

**BMO rules this wave must keep**
- BMO settings live in `.dp/bmo.json`, mode 0600, and only architects change them (DEC-065).
- The preview hash covers the provider, host and model (DEC-064).
- The server has three runtime dependencies (`package.json:39-43`).

**Ollama's GPU report** [Fact; docs.ollama.com/api/ps and ollama issues #8644, #19089, #19204, checked 2026-11-17]
- `GET /api/ps` lists the loaded models with `size` and `size_vram`, so the GPU share is `size_vram / size`.
- There is no field naming the processor.
- On some recent builds the value is reported too low.

**From earlier waves**
- Wave 2: a BM25 search over help sections.
- Wave 5: `functions()` and `types()` per language, for splitting code into chunks.

## Design [Proposal; rewritten after the owner answers]

1. **Word index** (`src/assistant/retrieval/`; Q14.5).
   - BM25 over chunks:
     - docs sections, notes, decisions and library entries;
     - code, split by function and class using the Wave 5 language modules.
   - Identifiers are split at camelCase and snake_case.
   - Stored in `.dp/index/`, mode 0600, and rebuilt when content hashes change.
   - **Filtered by the current intake rules and file gate at every query**, so a file closed after indexing is never returned.
2. **Using it.** `ask`, `explain` and `antipattern-review` add ranked excerpts within the code budget. The manifest lists each one as "found by search for …".
3. **Optional local embeddings** (★Q14.2, ★Q14.3). Off by default.
   - Vectors come from Ollama `/api/embed`, on loopback, or on a host the architect allowed.
   - They are stored in a flat file under `.dp/index/`. Search is exact cosine, written in TypeScript. Results are combined with BM25 by reciprocal rank fusion.
   - Building the index shows what will be embedded (count and size) and needs a confirmation.
   - No cloud embeddings, and no database server.
4. **Local OpenAI-compatible server** (★Q14.4). A new provider kind, loopback only by default. Any other host needs `allowCustomEndpoint`, as today, and the same host checks apply.
5. **GPU status** in the BMO settings, read from `/api/ps`: "GPU share about N%, as reported by Ollama". A note says the value can be reported too low.
6. **Bounded runtime settings.** A cap on the context size and on how long a model stays loaded (`keep_alive`), validated and recorded in the run log.
7. **Setup notes** per platform in README: Apple Silicon (Metal is used by itself), NVIDIA (drivers for CUDA), and CPU only.
8. **Measure it.** Run Wave 1's evaluation with retrieval and without it, and put both results in reviews.md.

## Determinism

| Output | Class |
|---|---|
| BM25 ranking | computed |
| Embedding ranking | computed for a fixed model, but changes when the model changes; labelled "ranked by embeddings" |
| Answers | proposed |
| GPU share | as reported by Ollama |

## Owner answers

*Filled in when the answers are applied.*

## Stop and ask if

- The gate (★Q14.1) is not met.
- ★Q14.3 asks for cloud embeddings.
- ★Q14.4 asks for native GPU code.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Providers and outbound calls: OpenAI-compatible local provider, embeddings call, `/api/ps`, settings | general-purpose · Opus | `src/assistant/settings.ts`, `providerBackend.ts`, `src/core/hosts.ts`, `ui/src/pages/BmoSettings.tsx` | Host rules hold; the preview and hash cover the new provider |
| 3 | Word index, chunks, query-time filter, use in tasks | general-purpose · Sonnet | `src/assistant/retrieval/` (new), `contextPack.ts`, `runTask.ts` | Deterministic ranking; a closed file is never returned |
| 4 | Optional embeddings: flat index, cosine, fusion | general-purpose · Sonnet | `retrieval/vectors.ts` (new) | Off by default; confirmation before building |
| 5 | Tests (another agent), and the evaluation comparison | general-purpose · Sonnet | `tests/unit/retrieval*.test.ts`, `tests/unit/bmo-provider*.test.ts` | Tests as listed below |
| 6 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md (with the measurements), README (local models, GPU notes), CONTRIBUTING (security model), CLAUDE.md | All docs updated |
| 7 | Review | main session | — | `/code-review` (high) and `/security-review` findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` for building the index (decide: an architect, or anyone allowed to run BMO; record it in the DEC) and for the settings (architect).
- **Hub.** Hub-level BMO settings (DEC-064). One index per project.
- **Read-only mode.** Queries are allowed; a missing index is built in memory, not on disk.
- **CONTRIBUTING security model.** The new outbound paths: loopback by default, and embeddings for allowed hosts only.
- **Static export.** Not affected.

## Tests

- **BM25.** Deterministic ranking, and identifier splitting.
- **Query-time filter.** A file closed after indexing is never returned.
- **Index rebuild.** Triggered when a content hash changes.
- **Embeddings.** Checked with a fake embedder: the fusion is deterministic for fixed vectors.
- **Provider host rules.**
  - Loopback is accepted.
  - A remote host is refused without the setting.
  - Link-local addresses are refused.
- **`/api/ps` parsing.**
  - A model fully on the GPU.
  - A model with `size_vram` 0.
  - A malformed reply.
- **The evaluation.** It runs with retrieval and without it.

## Docs

- **New DEC:** the word index first; optional local embeddings in a flat file; no database server; no GPU code in dp; the local provider on loopback by default.
- **README:** local models and GPU notes.
- **CONTRIBUTING:** the outbound paths.
- **CLAUDE.md:** `retrieval/`.
- **CHANGELOG** and **reviews.md:** this wave's entries, including the measurements.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- CUDA or MPS code in dp.
- Models running in the browser on WebGPU.
- Cloud embeddings.
- Database servers.
- Multi-pass summarising (future_tasks 1.3).

## Start prompt

```
Run Wave 14 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-14-retrieval-local-models.md, and follow them. First check the gate in the
header with me. Then branch from main as the header says, run the steps with the agents and
models in the table, brief each subagent with files and line ranges and the words "never
run git stash, never push", run the checks, update the docs, and commit by path. Stop and
ask me if a "Stop and ask if" condition is met or an answer this wave needs is missing.
```
