# Wave 05: Code search, key code and one generic code reader

| | |
|---|---|
| **Status** | Rewritten 2026-11-20, revised the same day. dp stops reading code with one tokenizer per language. It searches code as plain text, a component's main files and functions are pinned, and one **generic regex reader** (a table of patterns for the major languages) replaces the Python and JS/TS readers. Ready to run after Waves 1 and 2 |
| **Branch** | `feat/w05-code-search`, from `main` after Waves 1 and 2 are merged |
| **Size** | M–L. Split point: 5a is search and key code (steps 2 to 5); 5b is the generic reader that replaces the old readers (step 6) |
| **Release** | 0.8.0 (with Wave 15) |
| **Depends on** | Wave 1 (context packs, citations) and Wave 2 (the list of fixed BMO commands and `dp find`) |
| **Owner items** | 14 (more languages) and 8 (config files, `tools.py`) ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave. Also read [../import-design.md](../import-design.md) (what the import is for and what matters to C4 at each level) and the import choices N1 to N15 in [DEC-103](../decisions.md#pro-19--dec-103--code-import-and-bmo-choices-and-the-080-split-n1-to-n15), which change what this wave builds (see its "Decided" section if it has one).

## Goal

Three things, with no code written per language:

1. **Find code by name, with no LLM.** Type a function, class or file name, offline in BMO or on the command line, and dp shows the files and lines where it appears. Hits that look like a definition are marked and listed first.
2. **Key code.** A C3 component (or any element with code) shows its **main files and functions**, a short list a person pins. dp checks each entry against the code. With an LLM on, BMO can propose entries; dp verifies them first.
3. **One generic reader** for imports and definitions, built from a table of regular expressions that covers the major languages. It replaces the separate Python and JS/TS readers, so the code diagram, the component lines in the scan and the coding plan's import check now work for more languages. Its results are labelled approximate.

dp has no module, tokenizer or branch for any single language. A language is covered by patterns in a table, and a language not in the table still gets search.

## Owner requests covered

> - Add more languages to be supported such as Java
> - How does config files/common functions such as tools.py show up in this?

The owner's answers of 2026-11-20 ([the questions section below](#questions-options-and-answers-moved-from-questionsmd), Q5.1 to Q5.8):

- "Remove non-LLM reading of code. It can search and show you specific searches like if I search the name of a function in BMO offline (no-LLM) it'll show me the file for it."
- "The above should be applicable to any programming language, nothing should be programming language specific."
- "I don't think we should be mapping tools.py and such. I only want to see the main files and functions related to a C3 object."
- Later the same day, on what to do with the readers already built (Q5.8): "Remove the non-LLM reading of code, just do the regex expressions and things can be generalized to all types of major coding languages."
- On search not telling a definition from a call: "What can we do about this?" Answer: item 3, the generic definition patterns.

## What exists today [Fact; anchors from the earlier survey, the re-anchor step confirms them]

**Code access**
- `src/core/codeFiles.ts` reads code from the code root on disk, a draft's planned code edits, or a git commit. Paths are confined to the code root and symlinks are resolved.
- Hidden paths are never read (DEC-031). The intake can close more (`mustNotOpen`, `scope.include`, `scope.exclude`, `src/import/intake.ts`), and DEC-064 says who may loosen it.
- `redactText` (`src/assistant/redact.ts`) masks secret-looking values.
- The code viewer is `FilePanel` in `ui/src/panels/MultiSelectAndFilePanels.tsx`. The file pickers are in `ui/src/panels/CodePickers.tsx`.

**Readers that this wave replaces**
- `src/core/codeMap.ts`: `SOURCE_EXT` and `JS_IMPORT` (`:33`, `:36`, one regex over raw text), the Python tokenizer `pythonStatements` (`:98-148`) and `pyModules` (`:153-192`), the resolvers `resolvePy` (`:194-220`) and `resolveJs` (`:222-232`), `scanImports` (`:235-249`, only `.py`, `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`), `findFunctions` (`:484-523`, JS/TS and Python regexes), `expandPaths` (60 files per object, `:35`, `:92`).
- `src/import/scan.ts` counts source files by extension (`LANG_BY_EXT`, `:67-103`, `CODE_LANGS`, `ANALYSABLE`, `:104-106`) and builds the folder graph from the imports (`:966-975`).
- Users of these: the code level diagram, the scan's component-to-component lines, `unmappedCode.ts`, the coding plan's check (`src/core/codingPlan.ts:229-234`), the import review (`src/import/review.ts:162-163`).

**Things this wave does not change**
- Manifest, compose, Kubernetes, Dockerfile and env-sample reading in `scan.ts`: these are files about the system, not source code.
- An element's code paths, `dp.code.paths` (`src/core/modelEdits.ts:69`).

**BMO**
- Excerpts for a prompt are ranked by fixed rules (`src/assistant/codeExcerpts.ts:272-345`).
- Wave 2 adds `src/assistant/commands.ts`, the fixed commands BMO answers with the LLM off (DEC-093), and `dp find`.

## Design [Proposal; rewritten after the owner answers]

### A. Find code by name

1. **`src/core/codeSearch.ts`** (new).
   - **Input:** a name, an optional scope (a set of code paths, for example one component's), and a limit.
   - **Match:** the name as a whole token (letters, digits, `_`, `$`). Then, labelled, the same words in another style (`parseOrder`, `parse_order`, `ParseOrder`, `parse-order`). Then, labelled, the name as part of a longer token.
   - **Looks like a definition** (the answer to "search can't tell a definition from a call"). A hit line that matches one of the generic definition patterns of item 8 for that name is marked "looks like a definition" and sorted first. This is a heuristic, shown as one, and a file in a language the patterns do not cover simply has no marks.
   - **Result:** grouped by file: path, hit count and up to three lines (line number and the line, cut to 200 characters). Order: definition hits, then name in the path, then whole-token before partial, then more hits, then shorter path, then path order. Same input, same output.
   - **What it reads:** the same gate as the code viewer: code root, draft or git commit; the hidden-path rule, the intake's closed paths, skip folders. A file over 1 MB, or with a NUL byte in its first 8 KB, is skipped. If a limit cuts the search, the result says "searched N of M files".
   - **Lines are masked** by `redactText`, as the viewer masks them [the re-anchor step checks].
2. **Where it appears**
   - BMO with the LLM off (DEC-093): a fixed command `where <name>`. Free text keeps running as `find`. Results are file chips that open the viewer at the line.
   - `dp find <name> --code` (Wave 2's `dp find` gains the flag).
   - `GET /api/code/search?q=&scope=`, with the code viewer's roles.
   - A search box in the Key code section (item 4); each result has a **Pin** button.
3. **No index.** Search reads files when asked. Wave 14's word index is for choosing BMO's context.

### B. Key code on a component

4. **`dp.code.key`** on an element: `[{path, name?, line?, note?}]`, at most 12 entries.
   - An entry without `name` is a **main file**. With `name` it is a **main function (or class, or anything named)** in that file; `line` is where it was when pinned.
   - `modelEdits.ts` cleans it (`cleanKeyCode`): a safe relative path, no hidden path, capped text, no duplicates. If the element has code paths, the file must lie inside one of them. Existence is a check, not a save error, because code changes under the model.
   - It is a `dp.*` property: drafts, undo, `dp diff` and merge handle it.
5. **Checks dp makes itself** (computed; `dp check` warnings, and Findings once Wave 6 is in): the file is gone; the name is not in the file any more. A moved line is information: "moved to line N".
6. **The panel.** A "Key code" section on the element panel: chips that open the viewer at the line, "Add" by searching a name (then Pin) or by picking a file, and each entry's check result. A function entry also shows "looks like a definition" when the pattern table finds one.
7. **Hints without an LLM** (heuristic, never saved without a click). For a component with code paths, up to 5 files, each with the signal that put it there: its name without the extension equals the component's name or its folder's; its name appears in at least 3 other files of the component (or the generic reader shows at least 3 of them importing it); it is the longest file.
8. **BMO proposals (LLM on).** A task `propose-key-code`, scope an element (or a container's components, one run each).
   - The pack is Wave 1's: model text for the scope, excerpts through the file gate, the manifest.
   - The answer is a list of `{path, name?, line?, why, cite}`.
   - **Checks:** Wave 1's verifier checks the cite. dp also checks that the path passes the gate and that `name` occurs in that file near `line`. A failure shows as "could not be verified" and cannot be pinned.
   - Rows are accepted one by one into `dp.code.key` (engineers into a draft), labelled "proposed by BMO" until then (A6).

### C. One generic reader (step 6, split point 5b)

9. **`src/core/codeReader.ts`** (new) replaces the per-language code in `codeMap.ts`. It has **one engine and one pattern table**, no function or file per language.
   - **The pattern table** (`src/core/codePatterns.ts`) is data: a list of `{id, kind: import | definition, regex, capture}`. It covers the major languages: Python, JavaScript and TypeScript, Java, Kotlin, Scala, C#, Go, Rust, C and C++, Ruby, PHP and Swift. Every pattern runs on every code file. A file counts as code by the extension list that `scan.ts` already holds (`CODE_LANGS`), which is the only language table.
   - **Import patterns** (examples): `import x from 'y'`, `require('y')`, `import('y')`, `from y import z`, `import y`, `import a.b.C;`, `import "pkg"` (including a grouped block), `using A.B;`, `use a::b;`, `#include "x.h"`, `require 'x'`, `import Foundation`. The capture is the specifier.
   - **Definition patterns** (examples): `def name`, `function name`, `name = (…) =>`, `func name`, `func (r T) name`, `fn name`, `fun name`, `sub name`, `class|interface|struct|enum|trait|object|record|type name`, and a method-looking line (modifiers, a type, `name(`).
   - **Comments** are cut by one generic rule: `/* … */` ranges, `//` to the end of a line, and `#` to the end of a line except lines that start `#include`, `#import` or `#define`. Strings are not handled. Both limits are stated.
   - **Resolving an import to a file** is also generic. A relative specifier is resolved against the importing file's folder, trying any extension and `index.*` or `__init__.*`. A dotted, `::` or `/` specifier becomes path segments and matches the files whose path ends with them, by the longest tail; a wildcard (`a.b.*`) matches the folder. Exactly one match gives an edge. Zero is an outside library and gives no edge. More than one is ambiguous: dp draws no line and says so.
   - **Function ranges** (the code level) run from a definition to the line before the next definition at the same or a shallower indent, or to the end of the file. Approximate.
   - **Replaced:** `pythonStatements`, `pyModules`, `resolvePy`, `resolveJs` and the regexes of `findFunctions`. `scanImports` and `findFunctions` keep their names and return shapes, and delegate to the engine. The code diagram, the scan's component lines, `unmappedCode.ts`, the coding plan and the import review need only their imports changed.
   - **What changes in results:** for Python and JS/TS, results may differ slightly from the old exact readers (the old Python tokenizer was exact; the regexes are not). The step records every difference on the demo and in the fixtures, and the demo is regenerated. Other languages gain imports and definitions they did not have.
   - **Class:** approximate throughout, with a coverage note on every use ("found by pattern; dynamic imports, injected dependencies and generated code are not seen").

### What is not built, and why

- **No module, tokenizer or code path per language.** Coverage is patterns in one table.
- **No Maven or Gradle reading, no `pom.xml` parsing.** They are manifests, not source code, and were not part of the owner's answer. Java source is read by the generic reader. (Say if you want the manifests read like `package.json` is.)
- **No file roles** (test, config, build, generated, shared helper), **no hiding of shared helpers**, **no config facts** from settings files.
- **No uncapped file walker, no content-hash cache.** Search has its own caps; Wave 14 hashes what it indexes.
- **No language mix per object** (DEC-104, P8: dropped).
- **No complexity, LCOM or abstractness** (Wave 7): they need function bodies and field use, which regexes get badly wrong.

## Determinism

| Output | Class |
|---|---|
| Search results (whole name, other style, part of a name) | computed: exact text matches by fixed rules |
| "Looks like a definition" marks | heuristic: a pattern match, shown as a hint |
| Imports, definitions and function ranges from the generic reader | approximate, with a coverage note |
| The checks on key code (file gone, name missing, moved) | computed |
| The key-code hints | heuristic |
| BMO's proposed key code | proposed; verified for path and name, cited |
| Pinned key code | the person's own choice |

## Owner answers

- **Q5.1, Q5.2 (2026-11-20):** search instead of reading; nothing language-specific. **Revised the same day by Q5.8:** regex patterns generalised to the major languages are wanted for reading code, so the readers become one generic engine and table (part C).
- **Q5.3, Q5.4:** no Maven or Gradle reading, no Java sample code and no Java fixtures. Tests write small plain-text fixtures from strings into a temporary folder, one string per language, and check in no sample source files.
- **Q5.5, Q5.6, Q5.7:** no mapping of `tools.py` and similar; main files and functions of a C3 object only; no config facts; no hash cache.
- **Q5.8:** remove the existing per-language reading, do regexes generalised to the major languages. Applied as part C.
- **Search and definitions:** "What can we do about this?" Applied as the definition cue in item 1.
- **Vision:** feature H (codebase importing) and feature L (BMO finds and explains code).

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in DEC-104.*

*The questions of this wave were asked about code facts, before the owner chose search and one generic reader (Q5.1, Q5.2, Q5.5, Q5.8). Wave 5 was then rewritten; the "Applied" lines say what changed.*

### ★Q5.1 How should dp read code?

**Analysis** [Fact]
- dp reads code with small hand-written tokenizers and regular expressions, and has no parser dependency (`src/core/codeMap.ts:98-232`, `package.json:39-43`).
- JS and TS imports come from one regular expression over the raw text (`codeMap.ts:36`, `:245`). So commented-out imports count, and dynamic imports are missed.

**Options**
1. **A tokenizer per language.** No dependency and the same result every time, but unusual syntax is missed.
2. **tree-sitter grammars compiled to WebAssembly.** Real syntax trees for many languages, called from TypeScript. It adds a dependency and a few MB to the package [Training].
3. **Reports from each language's own tools.**

**Recommended.** Option 1, including a JS/TS tokenizer that drops comments and strings, as the Python one does. Every approximate result is labelled. Revisit option 2 if Wave 7's complexity and LCOM numbers need it.

**Owner's thinking:** Remove non-LLM reading of code. It can search and show you specific searches like if I search the name of a function in BMO offline (no-LLM) it'll show me the file for it. Much more simple for no-LLM code reading

**Applied [2026-11-20].** **Revised later the same day (see Q5.8).** The first reading was 'dp reads no language at all'; your follow-up says regexes generalised to the major languages are wanted. Final: remove the per-language readers (tokenizers and resolvers) and replace them with **one generic regex reader**, a table of patterns for the major languages run the same way on every code file, with every result labelled approximate. Plain-text search comes first (offline BMO `where <name>`, `dp find <name> --code`), shows files and lines, and marks hits that look like a definition. Recorded as DEC-096. [Wave 5](wave-05-code-search.md) is rewritten as 'Code search, key code and one generic code reader'.

### ★Q5.2 Which languages after Java?

**Recommended**
- Java now, with Kotlin imports in the same pass; they use the same syntax.
- Go next: `go.mod` is already read (`src/import/scan.ts:431-452`).
- C# later.

This depends on who dp is for (★A1).

**Owner's thinking:** The above should be applicable to any programming language, nothing should be programming language specific.

**Applied [2026-11-20].** 'Any programming language' is met by one pattern table for the major languages (Python, JavaScript and TypeScript, Java, Kotlin, Scala, C#, Go, Rust, C and C++, Ruby, PHP, Swift) and no module, file or branch per language. A language that is not in the table still gets search. Adding a language means adding patterns and a test string. The earlier 'Java now, Go next, C# later' becomes 'all of those at once, approximately'.

### Q5.3 Java builds

**Proposed**
- **Maven:** `pom.xml` modules, packaging and dependencies.
- **Gradle:** `settings.gradle` includes, and dependencies in their common forms. Gradle files are code, so only the common forms can be read.
- **Container candidates:** a module with an entry point (a `main` method or a Spring Boot application class), or one packaged as a war.
- **Two approximations, labelled:**
  - classes in the same package need no import, so those lines come from same-package names;
  - a wildcard import gives a line to the whole package.

**Recommended.** Yes.

**Owner's thinking:** Do we still need Java builds/sample code with the above in mind? (asked once for Q5.3 and Q5.4)

**Applied [2026-11-20].** No Maven or Gradle reading for now: they are build manifests, not source code, and your later answer was about reading code with regexes. Java source is read by the generic reader. Say so if you want `pom.xml` and Gradle files read as well; that would be a small manifest reader like the one for `package.json`.

### ★Q5.4 Java sample code

**Analysis** [Fact]
- CLAUDE.md says: "Everything is TypeScript. Do not add Python or other-language code."
- The demo already has Python sample code (`demo/sample_code/api`, `pipeline`). It is data that gets scanned, not dp code.
- CI has no Java runtime, and the demo system's services are TypeScript (DEC-077).

**Options**
1. Java only as test fixtures.
2. Also a small Java service in `demo/sample_code`, scanned but never run.

**Recommended.** Option 1. Choose option 2 if you want the demo to show Java.

**Owner's thinking:** (Answered with Q5.3: do we still need Java sample code?)

**Applied [2026-11-20].** No Java sample code and no Java fixtures, and CLAUDE.md's 'everything is TypeScript' needs no exception. Tests write small plain-text fixtures from strings into a temporary folder, in no particular language.

### ★Q5.5 How `tools.py` and other shared helpers are treated

**Proposed** (see 0.2)
- **When a file is a shared helper:** its folder has a known name (util, utils, common, shared, helpers, tools, lib), or at least N components import it.
- **How shared helpers show:**
  - with a badge;
  - left out of the lines between components by default; a toggle shows them;
  - no longer "unmapped" once they have the role.
- **When shared code becomes a box:**
  - a "shared" component is proposed only above the threshold;
  - code shared by several containers is proposed as its own container (DEC-023).
- **Your overrides** go in the intake, for example `"roles": {"src/tools.py": "shared"}`.

**Recommended.** Yes. Your thinking could set N (we suggest 3) and the folder names.

**Owner's thinking:** Since I no longer care about how the code specific things work, i dont think we should be mapping tools.py and such. I only want to see the main files and functions related to a C3 object with that in mind (asked once for Q5.5, Q5.6 and Q5.7)

**Applied [2026-11-20].** The shared-helper rule (folder names, N = 3, intake overrides), the file roles and the badges are dropped. A component instead shows **key code**: its main files and functions, stored as `dp.code.key`. A person pins them (from a search result or the file picker); dp checks each file still exists and holds the name; dp offers hints without an LLM (a file named like the component, mentioned by several of its files, the longest); BMO can propose entries, and dp verifies the path and the name before they can be pinned. `tools.py` is a code file like any other: no box, no role, and no special line. If it matters to a component, someone pins it.

### Q5.6 Config files as evidence

**Recommended**
- Keep names and hosts only, passed through the same redaction as BMO (`src/assistant/redact.ts`). Never keep values.
- `.env` and `.github/` stay closed (DEC-031).
- This covers Java's `application.yml` and `.properties` files, and Python settings modules.

**Owner's thinking:** (Answered with Q5.5.)

**Applied [2026-11-20].** Config facts are dropped with the language readers. The scan's existing reading of env samples and compose stays as it is; `.env` and `.github/` stay closed (DEC-031).

### Q5.7 Content hashes

**Analysis** [Fact]
- `evidence.json` stores file sizes, not hashes (`scan.ts:932`). An edit that keeps a file's size is invisible.
- `evidence.json` is committed.

**Options**
1. Hashes in `evidence.json`. Every edit changes it, which makes noisy diffs.
2. Hashes in a git-ignored `.dp/cache/`. Fine on one machine, but CI can't say what changed since a given point.

**Recommended.** Option 2. Wave 13 stores the contract fingerprints it needs in the model instead.

**Owner's thinking:** (Answered with Q5.5.)

**Applied [2026-11-20].** No content-hash cache in Wave 5: search needs none. Wave 14 hashes what it indexes, and Wave 13 computes a fingerprint from a small JSON file when asked.

### ★Q5.8 What happens to the code reading that is already built?

*New on 2026-11-20. It comes from "remove non-LLM reading of code" (Q5.1).*

**Analysis** [Fact]
- Built today and language-specific: Python and JS/TS imports and function lookup (`src/core/codeMap.ts`), the component-to-component import lines in the scan, the code level diagram, the unmapped-code warning, and the import check in the coding plan.
- Not language-specific and not affected: code paths on elements (`dp.code.paths`), the file viewer, the scan of manifests, compose and Dockerfiles.
- We read Q5.1 as "do not build more of this, and do not rely on it". It could also be read as "take it out".

**Options**
1. **Freeze.** Keep what exists, label it "Python and JS/TS only" in the UI and docs, add nothing, fix bugs only. New work (search, key code, model metrics, the interview) does not depend on it; the interview uses the import lines where they exist.
2. **Remove the import reading and function lookup.** Keep code paths, the viewer and search. The code diagram would show files without import lines; the scan's component lines and the coding plan's import check go.
3. **Remove all of it,** including the code level diagram.

**Recommended.** Option 1 now, and look again before 1.0.0. Removing built features is a bigger step than not building more (the scope review makes the same point), and the import lines are the only evidence dp has for lines between components. **Trade-off:** two ways of reading code live side by side, one of them language-specific, and the docs must say so.

**Owner's thinking:** Remove the non-LLM reading of code, just do the regex expressions and things can be generalized to all types of major coding languages

**Applied [2026-11-20].** Option 2 in spirit, with a replacement. The per-language tokenizers, resolvers and function lookup (Python, JS/TS) are removed. **One generic regex reader** (a pattern table plus one engine, no code per language) takes over `scanImports` and `findFunctions`, so the code diagram, the scan's component lines, the unmapped-code warning and the coding plan's import check keep working and now cover the major languages, not only Python and JS/TS. Everything it returns is approximate and says so. The demo's results may change slightly; step 1 of Wave 5 records the old results as a baseline, step 6 lists every difference, and the demo is regenerated. **Trade-off:** regexes without a tokenizer can read a commented-out or string-embedded import as real (a generic comment cut helps but is not exact), and the resolver matches a specifier to files by path, so two files with the same path tail are ambiguous (dp draws no line then, and says so). The old Python tokenizer was exact for Python; that exactness is traded for breadth. [Wave 5](wave-05-code-search.md) part C.

## Stop and ask if

- A language needs its own code (a tokenizer, a parser, a branch in the engine) to reach acceptable results. The answer then is a new pattern, or the language stays search-only; a parser is a new plan.
- Key code would need to be stored outside a `dp.*` property.
- Search would need a stored index to be fast enough (Wave 14).
- The viewer's redaction does not match `redactText`.
- The generic reader's results on the demo differ from the old readers in a way that changes the code diagram's meaning, not only its details.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor; record what the viewer masks; save the old readers' results on the demo and the fixtures for comparison | Explore · Haiku, then the main session | The files above | Anchors confirmed; baseline results saved |
| 2 | Search core on the file gate: confinement, closed paths, caps, redaction, ordering | general-purpose · Opus | `src/core/codeSearch.ts` (new), `codeFiles.ts` (use only) | A closed or hidden file is never returned or counted; same input, same output |
| 3 | Key code: property, cleaner, units, diff, merge, checks, hints | general-purpose · Sonnet | `modelEdits.ts`, `modelUnits.ts`, `diff.ts`, `merge.ts`, `cliReports.ts`, `src/shared/types.ts`, `src/core/keyCode.ts` (new) | Round trip byte-stable; old files unchanged |
| 4 | Surfaces: `where`, `dp find --code`, route, Key code section, search box, Pin | general-purpose · Sonnet | `src/assistant/commands.ts`, `src/cli.ts`, `src/server/routes/code.ts`, `ui/src/panels/ElementPanel.tsx`, `CodePickers.tsx`, `KeyCodeSection.tsx` (new) | Works by keyboard; results open the viewer at the line |
| 5 | BMO `propose-key-code` | general-purpose · Sonnet | `src/assistant/prompts.ts`, `tasks.ts`, `runTask.ts`, `citations.ts` | A forged path or name is refused |
| 6 | **5b.** Generic reader: pattern table, engine, resolver, ranges; switch `codeMap`, scan, `unmappedCode`, coding plan and review to it; remove the old readers; the definition cue in search | general-purpose · Opus | `src/core/codeReader.ts`, `codePatterns.ts` (new), `codeMap.ts`, `src/import/scan.ts`, `review.ts`, `unmappedCode.ts`, `codingPlan.ts`, `codeSearch.ts` | Every difference from the baseline listed; the demo regenerated; no per-language code left |
| 7 | Tests (not the authors of steps 2 to 6) | general-purpose · Sonnet | `tests/unit/code-search*.test.ts`, `key-code*.test.ts`, `code-reader*.test.ts`, `tests/browser/key-code.spec.ts` | Tests as listed below |
| 8 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md (the `codeMap.ts` description), `docs/determinism.md` | All docs updated |
| 9 | Review | main session | — | `/code-review` (high) and `/security-review` (the file gate) findings fixed |

Only one agent builds the UI or runs `cd ui && npm run build` at a time.

## Required in this wave

- **Routes.** `GET /api/code/search` needs no `ROUTE_RULES` entry (GET) but must use the code viewer's role check. Key code is edited through the existing element update route. `propose-key-code` goes through BMO's routes: check `ROUTE_RULES` and `allowedRoles` cover the task id.
- **Hub** and **`--read-only`:** search works in both; key code edits are refused read-only; in a hub, per-project roles apply.
- **Model data.** `dp.code.key` needs a unit, a diff label ("Key code"), merge, the change list and `dp diff`.
- **Evidence.** If the scan's evidence changes with the new reader, `schemaVersion` goes up and the output stays byte-stable.
- **Static export.** Includes key code. Does not include search.
- **Security model.** In CONTRIBUTING: search reads only what the viewer can read, shows masked lines, and makes no outbound call.
- **Windows.** Paths in results, in `dp.code.key` and in resolved imports use forward slashes.
- **Demo.** Add key code to a few demo components, run `npm run make-demo`, commit `demo/`.

## Tests

- **Search**
  - Fixtures are written by the test into a temporary folder as strings, in several styles.
  - Whole name, other style (`parseOrder` finds `parse_order`) and part of a name, each labelled. Definition hits are marked and first.
  - Order is stable. A binary file and a file over 1 MB are skipped. A cut search says "N of M".
  - A hidden path, a `mustNotOpen` path and a path outside the code root (including through a symlink) never appear.
  - A secret-looking value in a hit line is masked. It works against a draft's planned edits and a git ref.
- **Key code:** cleaning (unsafe paths, duplicates, the cap, a path outside the element's code paths); file gone, name missing and moved; old files load and save unchanged; drafts, apply and undo carry it.
- **Hints:** each signal fires on a fixture and not on a control.
- **BMO proposals:** one valid entry, one forged cite, one name not in the file; only the valid one can be pinned.
- **Commands:** `where` with the LLM off builds no prompt and calls no backend.
- **Generic reader** (one fixture string per language: Python, JS, TS, Java, Kotlin, Scala, C#, Go, Rust, C, C++, Ruby, PHP, Swift)
  - Each import form in the pattern table is found with the right specifier; each definition form is found with the right name and line.
  - A commented-out import (`//`, `/* */`, `#`) is ignored; a `#include` is not treated as a comment.
  - Resolution: a relative import, a dotted import, a grouped Go block, a wildcard, an outside library (no edge), and an ambiguous tail (no edge, and the result says so).
  - Function ranges end at the next definition.
  - The demo's results are compared with the baseline from step 1, and every difference is listed in reviews.md.
  - No file or branch is named for a single language (a test greps the source tree).
- **Users of the reader:** the code diagram and the unmapped-code warning work on a fixture in a language that had no reader before.
- **Browser:** search for a name, pin a result, open it at the line, remove the name from the file and see the warning.

## Docs

- **DEC-096** records the decision (search, key code, one generic reader). Add a new DEC for key code (`dp.code.key`), its checks, the hints and the BMO proposal task.
- **README:** find code, key code, the languages the pattern table covers. **CLAUDE.md:** `codeSearch.ts`, `keyCode.ts`, `codeReader.ts`, `codePatterns.ts`, and the revised description of `codeMap.ts`.
- **CHANGELOG** and **reviews.md:** this wave's entries, including the list of differences from the old readers. **`docs/determinism.md`:** rows.
- **planned_features.md:** B4's "Scan languages beyond Python and JS/TS" is done for the languages in the table.

## Decided (DEC-103, 2026-11-20; assistant's reasoning, the owner may overrule)

- **N2.** Entry points and public interfaces (`main`, route registrations, CLI commands, queue consumers, schedulers, exports) are one small generic pattern per kind in the pattern table. They are hints for key code, never components.
- **N4.** The manifest table adds Cargo, Gemfile, Composer and .NET project files. Maven and Gradle stay out (Q5.3).
- **N5.** One list of source extensions replaces `SOURCE_EXT` (`codeMap.ts`) and `LANG_BY_EXT` (`scan.ts`), with a flag for "counts as source" versus "known file type".
- **N7.** The rule for what matters at each level is stated in [import-design.md](../import-design.md); this wave implements it and links back, and does not restate it.

## Out of scope

- A parser, tokenizer or module for any single language.
- Maven, Gradle and other build manifests of Java and similar (a manifest reader, not code reading).
- File roles, shared-helper hiding, config facts, language mix.
- Complexity, LCOM and abstractness (Wave 7).
- A stored index (Wave 14).

## Start prompt

```
Run Wave 05 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-05-code-search.md, and follow them: branch from main as the header says, run
the steps with the agents and models in the table, brief each subagent with files and line
ranges and the words "never run git stash, never push", run the checks, update the docs,
and commit by path. If the wave runs long, stop at the split point (after step 5), commit,
and tell me. Stop and ask me if a "Stop and ask if" condition is met or an answer this wave
needs is missing.
```
