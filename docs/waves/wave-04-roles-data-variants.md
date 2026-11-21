# Wave 04: Roles, data and variants

| | |
|---|---|
| **Status** | Owner answers applied (2026-11-19 for the variants, 2026-11-20 for the data half). The owner answered Q4.1 to Q4.3, so the data half (CRUD letters, role × data matrix) is **kept**; the scope decision for P4 is keep (DEC-104). Ready to run |
| **Branch** | `feat/w04-roles-data-variants`, from `main` after the previous wave is merged |
| **Size** | M |
| **Release** | 0.8.0 (with Waves 3, 26, 16, 27; run before Wave 27, see below) |
| **Depends on** | Nothing in this plan. Wave 13 (contracts, 0.12.0) needs it. Two things in it are shared with other waves (added in the second look at the waves, 2026-11-20): **the CSV writer** `src/core/csv.ts` (step 4) is reused by Waves 7 and 27, and **the condition chip on a line** changes label sizing, which [Wave 27](wave-27-small-batch.md) (technology on lines) changes next |
| **Owner items** | 20, 5 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Show who can create, read, update and delete which data, per role of the **modelled system**, as the owner chose on 2026-11-17. Model A/B tests, feature flags and other conditional paths in a way that stays valid Structurizr.

## Owner requests covered

> - Include easy way to view roles/actions like CRUD for each role and what they view and easy way to do this.
> - From C4 design, how does A/B testing and similar conditional services work?

The explanation of A/B testing in C4 is in section 0.1 of the questions section below.

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

1. **Letters** (★Q4.1). An access entry becomes `{asset, ops}`, where `ops` holds the letters C, R, U and D. There is no `W`.
   - **An old `write` is read as C, U and D, right away** (owner, 2026-11-20: "W should change to C U D right now"). An old `read` is R. The person then narrows the letters by choosing: a checkbox per letter.
   - An old file that nobody edits is not rewritten: the old `mode` stays on disk until the entry is edited, so untouched files stay byte-identical. The letters are expanded when the file is read.
   - When an entry is saved, dp writes `ops` and also the old `mode` (`write` if any of C, U, D is present, otherwise `read`), so an older dp keeps the meaning.
   - "Several writers" counts C, U and D, and the hub flags keep working.
   - **Trade-off:** an old `write` that really meant "updates only" shows all three letters until someone narrows it. So the matrix shows too much (a person who "can delete" because of an old write), and the check "data nobody creates" cannot fire for such data. The wave says so in the matrix legend ("legacy write, not yet narrowed" marker on those cells) so the person knows which letters were never chosen.
2. **Roles.** A role is a C4 person (★Q4.2). The Data access section shows on a person's own relationships.
3. **Matrix page** (`p=access`).
   - Rows are people, with a second tab for containers. Columns are data assets, grouped by the element that holds them.
   - A cell shows two things:
     - the letters set on the row's own relationships;
     - greyed, the letters the person **can reach** through the containers they use. For person → web app → database, these are the web app's letters on its line to the database.
   - The reach is computed with a depth limit and protection against cycles. It is labelled "can reach", because it says what the path allows, not what the role is allowed to do.
   - Filters: sensitive data only, and one holder. The table exports as CSV, through **one shared writer, `src/core/csv.ts`, that this wave builds first** (RFC 4180 quoting, a fixed column order, byte-stable output, and a leading formula character neutralised: a cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe, because a spreadsheet can run such a cell). Wave 7 (`dp metrics --csv`) and Wave 27 (`dp export csv`) call the same writer; none of them writes a second one.
4. **Checks.** These are `dp check` warnings for now; they become Findings in Wave 6 and Wave 8.
   - Sensitive data that a person can delete, explicitly or through reach.
   - An asset nobody creates (not for an entry still marked "legacy write": its letters were never chosen).
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

Applied 2026-11-19 (Part A) and 2026-11-20 (Part B, [the questions section below](#questions-options-and-answers-moved-from-questionsmd)).

- **Split by the vision (2026-11-19).** Half of this wave is C4 modelling: conditions on lines and A/B variants as grouped flows (Q4.4, Q4.5). The other half is data architecture: CRUD letters (Q4.1), people as roles and the matrix (Q4.2). The scope review recommended **later** for the data half; the owner then answered Q4.1 to Q4.3 (2026-11-20), which was read as **keep**, and confirmed it on 2026-11-20 by taking the review's recommendation to keep it, together with the data catalog it edits (DEC-104, B1 and P4). Cutting one means cutting the other.
- **Q4.1 (2026-11-20):** "W should change to C U D right now. CRUD choosing works." Applied: no `W`; an old `write` reads as C, U and D, and the person narrows it by choosing letters.
- **Q4.2 (best thinking):** as proposed. A role is a C4 person; a matrix page with the letters set on the person's own lines and, greyed, the letters they can reach through their containers; the checks as `dp check` warnings. No policy letters ("allowed"); that stays a stop-and-ask.
- **Q4.3:** yes. A table of Architect, Engineer and Viewer in the help card, generated from `src/server/auth.ts`.
- **Q4.4:** option 1. Each variant is its own flow; variants share a key and show as tabs in the flow player.
- **Q4.5:** yes, an optional condition on a line, shown as a chip, with a diagram filter.
- **Q4.6 (best thinking):** wait for deployment diagrams, which are infrastructure and after 1.0.0 (DEC-104, P1).
- **The observed A/B split** belonged to the parked runtime work (ideas list I2.7) (answer A7).

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in DEC-104.*

### 0.1 How do A/B tests, feature flags and other conditional services fit C4?

**Short answer.** C4 diagrams show structure: what exists and what talks to what. Which path a request takes at run time is not structure: variant A or B, a flag on or off, the canary or the stable version. So C4 shows conditional behaviour in four places, each at its own level.

1. **The flag or experiment service is a box.** If a third party runs it, it is an external software system; if you run it, it is a container. Everything that reads flags has a line to it ("reads flag rules from").
2. **Variants are boxes only when they are deployed separately.** Checkout v1 and Checkout v2 as two services are two containers, and the line from the router to each carries the condition ("10% of users, experiment checkout-v2"). When the variant is an `if` inside one component, which is the usual case, no box changes. That detail is below C4's level on purpose; show it in a flow or a note.
3. **Dynamic diagrams show one path at a time.** dp's flows are Structurizr dynamic views: an ordered list of steps with no "else" branch. So each variant is its own flow, for example "Checkout, variant A" and "Checkout, variant B".
4. **Canary and blue/green releases are a deployment matter.** The same container runs twice in one environment, with traffic split between them. They belong on deployment diagrams (the C4 book, chapter 8; notes `c4-model-brown.md:123-132`).

Measuring the experiment means sending exposure and conversion events to an analytics store. That is an ordinary data flow with its own lines.

**What dp has today** [Fact]
- There is no condition, weight, variant or flag anywhere in `src/` or `ui/src/`.
- A flow step is `{id, description, order, response}` (`src/shared/types.ts:363-370`), and dp renumbers its own flows "1" to "n" on every save (`src/core/flows.ts:171-205`). Any branch notation would be flattened.
- The only conditions are:
  - System Testing breakpoints, which pause a call (`src/core/testing.ts:319-362`);
  - the "conditional" kind of decision (`src/shared/types.ts:547-569`).
- Deployment diagrams are decided (DEC-019, DEC-022) but not built.

**Telemetry** [Fact]
- OpenTelemetry's feature-flag conventions (status: Release Candidate) record each flag evaluation as a `feature_flag.evaluation` event through the logs API.
- The event carries `feature_flag.key` and `feature_flag.result.variant` (opentelemetry.io, semantic conventions for feature flags, checked 2026-11-17).
- dp reads trace files only (`src/core/traces.ts`). It sees a variant only when an app also puts these attributes on its spans.

**Proposed**
- Wave 4: an optional condition on lines, and A/B variants as grouped flows, with a short guide.
- The parked runtime work (ideas list I2.7): the observed split from telemetry, when the telemetry carries it.
- Canary and blue/green wait for deployment diagrams.

See Q4.4 to Q4.6 and Q12.3.

### ★Q4.1 CRUD letters on data access

**Analysis** [Fact]
- Data access on a line is "read" or "write" today (`src/shared/types.ts:259-262`; `cleanAccess`, `src/core/modelEdits.ts:1320-1330`).
- A hub flags data that several projects write (`src/core/catalog.ts:139-144`).

**Proposed**
- Access becomes letters: C, R, U and D.
- Old files stay valid:
  - read becomes R;
  - write becomes W, meaning "changes it; the letters aren't chosen yet". W counts as a writer until someone picks C, U or D.
- dp writes both the letters and the old read/write value, so an older dp still reads the file correctly.
- "Several writers" counts C, U, D and W.

**Recommended.** Yes.

**Owner's thinking:** W should change to C U D right now. CRUD choosing works.

**Applied [2026-11-20].** No `W`. An old `write` is read as C, U and D from the start, and the person narrows it by choosing letters; an old `read` is R. An untouched file is not rewritten (it stays byte-identical); once an entry is saved, dp writes the letters and the old read/write value so an older dp still reads it. **Trade-off:** until someone narrows it, an old write shows all three letters, so the matrix over-reports deletes and the check 'data nobody creates' cannot fire for that data. The matrix marks such cells 'legacy write, not yet narrowed'. [Wave 4](wave-04-roles-data-variants.md) is updated.

### ★Q4.2 People as roles, and "can reach"

**Analysis** [Fact]
- A C4 person is a plain element with no role field (`src/core/workspace.ts:15`).
- The Data section is hidden for people (`ui/src/panels/ElementPanel.tsx:106`).
- Access is recorded per line.

**Proposed**
- **A role is a C4 person.**
- **A matrix page:**
  - rows are people; a second tab shows containers;
  - columns are data, grouped by the element that holds it.
- **Each cell shows two things:**
  - the letters set explicitly on the person's own line;
  - greyed out, the letters the person **can reach** through the containers they use. For person → web app → database, these are the web app's letters. They are computed, and they say what the path allows, not what the role is allowed to do.
- **Checks:**
  - sensitive data a person can delete;
  - data nobody creates;
  - access to data neither end holds (this exists today).

**Open:** do you also want "allowed" (a policy you set) beside "does" (what the path allows)? That would be a second set of letters per person.

**Recommended.** Yes to the proposal; no policy letters for now.

**Owner's thinking:** Go with your best thinking.

**Applied [2026-11-20].** As proposed: a role is a C4 person; a matrix page with the letters set on the person's own lines and, greyed, the letters they can reach through the containers they use; the three checks as `dp check` warnings. No policy letters ('allowed'): a second set of letters per person would be a second thing to keep true, and the model can say what a path permits, not what a role may do. Answering Q4.1 to Q4.3 is read as keeping the data half of Wave 4 (scope review P4 is marked keep; overrule it there if that is wrong).

### Q4.3 dp's own roles

**Recommended.** A table in the help card, generated from `src/server/auth.ts`, showing what Architect, Engineer and Viewer can see and do. Nothing more.

**Owner's thinking:** Yes.

**Applied [2026-11-20].** A table in the help card, generated from `src/server/auth.ts`: what Architect, Engineer and Viewer can see and do.

### ★Q4.4 A/B variants as separate flows?

**Analysis** [Fact]
- Flows are linear, and dp renumbers them on every save (`flows.ts:171-205`).
- Structurizr's dynamic views have no branch.

**Options**
1. **Each variant is its own flow.** Variant flows are grouped by a shared key and labelled "A", "B" or "control". The flow player shows them as tabs and marks the steps that differ.
2. **Branches inside one flow.** This needs a new step format, which Structurizr's own tools would show as a flat list. It also needs protecting from renumbering.

**Recommended.** Option 1.

**Owner's thinking:** Option 1.

**Applied [2026-11-20].** Each variant is its own flow. Variants share a key, are labelled A, B or control, and show as tabs in the flow player with the differing steps marked.

### Q4.5 Conditions on lines

**Proposed.** An optional condition on a line: a flag and a value, or free text ("checkout-v2 = on", "10% of users"). It shows as a chip on the line, and a diagram filter shows or hides conditional lines.

**Recommended.** Yes.

**Owner's thinking:** Yes.

**Applied [2026-11-20].** An optional condition on a line, shown as a chip, with a diagram filter.

### Q4.6 Canary and blue/green

**Recommended.** Wait for deployment diagrams (see ★A2).

**Owner's thinking:** Go with your best thinking.

**Applied [2026-11-20].** Wait for deployment diagrams, which are infrastructure and not scheduled before 1.0.0 (scope review P1; after 1.0.0, DEC-104). Until then a canary or blue/green split is modelled with the condition on a line (Q4.5) and a note.

## Stop and ask if

- ★Q4.2 asks for policy letters ("allowed"), which would be a second set per person.
- ★Q4.4 asks for branches inside one flow.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Variant flows and conditions (model, units, merge, renumbering) | general-purpose · Opus | `src/core/flows.ts`, `modelEdits.ts`, `modelUnits.ts`, `diff.ts`, `src/core/merge.ts` | Variants survive saves, drafts and merges; old flows are unchanged |
| 3 | CRUD letters: model and compatibility | general-purpose · Sonnet | `modelEdits.ts` (`cleanAccess`), `types.ts`, `catalog.ts`, `DataSections.tsx`, `ElementPanel.tsx` | Old files load and save byte-identically when untouched |
| 4 | Matrix page, reach, checks, and the shared CSV writer | general-purpose · Sonnet | `ui/src/pages/AccessPage.tsx` (new), `src/core/access.ts` (new), `src/core/csv.ts` (new), `src/core/cliReports.ts`, `App.tsx`, `useNavigation.ts` | The page works by keyboard; reach handles cycles; the CSV writer quotes, neutralises formula cells and gives the same bytes twice |
| 5 | Flow UI: groups, tabs, condition chips, filter | general-purpose · Sonnet | `ui/src/panels/FlowPanel.tsx`, `useFlowPlayer.ts`, `ui/src/canvas/BoxesAndLines.tsx`, `ui/src/canvas/FlowPlayer.tsx` | Tabs work; chips show; the filter works |
| 6 | Tests by another agent | general-purpose · Sonnet | `tests/unit/`, `tests/browser/` | Tests as listed below |
| 7 | Demo and docs | general-purpose · Haiku | `scripts/make-demo.ts` (a variant pair and CRUD letters in the demo), decisions.md, the review file (notes for the release entry, not the CHANGELOG), README, CLAUDE.md (`access.ts`, `csv.ts`) | `npm run make-demo` result committed |
| 8 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** Edits go through the existing element and relationship routes. Add `ROUTE_RULES` entries for any new route.
- **Hub.** `sharedUsage` across projects understands letters; the multi-writer flag keeps working.
- **Read-only mode.** No edits.
- **Model data.** `ops`, `dp.condition`, `dp.variant` and `dp.variantOf` need units, diff labels, merge, the change list and `dp diff`.
- **Static export.** It includes all of these.
- **Notes for the release entry** (in the review file; the release change writes the CHANGELOG): an older dp sees only read or write.

## Tests

- **Access compatibility**
  - An untouched old file with `read` and `write` values round-trips byte-identically.
  - An old `write` reads as C, U and D, and an old `read` as R. A `W` in a file is refused.
  - Letters are cleaned (only C, R, U, D; duplicates removed).
  - `mode` is written alongside `ops` once an entry is saved.
  - The several-writers flag counts C, U and D.
  - The legacy-write marker shows on a cell until the letters are chosen.
- **Reach**
  - A path through two containers.
  - A cycle.
  - The depth limit.
  - A person with no relationships.
- **Checks:** sensitive data deletable by a person; an asset with no creator.
- **CSV writer** (`src/core/csv.ts`): quoting of commas, quotes and newlines; a cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe; fixed column order; the same bytes twice; an empty table gives the header only.
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
- **The review file** (not the CHANGELOG, which the release change writes): notes for the release entry, including that an older dp sees only read or write.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- Policy letters ("allowed").
- Canary and blue/green, which need deployment diagrams.
- Variant splits seen in telemetry (parked runtime work, ideas list I2.7).
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
