# Wave 04: Roles, data and variants

| | |
|---|---|
| **Status** | Waiting for owner answers: ★Q4.1, ★Q4.2, Q4.3, ★Q4.4, Q4.5, Q4.6 ([questions.md](questions.md)) |
| **Branch** | `feat/w04-roles-data-variants`, from `main` after the previous wave is merged |
| **Size** | M |
| **Depends on** | Nothing in this plan; can move earlier or later |
| **Owner items** | 20, 5 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Show who can create, read, update and delete which data, per role of the **modelled system**, as the owner chose on 2026-11-17. Model A/B tests, feature flags and other conditional paths in a way that stays valid Structurizr.

## Owner requests covered

> - Include easy way to view roles/actions like CRUD for each role and what they view and easy way to do this.
> - From C4 design, how does A/B testing and similar conditional services work?

The explanation of A/B testing in C4 is in [questions.md](questions.md), section 0.1.

## What exists today [Fact]

**Data and access**
- Types: `DataAsset` and `DataAccess` (`src/shared/types.ts:245-262`). Access mode is `"read"` or `"write"` only.
- Cleaners: `cleanData` (`src/core/modelEdits.ts:1298-1317`) and `cleanAccess` (`:1320-1330`). The default is read, and write wins when both are given.
- UI in `ui/src/panels/DataSections.tsx`:

  | Lines | What |
  |---|---|
  | `:84-145` | Data section |
  | `:185-189` | The access select (—, reads, writes) |
  | `:194-200` | A warning for access to data neither end holds |

  Derived lines repeat access in `RelationshipPanel.tsx:106-115`.
- `sharedUsage` (`src/core/catalog.ts:57-146`) yields asset × accessor × mode. Its flags `used-by-several` and `several-writers` are at `:139-144`. `usageAttention` (`src/server/routes/hub.ts:72-115`) turns them into home-page items.
- The closest thing to a matrix is the Data table (`ui/src/pages/CatalogPage.tsx:207-264`).

**People**
- A person is a plain element with no role attribute (`src/core/workspace.ts:15`).
- The Data section is hidden for people (`ui/src/panels/ElementPanel.tsx:106`).
- `dp.usage` holds free text `{users, frequency, volume}` (`types.ts:38-42`).

**dp's own roles**
- The action table is at `src/server/auth.ts:11-27`; `permissions()` is at `:267-280`.

**Flows**
- A flow step is `{id, description, order, response}` (`src/core/flows.ts:1-16`, `types.ts:363-370`).
- dp renumbers its own flows "1" to "n" on every save and sync (`flows.ts:171-205`). Per-step samples live in `dp.stepData` (`:26-45`).
- The flow player steps through a flow in a straight line (`ui/src/hooks/useFlowPlayer.ts:11-30`).

**Conditions**
- There is no condition, variant, flag or weight concept anywhere. The only conditions are System Testing breakpoints (`src/core/testing.ts:319-362`) and the "conditional" decision kind (`types.ts:547-569`).

## Design [Proposal; rewritten after the owner answers]

### A. Roles and CRUD

1. **Letters** (★Q4.1). An access entry becomes `{asset, ops}`, where `ops` holds the letters C, R, U and D.
   - `W` means "changes it, letters not chosen yet".
   - Old values stay valid: `read` maps to R and `write` to W.
   - dp also writes the old `mode` (`write` if any of C, U, D or W, otherwise `read`), so an older dp keeps the meaning.
   - "Several writers" counts C, U, D and W, and the hub flags keep working.
2. **Roles.** A role is a C4 person (★Q4.2). The Data access section shows on a person's own relationships.
3. **Matrix page** (`p=access`).
   - Rows are people, with a second tab for containers. Columns are data assets, grouped by the element that holds them.
   - A cell shows two things:
     - the letters set on the row's own relationships;
     - greyed, the letters the person **can reach** through the containers they use. For person → web app → database, these are the web app's letters on its line to the database.
   - The reach is computed with a depth limit and protection against cycles. It is labelled "can reach", because it says what the path allows, not what the role is allowed to do.
   - Filters: sensitive data only, and one holder. The table exports as CSV.
4. **Checks.** These are `dp check` warnings for now; they become Findings in Wave 6 and Wave 8.
   - Sensitive data that a person can delete, explicitly or through reach.
   - An asset nobody creates.
   - The existing check for access to data neither end holds.
5. **dp's own roles** (Q4.3). A table in the help card, generated from the action table: what Architect, Engineer and Viewer can see and do.

### B. Conditions and variants

6. **Condition on a relationship** (Q4.5). `dp.condition` holds `{flag?, value?, text?}`.
   - It shows as a chip on the line.
   - A diagram filter offers three views: all lines, lines without conditions, or only lines with a given flag.
7. **Variant flows** (★Q4.4).
   - A flow can carry `dp.variant` (a label such as "A", "B" or "control") and `dp.variantOf` (a group key).
   - The flow list groups variants, and the flow player shows them as tabs.
   - Comparing two variants highlights the steps that differ.
   - Renumbering must keep the variant properties.
8. **Guide.** A short "Modelling A/B tests and feature flags" section in README, from questions 0.1. Canary and blue/green wait for deployment diagrams (Q4.6).

## Determinism

| Output | Class |
|---|---|
| Letters and conditions entered by people | human |
| "Can reach" letters, checks, the variant comparison | computed |

## Owner answers

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q4.2 asks for policy letters ("allowed"), which would be a second set per person.
- ★Q4.4 asks for branches inside one flow.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Variant flows and conditions (model, units, merge, renumbering) | general-purpose · Opus | `src/core/flows.ts`, `modelEdits.ts`, `modelUnits.ts`, `diff.ts`, `src/core/merge.ts` | Variants survive saves, drafts and merges; old flows are unchanged |
| 3 | CRUD letters: model and compatibility | general-purpose · Sonnet | `modelEdits.ts` (`cleanAccess`), `types.ts`, `catalog.ts`, `DataSections.tsx`, `ElementPanel.tsx` | Old files load and save byte-identically when untouched |
| 4 | Matrix page, reach, checks | general-purpose · Sonnet | `ui/src/pages/AccessPage.tsx` (new), `src/core/access.ts` (new), `src/core/cliReports.ts`, `App.tsx`, `useNavigation.ts` | The page works by keyboard; reach handles cycles |
| 5 | Flow UI: groups, tabs, condition chips, filter | general-purpose · Sonnet | `ui/src/panels/FlowPanel.tsx`, `useFlowPlayer.ts`, `ui/src/canvas/BoxesAndLines.tsx`, `ui/src/canvas/FlowPlayer.tsx` | Tabs work; chips show; the filter works |
| 6 | Tests by another agent | general-purpose · Sonnet | `tests/unit/`, `tests/browser/` | Tests as listed below |
| 7 | Demo and docs | general-purpose · Haiku | `scripts/make-demo.ts` (a variant pair and CRUD letters in the demo), CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md | `npm run make-demo` result committed |
| 8 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** Edits go through the existing element and relationship routes. Add `ROUTE_RULES` entries for any new route.
- **Hub.** `sharedUsage` across projects understands letters; the multi-writer flag keeps working.
- **Read-only mode.** No edits.
- **Model data.** `ops`, `dp.condition`, `dp.variant` and `dp.variantOf` need units, diff labels, merge, the change list and `dp diff`.
- **Static export.** It includes all of these.
- **CHANGELOG.** Note that an older dp sees only read or write.

## Tests

- **Access compatibility**
  - Old read and write values round-trip unchanged.
  - Letters are cleaned (`W` only alone; duplicates removed).
  - `mode` is written alongside `ops`.
  - The several-writers flag counts letters.
- **Reach**
  - A path through two containers.
  - A cycle.
  - The depth limit.
  - A person with no relationships.
- **Checks:** sensitive data deletable by a person; an asset with no creator.
- **Variants**
  - Renumbering keeps the variant properties.
  - Group, draft, apply.
  - The comparison highlights the differing steps.
- **Browser**
  - The matrix page, by keyboard.
  - The condition chip and the filter.
  - The variant tabs in the player.

## Docs

- **New DEC:** CRUD letters and their compatibility; people as roles and "can reach"; variants as grouped flows; conditions on relationships.
- **README:** the A/B guide.
- **CLAUDE.md:** `access.ts` and `AccessPage.tsx`.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- Policy letters ("allowed").
- Canary and blue/green, which need deployment diagrams.
- Variant splits seen in telemetry (Wave 12).
- Findings and acknowledgements (Wave 6).

## Start prompt

```
Run Wave 04 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-04-roles-data-variants.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
