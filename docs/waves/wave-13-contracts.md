# Wave 13: Contracts and consumer notifications

| | |
|---|---|
| **Status** | Owner answers applied (2026-11-19; decided 2026-11-20: JSON only, no YAML dependency in this wave). Ready to run after Waves 4 and 6 |
| **Branch** | `feat/w13-contracts`, from `main` after Waves 4 and 6 are merged (Wave 12 is parked and not needed) |
| **Size** | M–L |
| **Release** | 0.11.0 (with Waves 14, 20, 22) |
| **Depends on** | Wave 4 (data access letters), Wave 6 (Findings, acknowledgements) |
| **Owner items** | 19 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

When what a service sends out changes, the services that read it are told. A change can come from three places:
- an edit to the model;
- a change to a schema file in the code;
- a different shape seen in a live call.

Consumers are told on the diagram, on the home page, in the bell, in CI and, if you want, as linked work. Each consumer marks the change as checked when it has looked.

## Owner requests covered

> - When output of service A changes, it should notify service B since service B takes the output of service A as the input. It should notify the user and notify in the UI about this.

## What exists today [Fact]

**What a relationship carries** (`src/shared/types.ts:417-442`)
- Endpoints: `dp.endpoints` `{method, path}`, HTTP only (`types.ts:445-448`).
  - Cleaned by `cleanEndpoints` (`src/core/modelEdits.ts:91-116`).
  - Matched by `endpointMatches` and suggested by `suggestEndpoint` (`src/core/endpoints.ts:32-54`).
- A sample: `dp.example`, up to 8,000 characters, and `dp.format`, which is free text (`modelEdits.ts:75-78`, `:141-147`).
- Also stages, and samples per flow step (`dp.stepData`, `src/core/flows.ts:26-45`).

**What doesn't exist**
- No schema of any kind is stored: no OpenAPI, JSON Schema or protobuf for payloads.
- No function lists the consumers of a service. The diff marks ancestors only, not neighbours (`src/core/diff.ts:205-221`).

**What helps**
- The shape of samples is compared at the top level only (`compareFields`, `ui/src/inspect/SamplePayload.tsx:26-33`).
- Readers and writers of data are known (`sharedUsage`, `src/core/catalog.ts:118-137`).
- Wave 4 adds CRUD letters to data access.
- A relationship through a broker is two relationships: source → broker → target (DEC-065 `via`).

**Ways to tell people**
- Home-page `AttentionItem` (`types.ts:1166-1172`; `src/core/homeSummary.ts:168-240`).
- The bell's "Now" list, built in the browser (`ui/src/App.tsx:591-610`). It stores no list per person (DEC-080).
- Linked work (DEC-085, `src/core/work.ts`).
- Badges on boxes and lines (`ui/src/canvas/BoxesAndLines.tsx:461-503`, `:1141-1151`).

**Other facts this wave relies on**
- There is no YAML library; the scan reads YAML line by line.
- Fingerprints are computed when asked, from the contract file's text. A contract file is a small JSON document, so no cache is needed (Wave 5 no longer builds one).

## Design [Proposal; rewritten after the owner answers]

1. **A contract** (★Q13.1). `dp.contract` on a relationship holds:
   - `kind`: `openapi`, `jsonschema` or `sample`;
   - `file`: a path in the producer's code;
   - `pointer`: a JSON pointer to the operation or schema;
   - `direction`: `response`, `request`, `message` or `data`.

   Files are read as JSON only in this wave. A team whose specs are YAML exports them to JSON in CI (one command in most spec tools) and points the contract at the JSON file; the weak fallback, the top-level shape of samples, still works. Reading YAML directly is a future task (a new dependency, so the owner decides it then).
2. **Fingerprint.**
   - Resolve local `$ref`s, sort the keys, write canonical JSON, and take its sha256.
   - It is computed from the code at a version: the working tree, or a git ref.
3. **Impact index** (`src/core/impact.ts`, new; ★Q13.2). The consumers of A's output are:
   - the callers of A's endpoints (relationships to A whose `dp.endpoints` match);
   - the readers of data A writes (data access);
   - whoever reads a topic A publishes to, through the broker pairs.

   Impact is keyed on endpoints and data, not on which way a line points. Drift and risk can reuse the index later.
4. **Finding changes** (Q13.5).
   - **Model changes.** When a draft changes a contract, endpoints, the sample or format, or the data, the change list and the apply dialog show "Consumers to tell: B, C".
   - **Code changes.** When the current fingerprint differs from the consumer's `dp.contract.seen`, the consumer gets a Finding: "contract changed".
     - Breaking changes are classed by direction, for JSON Schema and OpenAPI:
       - a removed response field;
       - a type change;
       - a new required request field;
       - a removed endpoint.
     - Anything else is "changed, impact unknown".
   - **Live calls.** During System Testing, a body whose top-level shape differs from the sample gives an information Finding. System Testing is off by default in 1.0.0 (DEC-104, [planned_features.md](../planned_features.md) A8), so this step runs only when the mode is switched on; it is the one optional part of this wave and nothing else depends on it.
5. **Marking as checked** (★Q13.3). "Mark as checked" sets `dp.contract.seen` on the consumer's relationship. It is a model edit: engineers make it in drafts, architects on main.
6. **Telling people** (Q13.4).
   - A "needs a look" item of kind `contract-change` on the home page, and a count in the bell's "Now".
   - A badge on the consumer's box and line.
   - "Create linked work for the consumer", optional.
   - `dp contracts [--fail-on breaking|any]` for CI, with a CI example.
   - No email, chat or webhooks.

## Determinism

| Output | Class |
|---|---|
| Fingerprints, the impact index, breaking classes for supported formats | computed |
| "Impact unknown" | stated when dp can't tell |
| A different shape in a live call | computed for the top level only, and says so |

## Owner answers

Applied 2026-11-19: the owner answered Part A and left Part B blank, so every Q below uses its recommendation ([the questions section below](#questions-options-and-answers-moved-from-questionsmd)).

- **Q13.1 (best thinking, 2026-11-20):** JSON only (OpenAPI and JSON Schema). No YAML dependency now; the server keeps three runtime dependencies. Trade-off: most real OpenAPI files are YAML, so those teams need the JSON export step. "Read YAML contracts" is a line in ideas list I2.1.
- **Q13.2 to Q13.5 (best thinking, 2026-11-20):** hold as recommended, below.
- **Q13.2:** a service's output is its endpoint responses, the messages it publishes and the data it writes; impact is found through endpoints and data, not line direction. The "data it writes" part depends on the data access built in DEC-055; Wave 4's CRUD letters are not needed.
- **Q13.3:** the consumer's line stores the fingerprint it has checked (`dp.contract.seen`); marking it is an ordinary edit.
- **Q13.4:** a computed "needs a look" item, a badge, optional linked work, `dp contracts --fail-on breaking`; no email or webhooks.
- **Q13.5:** dp computes removed fields, type changes, new required request fields and removed endpoints; anything else is "changed, impact unknown".
- **Vision:** this wave is feature F.

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in DEC-104.*

### ★Q13.1 Which contract formats first?

**Analysis** [Fact]
- No schema exists today:
  - `dp.endpoints` is a method and a path (`src/shared/types.ts:445-448`);
  - `dp.example` is a sample.
- There is no YAML library; the scan reads YAML line by line.

**Options**
- OpenAPI and JSON Schema in JSON first.
- YAML through a new dependency.
- AsyncAPI and protobuf later.
- As a weak fallback, the top-level shape of the samples (`ui/src/inspect/SamplePayload.tsx:26-33`).

**Recommended.** JSON first, and ask you before adding a YAML dependency. Are your OpenAPI files YAML?

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** JSON only (OpenAPI and JSON Schema); no YAML dependency in this wave, so the server keeps three runtime dependencies. **Trade-off:** most real OpenAPI files are YAML, so those teams export to JSON in CI first. Reading YAML directly is a line in ideas list I2.1, and the dependency is then your decision. The earlier question 'are your OpenAPI files YAML?' no longer blocks the wave.

### ★Q13.2 What "the output of service A" means

**Proposed.** A's output is three things:
1. **The responses of A's endpoints,** read by the callers.
2. **The messages A publishes,** read by whoever reads the topic, through the broker (DEC-065 `via`).
3. **The data A writes,** read by its readers (DEC-055).

So dp finds who is affected through endpoints and data, not through which way a line points.

Requests and responses break in opposite ways:
- a new required request field breaks callers;
- a removed response field breaks readers.

**Recommended.** Yes.

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: a service's output is its endpoint responses, the messages it publishes and the data it writes.

### ★Q13.3 How a consumer marks a change as checked

**Proposed**
- The consumer's line stores the fingerprint it has checked (`dp.contract.seen`).
- When the current fingerprint differs, the consumer "needs a look".
- "Mark as checked" is an ordinary model edit: engineers make it in drafts, architects on main.

**Recommended.** Yes.

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: the consumer's line stores the fingerprint it has checked (`dp.contract.seen`).

### Q13.4 How people are told

**Recommended**
- A computed "needs a look" item, on the home page and in the bell's "Now".
- A badge on the consumer.
- Optional linked work on the consumer (DEC-085).
- `dp contracts --fail-on breaking` in CI.
- No email, chat or webhooks: the bell keeps no stored list per person (DEC-080).

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: a computed 'needs a look' item, a badge, optional linked work and `dp contracts --fail-on breaking`. No email or webhooks.

### Q13.5 Breaking changes

**Recommended.** For JSON Schema and OpenAPI, dp computes these:
- a removed field;
- a type change;
- a new required request field;
- a removed endpoint.

Anything else is "changed, impact unknown".

**Owner's thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: removed fields, type changes, new required request fields and removed endpoints; anything else is 'changed, impact unknown'.

## Stop and ask if

- Anyone asks for YAML, AsyncAPI or protobuf now. Each is a new reader, and YAML a new dependency.
- ★Q13.2 means something other than responses, published messages and written data.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Contract meaning: direction rules, canonical fingerprint, breaking classes | general-purpose · Opus | `src/core/contracts.ts` (new), `src/core/impact.ts` (new), `modelEdits.ts`, `types.ts` | Fingerprints stable; breaking rules correct by direction |
| 3 | Finding changes, marking as checked, CLI, home and bell | general-purpose · Sonnet | `drafts.ts` and `diff.ts` (the impact list), `homeSummary.ts`, `App.tsx`, `src/cli.ts`, `src/server/routes/contracts.ts` (new), `auth.ts` | Exit codes correct; ROUTE_RULES added |
| 4 | UI: contract field in the panel, badges, impact in the change list and apply dialog | general-purpose · Sonnet | `RelationshipPanel.tsx`, `BoxesAndLines.tsx`, `ui/src/drafts/ChangeList.tsx`, `ApplyDialog.tsx` | Works by keyboard |
| 5 | Fixtures and tests (another agent) | general-purpose · Sonnet | `tests/fixtures/contracts/`, `tests/unit/contracts*.test.ts`, `tests/browser/` | Tests as listed below |
| 6 | Docs and CI example | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md, `demo/ci-examples/` | All docs updated |
| 7 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` for marking as checked (`edit`) and for creating linked work (the existing work rules).
- **Hub.** Consumers in other projects through catalog data are out of scope for the first cut. Say so in the limits.
- **Read-only mode.** Viewing only.
- **Model data.** `dp.contract` and `dp.contract.seen` need units, diff labels, merge, the change list, and the `dp diff` section "Consumers to tell".
- **Static export.** It includes contract references, not fingerprints.

## Tests

- **Fingerprints.** The same whatever the key order or whitespace. Local `$ref`s are resolved.
- **Breaking classes,** in both request and response directions.
- **Impact index.** Callers, readers, and subscribers through a broker.
- **Marking as checked.** "Seen" and "not seen" states; a draft, then apply.
- **`dp contracts`.** Exit codes.
- **Browser.** The consumer badge; marking as checked; the impact list in the apply dialog.

## Docs

- **New DEC:**
  - what "A's output" means;
  - contracts and fingerprints;
  - impact keyed on endpoints and data;
  - marking as checked as model data;
  - how people are told.
- **README:** contracts.
- **CLAUDE.md:** `contracts.ts` and `impact.ts`.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- YAML, AsyncAPI and protobuf.
- Consumers across hub projects.
- Email, chat and webhooks.
- Comparing nested JSON in live calls (ideas list I2.7).

## Start prompt

```
Run Wave 13 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-13-contracts.md, and follow them: branch from main as the header says, run
the steps with the agents and models in the table, brief each subagent with files and line
ranges and the words "never run git stash, never push", run the checks, update the docs,
and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an answer
this wave needs is missing.
```
