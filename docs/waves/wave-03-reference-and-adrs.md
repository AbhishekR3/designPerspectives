# Wave 03: Reference library and ADRs

| | |
|---|---|
| **Status** | Owner answers applied (2026-11-19; Q3.1 to Q3.5 answered: the page stays "Decisions", plus references to local files). Ready to run after Wave 2. Uploads are in [Wave 16](wave-16-attachments.md) |
| **Branch** | `feat/w03-reference-and-adrs`, from `main` after Wave 2 is merged |
| **Size** | M |
| **Release** | 0.8.0 (with Waves 26, 16, 4, 27) |
| **Depends on** | Wave 2 (the Markdown renderer) |
| **Owner items** | 4, 13 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

The owner keeps a curated **reference library**: Markdown write-ups of patterns and anti-patterns that architects fall into (Entity Trap, Big Ball of Mud and so on). In the UI the page is called "Reference notes", the owner's own words. Everyone can read it, only architects edit it, and later checks link to it: rules in Wave 8, BMO's review in Wave 11.

Decision records stay on the **Decisions** page (architecture decision records, ADRs). Each can carry links to web pages, to files in the repository, and to a file on the reader's own computer, so nothing needs copying. Uploaded images and files are [Wave 16](wave-16-attachments.md).

## Owner requests covered

> - I want to have a reference notes section that is curated by me that can help software architects such as a list of patterns and anti-patterns software architects fall into
> - Have a section called ADR Architectural Decision Records so the architect can keep things in mind. And each decision can have a way to attach files or info to it

## What exists today [Fact]

**The library**
- No reference library exists.
- The book notes name anti-patterns and patterns with page numbers (`docs/notes/fundamentals-of-software-architecture-richards-ford.md`). Some, with their lines in that file:

  | Line | Name |
  |---|---|
  | :35 | Frozen Caveman |
  | :39 | Bottleneck Trap |
  | :49 | Distributed Monolith |
  | :87 | Ivory Tower |
  | :138 | Entity Trap |
  | :158 | Big Ball of Mud |
  | :188 | Architecture Sinkhole |
  | :198-202 | Chatty modules and over-reuse |
  | :253 | Shared entity library |
  | :269-277 | Poison event, Swarm of Gnats |
  | :324 | Accidental SOA |
  | :344 | Grains of Sand |
  | :368-375 | Patterns |

- Precedents for files kept beside the model, each with a store, routes and UI:
  - `architecture/comments.json` (DEC-049): `src/core/comments.ts`, `src/server/routes/comments.ts`;
  - `architecture/checklist.json` (DEC-084): `src/core/checklist.ts`, starter lists `STARTERS` at `:85-134`, `addStarter` at `:351-375`.
- Hub-wide sharing exists for the catalog (DEC-055): `src/server/hub.ts`, `src/server/routes/hub.ts`, `ui/src/pages/CatalogPage.tsx`.
- Hub page plumbing: `ui/src/Router.tsx:17-24`, `ui/src/pages/Shell.tsx:16`, `:34-38`, `:63-67`.

**Permissions**
- The action table is at `src/server/auth.ts:11-27`, `ROUTE_RULES` at `:74-186`, and `decide()` at `:224-264`.
- The checklist action is open to engineers (`:26`).
- A route without a rule is architect-only, and a test fails (`tests/unit/auth.test.ts:733-734`).

**Decisions (DEC-050)**
- `src/core/decisions.ts` has:

  | Lines | What |
  |---|---|
  | `:1-36`, `:173-207` | Front-matter grammar |
  | `:59-72` | `META` keys |
  | `:225-309` | Sections |
  | `:314-350` | `serializeDecision` |
  | `:55` | `DECISION_FILE_RE` |
  | `:626-649` | Renumbering on apply |

  Unknown keys and sections are kept in `extraMeta` and `extra`.
- In the UI, prose is shown as plain text (`ui/src/pages/DecisionsPage.tsx:351-353`). The editor warns on text that looks like a secret (`DecisionEditor.tsx:21`).
- Routes: `src/server/routes/decisions.ts:21-51`.
- The diff compares field by field (`DECISION_FIELDS`, `src/core/diff.ts:80-98`).
- The toolbar label is "Decisions" (`ui/src/App.tsx:946-950`), and so is the tab title (`:357`).
- Drafts copy the whole decisions folder into the draft and its base (`src/core/drafts.ts:208-212`).

**Request limits**
- Request bodies must be JSON and under 5 MB (`src/server/requestProtection.ts:12`, `:94-102`). This is also the cross-site defence.
- `dp.links` already holds `{label, url}` lists on elements, with no URL scheme check (`modelEdits.ts:956-961`). Validators exist that could be reused: `checkServiceUrl` and `cleanRunUrl` (`src/core/hosts.ts:33-51`, `modelEdits.ts:119-132`).

## Design [Proposal; rewritten after the owner answers]

1. **Library store** (`src/core/reference.ts`, new).
   - Markdown files: `architecture/reference/<slug>.md` per project, and `<hub>/reference/<slug>.md` in a hub (★Q3.1).
   - The front matter reuses the decisions grammar style. Keys:
     - `kind`: pattern, anti-pattern, principle, checklist or note;
     - `tags`, `characteristics`, `rules` and `sources`;
     - `check` (true or false): whether the entry is pre-selected for BMO's review.
   - Sections follow Q3.3: Summary, Signs to look for, Why it hurts / helps, What to do instead, Example, My notes.
   - Precedence: a project entry overrides a hub entry with the same slug, and the UI says so.
   - Kept beside the model: no drafts, no undo. Byte-stable round trip.
2. **Permissions.** A new `reference` action, for architects only. Everyone reads. Each POST, PUT or DELETE route under `/api/reference*` gets a `ROUTE_RULES` entry.
3. **UI.**
   - A Reference notes page (`p=reference`) in a project, and a hub page `#/reference` (Router and Shell).
   - Filter by kind, search, and an editor (Markdown, using the Wave 2 renderer).
   - "Add starter entries": opt-in, de-duplicated by slug, like the checklist starters.
4. **Starter set** (★Q3.2). About 10 anti-patterns and 5 patterns, written in our own words, with book and page references.
   - Kept in code, like `STARTERS`.
   - An Opus subagent checks that nothing copies the books.
5. **The Decisions page keeps its name** (★Q3.4, the owner: "leave it as the Decisions page").
   - The toolbar label and the page title stay "Decisions".
   - Searching for "ADR" or "architecture decision record" finds the page. The help card and the README say "Decisions (architecture decision records, ADRs)".
   - File paths, CLI and API names stay as they are.
6. **Links in decisions** (★Q3.5 option 1).
   - A `## Links` section, one per line:
     - `- [title](https://…) — note` for web pages;
     - `- [title](code:path/to/file#L10-L20) — note` for repository files;
     - `- [title](local:~/specs/design.pdf) — note` for a file on the reader's own computer (★Q3.5).
   - It is parsed into a `links` field, which gets a diff label and merges field by field.
   - Checks:
     - web links must be http or https;
     - repository paths must stay inside the code root and obey the hidden-path rule (DEC-031);
     - a `local:` path is text only: an absolute path or one starting with `~/`, at most 500 characters, no control characters. dp never reads, copies, uploads or sends it to BMO.
   - Display: web links open in a new tab with `rel="noopener noreferrer"`; repository paths open the file panel; a `local:` path shows its file name and a Copy path button. **Open in the system's default app is built in [Wave 16](wave-16-attachments.md)** (item 12), not here, because it needs its own security review.
   - `local:` link text goes to BMO as part of the decision (the path text only, never the file).
   - `dp check` gives an info line (not a warning) when a `local:` file does not exist on the machine running the check.
   - **Trade-off:** a path in git only helps on that machine, and shows a user name unless written with `~/`. Teammates see a path that may not exist on their machine.
7. **Decision prose** is rendered with the Wave 2 Markdown renderer.
8. **An optional `## Compliance` section** (Q3.6), which can name a Wave 8 rule id later.
9. **Uploads are not in this wave.** [Wave 16](wave-16-attachments.md) builds them, and offers "Reference a file on this computer" (the `local:` kind above) beside "Upload" wherever one can attach. The design lines below are the starting point it uses.
   - Sent as base64 inside JSON on their own route, with their own body cap.
   - Stored in a content-addressed `architecture/attachments/<sha256>.<ext>`, outside `decisions/` so drafts never copy them.
   - A `## Attachments` section lists name, hash and size.
   - Downloads only: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, a CSP sandbox. SVG and HTML are never shown inline.
   - An allowlist of file types. Never sent to BMO. Left out of the static export unless the owner chooses otherwise.
   - `dp check` warns about files no decision references.

## Determinism

| Output | Class |
|---|---|
| Library, links, checks | computed |
| Starter entries | written by us and reviewed; the owner curates them |

## Owner answers

Applied 2026-11-19: the owner answered Part A and Q3.1 to Q3.5 ([the questions section below](#questions-options-and-answers-moved-from-questionsmd)). Q3.6 was left blank, so it uses its recommendation.

- **Q3.1:** the owner asked "What is a library?". It is the reference library of pattern and anti-pattern write-ups (see Goal); the page is called "Reference notes". The recommendation stands: option 4. Per project in `architecture/reference/` and hub-wide in `<hub>/reference/`; a project entry overrides a hub entry with the same name; architects edit, everyone reads; a DEC adds it to CLAUDE.md's list of files outside the workspace.
- **Q3.2:** yes for now; an opt-in starter set of about 10 anti-patterns and 5 patterns, in our own words, with book and page references; an Opus subagent checks that no text is copied. The owner wants to review the starters later: it is an item in ideas list O.
- **Q3.3:** the entry template as proposed (the owner said "whatever you think is best").
- **Q3.4:** the page stays "Decisions" (option 2). Search for "ADR" finds it.
- **Q3.5:** links in decisions here, files in [Wave 16](wave-16-attachments.md) (which also covers diagrams, notes and comments), and a reference to a file on the owner's own computer so nothing is duplicated (the `local:` link kind). The owner also wants a click to open it in the system's default app; that is Wave 16's item 12 (DEC-095). Splitting files out keeps this wave at M and gives the security work its own review.
- **Q3.6:** yes, an optional Compliance section that can name a rule.

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in DEC-104.*

### ★Q3.1 Where does the library live, and who edits it?

**Analysis**
- The library isn't data about one object, so the `dp.*` rule doesn't fit. It is like `comments.json` (DEC-049) and `checklist.json` (DEC-084).
- Hubs already share a catalog across projects (DEC-055).

**Options**
1. Per project, in `architecture/reference/`.
2. Hub-wide, in `<hub>/reference/`.
3. Per person, outside git.
4. Both 1 and 2, with a rule for which entry wins.

**Recommended.** Option 4.
- **Entries:** Markdown files with a small header.
- **Which wins:** a project entry overrides a hub entry with the same name.
- **Kept beside the model:** no drafts and no undo, like the checklist.
- **Who edits:** architects only, through a new permission (engineers' checklist rights don't cover it). Everyone can read it.
- **A DEC** adds it to CLAUDE.md's list of files outside the workspace.

**Owner's thinking:** What is a library?

**Applied [2026-11-19].** The word was unclear, so here it is in plain words.
- **"The library" is the reference library:** your curated set of write-ups on patterns and anti-patterns that architects fall into (Entity Trap, Big Ball of Mud, and so on). It is what you asked for as "a reference notes section curated by me". Each entry is one Markdown page inside dp: a summary, signs to look for, why it hurts, what to do instead. It is a small built-in wiki that everyone can read and architects edit.
- **"Where does it live" means which folder the entry files are in, and who may edit them:**
  1. Per project, in `architecture/reference/`. It travels with the project's git repository.
  2. Per hub, shared by every project on a hub.
  3. Per person, outside git.
  4. Both 1 and 2, where a project entry beats a hub entry of the same name.
- **No change to the plan.** Option 4 still holds, since the question was about the word and not about the options. Tell me if the explanation changes your mind.
- **The label:** I'll call the page "Reference notes", your own words, and not "library".

### ★Q3.2 Should dp ship starter entries?

**Analysis** [Fact]. The book notes name many anti-patterns and patterns, with page numbers (`docs/notes/fundamentals-of-software-architecture-richards-ford.md`):
- Entity Trap (:138);
- Architecture Sinkhole (:188);
- Big Ball of Mud (:158);
- one shared entity library (:253);
- Swarm of Gnats (:277);
- Accidental SOA (:324);
- Grains of Sand (:344).

**Recommended**
- An opt-in starter set of about 10 anti-patterns and 5 patterns, written in our own words, with book and page references.
- No copied text. An Opus subagent checks for that.
- You then curate: edit, delete, add.
- The alternative is to start empty.

**Owner's thinking:** Yes, that works for now, but still add this into future_tasks.md so I can review these later.

**Applied [2026-11-19].** As recommended: an opt-in starter set of about 10 anti-patterns and 5 patterns, in our own words, with book and page references, and an Opus copy check. Added to ideas list O ("Checks that only the owner can run"): review the starter entries and curate them.

### Q3.3 The entry template

**Proposed**
- **Header:**
  - kind: pattern, anti-pattern, principle, checklist or note;
  - tags;
  - the characteristics it affects;
  - related rule ids (Wave 8);
  - sources (book and page);
  - "check by default" (pre-selected for BMO's review).
- **Sections:** Summary · Signs to look for · Why it hurts (or why it helps) · What to do instead · Example · My notes.
- "Signs to look for" is what Wave 8's detectors and Wave 11's BMO review use.

**Owner's thinking:** Do whatever you think is best.

**Applied [2026-11-19].** As proposed.

### ★Q3.4 Should the section be called "ADRs"?

**Analysis** [Fact]
- The toolbar button and the page are called "Decisions" (`ui/src/App.tsx:946-950`, `:357`).
- The files are `architecture/decisions/NNNN-slug.md` (DEC-050). The CLI and the API say "decisions".
- You asked for "a section called ADR Architectural Decision Records".

**Options**
1. Label the button "ADRs" and the page "Architecture decision records (ADRs)". Keep the paths.
2. Keep "Decisions", and make a search for "ADR" find it.

"ADR" is architect jargon, and people on the Overview lens may not know it.

**Recommended.** Option 1. It is what you asked for, and the people who write decisions are architects.

**Owner's thinking:** Leave it as the Decisions page.

**Applied [2026-11-19].** Option 2. The button and the page stay "Decisions". Searching for "ADR" or "architecture decision record" finds the page. The help card and the README say "Decisions (architecture decision records, ADRs)", and paths and API names stay. The vision's feature G ("an ADR page") is the Decisions page. [Wave 3](wave-03-reference-and-adrs.md), Wave 11 and the vision file are updated.

### ★Q3.5 Attachments: links, or files too?

**Analysis** [Fact]
- **A decision can hold neither links nor files today.** Its prose shows as plain text (`ui/src/pages/DecisionsPage.tsx:351-353`).
- **Drafts copy the whole decisions folder,** into the draft and into its base (`src/core/drafts.ts:208-212`). A file kept there would be stored three times per draft.
- **A request body must be JSON under 5 MB** (`src/server/requestProtection.ts:12`, `:94-102`). That rule also stops other websites sending requests to dp.
- **Secrets:** a decision holding a secret is refused (DEC-064), and binary files can't be scanned for secrets.
- **The planned static export would include attachments** (DEC-024).

**Options**
1. **Links now.** A Links section with web links (http and https only) and repository paths. Paths are checked against the code root and the hidden-path rule (DEC-031).
2. **Files as well.**
   - Uploaded as base64 inside JSON, into a shared `architecture/attachments/` folder named by content. It sits outside `decisions/`, so drafts don't copy it.
   - A size cap and a list of allowed types.
   - Download only: SVG and HTML are never shown in the page.
   - Never sent to BMO.

**Recommended.** Option 1 now, option 2 later if links aren't enough. Your thinking could say what you expect to attach (whiteboard photos, PDFs, spreadsheets).

**Owner's thinking:** Options 1 and 2, but also allow users to just reference another file on their local machine, so they don't need duplicates.

**Applied [2026-11-19].** Both options, plus a third way to attach.
- **Links:** built in Wave 3, as planned.
- **Files:** built in [Wave 16](wave-16-attachments.md), as planned (up to 10 MB, anyone can attach, stored in the project).
- **New: a reference to a file on your own computer,** so a large file need not be copied into the project. [Proposal, how]
  - It is a `local:` link kind that holds a path (`~/specs/design.pdf` or an absolute path).
  - dp stores the path text only. It never reads, copies, uploads or sends the file to BMO.
  - It shows the file name and a Copy path button.
  - `dp check` gives an info line if the file does not exist on the machine running the check.
  - Wave 3 builds the link kind for decisions. Wave 16 adds "Reference a file on this computer" beside "Upload" wherever you can attach.
- **Opening it (follow-up, 2026-11-19):** you asked that a click open the file in the system's default app, such as a PDF in Acrobat or a spreadsheet in Excel. Yes, in [Wave 16](wave-16-attachments.md) (item 12, DEC-095), with limits.
  - A web page cannot open `file:` links [Training], so dp's server asks the operating system to open it, the way the CLI already opens the browser (`src/cli.ts:57-60`).
  - **The danger:** a decision from a cloned repository could point at a program or script, and "open" would start it. So:
    - only a short list of document types opens (PDF, Word, Excel, PowerPoint, CSV, text, Markdown, common images). Programs, scripts, shortcuts, `.app` bundles, `.html`, `.svg` and macro-enabled Office files are refused;
    - the path is resolved first, symlinks included, and the real file's type is checked;
    - a dialog shows the full path before it opens, because a link's label can say anything;
    - it works only on a server running on your own machine. On a hub or remote server the button is Copy path, because "open" would open the file on the server's computer;
    - the same cross-site rule as uploads applies.
  - The Windows path is written and not run, like the rest of the CLI's Windows code. If the security review finds the route unsafe, Wave 16 ships Copy path only and tells you.
- **Trade-off:** a path in git is only useful on that machine. It shows your user name unless written as `~/`. Teammates see a path they cannot open.

### Q3.6 A "Compliance" section in decisions

**Proposed.** The book's ADR template has a Compliance section: how the decision is checked, by hand or by an automated test (notes `fundamentals…md:386`). In dp it would be an optional section that can name a rule from Wave 8.

**Recommended.** Yes.

## Stop and ask if

- ★Q3.1 asks for a per-person library outside git.
- Opening a `local:` file is wanted in this wave rather than Wave 16. It needs a security review first.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Library store, routes, permission | general-purpose · Sonnet | `src/core/reference.ts` (new), `src/server/routes/reference.ts` (new), `src/server/auth.ts`, `src/server/app.ts`, `src/server/hub.ts` | Round trip byte-stable; precedence works; engineers are refused edits |
| 3 | Reference pages | general-purpose · Sonnet | `ui/src/pages/ReferencePage.tsx` (new), `Router.tsx`, `Shell.tsx`, `App.tsx`, `useNavigation.ts` | Project and hub pages work by keyboard |
| 4 | Starter entries | general-purpose · Sonnet; then a copy check by general-purpose · Opus | `src/core/referenceStarters.ts` (new) | About 15 entries; the Opus check finds no copied text |
| 5 | Search for "ADR", links (web, `code:`, `local:`), prose rendering, Compliance | general-purpose · Sonnet | `decisions.ts`, `diff.ts`, `DecisionsPage.tsx`, `DecisionEditor.tsx`, `App.tsx`, the search box and help card | Links parse and serialize byte-identically; unsafe links are refused; "ADR" finds the Decisions page |
| 6 | *(Uploads moved to Wave 16)* | — | — | — |
| 7 | Tests by another agent | general-purpose · Sonnet | `tests/unit/`, `tests/browser/` | Tests as listed below |
| 8 | Docs | general-purpose · Haiku | decisions.md, the review file (notes for the release entry, not the CHANGELOG), CLAUDE.md (the list of files kept outside the workspace), README | All docs updated |
| 9 | Review | main session | — | `/code-review` (high) and `/security-review` findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` entries for every reference route.
- **Hub.** The hub-wide library and the precedence rule. Per-project roles apply to project entries.
- **Read-only mode.** No library edits.
- **Model data.** The library is outside the model, so it needs no units. The decisions' `links` field needs `DECISION_FIELDS`, diff labels and merge.
- **Static export.** It includes the library, read-only. Attachments are Wave 16's concern.
- **CLAUDE.md** adds `architecture/reference/` to the files kept outside the workspace, next to `comments.json` and `checklist.json`.

## Tests

- **Library store**
  - Parse and serialize round trip.
  - A malformed entry gives a clear error.
  - Precedence between project and hub.
  - Starter entries de-duplicate by slug.
- **Permissions:** an engineer and a viewer are refused edits; every role can read.
- **Decision links**
  - These are refused: `javascript:` links, `../` escapes, hidden paths, a `local:` path that is relative or has control characters.
  - A `local:` path is stored and shown as text, and nothing reads the file (a test that the route never touches the disk for it).
  - A decision without links still round-trips byte for byte.
- **Browser**
  - Add and edit a library entry.
  - Links in a decision can be clicked.
  - Searching for "ADR" finds the Decisions page, and its label is unchanged.

## Docs

- **New DEC:** the library is kept beside the model with a precedence rule and architect-only edits; links in decisions, including `local:` references; the page keeps the name "Decisions". It amends DEC-050 where decisions change.
- **README:** the reference notes and Decisions (ADRs).
- **CLAUDE.md:** the map and the list of files outside the workspace.
- **The review file** (not the CHANGELOG, which the release change writes): the wave's entries.
- **`docs/determinism.md`:** rows for this wave.

## Decided (DEC-103, 2026-11-20; assistant's reasoning, the owner may overrule)

- **N14.** The assumption work of DEC-099 (a decision cites assumption items, a "wrong" state, "needs a look" on the decisions that cite one) is built here, because the decision record and its page hold the link. The "wrong" state is a small checklist change that rides with it. Wave 6 reads that state and does not define it.

## Out of scope

- Linking findings to entries (Wave 8).
- BMO reading the entries (Wave 11).
- Uploads and attachments (Wave 16).
- Opening a `local:` file in the default app (Wave 16).
- A library shared per person.

## Start prompt

```
Run Wave 03 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-03-reference-and-adrs.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
