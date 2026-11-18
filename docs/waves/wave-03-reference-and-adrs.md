# Wave 03: Reference library and ADRs

| | |
|---|---|
| **Status** | Waiting for owner answers: ★Q3.1, ★Q3.2, Q3.3, ★Q3.4, ★Q3.5, Q3.6 ([questions.md](questions.md)) |
| **Branch** | `feat/w03-reference-and-adrs`, from `main` after Wave 2 is merged |
| **Size** | M (L if ★Q3.5 asks for file uploads) |
| **Depends on** | Wave 2 (the Markdown renderer) |
| **Owner items** | 4, 13 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

The owner keeps a curated library of patterns and anti-patterns that architects fall into. Everyone can read it, and later checks link to it: rules in Wave 8, BMO's review in Wave 11.

Decision records are presented as **ADRs**. Each can carry links to web pages and to files in the repository, and uploaded files only if the owner chooses them.

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
   - A Reference page (`p=reference`) in a project, and a hub page `#/reference` (Router and Shell).
   - Filter by kind, search, and an editor (Markdown, using the Wave 2 renderer).
   - "Add starter entries": opt-in, de-duplicated by slug, like the checklist starters.
4. **Starter set** (★Q3.2). About 10 anti-patterns and 5 patterns, written in our own words, with book and page references.
   - Kept in code, like `STARTERS`.
   - An Opus subagent checks that nothing copies the books.
5. **ADRs** (★Q3.4).
   - The toolbar label becomes "ADRs" and the page title "Architecture decision records (ADRs)". The tab title follows. Searching for "ADR" or "decision" finds the page.
   - File paths, CLI and API names stay as they are.
6. **Links in decisions** (★Q3.5 option 1).
   - A `## Links` section, one per line:
     - `- [title](https://…) — note` for web pages;
     - `- [title](code:path/to/file#L10-L20) — note` for repository files.
   - It is parsed into a `links` field, which gets a diff label and merges field by field.
   - Checks:
     - web links must be http or https;
     - repository paths must stay inside the code root and obey the hidden-path rule (DEC-031).
   - Display: web links open in a new tab with `rel="noopener noreferrer"`; repository paths open the file panel.
7. **Decision prose** is rendered with the Wave 2 Markdown renderer.
8. **An optional `## Compliance` section** (Q3.6), which can name a Wave 8 rule id later.
9. **Uploads, only if ★Q3.5 chooses option 2.**
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

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q3.1 asks for a per-person library outside git.
- ★Q3.5 chooses uploads. Then the upload step is Opus, and `/security-review` is mandatory before commit.
- ★Q3.4 keeps "Decisions".

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Library store, routes, permission | general-purpose · Sonnet | `src/core/reference.ts` (new), `src/server/routes/reference.ts` (new), `src/server/auth.ts`, `src/server/app.ts`, `src/server/hub.ts` | Round trip byte-stable; precedence works; engineers are refused edits |
| 3 | Reference pages | general-purpose · Sonnet | `ui/src/pages/ReferencePage.tsx` (new), `Router.tsx`, `Shell.tsx`, `App.tsx`, `useNavigation.ts` | Project and hub pages work by keyboard |
| 4 | Starter entries | general-purpose · Sonnet; then a copy check by general-purpose · Opus | `src/core/referenceStarters.ts` (new) | About 15 entries; the Opus check finds no copied text |
| 5 | ADR label, links, prose rendering, Compliance | general-purpose · Sonnet | `decisions.ts`, `diff.ts`, `DecisionsPage.tsx`, `DecisionEditor.tsx`, `App.tsx` | Links parse and serialize byte-identically; unsafe links are refused |
| 6 | Uploads (only if chosen) | general-purpose · Opus | `src/server/routes/attachments.ts` (new), `requestProtection.ts` (a per-route cap), `decisions.ts` | Security cases pass; drafts don't copy files |
| 7 | Tests by another agent | general-purpose · Sonnet | `tests/unit/`, `tests/browser/` | Tests as listed below |
| 8 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, CLAUDE.md (the list of files kept outside the workspace), README | All docs updated |
| 9 | Review | main session | — | `/code-review` (high) and `/security-review` findings fixed |

## Required in this wave

- **Routes.** `ROUTE_RULES` entries for every reference route, and for the attachment routes if those are built.
- **Hub.** The hub-wide library and the precedence rule. Per-project roles apply to project entries.
- **Read-only mode.** No library edits.
- **Model data.** The library is outside the model, so it needs no units. The decisions' `links` field (and `attachments`, if built) needs `DECISION_FIELDS`, diff labels and merge.
- **Static export.** It includes the library, read-only. It includes attachments only if chosen.
- **CLAUDE.md** adds `architecture/reference/` to the files kept outside the workspace, next to `comments.json` and `checklist.json`.

## Tests

- **Library store**
  - Parse and serialize round trip.
  - A malformed entry gives a clear error.
  - Precedence between project and hub.
  - Starter entries de-duplicate by slug.
- **Permissions:** an engineer and a viewer are refused edits; every role can read.
- **Decision links**
  - These are refused: `javascript:` links, `../` escapes, hidden paths.
  - A decision without links still round-trips byte for byte.
- **Uploads, if built**
  - Over the cap.
  - Wrong type.
  - Bad file names.
  - Downloads carry the Content-Disposition header.
  - Drafts don't copy the files.
  - Nothing reaches BMO.
- **Browser**
  - Add and edit a library entry.
  - Links in a decision can be clicked.
  - The "ADRs" label shows.

## Docs

- **New DEC:** the library is kept beside the model with a precedence rule and architect-only edits; the "ADRs" label; links in decisions (and uploads, if chosen). It amends DEC-050 where decisions change.
- **README:** the library and ADRs.
- **CLAUDE.md:** the map and the list of files outside the workspace.
- **CHANGELOG** and **reviews.md:** the wave's entries.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- Linking findings to entries (Wave 8).
- BMO reading the entries (Wave 11).
- Uploads, unless ★Q3.5 chooses them.
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
