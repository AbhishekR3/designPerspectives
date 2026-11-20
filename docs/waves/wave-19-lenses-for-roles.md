# Wave 19: Lenses for the roles around an architect

| | |
|---|---|
| **Status** | Owner answer applied (questions C3: "go with your best decisions", 2026-11-19 → DevOps, Security and Business presets). The exact settings are mine; the owner reviews them in the UI. Ready to run |
| **Branch** | `feat/w19-lenses-for-roles`, from `main` |
| **Size** | S–M |
| **Release** | 0.5.3 (with Waves 9, 11, 17, 18) |
| **Depends on** | Nothing required. Better after Wave 9 (characteristics) and Wave 13 (contracts) so the lenses can show them; without them the lenses still work |
| **Owner items** | Feature D of [../product-vision.md](../product-vision.md): "Architecture Lenses (Architect, DevOps, other members involved during SDLC)". [../planned_features.md](../planned_features.md) B5 |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

The same model reads right for the people who work with an architect: DevOps, security and business. Each gets a built-in lens with sensible defaults, next to Engineer, Architect and Overview. A lens is a default view; it hides no data and is not access control (DEC-008, DEC-063).

## Owner request covered

> D. Architecture Lenses (Architect, DevOPS, other members involved during SDLC)
> C3: Go with your best decisions.

## What exists today [Fact]

- A lens has: `visibleLevels`, `defaultOverlay`, `hiddenTagGroups`, `visibleSections`, `showTechnology`, `showDescriptions`, `builtin` (`src/core/designPerspectivesFile.ts`, `makeLens`).
- The levels are landscape, context, container, component, code (`LEVELS`, `src/shared/types.ts:7`). The sections are technology, characteristics, cost, work, details, notes, tradeoffs, usage, sensitive, code (`SECTIONS`, `:10`).
- Overlays: tags, technology, characteristics, cost, work (`ui/src/colourOverlays.ts`).
- Three built-ins: `ENGINEER`, `ARCHITECT`, `OVERVIEW`; `BUILTIN_LENSES` lists them (DEC-008, DEC-038). The default lens is Architect for a model with no containers, otherwise Engineer. The chosen lens is remembered per project in the browser (DEC-011, DEC-035). Lens settings are edited in `ui/src/panels/SettingsDialogs.tsx`.
- BMO's context follows the lens (DEC-073).

## Design [Proposal: the settings are the assistant's best decision]

| Lens | For | Levels | Sections | Overlay | Technology |
|---|---|---|---|---|---|
| **DevOps** | The people who build, ship and run it: what runs, on what, and how the parts connect | context, container, component | technology, characteristics, work, details, notes, usage, sensitive, code | technology | shown |
| **Security** | The people who look for weak points: who reaches what, what is sensitive, what is flagged | landscape, context, container, component | technology, characteristics, work, details, notes, tradeoffs, usage, sensitive | work (findings from SARIF, DEC-085) | shown |
| **Business** | Product owners and stakeholders who care about value, cost and why | landscape, context | characteristics, cost, work, details, notes, tradeoffs | cost | hidden |

- **Why these:** DevOps needs containers, technology, endpoints and code paths (where the Dockerfile and entry points are) but not cost or trade-offs. Security needs sensitive data, usage and linked findings, and not cost or code. Business needs the big picture with cost, characteristics and the reasons, and not technology or code. Overview stays as the plain big picture.
- **Built-in, not stored.** Like the others, built-ins are code, not entries in the sidecar, so old models get them with no migration. A team can copy one into its own lens and edit it.
- **The picker** lists all six; the default rule is unchanged.
- **Help card** gets a short table of what each lens shows.
- **Open for the owner:** the settings above are a starting point. Changing one is a one-line change.

## Determinism

| Output | Class |
|---|---|
| Lens settings and what a lens shows | computed |
| Nothing here uses BMO | — |

## Owner answers

- **C3:** best decision: DevOps, Security and Business presets (option 2). The settings table is the assistant's proposal for the owner to review.

## Stop and ask if

- A lens would have to hide data from someone (that changes DEC-008 and DEC-063).
- An overlay a lens names does not exist yet (use `null` and say so).

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files in "What exists today" | Anchors confirmed |
| 2 | Three built-in lenses, picker, help table | general-purpose · Sonnet | `src/core/designPerspectivesFile.ts`, `ui/src/hooks/useLens.ts`, `ui/src/common/HelpCard.tsx`, settings dialog | Six lenses listed; defaults unchanged; no stored data |
| 3 | Tests (a different agent) | general-purpose · Sonnet | `tests/unit/lenses*.test.ts`, a browser test | As listed below |
| 4 | Docs | general-purpose · Haiku | decisions.md, CHANGELOG, reviews.md, CLAUDE.md, README (lenses), planned_features B5 | Docs updated |
| 5 | Review | main session | — | `/code-review` (high) fixed |

## Required in this wave

- **Routes.** None new.
- **Hub and read-only.** Unchanged.
- **Model data.** None stored.
- **Static export.** The export, if built, shows the default lens.

## Tests

- `BUILTIN_LENSES` holds six lenses with unique ids; each passes `makeLens`.
- A model with no containers still defaults to Architect, otherwise Engineer.
- A sidecar written before this wave loads and shows the new lenses.
- Each lens hides only what the table says; every hidden section is still reachable by changing the lens.
- Browser: switch to each lens; the panel sections and overlay match.

## Docs

- **New DEC:** the three lenses (amends DEC-038's list of built-ins). **CHANGELOG**, **reviews.md**, **CLAUDE.md**, **README**. **planned_features.md** B5: mark built; Compliance and QA lenses stay ideas.

## Out of scope

- Compliance and QA lenses.
- Hiding data on the server (DEC-063).
- Per-user default lens stored on the server.

## Start prompt

```
Run Wave 19 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-19-lenses-for-roles.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
