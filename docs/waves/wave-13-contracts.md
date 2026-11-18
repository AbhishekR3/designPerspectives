# Wave 13: Contracts and consumer notifications

| | |
|---|---|
| **Status** | Waiting for owner answers: ★Q13.1, ★Q13.2, ★Q13.3, Q13.4, Q13.5 ([questions.md](questions.md)) |
| **Branch** | `feat/w13-contracts`, from `main` after Wave 12 is merged |
| **Size** | M–L |
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
- Wave 5 adds a cache of content hashes in `.dp/cache/`.

## Design [Proposal; rewritten after the owner answers]

1. **A contract** (★Q13.1). `dp.contract` on a relationship holds:
   - `kind`: `openapi`, `jsonschema` or `sample`;
   - `file`: a path in the producer's code;
   - `pointer`: a JSON pointer to the operation or schema;
   - `direction`: `response`, `request`, `message` or `data`.

   Files are read as JSON first. A YAML dependency waits for the owner's answer.
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
   - **Live calls.** During System Testing, a body whose top-level shape differs from the sample gives an information Finding.
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

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q13.1 needs YAML, which means a new dependency.
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
- Comparing nested JSON in live calls (future_tasks 2.7).

## Start prompt

```
Run Wave 13 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-13-contracts.md, and follow them: branch from main as the header says, run
the steps with the agents and models in the table, brief each subagent with files and line
ranges and the words "never run git stash, never push", run the checks, update the docs,
and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an answer
this wave needs is missing.
```
