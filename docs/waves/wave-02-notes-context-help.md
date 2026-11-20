# Wave 02: Notes, context and help

| | |
|---|---|
| **Status** | Owner answers applied (2026-11-19; Q2.1 to Q2.5 answered: sticky notes are model data, BMO always sees notes, BMO works without an LLM). Ready to run after Wave 1 |
| **Branch** | `feat/w02-notes-context-help`, from `main` after Wave 1 is merged |
| **Size** | M–L (was M; sticky notes as model data and BMO without an LLM were added) |
| **Release** | 0.5.1 |
| **Depends on** | Wave 1 (context packs, citations, labels) |
| **Owner items** | 3, 17 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Notes are easy to write, read and find for three audiences: people, BMO and coding agents. A **sticky note** can be stuck to an object or to a diagram, and it is part of the architecture. BMO reads every note and every comment. One command prints what BMO would be told about any object. dp can answer "how does dp work?" from its own docs. BMO keeps working with no LLM, as a search and a set of fixed commands, behind a setting.

## Owner requests covered

> - Have an option for the user to have a note specifically for each object at each level so they can store notes that you can see easily
> - BMO agent should be able to ask questions about this software as well and how it works. Similar to how you can ask Claude questions about Claude, you should be able to ask BMO about designPerspectives.
> - (Q2.1, 2026-11-19) Sticky notes on diagrams need to be stored as well as part of the architecture. They need to be analyzed by BMO as well. Notes can be stuck to objects or diagrams as sticky notes.
> - (follow-up, 2026-11-19) Comments should be reachable by BMO: everything a person can visualize on screen should be reachable by BMO.
> - (Q2.5, 2026-11-19) It should support non-LLM usage as well; this can be turned on and off in the settings. If turned off, BMO can just be a simple search or whatever deterministic commands.

## What exists today [Fact]

**Notes on objects**
- `dp.notes` holds one free-text note per element or relationship, the same on every diagram (`src/core/modelEdits.ts:967`, `:769`).
- The editor shows only when the lens includes notes (`ui/src/panels/listEditors.tsx:101-103`, `ElementPanel.tsx:145-147`, `RelationshipPanel.tsx:224-226`).
- Boxes and lines show a badge (`ui/src/canvas/BoxesAndLines.tsx:461-503`, `:1141-1151`). Diffs report a "notes" field.

**Notes and BMO**
- BMO gets notes only when the lens shows them (`src/assistant/modelText.ts:112`, `:150`).
- They are cut to 2,000 characters and joined into one line (`oneLine`).
- The Overview lens hides notes (`src/core/designPerspectivesFile.ts:146`).
- The import summary leaves notes out (`modelText.ts:81-97`).
- DEC-073 says BMO's context follows the lens.

**Sticky notes on a diagram today (DEC-070)**
- A placed note is a **comment** with a position (`src/core/comments.ts:73-79`, `:225-247`). Only a comment about a diagram can be placed, and it is stored in `comments.json`.
- It is drawn above the lines and outside the diagram's own objects. A resolved one is hidden, and image exports leave it out.
- It is not model data. It has no undo step, goes through no draft, and does not reach BMO today.
- It does not follow a box that moves (DEC-070's own trade-off).

**Diagrams**
- Views carry `properties`. Linked work is stored on a view through `holderOf` and `ensureView`, and a computed diagram gets a stored view when needed (`src/core/work.ts:48-75`).

**BMO's settings**
- `enabled` is false by default (`src/assistant/settings.ts:54`, `:83`). The backend is `handoff` or `direct` (`:32`).
- With `enabled` false, a run is refused with "BMO is turned off in the settings." (`:331`).
- The exact UI behaviour of BMO when it is off (button hidden or not) is for the re-anchor step to read in `ui/src/hooks/useBmo.ts` and `ui/src/common/BmoChat.tsx`.

**Help and packaging**
- The help card is static (`ui/src/common/HelpCard.tsx:31-101`).
- The package ships `dist`, `static`, `demo`, `README.md` and `LICENSE` (`package.json:15-21`), so `docs/` is not shipped.

**Page plumbing**
- Pages over the diagram use `usePage` (`ui/src/hooks/useNavigation.ts:84-113`). Bare links are matched by the regex at `:34`.
- `App.tsx` mounts the pages at `:1089-1093` and holds the toolbar at `:918-988`.

## Design [Proposal; rewritten after the owner answers]

1. **Sticky notes are model data** (★Q2.1).
   - **Stored** as `dp.stickies` on the diagram's view, the way `dp.work` is, through `holderOf` and `ensureView`. Each item is `{id, text, x, y, on?}`.
   - **Stuck to a diagram:** no `on`; `x, y` is the position on that diagram.
   - **Stuck to an object:** `on` is an element or relationship id on that diagram, and `x, y` is the offset from the box (for a line, from its label point). The sticky moves with the object, which fixes DEC-070's "does not follow a box".
   - **Caps** [Proposal]: 4,000 characters of text, 100 stickies per diagram. A breach is a `ModelError`.
   - **Deleting an object** turns its stickies into free stickies where they were. They are never deleted silently, and the change list shows it.
   - **They go through drafts, undo, `dp diff`, merge and the static export.** Each sticky is a unit in `modelUnits.ts`, with a label in `diff.ts`.
   - **Drawn** like the placed notes of DEC-070: above the lines, outside layout and Make room. Left out of image exports, as placed notes are.
   - **Written by** those who edit the model: architects on main, engineers in a draft. Viewers read, and use comments (C6a).
   - **UI**
     - Right-click on empty canvas gives "Add sticky note here"; right-click on a box or line gives "Add sticky note to this".
     - Edit in place, drag to move, delete.
     - A "Sticky notes" list in the diagram panel and in each object's panel makes every sticky reachable by keyboard.
     - Placed comments stay (DEC-070), and the menu offers "Add comment here" beside the sticky entries. They are conversation, open to every role, and BMO reads them too (item 4).
     - An architect can turn a placed comment into a sticky. The comment stays.
   - **`dp.notes` on objects stays** as it is: one note per box or line, the same on every diagram.
2. **Markdown in notes and stickies.** A small renderer that builds React elements, never setting innerHTML. It supports:
   - paragraphs, lists, emphasis, inline code and code blocks, and headings from level 3 down;
   - links with http or https only.

   It has no raw HTML and no images. [Wave 16](wave-16-attachments.md) adds `attachment:` images, never remote ones. Line breaks are kept. Wave 3 reuses it for decision prose.
3. **Notes page** (`p=notes`). Every note and sticky, grouped by level: landscape and context, containers, components, relationships, diagrams. It has search, and a click reveals the object, or the diagram with the sticky.
4. **BMO always sees notes and comments** (★Q2.2, screen parity DEC-094).
   - Every object note and every sticky in scope goes into the pack, whatever the lens shows. There is no switch.
   - **Comments too** (owner, 2026-11-19: "everything a person can visualize on screen should be reachable by BMO"). The threads on the object or diagram in scope go in, each with its kind (comment, idea, question), author, time, status and replies. Placed comments are included with their diagram. Resolved threads come last, marked resolved, and are the first dropped under budget.
   - Comments are text from any account, so each goes in a data block labelled "comment by <author>, not reviewed" (the author can be "Anonymous"), after redaction. They are data, never instructions (DEC-064); BMO's output is still only a proposal, the preview shows the exact prompt, and citations are checked.
   - Two new cite kinds for the Wave 1 verifier: `comment:<thread id>` and `sticky:<id>`. A cite to a thread that was not in the pack is refused.
   - The Overview lens still hides notes in the UI, but not from BMO. This amends DEC-073 for notes only.
   - A diagram's pack holds that diagram's stickies. An object's pack holds its note and the stickies stuck to it on any diagram.
   - Notes go in data blocks, after redaction, like all repository text.
   - Each block has its Wave 1 budget share. Whole notes are dropped, never cut, and the manifest lists any left out. Line breaks are kept, and the 2,000-character cut goes away.
5. **`dp context <target> [--for explain|review|code] [--code] [--json]`.** Prints the Wave 1 pack for an object or diagram, without the system text.
   - Same redaction, same file gate, read-only. Markdown by default (Q2.3).
   - It gives coding agents (such as Claude Code) the model without an MCP server (DEC-020).
6. **BMO without an LLM** (★Q2.5, DEC-093).
   - **The setting:** the existing `enabled` flag, relabelled "Use an LLM" in the BMO settings. It stays off by default and architects change it.
   - **Off:** BMO is still in the UI, as a deterministic assistant. No prompt is built, nothing is sent, no handoff file is written, and the fake and provider backends are never called.
   - **Fixed commands** (`src/assistant/commands.ts`, new). Each is a pure function of the model, the docs corpus and its arguments:

     | Command | Does |
     |---|---|
     | `find <words>` | A word-index search over names, descriptions, notes, stickies, decisions, reference notes (once Wave 3 is in) and doc sections |
     | `help <words>` | The help search of item 8 |
     | `show <object>` | Prints what `dp context` prints for it |
     | `notes [object or diagram]` | Lists its notes, stickies and comment threads |
     | `decisions about <object>` | Lists them (`decisionsAbout`, `src/core/decisions.ts`) |

   - **Free text** with the LLM off is run as `find`, and the chat says "Searched; no LLM is on."
   - **Results** use the shape the chat already renders, so object chips reveal objects. They are class computed, and no "BMO" label is shown because nothing was proposed.
   - **Later waves** add their own deterministic commands to this list: Wave 5 adds `where <name>` (find a name in the code, any language) and a `--code` flag on `dp find`; Wave 6 findings; and so on.
   - **CLI twin:** `dp find <words>`, with `dp help` and `dp context`.
   - **Routes:** GET only (`/api/find`, `/api/context`, `/api/help/search`).
   - **On:** handoff or direct, as today.
7. **Help corpus.** A build step bundles the docs chosen in ★Q2.4 into `dist/help/` as sections `{id, file, heading, text}`, plus:
   - generated CLI help (`dp <command> --help`);
   - the help card's hints.
8. **Help without an LLM.**
   - A word index (BM25) over the sections, written as a small reusable module with no file or network access in the ranking code. `find` and Wave 14 reuse it.
   - `dp help <words>`.
   - A search box in the help card, through `GET /api/help/search?q=`.
9. **BMO help task** (LLM on). "Ask about dp" in the chat, with a fixed template.
   - The top sections go in as data blocks.
   - The answer must cite `doc:<section id>`, checked by the Wave 1 verifier.
   - It works with the handoff backend too. With the LLM off, "Ask about dp" is `help`.

## Determinism

| Output | Class |
|---|---|
| Object notes, sticky notes, comments in the pack, the Notes page, `dp context`, help search, `find` and the other fixed commands | computed |
| Help answers (LLM on) | proposed, labelled, cited |

## Owner answers

Applied 2026-11-19 ([questions.md](questions.md)).

- **Q2.1:** sticky notes are stored as part of the architecture (`dp.stickies`), BMO reads them, and they can be stuck to an object or a diagram. The separate "one note per diagram" field is dropped; a sticky stuck to the diagram is that note. The vision's "notes on diagrams" (feature E) is this.
- **Who writes notes (C6a, confirmed 2026-11-19):** model data, written by those who edit the model. Every other account uses comments, with images and files from [Wave 16](wave-16-attachments.md). Stickies follow the same rule.
- **Q2.2:** always. BMO sees every note, whatever the lens. No switch.
- **Follow-up (2026-11-19):** comments reach BMO too, and the general rule is screen parity: everything a person can see on screen is reachable by BMO (DEC-094). This reverses the C6a reasoning that kept comments away from BMO; the data-block treatment of DEC-064 is what keeps it safe.
- **Q2.3:** `dp context` prints Markdown, with `--json` as an option (the assistant's choice, the owner said "what you think is best").
- **Q2.4:** ship README, `planned-change.md`, the security model part of CONTRIBUTING, CHANGELOG and `decisions.md`, plus generated CLI help and the UI's hints. Leave out the backlog, the reviews and the book notes.
- **Q2.5:** yes, and with an on/off setting for the LLM. Off: search and fixed commands only.

## Stop and ask if

- ★Q2.1 turns out to need a separate note per object per diagram. Nothing stores per-diagram, per-object text except layout.
- ★Q2.4 changes which docs ship, beyond the list in the answer.
- Turning the LLM off would still need a prompt, a network call or a file written for a coding agent.
- Engineers cannot write stickies in a draft with the existing edit rules, or viewers would need to.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above, plus the canvas code that draws placed notes and `BmoChat.tsx` | Anchors confirmed |
| 2 | Markdown renderer and help routes | general-purpose · Opus | `ui/src/common/Markdown.tsx` (new), `src/server/routes/help.ts` (new), `src/server/app.ts` | Renders safely; XSS cases refused; GET routes only |
| 3 | Sticky notes: model, units, diff, merge | general-purpose · Opus | `src/core/modelEdits.ts`, `src/core/work.ts` (reuse `holderOf`), `src/core/modelUnits.ts`, `src/core/diff.ts`, `src/core/merge.ts` | Round trip, draft, diff, merge, undo and apply all work; deleting an object frees its stickies |
| 4 | Sticky notes: canvas, panels, menu | general-purpose · Sonnet | `ui/src/canvas/`, `ui/src/panels/`, `ui/src/contextMenus.ts` | A sticky can be added, edited, dragged and deleted; one stuck to a box moves with it; keyboard list works |
| 5 | Notes page, BMO always sees notes and comments | general-purpose · Opus | `ui/src/pages/NotesPage.tsx` (new), `App.tsx`, `useNavigation.ts`, `modelText.ts`, `contextPack.ts`, `src/assistant/citations.ts` (new cite kinds), read access to `src/core/comments.ts` | Page works by keyboard; notes, stickies and comment threads are in every pack, under every lens; comment and sticky cites are verified |
| 6 | BMO without an LLM | general-purpose · Opus | `src/assistant/commands.ts` (new), `src/assistant/settings.ts`, `src/server/routes/bmo.ts`, `ui/src/hooks/useBmo.ts`, `ui/src/common/BmoChat.tsx`, BMO settings UI | With the switch off, nothing is built or sent and the commands work; free text runs as `find` |
| 7 | `dp context`, `dp find`, help corpus, search, help task | general-purpose · Sonnet | `src/cli.ts`, `scripts/` (corpus build), `src/assistant/help.ts` (new), `prompts.ts` | Byte-stable output; search ranks deterministically; help answers cite sections |
| 8 | Tests by another agent | general-purpose · Sonnet | `tests/unit/`, `tests/browser/` | Tests as listed below |
| 9 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md (update DEC-092 and DEC-093 if the build differs), reviews.md, CLAUDE.md, README, `docs/determinism.md` | All docs updated |
| 10 | Review | main session | — | `/code-review` (high) and `/security-review` (the renderer, and what the LLM-off mode can send) findings fixed |

## Required in this wave

- **Routes.** The help, find and context routes are GET only. Sticky edits go through the model edit routes, which need a `ROUTE_RULES` entry with the `edit` action. Moving, editing and deleting a sticky each count as an edit.
- **Hub.** Search works per project and on hub pages; the help corpus is the same everywhere. BMO's LLM switch is a hub-level setting (DEC-064).
- **Read-only mode.** No sticky or note edits. Search and commands still work.
- **Units.** Stickies need units in `modelUnits.ts`, labels in `diff.ts`, merging, the change list and `dp diff`.
- **Packaging.** The help corpus is built into `dist/`, so the `package.json` `files` list covers it. Check that the package test still passes.
- **Static export.** It includes stickies and object notes.
- **Comments.** Placed comments keep working as they do today (DEC-070). Nothing in `comments.json` changes shape. BMO reads them; it never writes them.

## Tests

- **Renderer**
  - These are refused or rendered as text: `javascript:` and `data:` links, HTML tags, and an attribute injection attempt.
  - Line breaks are kept.
- **Sticky notes**
  - One on a computed diagram (a stored view is created).
  - Stuck to a box, to a line, and free.
  - Draft, apply and undo.
  - `dp diff` and the change list show it; a three-way merge keeps both sides' stickies.
  - Deleting its object frees it.
  - A viewer is refused; an engineer writes in a draft; an architect writes on main.
- **BMO and notes**
  - Notes and stickies are in the pack under the Overview lens.
  - They are redacted; whole notes are dropped under budget and the manifest says so.
  - A sticky's text that looks like an instruction stays in a data block.
  - Comment threads on the object or diagram are in the pack, with author and status, in data blocks labelled "not reviewed". Resolved ones come last and are dropped first under budget; the manifest says so.
  - A comment that tries to pose as an instruction ("ignore the rules above") stays in its block and changes nothing in the system text.
  - A cite to `comment:<id>` passes only when that thread was in the pack.
- **BMO without an LLM**
  - With the switch off, the backends are never called and no handoff file is written.
  - Each command works, with the same output twice.
  - Free text runs as `find` and says so.
  - With the switch on, behaviour is as before.
- **Notes page** browser test, including keyboard use.
- **`dp context`**
  - The same output twice.
  - Redaction applied.
  - Hidden paths never printed.
- **Help search**
  - Deterministic ranking.
  - Works with no BMO settings.
- **Help task** answers cite doc sections; a bad cite is marked.

## Docs

- **DEC-092, DEC-093 and DEC-094** are already written (2026-11-19): sticky notes as model data and BMO always reading notes and comments (amends DEC-070 and DEC-073), BMO without an LLM, and screen parity (BMO can reach everything the UI shows). This wave adds one more DEC for the help corpus, what ships, and `dp context` as the alternative to MCP.
- **README:** notes, stickies, `dp context`, `dp find`, help, the LLM switch.
- **CLAUDE.md:** the new files (`commands.ts`, `help.ts`, `Markdown.tsx`, the Notes page) and a line that placed notes are comments while stickies are model data.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **`docs/determinism.md`:** rows for this wave.
- **planned_features.md:** the MCP row gets a pointer to `dp context`.

## Out of scope

- A separate note per object per diagram.
- An MCP server.
- Searching code (Wave 14).
- Decision prose rendering (Wave 3; the renderer from this wave is reused).
- Images and files on stickies (Wave 16).
- Free-text answers with no LLM. The chat searches; it does not write answers.

## Start prompt

```
Run Wave 02 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-02-notes-context-help.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
