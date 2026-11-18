# Wave 05: Code facts

| | |
|---|---|
| **Status** | Waiting for owner answers: ★Q5.1, ★Q5.2, Q5.3, ★Q5.4, ★Q5.5, Q5.6, Q5.7 ([questions.md](questions.md)) |
| **Branch** | `feat/w05-code-facts`, from `main` after the previous wave is merged |
| **Size** | L. Split point: if the brief runs long, stop after steps 2–4 (5a) and do Java in a second run (5b) |
| **Depends on** | Nothing in this plan |
| **Owner items** | 14, 8 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

dp reads more languages, starting with Java and Kotlin imports. It knows what each file is for: source, test, config, build, infrastructure, generated, or shared helper. It takes facts from config files. Everything stays deterministic, and approximate results are labelled.

Waves 6 (drift) and 7 (metrics) build on this.

## Owner requests covered

> - Add more languages to be supported such as Java
> - How does config files/common functions such as tools.py show up in this?

The explanation of how config files and `tools.py` show up today is in [questions.md](questions.md), section 0.2.

## What exists today [Fact]

**Code map** (`src/core/codeMap.ts`)
- `SOURCE_EXT` (`:33`) and `JS_IMPORT` (`:36`), a single regex run over raw text: commented-out imports count and dynamic `import()` is missed.
- Python is read by the `pythonStatements` tokenizer (`:98-148`) and `pyModules` (`:153-192`).
- Resolvers: `resolvePy` (`:194-220`) and `resolveJs` (`:222-232`), which follows relative imports only.
- `scanImports` (`:235-249`) reads only `.py`, `.js`, `.jsx`, `.ts`, `.tsx` and `.mjs` (`:241`).
- `countLines` (`:251-256`).
- `findFunctions` (`:484-523`) uses regexes for JS/TS and Python only.
- `expandPaths` stops at 60 files per object (`MAX_FILES`, `:35`, `:92`).

**Scan** (`src/import/scan.ts`)
- Language tables:
  - `LANG_BY_EXT` (`:67-103`); `.xml`, `.gradle` and `.properties` count as "other";
  - `CODE_LANGS` (`:104`);
  - `ANALYSABLE` = python, javascript and typescript (`:106`).
- Manifest readers cover package.json, requirements files, pyproject.toml, go.mod, compose, Kubernetes, serverless, Dockerfile, env samples and CODEOWNERS (`:346-641`).
- The dispatch loop is at `:798-917`. Hosts are collected at `:919-925`, and component folders at `:930-975`.
- The evidence file's shape is at `:39-58` and `:977-1001`. Source files store their size, not a hash (`:932`).
- Gap: `.cjs`, `.mts` and `.cts` count as analysable (`:72-76`), but their imports are never read (`codeMap.ts:33`, `:241`).
- Order issue: `build.gradle.kts` maps to Kotlin (`:79`), so it is caught as a source file (`:809`) before any manifest reader sees it.

**Known services and review**
- `src/import/knownServices.ts` has kinds `npm`, `pypi`, `go`, `image` and `host` (`:22`); the scoring is at `:122-129`.
- `MATCH_KEYS` is at `src/import/intake.ts:75`.
- Container-candidate priority: `C2_PRIORITY` (`src/import/analysis.ts:184`). Manifest fact kinds: `MANIFEST_KINDS` (`src/import/review.ts:74`).
- BMO's entry-point regex doesn't match `*Application.java` (`src/assistant/codeExcerpts.ts:67`).

**Rules this wave must respect**
- Intake defaults (`src/import/intake.ts:21-30`): `componentDepth` 2 and `componentMinFiles` 2. DEC-064 says who may loosen limits.
- Hidden paths are never read (DEC-031), so `.env` and `.github/` stay closed.
- DEC-023: a shared library is its own container or system, never an element with two parents.
- CLAUDE.md: "Everything is TypeScript. Do not add Python or other-language code." The Python files in `demo/sample_code` are scanned data, not dp code.

## Design [Proposal; rewritten after the owner answers]

1. **Language modules** (`src/core/languages/`: `index.ts`, `python.ts`, `javascript.ts`, `java.ts`, `kotlin.ts`). One interface for all:
   - `extensions`;
   - `imports(text)`, giving specifiers with line numbers;
   - `resolve(spec, file, ctx)`;
   - `functions(text)`, giving line ranges;
   - `types(text)`, giving classes, interfaces and abstract types (Wave 7 uses this);
   - `tokens(text)` (Wave 7).

   `codeMap.scanImports` and `findFunctions` delegate to these modules. The refactor must leave the demo's `evidence.json` unchanged.
2. **JavaScript and TypeScript tokenizer.**
   - It drops comments, strings and regex literals.
   - `import("x")` with a literal string counts as an import.
   - Fix the `.cjs`, `.mts` and `.cts` gap.
   - Optionally read `compilerOptions.paths` from tsconfig.json; the result stays deterministic.
3. **File roles.** Fixed rules give every file one role:

   | Role | How it is recognised |
   |---|---|
   | test | path and name patterns |
   | config | YAML, JSON, TOML, INI, `.properties` and XML config names; settings modules |
   | build | manifests |
   | infrastructure | Dockerfile, compose, Kubernetes, Terraform |
   | docs | — |
   | generated or vendor | skip folders, "generated" headers |
   | shared helper | folder names util, utils, common, shared, helpers, tools, lib; or imported by at least N components |
   | source | everything else |

   - The intake can override roles: `roles: {glob: role}` (★Q5.5). Roles don't change what dp reads, so anyone who may edit the intake may set them.
   - **Shared helpers:**
     - get a badge;
     - are left out of component-to-component lines by default (kept separately as `sharedImports`), with a toggle to show them;
     - stop counting as "unmapped".

     dp proposes a "shared" component only above the threshold. Code shared across containers is proposed as its own container (DEC-023).
4. **Config facts** (Q5.6).
   - Hosts and variable names come from config files: Java `application.yml` and `.properties`, Python settings modules, JSON and TOML config.
   - Each fact gets a file and line, and passes through `redactText`. Values are never kept.
   - Relationship evidence then reads like "host orders-db, configured in settings.py:12".
5. **Java and Kotlin** (★Q5.2, Q5.3; split point 5b).
   - **Java imports:** single-type, wildcard and static.
   - **Resolving them:**
     - the `package` line gives the source root (`src/main/java`, `src/test/java`, or worked out from the package path);
     - a same-package reference by simple name counts as an edge, labelled approximate;
     - a wildcard gives a package-level edge.
   - **Maven:** `pom.xml` gives modules, `artifactId`, packaging, `groupId:artifactId` dependencies and the Spring Boot plugin. XML is read by a small reader, with no new dependency.
   - **Gradle:** `settings.gradle(.kts)` includes, and dependencies in their common forms. It is read before the Kotlin source branch.
   - **Containers and components:**
     - an entry point (`public static void main`, `@SpringBootApplication`) or war packaging makes a container candidate per module;
     - `componentDepth` counts from the source root;
     - the BMO entry-point regex also matches `*Application.java`.
   - **Known services:** a `maven` kind in knownServices, plus entries for common SDKs. Updates to `MATCH_KEYS`, `C2_PRIORITY` and `MANIFEST_KINDS` follow.
   - **Kotlin:** imports only, which use the same syntax.
   - **Samples:** Java fixtures in tests only, unless ★Q5.4 asks for demo code.
6. **Uncapped file walker.** `walkFiles(code, paths, limits)` uses the intake limits instead of the 60-file cap. Language mix and Wave 7 use it.
7. **Language mix per object.** Files and lines by language for each container and component, shown in the panel. The future-task "where to put people" builds on it.
8. **Content-hash cache** (Q5.7). `.dp/cache/files.json` (path → size, mtime, sha1), git-ignored and mode 0600.

## Determinism

| Output | Class |
|---|---|
| Imports, roles by rule, config facts, language mix | computed |
| Java same-package edges, the shared-helper fan-in rule | approximate |
| Folder-name roles | heuristic, and the owner can override them |

## Owner answers

*Filled in when the answers are applied.*

## Stop and ask if

- ★Q5.1 chooses tree-sitter. A new dependency needs its own plan.
- ★Q5.4 asks for Java demo code.
- The shared-helper threshold or folder list (★Q5.5) is still open.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed |
| 2 | Language modules (no behaviour change) and the JS tokenizer | general-purpose · Sonnet | `src/core/languages/*` (new), `codeMap.ts`, `scan.ts` | The demo evidence is unchanged, apart from the JS fixes, which are noted |
| 3 | Config facts and redaction | general-purpose · Opus | `scan.ts`, `src/assistant/redact.ts` (reuse), `review.ts` (`factRelates`) | No value ever reaches `evidence.json`; secret-looking fixtures are masked |
| 4 | File roles, intake overrides, badges, walker, cache, language mix | general-purpose · Sonnet | `scan.ts`, `intake.ts`, `unmappedCode.ts`, `codeMap.ts`, `ui/src/panels/MultiSelectAndFilePanels.tsx`, the Import page intake form (Wave 15 later asks the role overrides as interview questions; the intake file stays the store) | Roles and toggles work; overrides validated |
| 5 | Java and Kotlin (5b) | general-purpose · Sonnet | `languages/java.ts`, `kotlin.ts`, `scan.ts` readers, `knownServices.ts`, `analysis.ts`, `review.ts`, `codeExcerpts.ts` | The fixtures pass |
| 6 | Fixture tests (not the authors of steps 2–5) | general-purpose · Sonnet | `tests/unit/lang-*.test.ts`, `tests/fixtures/java/` | Tests as listed below |
| 7 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README (languages, roles), CLAUDE.md | All docs updated |
| 8 | Review | main session | — | `/code-review` (high) findings fixed |

## Required in this wave

- **Routes.** Probably none new; the scan routes exist. Intake changes go through the existing intake route and its DEC-064 rules.
- **Evidence.** `schemaVersion` goes up, and the output stays byte-stable.
- **Demo.** If the demo's evidence changes, run `npm run make-demo` and commit.
- **Hub** and **`--read-only`:** unchanged behaviour.
- **Windows.** Path separators in Java package resolution.

## Tests

- **Refactor safety:** the demo evidence is identical before and after the refactor (except the documented JS fixes).
- **JS tokenizer**
  - Commented-out imports are ignored.
  - A dynamic import with a literal string counts.
  - Regex literals don't confuse it.
  - `.cjs`, `.mts` and `.cts` are read.
- **Java**
  - Single, wildcard and static imports.
  - A same-package reference.
  - A multi-module Maven build.
  - A Gradle `settings.gradle` include.
  - A Spring Boot entry point.
  - The source-root offset for components.
- **Known services:** maven entries match.
- **Roles:** the rules, the overrides, and the fan-in threshold.
- **Config facts:** hosts and names are extracted; values never appear in the evidence.
- **Walker and cache:** more than 60 files are walked; the cache is invalidated on change.

## Docs

- **New DEC:** language modules; Java and Kotlin support with their limits; file roles and the shared-helper rule (refines DEC-023's explanation); config facts as names and hosts only.
- **README:** supported languages and file roles.
- **CLAUDE.md:** the `languages/` folder.
- **CHANGELOG** and **reviews.md:** this wave's entries.
- **future_tasks:** row 1.3 done for Java and Kotlin.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- Go and C# (★Q5.2).
- Metrics (Wave 7).
- Drift (Wave 6).
- A new parser dependency.
- Reading `.env`.

## Start prompt

```
Run Wave 05 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-05-code-facts.md, and follow them: branch from main as the header says, run
the steps with the agents and models in the table, brief each subagent with files and line
ranges and the words "never run git stash, never push", run the checks, update the docs,
and commit by path. If the wave runs long, stop at the split point (after step 4), commit,
and tell me. Stop and ask me if a "Stop and ask if" condition is met or an answer this wave
needs is missing.
```
