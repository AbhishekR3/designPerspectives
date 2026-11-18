# Wave 02: Notes, context and help

| | |
|---|---|
| **Status** | Waiting for owner answers: ★Q2.1, ★Q2.2, Q2.3, ★Q2.4, Q2.5 ([questions.md](questions.md)) |
| **Branch** | `feat/w02-notes-context-help`, from `main` after Wave 1 is merged |
| **Size** | M |
| **Depends on** | Wave 1 (context packs, citations, labels) |
| **Owner items** | 3, 17 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Notes are easy to write, read and find for three audiences: people, BMO and coding agents. Each diagram gets a note of its own. One command prints what BMO would be told about any object. dp can answer "how does dp work?", from its own docs, with or without an LLM.

## Owner requests covered

> - Have an option for the user to have a note specifically for each object at each level so they can store notes that you can see easily
> - BMO agent should be able to ask questions about this software as well and how it works. Similar to how you can ask Claude questions about Claude, you should be able to ask BMO about designPerspectives.

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

**Diagrams**
- Views carry `properties`. Linked work is stored on a view through `holderOf` and `ensureView`, and a computed diagram gets a stored view when needed (`src/core/work.ts:48-75`).
- Sticky notes on a diagram (DEC-070) are comments with a position (`src/core/comments.ts:73-79`, `:225-247`). They are not model data and never reach BMO.

**Help and packaging**
- The help card is static (`ui/src/common/HelpCard.tsx:31-101`).
- The package ships `dist`, `static`, `demo`, `README.md` and `LICENSE` (`package.json:15-21`), so `docs/` is not shipped.

**Page plumbing**
- Pages over the diagram use `usePage` (`ui/src/hooks/useNavigation.ts:84-113`). Bare links are matched by the regex at `:34`.
- `App.tsx` mounts the pages at `:1089-1093` and holds the toolbar at `:918-988`.

## Design [Proposal; rewritten after the owner answers]

1. **Diagram notes.** `dp.notes` on views and flows, stored the way `dp.work` is (★Q2.1).
   - Shown in the diagram panel as "Diagram notes", apart from sticky notes.
   - They go through drafts, undo and diffs: a view-level property change must appear in the change list.
2. **Markdown in notes.** A small renderer that builds React elements, never setting innerHTML. It supports:
   - paragraphs, lists, emphasis, inline code and code blocks, and headings from level 3 down;
   - links with http or https only.

   It has no raw HTML and no images. Line breaks are kept. Wave 3 reuses it for decision prose.
3. **Notes page** (`p=notes`). Every note, grouped by level: landscape and context, containers, components, relationships, diagrams. It has search, and a click reveals the object.
4. **BMO and notes.** Notes follow the lens, with an "include notes" switch in the preview (★Q2.2).
   - The switch travels with the request, so the preview hash covers it.
   - Line breaks are kept, and the 2,000-character cut is replaced by the Wave 1 pack budget.
5. **`dp context <target> [--for explain|review|code] [--code] [--json]`.** Prints the Wave 1 pack for an object or diagram, without the system text.
   - Same redaction, same file gate, read-only. Markdown by default (Q2.3).
   - It gives coding agents (such as Claude Code) the model without an MCP server (DEC-020).
6. **Help corpus.** A build step bundles the docs chosen in ★Q2.4 into `dist/help/` as sections `{id, file, heading, text}`, plus:
   - generated CLI help (`dp <command> --help`);
   - the help card's hints.
7. **Help without an LLM.**
   - A word index (BM25) over the sections, written as a small reusable module with no file or network access in the ranking code, because Wave 14 reuses it for code and docs.
   - `dp help <words>`.
   - A search box in the help card, through `GET /api/help/search?q=`.
8. **BMO help task.** "Ask about dp" in the chat, with a fixed template.
   - The top sections go in as data blocks.
   - The answer must cite `doc:<section id>`, checked by the Wave 1 verifier.
   - It works with the handoff backend too.

## Determinism

| Output | Class |
|---|---|
| Notes, the Notes page, `dp context`, help search | computed |
| Help answers | proposed, labelled, cited |

## Owner answers

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q2.1 means a separate note per object per diagram. That needs a storage design, and nothing stores per-diagram, per-object data today except layout.
- ★Q2.4 changes which docs ship, beyond the list in the answer.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Markdown renderer and help routes | general-purpose · Opus | `ui/src/common/Markdown.tsx` (new), `src/server/routes/help.ts` (new), `src/server/app.ts` | Renders safely; XSS cases refused; GET routes only |
| 3 | Diagram notes (model and UI) | general-purpose · Sonnet | `src/core/modelEdits.ts`, `src/core/work.ts` (reuse `holderOf`), `src/core/modelUnits.ts`, `src/core/diff.ts`, the diagram panel in `ui/src/panels/` | Round trip, draft, diff and apply all work |
| 4 | Notes page, preview switch, line breaks | general-purpose · Sonnet | `ui/src/pages/NotesPage.tsx` (new), `App.tsx`, `useNavigation.ts`, `modelText.ts`, `contextPack.ts`, `BmoSheet.tsx` | Page works by keyboard; the switch changes the hash |
| 5 | `dp context`, help corpus, search, help task | general-purpose · Sonnet | `src/cli.ts`, `scripts/` (corpus build), `src/assistant/help.ts` (new), `prompts.ts` | Byte-stable output; search ranks deterministically; help answers cite sections |
| 6 | Tests by another agent | general-purpose · Sonnet | `tests/unit/`, `tests/browser/` | Tests as listed below |
| 7 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, CLAUDE.md, README, `docs/determinism.md` | All docs updated |
| 8 | Review | main session | — | `/code-review` (high) and `/security-review` (the renderer) findings fixed |

## Required in this wave

- **Routes.** The help routes are GET only. Diagram-note edits go through a model edit route, which needs a `ROUTE_RULES` entry with the `edit` action.
- **Hub.** Search works per project and on hub pages; the help corpus is the same everywhere.
- **Read-only mode.** No note edits.
- **Units.** View properties need units in `modelUnits.ts`, labels in `diff.ts`, merging, the change list and `dp diff`.
- **Packaging.** The help corpus is built into `dist/`, so the `package.json` `files` list covers it. Check that the package test still passes.
- **Static export.** It includes diagram notes.

## Tests

- **Renderer**
  - These are refused or rendered as text: `javascript:` and `data:` links, HTML tags, and an attribute injection attempt.
  - Line breaks are kept.
- **Diagram notes**
  - Note on a computed diagram (a stored view is created).
  - Draft, apply and undo.
  - `dp diff` shows the note.
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

- **New DEC:** diagram notes compared with sticky notes; the help corpus and what ships; `dp context` as the alternative to MCP.
- **README:** notes, `dp context`, help.
- **CLAUDE.md:** the new files.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **`docs/determinism.md`:** rows for this wave.
- **future_tasks:** the MCP row gets a pointer to `dp context`.

## Out of scope

- A note per object per diagram, unless ★Q2.1 asks for it.
- An MCP server.
- Searching code (Wave 14).
- Decision prose rendering (Wave 3; the renderer from this wave is reused).

## Start prompt

```
Run Wave 02 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-02-notes-context-help.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
