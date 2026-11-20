# Wave 07: Model metrics

| | |
|---|---|
| **Status** | Rewritten 2026-11-20. Metrics are computed from the model's relationships, not from code, because dp no longer reads code language by language (Wave 5). Ready to run |
| **Branch** | `feat/w07-metrics`, from `main` |
| **Size** | S–M (was M) |
| **Release** | 0.5.2 |
| **Depends on** | Nothing. It reads the model only |
| **Owner items** | 6 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Show coupling numbers for every system, container and component: who depends on it, what it depends on, how unstable it is, and which cycles it sits in. The numbers come from the lines drawn in the model, so they work for any codebase and any language, and they change when a draft changes the model. Each number says what it can and cannot see.

## Owner request covered

> - Consider metrics such as LCOM, Instability, etc

**What was dropped, and why.** LCOM, complexity, abstractness and distance from the main sequence need function bodies, field use and type kinds. Wave 5's generic regex reader finds imports and definition names well enough to call them approximate, but it reads bodies and fields badly, so these would be wrong too often to show as numbers. They are not built. Revisit after Wave 5's reader (part C) has shown how good it is; or import a report from a tool that already measures them (ideas list I2.5).

## What exists today [Fact]

- No metric is computed anywhere.
- **The model graph:** elements with a parent, relationships between them, and diagrams that lift a lower-level relationship to a higher level as a derived edge (`src/core/diagrams.ts`, documented at its top).
- **Where numbers can show:** overlays (`ui/src/colourOverlays.ts:8-14`, `:128-196`); the badge row on boxes (`ui/src/canvas/BoxesAndLines.tsx:461-503`); `ElementSummary` (`src/shared/types.ts:264-300`).
- **What the book says** (notes `fundamentals-of-software-architecture-richards-ford.md`): instability I = Ce ÷ (Ca + Ce) (`:51`); the ideas for dp are at `:55-56`.
- A relationship through a broker is two relationships, source → broker → target (DEC-065 `via`).

## Design [Proposal; rewritten after the owner answers]

1. **`src/core/metrics.ts`** (new): a pure function of the model. No files, no worker, no cache: a model is hundreds of elements, and the work is linear in elements plus relationships.
2. **Per element, at its own level** (system, container, component):
   - **Ca**, afferent coupling: the number of distinct other elements at that level that depend on it.
   - **Ce**, efferent coupling: the number of distinct other elements at that level it depends on.
   - **I** = Ce ÷ (Ca + Ce), shown as "—" when both are 0.
   - **Cycle:** whether it sits in a cycle (a strongly connected component of more than one element, or a line to itself), and which one. Computed by Tarjan's algorithm at each level.
   - A line `A → B` means A depends on B.
3. **Lifting.** The ends of a relationship are lifted to the level being measured by the same rule the diagrams use, so a number matches what the diagram draws. People and external systems count as nodes at every level. The exact rule is settled in step 2 against `diagrams.ts` and tested on the demo.
4. **Coverage note.** Every number says: "from N modelled lines; a dependency that is not drawn is not counted." The class is computed, over the model as it is.
5. **Surfaces** (Q7.2).
   - A "Coupling" section in the element panel: Ca, Ce, I, and the cycle with its members as chips.
   - An overlay `@metric:instability`, `@metric:ca`, `@metric:ce` and `@metric:cycle`, in bands with a legend that shows the coverage note.
   - `dp metrics [--level system|container|component] [--json|--csv]`.
   - `GET /api/metrics`, computed per request for the version shown (main, a draft, a git ref), so a draft's numbers are available beside main's.
6. **No thresholds here.** Turning a cycle, a very high Ce or a very high Ca into a Finding is Wave 8's job (rules and presets), so the limits live in one place.

## Determinism

| Output | Class |
|---|---|
| Ca, Ce, I, cycles | computed, over the modelled lines |

## Owner answers

- **Q7.1 (2026-11-20, best thinking, after Q5.1):** compute Ca, Ce, instability and cycles from the model. LCOM, complexity, abstractness and distance are not built. Report import stays an idea.
- **2026-11-20, later:** the owner then allowed regexes generalised to the major languages for reading code (Wave 5, Q5.8). That does not change this wave: metrics that need bodies and fields stay out until the generic reader has proved itself.
- **Q7.2:** a panel section, an overlay and `dp metrics --json|--csv`, as recommended; named "Coupling" because they are no longer code metrics.
- **Q7.3:** a worker thread, a cache and a 20,000-file test are not needed. A test with a generated model of 5,000 elements and 20,000 lines under a time budget replaces them.
- **Q7.4:** thresholds move to Wave 8's rules.
- **Vision:** feature L (metrics are part of BMO's analysis; BMO reads them in its packs).

## Stop and ask if

- Someone asks for complexity, cohesion or abstractness computed by dp. That needs more than the generic regex reader gives (function bodies, field use); decide after Wave 5 part C.
- The lifting rule cannot be made to match what the diagrams draw.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Algorithms: lifting rule, Ca/Ce/I, Tarjan | general-purpose · Opus | `src/core/metrics.ts` (new), `diagrams.ts` (read) | Values are correct on hand-made models and match the demo's diagrams |
| 3 | Route, CLI, panel section, overlay | general-purpose · Sonnet | `src/server/routes/metrics.ts` (new), `src/cli.ts`, `ui/src/panels/ElementPanel.tsx`, `colourOverlays.ts`, `src/shared/types.ts` | Works by keyboard; the legend shows the coverage note |
| 4 | Fixture tests with known values (not the step 2 author) | general-purpose · Sonnet | `tests/unit/metrics*.test.ts` | Tests as listed below |
| 5 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md | All docs updated |
| 6 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** `GET /api/metrics` needs no `ROUTE_RULES` entry. Any role that can read the model can read it.
- **Hub** and **read-only mode:** unchanged behaviour; it only reads.
- **Model data.** None: metrics are not stored.
- **Static export.** Does not include metrics unless the owner asks.
- **Performance.** A test on a generated model of 5,000 elements and 20,000 lines, with the time budget written down in reviews.md.

## Tests

- **Coupling.** Hand-computed Ca, Ce and I on small models at each level; a person and an external system as nodes.
- **Lifting.** A line between components in two containers is counted at the container level the way the diagram draws it.
- **Cycles.** A two-element cycle, a three-element cycle, a line to itself, and a model with none.
- **Broker pairs.** A → broker → B counts A on the broker and the broker on B.
- **Versions.** The same model gives the same numbers twice; a draft's numbers differ from main's after an edit.
- **Browser.** The overlay and the panel section.

## Docs

- **New DEC:** metrics are computed from the model, not from code; which ones, with the coverage note; limits live in Wave 8. (DEC-096 records the decision not to parse code.)
- **README:** metrics. **CLAUDE.md:** `metrics.ts`. **CHANGELOG** and **reviews.md:** this wave's entries.
- **planned_features.md:** the brownfield-metrics line in 2.2 is closed for coupling and cycles; abstractness, complexity and cohesion stay as report-import ideas.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- Complexity, LCOM, abstractness, distance, and a main-sequence chart.
- Anything read from code.
- Trends over time (the ideas list: architecture vitality).
- Importing metric reports (ideas list I2.5). Coverage (planned_features B5).

## Start prompt

```
Run Wave 07 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-07-metrics.md, and follow them: branch from main as the header says, run
the steps with the agents and models in the table, brief each subagent with files and line
ranges and the words "never run git stash, never push", run the checks, update the docs,
and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an answer
this wave needs is missing.
```
