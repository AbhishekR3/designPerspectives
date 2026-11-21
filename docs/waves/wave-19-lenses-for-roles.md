# Wave 19: Lenses for the roles around an architect

| | |
|---|---|
| **Status** | Owner answer applied (questions C3: "go with your best decisions", 2026-11-19 → DevOps, Security and Business presets). The exact settings are mine; the owner reviews them in the UI. Ready to run |
| **Branch** | `feat/w19-lenses-for-roles`, from `main` |
| **Size** | S–M |
| **Release** | 0.11.0 (with Waves 9, 11, 17, 18) |
| **Depends on** | Nothing required. Better after Wave 9 (characteristics) so the lenses can show it; without it the lenses still work. **Wave 13 (contracts) is built after this wave** (0.12.0), so it adds its own section to the lenses: the DevOps and Security presets written here list no "contracts" section, and [Wave 13](wave-13-contracts.md) adds it to them (and to the Architect and Engineer lenses) in one of its steps, with a test. Do not add a placeholder section for it here |
| **Owner items** | Feature D of [../product-vision.md](../product-vision.md): "Architecture Lenses (Architect, DevOps, other members involved during SDLC)". the former backlog B5 (now "Carried from the backlog" below) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

The same model reads right for the people who work with an architect: DevOps, security and business. Each gets a built-in lens with sensible defaults, next to Engineer, Architect and Overview. A lens is a default view; it hides no data and is not access control (MOD-11, PRO-15).

## Owner request covered

> D. Architecture Lenses (Architect, DevOPS, other members involved during SDLC)
> C3: Go with your best decisions.

## What exists today [Fact]

- A lens has: `visibleLevels`, `defaultOverlay`, `hiddenTagGroups`, `visibleSections`, `showTechnology`, `showDescriptions`, `builtin` (`src/core/designPerspectivesFile.ts`, `makeLens`).
- The levels are landscape, context, container, component, code (`LEVELS`, `src/shared/types.ts:7`). The sections are technology, characteristics, cost, work, details, notes, tradeoffs, usage, sensitive, code (`SECTIONS`, `:10`).
- Overlays: tags, technology, characteristics, cost, work (`ui/src/colourOverlays.ts`).
- Three built-ins: `ENGINEER`, `ARCHITECT`, `OVERVIEW`; `BUILTIN_LENSES` lists them (MOD-11, MOD-13). The default lens is Architect for a model with no containers, otherwise Engineer. The chosen lens is remembered per project in the browser (MOD-12, CAN-02). Lens settings are edited in `ui/src/panels/SettingsDialogs.tsx`.
- BMO's context follows the lens (COD-09).

## Design [Proposal: the settings are the assistant's best decision]

| Lens | For | Levels | Sections | Overlay | Technology |
|---|---|---|---|---|---|
| **DevOps** | The people who build, ship and run it: what runs, on what, and how the parts connect | context, container, component | technology, characteristics, work, details, notes, usage, sensitive, code | technology | shown |
| **Security** | The people who look for weak points: who reaches what, what is sensitive, what is flagged | landscape, context, container, component | technology, characteristics, work, details, notes, tradeoffs, usage, sensitive | work (findings from SARIF, WRK-02) | shown |
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

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in PRO-20.*

### ★C3. Which lenses does 1.0.0 ship?

**Analysis** [Fact]
- A lens is a default view: it picks levels, sections and a default overlay, and hides no data (MOD-11, PRO-15). Three ship: Engineer, Architect, Overview (MOD-11, MOD-13).
- Business and Security presets are in the backlog (the former backlog B5 (now in the wave files), small). There is no DevOps lens.

**Proposal.** Ship presets for the roles your vision names. A DevOps lens would show containers and technology, run addresses, endpoints, linked work and contracts, and hide cost and trade-offs. The other presets (Business, Security, and Developer if Engineer is not that) follow the same pattern.

**Options**
1. DevOps only.
2. DevOps, Security and Business.
3. Also Compliance and QA.

**Recommended.** Option 2, in a small wave after Wave 4 (or inside it). Tell me what each role must see first and I will write the presets from that.

**Owner's thinking:** Go with your best decisions.

**Applied [2026-11-19].** Option 2: DevOps, Security and Business, in new [Wave 19](wave-19-lenses-for-roles.md). I chose the settings (levels, sections, overlay for each); they are a table in that file for you to review.

## Carried from the backlog (moved from planned_features.md, 2026-11-21)

- **Business, Security and DevOps lens presets** (was B5; small). The lens mechanism is built; only Engineer, Architect and Overview ship. The vision names a DevOps lens (feature D). [Source: Owner, 2026-11-13 and 2026-11-19.]

## Stop and ask if

- A lens would have to hide data from someone (that changes MOD-11 and PRO-15).
- An overlay a lens names does not exist yet (use `null` and say so).

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files in "What exists today" | Anchors confirmed |
| 2 | Three built-in lenses, picker, help table | general-purpose · Sonnet | `src/core/designPerspectivesFile.ts`, `ui/src/hooks/useLens.ts`, `ui/src/common/HelpCard.tsx`, settings dialog | Six lenses listed; defaults unchanged; no stored data |
| 3 | Tests (a different agent) | general-purpose · Sonnet | `tests/unit/lenses*.test.ts`, a browser test | As listed below |
| 4 | Docs | general-purpose · Haiku | decisions.md, the review file (notes for the release entry, not the CHANGELOG), CLAUDE.md, README (lenses), the former backlog B5 (now in the wave files) | Docs updated |
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

- **New decision entry:** the three lenses (amends MOD-13's list of built-ins). **The review file** (not the CHANGELOG, which the release change writes), **CLAUDE.md**, **README**. **Backlog (this file's "Carried from the backlog"):** mark the lens item built; Compliance and QA lenses stay ideas.

## Out of scope

- Compliance and QA lenses.
- Hiding data on the server (PRO-15).
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
