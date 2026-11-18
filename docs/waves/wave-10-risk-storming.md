# Wave 10: Risk and risk storming

| | |
|---|---|
| **Status** | Waiting for owner answers: ★Q10.1, Q10.2, ★Q10.3, Q10.4 ([questions.md](questions.md)) |
| **Branch** | `feat/w10-risk-storming`, from `main` after Wave 9 is merged |
| **Size** | M |
| **Depends on** | Wave 9: the risk criteria are the characteristics |
| **Owner items** | 10 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Record risks per characteristic and per part of the system, and see them two ways: as an assessment grid, and on the diagram.

Run risk-storming sessions in which people score privately first, then agree, then decide how to reduce each risk. A mitigation can become a decision, a draft or a work item.

## Owner requests covered

> - Think through risk analysis for architecture such as risk storming

## What exists today [Fact]

**Risk data that already exists**
- Trade-offs have a "risk" kind (`TRADEOFF_KINDS`, `src/core/modelEdits.ts:184`).
- The demo has a "Risk" tag group, and a lens whose default overlay is "Risk" (`demo/designperspectives.json:5`, `:82`, `:106`).

**People and permissions**
- Sign-in is optional, with three roles (DEC-041; `src/core/users.ts`, `src/server/auth.ts`). Roles are per project in a hub (DEC-057).
- Private files live in `.dp/`, mode 0600 (for example `src/core/integrations.ts:34`).

**Where mitigations can go**
- Decisions (DEC-050), linked work (DEC-085, `src/core/work.ts`) and drafts.

**What the book says** (notes `fundamentals-of-software-architecture-richards-ford.md:403-420`)
- **Risk matrix.** Impact 1–3 × likelihood 1–3. Rate impact first; an unknown likelihood counts as 3. 1–2 is low, 3–4 medium, 6–9 high. Use shading as well as colour.
- **Assessment grid.** Criteria × contexts, with totals and a filter for high risks.
- **Risk storming** has three phases:
  1. people identify risks on their own;
  2. the group reaches consensus;
  3. the group plans mitigation.

  Unknown or unproven technology scores 9. Risk storming is continuous.

## Design [Proposal; rewritten after the owner answers]

1. **`dp.risks`** on elements, and on the workspace for project-wide risks (★Q10.1). Each risk is:

   | Field | Values |
   |---|---|
   | `id` | — |
   | `title` | — |
   | `criterion` | A characteristic name |
   | `impact` | 1–3 |
   | `likelihood` | 1–3 |
   | `status` | open, mitigating, accepted or closed |
   | `mitigation` | — |
   | `owner` | — |
   | `links` | decision?, draft?, work? |
   | `direction` | ▲, ▼ or ●, optional |

   - Score = impact × likelihood, banded 1–2, 3–4 and 6–9 (Q10.2).
2. **Moving trade-off risks.** "Move to risks" turns `tradeoffs` entries of kind `risk` into `dp.risks`. It is an explicit edit, per object or for all objects, and can be undone.
3. **The assessment grid** (`p=risks`).
   - Rows: criteria (the driving characteristics). Columns: contexts, which are the containers in scope for now (Q10.4).
   - Cells show the highest score and a count. Rows and columns have totals.
   - A "high only" filter.
   - A key that uses shading as well as colour.
   - Exports as CSV and Markdown.
4. **The risk overlay** is computed from `dp.risks`: the highest score per box. The "Risk" tag group stays for models that use it by hand.
5. **Risk-storming sessions** (★Q10.3).
   - **Setup.** An architect starts a session with:
     - one criterion;
     - the contexts;
     - the participants (signed-in users);
     - a deadline.
   - **Identification.** Each participant scores privately.
     - Scores are kept in `.dp/risk-sessions/<id>/<user>.json`, mode 0600.
     - No one sees anyone else's scores before the reveal, not even architects.
   - **Reveal.**
     - Shows the spread per cell.
     - Highlights disagreements: a difference of 3 points or more, or different bands.
     - Hints "unknown technology = 9".
   - **Consensus.** The facilitator records the agreed scores as `dp.risks` (a model edit). Then the private scores are deleted.
   - **Mitigation.** Each risk can become a decision, a draft or a linked work item.
   - **Without sign-in,** a session runs on one machine, with participants taking turns. This hides scores on trust only, and the UI says so.
6. **Checks.** A high risk with no mitigation or no owner gives a Finding (Wave 6 shape), and `dp check` reports it.

## Determinism

| Output | Class |
|---|---|
| Scores and mitigations | human |
| Bands, the grid, the overlay, the checks | computed |

## Owner answers

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q10.1 asks for a separate risks file.
- ★Q10.3 asks for private scores without sign-in.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Session storage, privacy, permissions | general-purpose · Opus | `src/core/riskSessions.ts` (new), `src/server/routes/risk.ts` (new), `src/server/auth.ts` | No route returns another person's score before the reveal |
| 3 | `dp.risks`, moving trade-off risks, checks | general-purpose · Sonnet | `modelEdits.ts`, `types.ts`, `modelUnits.ts`, `diff.ts`, `src/core/findings.ts` | Round trip, draft and merge work; moving can be undone |
| 4 | Grid page, overlay, session UI | general-purpose · Sonnet | `ui/src/pages/RiskPage.tsx` (new), `ui/src/common/RiskSession.tsx` (new), `colourOverlays.ts`, `App.tsx` | Works by keyboard; the key has shading |
| 5 | Tests by another agent (with sign-in fixtures) | general-purpose · Sonnet | `tests/unit/risk*.test.ts`, `tests/browser/risk.spec.ts` | Tests as listed below |
| 6 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md, CONTRIBUTING (security model) | All docs updated |
| 7 | Review | main session | — | `/code-review` (high) and `/security-review` (session privacy) findings fixed |

## Required in this wave

- **Routes and permissions.**
  - Risk edits: action `edit`.
  - Starting a session, revealing and recording consensus: architect.
  - Submitting a score: listed participants only, of any role.
  - Every route gets a `ROUTE_RULES` entry.
- **Hub.** Per-project roles. Participants must have access to the project.
- **Read-only mode.** Sessions are refused, because they write to `.dp/`. The grid can still be viewed.
- **Model data.** `dp.risks` on elements and on the workspace needs units, diff labels, merge, the change list and `dp diff`.
- **Static export.** It includes risks. Sessions are never included.

## Tests

- **Risks.** Cleaning (1–3 only); scores; bands.
- **Moving trade-off risks,** and undoing it.
- **The grid.** Totals and the high filter.
- **The overlay** is computed from risks.
- **Session privacy.**
  - Another person's scores are never returned before the reveal, to any role, through any route.
  - The reveal shows the disagreements.
  - Consensus writes the risks and deletes the private scores.
- **Single machine.** Mode works and is labelled.
- **Browser.** A full session with two signed-in users.

## Docs

- **New DEC:** `dp.risks` and moving trade-off risks; the computed risk overlay; session privacy; deleting private scores.
- **CONTRIBUTING:** session files in the security model.
- **README:** risk.
- **CLAUDE.md:** the new files.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **future_tasks:** 2.3 risk done for the first cut; continuous tracking stays.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- BMO's suggested risks (Wave 11).
- Domains or groups as contexts (they come with groups).
- Direction arrows from measurements over time.
- Risk analysis of user stories.

## Start prompt

```
Run Wave 10 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-10-risk-storming.md, and follow them: branch from main as the header says,
run the steps with the agents and models in the table, brief each subagent with files and
line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
