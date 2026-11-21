# Wave 14: Local runtimes and the word index

| | |
|---|---|
| **Status** | Kept in 1.0.0 (scope decision P7, PRO-20). Owner answers applied (questions 0.4 and 0.5, 2026-11-18). No gate. Part B questions Q14.1 to Q14.5 are answered by them. The with-and-without-index measurement left this wave on 2026-11-19, with Wave 1's evaluation set (see Q1.3). **Split in two on 2026-11-20 (the second look at the waves): 14a is Part A (local runtimes, the typed context window, the size shown before a run) and runs in the import release, before Wave 15; 14b is Part B (the word index) and stays in the 0.12.0 group.** The context-window rule was settled by the owner on 2026-11-20 (see "Context window rule" below). 14a is ready after Wave 1; 14b is ready after Waves 1 and 2 |
| **Branch** | `feat/w14a-local-runtimes` and, later, `feat/w14b-word-index`, each from `main` after its predecessors are merged |
| **Size** | M in all: 14a S–M (steps 2 and 4a), 14b M (steps 3 and 4b). The file stays until both parts are built; write "14a built" in the README table in between |
| **Release** | **14a: 0.9.0 (with Waves 5 and 15; run before Wave 15). 14b: 0.12.0 (with Waves 13, 22, 20; run before Wave 22 and Wave 20)** |
| **Depends on** | **14a:** Wave 1 only (settings, the BMO sheet, packs). **14b:** Wave 1 (packs), Wave 2 (the BM25 module built for help search); Wave 5's code search, file gate and definition patterns are reused (Wave 5 is merged by then). Code is split into chunks the same way for every language (no language modules exist) |
| **Owner items** | 16, 15 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

1. **Local runtimes are first-class.** dp shows whether a local model runs on the GPU, offers bounded runtime settings, and supports local servers that speak the OpenAI chat API.
2. **A word index for choosing context.** BMO picks code and doc excerpts for big codebases with a BM25 word index. Same input, same ranking. Every pick is shown in the manifest.

dp itself gets no CUDA or MPS code, no vector index and no embeddings. The owner chose the word index only (question 0.5 in the questions section below) and chose local runtimes over native GPU code (0.4).

## Owner requests covered

> - Implement GPU acceleration for tasks such as LLMs or things where it is applicable with cuda/mps or commonly used things
> - What about allowing users to leverage a vector DB for faster processing of LLMs

Owner answers [2026-11-18]: "Make local runtimes first-class" (0.4) and "Do only the word indexing" (0.5).

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
- BMO settings live in `.dp/bmo.json`, mode 0600, and only architects change them (COD-08).
- The preview hash covers the provider, host and model (COD-03).
- The server has three runtime dependencies (`package.json:39-43`). This wave adds none.

**Ollama's GPU report** [Fact; docs.ollama.com/api/ps and ollama issues #8644, #19089, #19204, checked 2026-11-17]
- `GET /api/ps` lists the loaded models with `size` and `size_vram`, so the GPU share is `size_vram / size`.
- There is no field naming the processor.
- On some recent builds the value is reported too low.

**From earlier waves**
- Wave 1: context packs with a manifest. (The evaluation set was deferred by the owner, Q1.3.)
- Wave 2: a BM25 search over help sections (`src/help/`, or wherever Wave 2 put it). This wave moves the BM25 code to a shared place and reuses it.
- Wave 5, if merged: `src/core/codeSearch.ts` (exact name search on the file gate) and key code. Wave 5 has no per-language functions or types, by the owner's answer of 2026-11-20; it has a generic regex reader (part C) whose definition patterns Wave 14 can reuse.

## Design [Proposal; rewritten after the owner answers]

### Part A. Local runtimes

1. **Local OpenAI-compatible server.** A new provider kind, `openai-compatible`, for local servers that speak the OpenAI chat API.
   - Loopback only by default. Any other host needs `allowCustomEndpoint`, as today, and the same host checks apply (`hosts.ts`).
   - The preview hash covers the provider, host and model.
   - No API key is required for loopback; if one is set it goes through the credentials store (SEC-06).
2. **GPU status** in the BMO settings, read from Ollama's `/api/ps`: "GPU share about N%, as reported by Ollama". A note says the value can be reported too low. Other servers show "not reported".
3. **Bounded runtime settings.** A cap on the context size (`num_ctx`) and on how long a model stays loaded (`keep_alive`), validated against fixed limits and recorded in the run log. The preview shows them.
4. **Setup notes** per platform in README: Apple Silicon (Metal is used by Ollama by itself), NVIDIA (drivers for CUDA), and CPU only. A short "is my model on the GPU?" check that uses the status above.
5. **Context window and the size shown before a run** (the former backlog B7 (now in the wave files)). An optional typed context window per model next to the bounded runtime settings; the BMO sheet shows the approximate size of the request against it, or "limit not set". The rule above ("Context window rule") says when a run is refused. Tests: a window below the estimate refuses with the three facts in the message; no window never refuses on size alone; the window changes the preview hash.

### Part B. Word index

1. **Chunks** (`src/assistant/retrieval/`):
   - docs sections, notes, decisions and library entries;
   - code, split the same way for every language: at the definition lines of Wave 5's generic pattern table when that wave is merged (a definition starts a chunk), otherwise at blank-line blocks; a size cap per chunk; each chunk keeps its path and first line number. No language is parsed.
2. **BM25.** Identifiers are split at camelCase and snake_case, and the original identifier is kept as a term too, so a search for `parseOrder` finds both. Fixed parameters (k1, b) are written in code and recorded in the manifest.
3. **Stored** in `.dp/index/`, mode 0600, git-ignored, and rebuilt when content hashes change. A missing or stale index is rebuilt on demand.
4. **Filtered at every query** by the current intake rules and file gate, so a file closed after indexing is never returned. Excerpts are redacted like all BMO context (`redact.ts`).
5. **Using it.** `ask`, `explain` and `antipattern-review` add ranked excerpts within the code budget. The Wave 1 manifest lists each one as "found by search for …" with its rank and the terms that matched. Ties break by path, then line, so the order is stable.
   - **Offline BMO too** (COD-10). With the LLM off, a free-text question runs as `find` (Wave 2). Once the index exists, `find` also returns matching code chunks, shown as file chips that open the viewer at the line. Wave 5's exact `where <name>` stays separate: it needs no index and always gives every match.
6. **Measuring it is deferred.** Wave 1's evaluation set was deferred by the owner (Q1.3), so there is nothing to measure against yet. The index ships; whether it helps is part of "Testing and evaluating BMO" in ideas list I2.0. If that shows the index does not help, a next step (embeddings) is a separate plan.

## Determinism

| Output | Class |
|---|---|
| BM25 ranking | computed |
| Chunk boundaries (blank-line blocks, size cap) | computed; a chunk can split a function, so chunks are approximate |
| Answers | proposed |
| GPU share | as reported by Ollama |

## Owner answers

- **0.4:** Make local runtimes first-class. No native GPU code.
- **0.5:** Do only the word indexing. No embeddings, vector file or fusion.
- **Gate (Q14.1):** lifted by the two answers above.
- **2026-11-20 (best thinking):** Q14.1 to Q14.5 stand. Two changes from the code-reading answers: chunks are language-neutral, and the index also serves offline BMO's free-text search.
- Still open, with their recommendation as the default: nothing in this wave. (The route rule for building the index is decided in step 3 and recorded in the decision entry.)

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in PRO-20.*

### 0.4 What can GPU acceleration speed up here?

**Short answer.** In dp, a GPU helps a lot with one kind of work only: running an LLM and computing embeddings. That work happens inside the model runtime, not in dp. Ollama, for example, uses Metal on Apple Silicon and CUDA on NVIDIA cards by itself [Training].

dp's own work is scanning files, import graphs, metrics, diffs and layout. That is branching graph work on small data, which a GPU doesn't speed up. Node also has no practical GPU path without native add-ons, and those would break the all-TypeScript, plain `npm install` setup.

**Facts**
- dp calls Ollama's `/api/chat` with `num_ctx` and `num_predict` only. It sends no GPU option (`src/assistant/providerBackend.ts:475-491`).
- Ollama's `/api/ps` lists the loaded models with `size` and `size_vram`, so the share on the GPU is `size_vram / size`.
  - There is no field that names the processor.
  - On some recent builds the number is reported too low.
  - Sources, checked 2026-11-17: docs.ollama.com/api/ps; ollama issues #8644, #19089, #19204.
- Diagram layout runs in the browser (`static/assets/diagram-layout.js`).

**Options**

| Option | Trade-off |
|---|---|
| CUDA or MPS code inside dp | Native add-ons per platform, to speed up work dp doesn't do. Not recommended |
| A model in the browser on WebGPU | Large downloads, slower than a local runtime, a heavy dependency. Not now |
| **Make local runtimes first-class** | Show whether the model sits on the GPU. Offer bounded runtime settings (context size, how long a model stays loaded). Add a provider for local servers that speak the OpenAI chat API, loopback only by default as COD-08 pins hosts. Write setup notes per platform. **Recommended (Wave 14)** |

**Owner's thinking:** Make local runtimes first-class.

**Applied [2026-11-18].** The third option, as recommended. No CUDA or MPS code in dp. [Wave 14](wave-14-retrieval-local-models.md) is now about local runtimes and the word index; Q14.4 is answered by this. It is no longer gated on Wave 1's evaluation.

### 0.5 What would a vector DB speed up?

**Short answer.** A vector DB doesn't make the LLM faster. It helps choose which pieces of code and docs go into a prompt when the words in a question don't match the names in the code. A smaller, better-chosen prompt is faster and cheaper, and that is the whole gain.

**Facts**
- dp chooses context by fixed rules today: the objects you name, their parents and neighbours, their code paths, and excerpts ranked by rules (`src/assistant/runTask.ts:375-474`, `src/assistant/codeExcerpts.ts:272-345`).
- There is no embedding or retrieval code in the repository.
- The server has three runtime dependencies (`package.json:39-43`).

**Trade-offs**
- **Embeddings need a model.**
  - A local one, through Ollama, keeps code on the machine.
  - A cloud embedding service would send the whole indexed codebase at once. The per-run preview and its hash can't show that (COD-03).
- **The index goes stale when code changes.** It must be rebuilt, and filtered by the current intake rules at every query.
- **Similar is not the same as evidence.** Retrieval only picks what BMO reads. Citations (Wave 1) still decide what counts.
- **A database server or a native extension adds install weight.** A flat file with exact cosine search in TypeScript is likely fast enough for tens of thousands of pieces [Proposal; to be measured].
- **A word index (BM25) needs no model and gives the same answer every time.** It works well on code, where names matter.

**Recommended (Wave 14, gated)**
- A word index first.
- Optional local embeddings, in a flat file under `.dp/index/`.
- No database server.
- Build it only if Wave 1's evaluation shows that choosing context is what holds answers back.

**Owner's thinking:** Do only the word indexing.

**Applied [2026-11-18].** The word index (BM25) only. Dropped from Wave 14: local embeddings, the flat vector file, fusion, and the embeddings call to Ollama. Nothing else changes: no database server, no cloud calls. Embeddings can come back later as their own task if Wave 1's evaluation shows the word index misses what BMO needs (the evaluation comparison stays in Wave 14). This also answers Q14.1 (go), Q14.2, Q14.3 and Q14.5.

### ★Q14.1 The gate

**Recommended.** Build this wave only if Wave 1's evaluation shows BMO missing context it needed, or if you say go.

**Owner's thinking:** Answered by 0.4 and 0.5: go, for local runtimes and the word index. No gate.

### ★Q14.2 A vector DB, or a flat index?

**Recommended.** A flat index in `.dp/index/`, with no database server (see 0.5).

**Owner's thinking:** Answered by 0.5: only the word index. No vector file at all for now. The word index still lives in `.dp/index/`, with no database server.

### ★Q14.3 Embeddings

**Recommended.** Local only (Ollama). Cloud embeddings would send the whole index past the preview.

**Owner's thinking:** Answered by 0.5: no embeddings, local or cloud, in this wave.

### ★Q14.4 GPU

**Recommended.** No CUDA or MPS code in dp. Instead (see 0.4):
- local model servers;
- the GPU share as Ollama reports it;
- bounded runtime settings;
- setup notes.

**Owner's thinking:** Answered by 0.4: make local runtimes first-class, as recommended.

### Q14.5 Word index first

**Recommended.** BM25 first. Add embeddings on top only if the evaluation shows they help.

**Owner's thinking:** Answered by 0.5: BM25 only. Embeddings are not planned.

## Added by the 2026-11-20 split

- **Show LLM size information** (the former backlog B7 (now in the wave files); PRO-16, PRO-19 N12 and N15). An optional typed "context window" per model in the bounded runtime settings, and "limit not set" when unknown (dp keeps no table of models). dp analyses the request and shows its approximate size before the person starts. It is part of **14a**, so the import release (0.9.0) has it: the import runs are where requests get large. The BMO preview already shows an estimated token count and a finished run shows tokens in and out (`ui/src/common/BmoSheet.tsx`).

## Context window rule (owner, 2026-11-20; settles the disagreement between PRO-16 and PRO-19)

Two accepted decisions disagreed on what happens above the window: PRO-16 (Q-C1b) said refuse only above the chosen model's window (replacing the size refusal of COD-08); PRO-19 (N12, N15) said the refusal stays tied to the pass budget and the window only warns. The owner chose to combine them. This is a Proposal made by the assistant and adopted by the owner:

1. **A window the person typed for the chosen model is a limit.** A run whose estimated size is above it is refused, and the refusal names the window, the estimate and what to narrow. The estimate is approximate and the message says so; the person typed the window and can change it.
2. **No window typed: warn only.** The BMO sheet shows "limit not set" beside the estimate. dp never claims a limit it does not know.
3. **The pass-budget refusal (`runTokenLimit`, COD-08) stays** in both cases: it is a limit about effort, not about the model.
4. **The window is part of the preview hash**, so what was shown is what is sent (COD-03).
5. **Where the number comes from.** Typed by the person only. Reading an Ollama model's own value is allowed only after it has been checked against a real server (manual test plan U27).

Record this in the decision entry the wave writes, as an amendment of COD-08 (the refusal), PRO-16 (Q-C1b) and PRO-19 (N12, N15).

## Carried from the backlog (moved from planned_features.md, 2026-11-21)

- **Show LLM information: context limit, token count, token usage** (owner note of 2026-11-20; planned, part 14a). Facts: the BMO preview shows an estimated token count (`ui/src/common/BmoSheet.tsx`, near line 198) and a finished run shows tokens in and out (near line 231); a per-run size limit exists (`runTokenLimit`, `src/assistant/settings.ts`); prices are typed by the person, none are built in; a model's context limit is not shown and dp keeps no table of models. Open choices were a small table of limits (goes stale), asking the provider (a network call), or letting the person type it. Decided: PRO-19 (N12, N15) an optional typed setting, a warning only, "limit not set" when unknown. Owner, 2026-11-20 (PRO-16): no token cap in the chat; dp analyses the request and shows the approximate size before the person starts. Follow-up Q-C1b: refuse only above the chosen model's context window (replaces the size refusal of COD-08). Settled by the owner on 2026-11-20 (PRO-23): a window the person typed is a limit and a larger request is refused; with none typed, dp warns and shows "limit not set"; the pass-budget refusal stays.

## Stop and ask if

- Anyone asks for embeddings, cloud calls for indexing, or native GPU code. Each needs its own plan.
- The index would need a runtime dependency.
- The query-time filter cannot be applied to a chunk (for example, a source that has no path).

## Steps and agents

Part A (**14a**) and Part B (**14b**) are now two runs on two branches in two releases (14a in 0.9.0, before Wave 15; 14b in 0.12.0, before Wave 22). They touch different files (only Part A touches `ui/`, one settings panel and the BMO sheet). Steps 1, 5 and 6 are done once per run, for the part being built; the Docs and Review steps of 14a do not wait for 14b.

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor (at the start of each part) | Explore · Haiku | The files above | Anchors confirmed |
| 2 | **14a.** Part A: OpenAI-compatible provider, `/api/ps`, runtime settings, the typed context window and the size shown before a run (item 5), BMO settings UI and BMO sheet | general-purpose · Opus | `src/assistant/settings.ts`, `providerBackend.ts`, `runTask.ts` (the size check), `src/core/hosts.ts`, `ui/src/pages/BmoSettings.tsx`, `ui/src/common/BmoSheet.tsx` | Host rules hold; the preview and hash cover the new provider and the window; the refusal follows the "Context window rule" |
| 3 | **14b.** Part B: word index, chunks, query-time filter, use in tasks | general-purpose · Sonnet | `src/assistant/retrieval/` (new), `contextPack.ts`, `runTask.ts` | Deterministic ranking; a closed file is never returned |
| 4 | Tests (not the authors of steps 2 and 3): **4a** for 14a, **4b** for 14b | general-purpose · Sonnet | `tests/unit/retrieval*.test.ts` (4b), `tests/unit/bmo-provider*.test.ts` and the window tests (4a) | Tests as listed below |
| 5 | Docs, per part | general-purpose · Haiku | decisions.md, the review file, README (local models, GPU notes), CONTRIBUTING (security model), CLAUDE.md | All docs updated |
| 6 | Review, per part | main session | — | `/code-review` (high) and `/security-review` findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` for building the index (decide: an architect, or anyone allowed to run BMO; record it in the decision entry) and for the settings (architect).
- **Hub.** Hub-level BMO settings (COD-03). One index per project.
- **Read-only mode.** Queries are allowed; a missing index is built in memory, not on disk.
- **CONTRIBUTING security model.** The new outbound path: the OpenAI-compatible provider, loopback by default. The word index makes no outbound call.
- **Static export.** Not affected.

## Tests

- **BM25.** Deterministic ranking, ties broken by path and line, identifier splitting, and the original identifier kept as a term.
- **Query-time filter.** A file closed after indexing is never returned.
- **Index rebuild.** Triggered when a content hash changes.
- **Provider host rules.**
  - Loopback is accepted.
  - A remote host is refused without the setting.
  - Link-local addresses are refused.
- **`/api/ps` parsing.**
  - A model fully on the GPU.
  - A model with `size_vram` 0.
  - A malformed reply.
- **Runtime settings.** Out-of-range values are refused; the values appear in the preview and the run log.
- **Context window (14a).** A typed window below the estimate refuses the run, and the message names the window, the estimate and what to narrow; no window typed never refuses on size (it shows "limit not set"); the pass-budget refusal still fires with or without a window; a changed window changes the preview hash; an invalid value is refused by the settings check.

## Docs

- **New decision entry:** local runtimes first-class (OpenAI-compatible provider, GPU status, bounded settings); word index only, in `.dp/index/`; no embeddings, no vector file, no database server, no GPU code in dp.
- **README:** local models and GPU notes.
- **CONTRIBUTING:** the outbound path.
- **CLAUDE.md:** `retrieval/`.
- **The review file** (not the CHANGELOG, which the release change writes): this wave's notes for the release entry, one set per part.
- **decision entry for the window rule:** the "Context window rule" above, as an amendment of COD-08, PRO-16 and PRO-19 (N12, N15).
- **`docs/determinism.md`:** rows for this wave.
- **planned_features.md:** row 14 done; add "embeddings on top of the word index" as an idea, only if the later evaluation shows a gap.

## Out of scope

- Embeddings of any kind, a vector file or vector database, fusion of rankings.
- CUDA or MPS code in dp.
- Models running in the browser on WebGPU.
- Database servers.
- Multi-pass summarising (the former backlog B4 (now in the wave files)).

## Start prompt

```
Run part <14a | 14b> of Wave 14 of the designPerspectives plan (14a is Part A, local runtimes
and the context window; 14b is Part B, the word index). Read docs/waves/README.md, then
docs/waves/wave-14-retrieval-local-models.md, and follow them for that part only. Branch
from main as the header says, run the steps with the agents and models in the table, brief each subagent with
files and line ranges and the words "never run git stash, never push", run the checks,
update the docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met
or an answer this wave needs is missing.
```
