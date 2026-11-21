# Wave 22: Digests for large codebases

| | |
|---|---|
| **Status** | Written 2026-11-20 from [import-design.md](../import-design.md) section 7 and DEC-103 (N13). The shape is the assistant's proposal; the owner may overrule it. Ready after Waves 5 and 15 |
| **Branch** | `feat/w22-digests`, from `main` after Waves 5 and 15 are merged |
| **Size** | M–L. Split point: 22a is the computed digests, the hash and `dp digest` (steps 2 to 3); 22b is the BMO summary, the UI and `dp context --write` (steps 4 to 6) |
| **Release** | 0.12.0 (with Waves 13, 14b, 20), run after Wave 14b and before Wave 20 (14b's word index chooses the excerpts of the one component in focus; digests cover everything else) |
| **Depends on** | Wave 5 (key code, the generic reader's definitions and imports), Wave 15 (the scan's candidates and the N1 skip list). Wave 2 (`dp context`) is extended by step 6; if it is not merged, step 6 waits. Wave 20 uses the digests and is better with them; neither blocks the other |
| **Owner items** | The open question of analysing a very large codebase (Q-C1b, N13; planned_features.md B4 "multi-pass summarising") |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave. Also read [../import-design.md](../import-design.md) section 7 (the methods, the two kinds of document, the trade-offs) and [DEC-103](../decisions.md#pro-19--dec-103--code-import-and-bmo-choices-and-the-080-split-n1-to-n15), N13.

## Goal

A very large repository costs one pass to understand and small runs afterwards. dp writes a short digest per container and component once, remembers exactly what it was built from, and later runs (a chat question, a Wave 20 round, a re-import) send the digests of the scope and its neighbours plus the code of only the component in focus. Nothing is regenerated without being asked, because regeneration can cost money.

## What exists today [Fact]

- **One digest per run, cut at a budget.** `src/assistant/codeExcerpts.ts` ranks excerpts (manifests, entry points, most-imported folders) and cuts at `passBudgetTokens` (default 100,000); what did not fit is listed as "left out". Nothing is remembered between runs.
- **Review data lives in `architecture/import/`** and never in the model (DEC-051); `evidence.json` is the scan's facts. A new store there follows the same rule.
- **Redaction and prompts are server-side** (`src/assistant/redact.ts`, `prompts.ts`, `runTask.ts`): a client sends selectors only, the preview returns the exact prompt and its hash, and a run is refused unless the hash matches (DEC-065).
- **A price can be set** (`pricePerMTok`, `estimateCost` in `src/assistant/settings.ts`), and the preview shows an estimate.
- Verify each anchor in step 1; line numbers move.

## Design [Proposal]

1. **The store.** `architecture/import/digests/<id>.md` per container and component (the id is the model id, or the candidate id before an import), one `MAP.md` for the system, and `architecture/import/digests/index.json` with, per digest: scope, the list of `{path, sha256}` it was built from, the built date, and the summary state (`none`, `proposed`, `accepted`, `verified`). Review data, not model data.
2. **The computed part** (class *computed*, or *approximate* where the reader is). The scan facts for the scope, entry points and key code (Wave 5), the names of definitions and the imports to and from the scope, the file count, the skipped folders (N1) and the hash. It never needs BMO and never calls the network.
3. **The staleness hash.** The hash of the sorted `{path, sha256}` list. A digest is stale when the files in its scope differ from the list. dp lists stale digests (`dp digest status`, the Import page) and rebuilds one only when asked. This is a cache check, not drift detection (DEC-097).
4. **The BMO summary** (class *proposed*). A new task `digest-summary`: a short summary of what the scope does, citing the files used, labelled proposed, written only after the person has seen the preview, the estimated tokens and (if a price is set) the estimated cost, and confirmed its hash (DEC-065, DEC-099). A person can mark a summary accepted or verified; an accepted summary can be promoted to the object's description or a note through the usual draft path. A digest is data, never instructions (DEC-064).
5. **Use in runs.** `codeExcerpts.ts` takes an option to use digests: the model text, the digests of the scope and its neighbours (their lines in the model), and the code of only the component in focus. A stale digest is used with a visible "out of date" line, never silently; a missing digest falls back to today's behaviour.
6. **The agent instructions file** (`dp context --write [PATH]`). Writes the Wave 2 context Markdown (systems, containers, where each lives, key code, the commands) to `PATH`, default `architecture/CONTEXT.md`. The file starts with a marker line; dp refuses to overwrite a file that does not carry it, so a person's own `CLAUDE.md` or `AGENTS.md` is never touched. It is written only on request, never after an apply.
7. **Interfaces.**
   - CLI: `dp digest build [--level c1|c2|c3] [--container ID] [--component ID] [--summary]`, `dp digest status`, `dp digest accept|verify ID`. `--summary` sends nothing without `--yes-send`, as `dp bmo run` does.
   - Routes under `/api/digests*` (list, build, summary preview and run, accept); roles follow the BMO roles; read-only mode builds nothing.
   - UI: a Digests list on the Import page (name, scope, built date, state, "out of date"), a preview sheet reusing `BmoSheet.tsx`, and a note in the readiness report of how many digests are stale.

## Determinism

| Output | Class |
|---|---|
| The computed part and the hash | computed (definitions and imports: approximate, a rule known to miss cases) |
| The summary | proposed; cites files; never stored as model data unless a person promotes it |
| Staleness | computed |
| The context file | computed from the model, and the digests |

## Owner answers

- **N13 (2026-11-20, DEC-103; assistant's reasoning):** a wave of its own after Waves 5 and 15; a computed part first, a labelled BMO summary on top; a hash that marks staleness and never regenerates silently; the agent instructions file only on request.

## Stop and ask if

- A digest would have to be written into the model (DEC-051).
- Anything wants to refresh digests without being asked, or to overwrite a file dp did not write.
- The generic reader of Wave 5 is not merged and the computed part would need per-language code (DEC-096).

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | `codeExcerpts.ts`, `redact.ts`, `runTask.ts`, `tasks.ts`, `importStatus.ts`, Wave 5's reader | Anchors confirmed |
| 2 | Store, computed part, hash | general-purpose · Opus | `src/import/digests.ts` (new), `src/shared/types.ts` | Same input gives the same files and hash on two runs |
| 3 | `dp digest build` and `status`, routes | general-purpose · Sonnet | `src/cli.ts`, `src/server/routes/digests.ts` (new), `src/server/auth.ts` | CLI and routes agree; read-only builds nothing |
| 4 | `digest-summary` task and the use in runs | general-purpose · Opus | `src/assistant/tasks.ts`, `prompts.ts`, `runTask.ts`, `codeExcerpts.ts` | Preview, hash check, estimate and cost shown; a stale digest is labelled |
| 5 | Digests list, sheet, readiness note | general-purpose · Sonnet | `ui/src/pages/ImportPage.tsx`, `ui/src/hooks/useBmo.ts` or a new hook | Works by keyboard; summary state changes in the list |
| 6 | `dp context --write` | general-purpose · Sonnet | `src/cli.ts`, Wave 2's context module | Refuses a file without the marker; writes only on request |
| 7 | Tests by another agent | general-purpose · Sonnet | `tests/unit/digests*.test.ts`, `tests/browser/digests.spec.ts` | Tests as listed below |
| 8 | Docs | general-purpose · Haiku | decisions.md, the review file (notes for the release entry, not the CHANGELOG), README, CLAUDE.md | All docs updated |
| 9 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` for build, summary run and accept; GET routes need none.
- **Redaction.** Everything sent for a summary passes `redact.ts`; a secret-looking value in a digest's computed part is masked before it is written.
- **Hub.** Per-project digests; per-project roles.
- **Static export.** Digests are not exported by default; an opt-in `--with digests` is added to the Wave 21 lists.
- **Git.** The folder is committable like `evidence.json`, or git-ignored if the team prefers; the docs say so.
- **Demo.** Build the computed digests for the demo's sample code, run `npm run make-demo`, commit `demo/` only if the demo's files change.

## Tests

- **Hash.** Changing one file makes exactly its digest stale; a skipped folder (N1) does not.
- **No silent refresh.** `dp digest status` changes nothing on disk; a stale digest is rebuilt only by `build`.
- **Summary.** Preview first; a changed prompt is refused (hash); `--summary` without `--yes-send` sends nothing; cost shown only when a price is set.
- **Use in runs.** The digests replace the code of neighbours; the focus component's code is still sent; a missing digest falls back.
- **Context file.** Refuses to overwrite a file without the marker; never written after an apply.
- **Roles and read-only.** A viewer cannot build; read-only builds nothing.
- **Browser.** The Digests list shows "out of date", and a summary is accepted from the sheet.

## Docs

- **New DEC:** the store and its place outside the model; no silent regeneration; the file-overwrite rule of `dp context --write`.
- **README:** digests. **CLAUDE.md:** `digests.ts`, `routes/digests.ts`. **import-design.md** section 7: mark methods 9 and 10 built.
- **The review file** (not the CHANGELOG, which the release change writes) and **`docs/determinism.md`** rows.

## Out of scope

- Drift of any kind (ideas list I2.2).
- Embeddings and vector files (Wave 14 stays a word index).
- Keeping the context file up to date after every apply.
- Digests of languages the generic reader cannot read: they get the computed facts the scan has and a "not analysable" line.

## Start prompt

```
Run Wave 22 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-22-digests.md, and follow them: branch from main as the header says, run
the steps with the agents and models in the table, brief each subagent with files and line
ranges and the words "never run git stash, never push", run the checks, update the docs,
and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an answer
this wave needs is missing.
```
