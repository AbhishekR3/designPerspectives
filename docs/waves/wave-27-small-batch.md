# Wave 27: The small batch

| | |
|---|---|
| **Status** | Planned 2026-11-20. The small batch was kept in 1.0.0 by the owner (DEC-104, P2) but had no release or wave; this wave gives it one. Design is a Proposal (DEC-028 named the items). Two questions below carry recommendations that hold if left blank. **Moved on 2026-11-20 (the second look at the waves) from 0.10.0 to 0.8.0, to run right after Wave 4** (see "Why this wave runs after Wave 4"). Ready to run after Wave 4 |
| **Branch** | `feat/w27-small-batch`, from `main` after Wave 4 is merged |
| **Size** | M (five small items, each S) |
| **Release** | **0.8.0 (with Waves 3, 26, 16, 4); run after Wave 4** |
| **Depends on** | Wave 4 (the shared CSV writer `src/core/csv.ts`, and the line-label work it does for conditions). If Wave 4 is not merged, build the writer here and say so in the review file; nothing else is needed |
| **Owner items** | DEC-028 (the small batch), DEC-104 P2 (kept). [../planned_features.md](../planned_features.md) B2, task 2. Plain software architecture; it no longer waits for deployment diagrams |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Five small additions that make the model easier to read and to take elsewhere:

1. **Technology on connections** (a toggle): show a line's technology on the diagram.
2. **Owner inherited from the parent**: an element with no owner shows its parent's.
3. **Descriptions on tag groups**.
4. **An "appears in diagrams" list per object** in its panel.
5. **CSV export of model objects** (name, type, technology, owner, tags).

## What exists today [Fact; from planned_features B2, anchors not yet checked, re-anchor first]

- The `?` help card already lists every keyboard shortcut (done, not part of this wave).
- Technology is a tag list on elements and relationships (`modelEdits.ts` rules); tag groups live in the sidecar `designperspectives.json`.
- `diagrams.ts` computes what each diagram shows from the model, so "appears in diagrams" can be computed, not stored.
- Three waves write CSV: Wave 4 (the role × data matrix "exports as CSV"), Wave 7 (`dp metrics --csv`) and this one. **One shared writer, `src/core/csv.ts`, is built by Wave 4** (the first of them) with the quoting and the formula-character rule below; Waves 7 and 27 call it and add no second writer. The formula rule matters because a CSV opened in a spreadsheet can run a cell that starts with `=`, `+`, `-` or `@`.

## Why this wave runs after Wave 4

(Added in the second look at the waves, 2026-11-20.) Three reasons, all about files these waves share:

- **Line labels.** Wave 4 puts a condition chip on a line; item 1 here puts the technology on a line. Both change how a line label is sized and placed (`ui/src/canvas/labelSize.ts`, `lineLayout.ts`), so one agent after the other changes the label code once, in a known order.
- **Owner cards in Wave 15.** Wave 15 proposes an `owner` card from `CODEOWNERS` for each mapped object. With the inherited owner built first, that card is skipped when the proposed owner equals what the object already shows (see Wave 15, "CODEOWNERS"), instead of proposing the same value on every child.
- **The CSV writer.** Wave 4 comes first and writes the shared writer (above), so this wave no longer waits for Wave 7.

## Design [Proposal]

1. **Technology on lines.** A display preference per diagram in the sidecar `layouts` (not model data), off by default, in the diagram panel next to the line-shape choice.
2. **Inherited owner.** Computed on read, shown in the panel as "inherited from <parent>" and in the CSV; **not stored** as a copy, so changing the parent's owner changes the child's shown owner (see Q27.1).
3. **Tag group descriptions.** A `description` on the tag group in the sidecar, edited in the tag group dialog, shown as a tooltip, carried through diff and merge.
4. **Appears in diagrams.** A computed list (diagram key and title, linking to it) in the element and relationship panels.
5. **CSV export.** `dp export csv [PATH] [--version main|ref:<ref>]` and a button, one row per element: id, name, type, technology, owner, tags, parent; stable column order, byte-stable. It uses the shared writer `src/core/csv.ts` from Wave 4 (RFC 4180 quoting; a leading formula character is neutralised: a cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe). The owner column holds the shown owner, with the inherited one marked (for example `Payments team (inherited)`), so the file says which values were typed.

## Determinism

All computed. Add rows to `docs/determinism.md`.

## Owner answers

DEC-104 P2: kept.

## Questions, options and answers

### Q27.1. Is an inherited owner stored or only shown?

**Options**
1. Shown only (computed from the parent).
2. Stored on the child when the child is created.

**Recommended.** Option 1: no copy to drift, and "who owns this" changes in one place. Cost: an explicit owner on a child is still possible and wins.

**Owner's thinking:** *(blank: the recommendation holds)*

### Q27.2. Does the CSV include relationships?

**Options**
1. Elements only.
2. A second file or a `--relationships` flag.

**Recommended.** Option 1 for 0.8.0, as the owner's list says "model objects (name, type, technology, owner, tags)". Add relationships when asked.

**Owner's thinking:** *(blank: the recommendation holds)*

## Stop and ask if

- Inherited owner would change what a lens, a check or the checklist rule reports (it must only add a shown value).
- The technology toggle would need model data instead of a per-diagram display setting.

## Steps and agents

| Step | Agent | Work |
|---|---|---|
| 1 | Explore · Haiku | Re-anchor the tag group dialog, the panels, `diagrams.ts`, the label code Wave 4 changed, and Wave 4's `src/core/csv.ts` |
| 2 | general-purpose · Sonnet | Items 1 to 4 (core, sidecar, panels) |
| 3 | general-purpose · Sonnet (a different agent) | Item 5, `dp export csv` and the button |
| 4 | general-purpose · Sonnet (a different agent from 2 and 3) | Tests |
| 5 | the wave agent | `/code-review` (high); fix findings |

## Required in this wave

- Every new non-GET route gets a `ROUTE_RULES` entry; the CSV route is a read (viewers allowed, as for other reads).
- New data (tag group descriptions) is handled in `modelUnits.ts`, `diff.ts` and the three-way merge, and shows in the change list and `dp diff`.
- Works in a hub and with `--read-only`; output is byte-stable; paths work on Windows; keyboard reachable.
- The static export ([Wave 21](wave-21-static-export.md)) carries the toggle's saved state and the CSV needs no change there; add a line to its table.

## Tests

- Tag group description: edit, diff, merge, change list.
- Inherited owner: shown, overridden by an explicit owner, follows a changed parent, never stored.
- Appears in diagrams: matches `diagrams.ts` for a landscape, context, container and component object.
- CSV: column order, quoting, a cell starting with `=` neutralised, same bytes twice, main and a git ref, an empty model.
- Browser: the technology toggle on and off.

## Docs

- **New DEC** (MOD topic) only if Q27.1 is answered differently from the recommendation. **README**, **CLAUDE.md**, **manual-test-plan**, **planned_features.md** B2 task 2: mark built. `docs/determinism.md` rows.

## Out of scope

- A CSV of relationships (Q27.2), Excel files, round-tripping a CSV back into the model.
- Per-diagram hiding of elements (not planned; it works against computed diagrams).

## Start prompt

```
Run Wave 27 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-27-small-batch.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
