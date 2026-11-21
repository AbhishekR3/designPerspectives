# Code import: understanding a codebase for C4

Rewritten 2026-11-20. It replaces the design record that was moved here from the old `future_tasks.md`. The code import and BMO were built in 0.5.0 ([COD-02](decisions.md#cod---02---stage-b-import-bmo-a-purpose-built-import-file-one-c4-level-at-a-time-no-inferred-labels), [COD-03](decisions.md#cod---03---what-an-import-file-cannot-vouch-for-itself-and-what-the-import-and-bmo-code-will-not-read-or-keep), [COD-08](decisions.md#cod---08---bmo-where-it-runs-who-may-run-it-and-how-an-import-draft-is-applied)). Two later decisions and two planned waves change how it reads code: [COD-06](decisions.md#cod---06---dp-finds-code-by-search-pins-key-code-and-reads-imports-and-definitions-with-one-generic-regex-reader) (no per-language code), [Wave 5](waves/wave-05-code-search.md) (search, key code, one generic reader) and [Wave 15](waves/wave-15-guided-import-interview.md) (the guided interview). Facts carry a source (`file:line`); [Proposal] marks interpretation. Choices N1 to N15 are in [PRO-19](decisions.md#pro---19---code-import-and-bmo-choices-n1-to-n15).

## 1. Purpose

Give an architect a **high-level picture of an existing codebase**, in C4 terms, with the least work:

- **C1**: which systems and people the code talks to or serves.
- **C2**: which deployable things (containers) the codebase is made of.
- **C3**: which components sit inside each container.
- **C4 (key code)**: for each component, the few files and functions a reader should open first.

It is **not an IDE and not a code analyser** ([PRO-05](decisions.md#pro---05---version-100-is-software-architecture-only-with-twelve-features), [product-vision.md](product-vision.md)). It does not measure complexity, find bugs or map every function. A file that is not important to the picture is left "mapped by path" or "unmapped", and that is fine.

Everything the import produces ends in a **draft** that a person accepts, edits or rejects object by object. dp never writes imported objects straight into the model.

## 2. How an import runs

| Step | What happens | Needs an LLM? | Status |
|---|---|---|---|
| Scan | `dp scan` reads files and git, writes facts to `architecture/import/evidence.json`. No network, no model. | No | Built (`src/import/scan.ts`) |
| Intake | Answers the code cannot give (people, depth, limits) in `intake.json` | No | Built (`src/import/intake.ts`); Wave 15 replaces the form with an interview |
| Analysis | Counts candidates per level, done and left, review effort (`dp scan --plan`) | No | Built (`src/import/analysis.ts`) |
| Interview | "Question x of y": dp shows what it found and proposes, the person approves or corrects; at least 6 questions per level; an "I don't know" answer on each; room for notes and file references | No | **Planned** (Wave 15) |
| Proposals | BMO can name components, descriptions, line labels and key code. Every proposal is checked by dp and labelled until accepted | Yes (or the handoff route: the person's own agent) | Built for names and labels (COD-02, COD-08); key-code proposals planned (Wave 5) |
| Import file | The proposals travel in one strict, versioned JSON file, checked by `dp import --check` | No | Built (`src/import/schema.ts`, `checks.ts`) |
| Draft and review | The file becomes a draft; each item shows its review level (verified, partly verified, unverified); unverified items need an explicit accept | No | Built (`importer.ts`, `review.ts`) |

Nothing blocks the import when BMO is off. The LLM is a choice, and every result carries a class ([waves/README.md](waves/README.md#determinism-classes)): the scan is *computed*, hints are *heuristic*, BMO's text is *proposed*.

## 3. What matters to C4 at each level [Proposal; some rules are built, some planned]

This is the rule a candidate must pass to show up. "Built" is what `scan.ts` does today; "Planned" is Wave 5 or 15. The rule is the same for every language: **no code per language** (COD-06).

| Level | A candidate matters when | Built today | Planned or missing |
|---|---|---|---|
| **C1** system | A dependency, host, image or route shows it, or the person names it. Evidence kinds: SDK package in a manifest that matches the shipped list of well-known services (`knownServices.ts`), a host in an env sample or compose `environment:`, an env-var name, a webhook-looking route | Yes, for `package.json`, `pyproject.toml`, requirements files and `go.mod` (`scan.ts:819-853`) | Other ecosystems' manifests are not read (open: N4). People come from the interview only: the scan has no people facts |
| **C2** container | Something deployable names it: Dockerfile, compose service, Kubernetes workload, serverless function, a package with an entry point (`bin`, `main`, `scripts.start`, a `pyproject` script). Datastores and queues from known images. Each also gives the container a **source root** | Yes (`scan.ts:831-894`) | Provider resources in infrastructure-as-code are not read (earlier text claimed they were) |
| **C3** component | A folder under a container's source root, 1 to 2 folders deep, holding at least 2 source files directly (both numbers are intake settings, `intake.ts:26`); or a component the person pinned | Yes (`scan.ts:945-952`) | Tests, docs, examples, migrations, vendored and generated folders are **not** excluded today (open: N1). Layered folders (controllers, services, repositories) split one component and are missed (N3) |
| **C3 lines** | Import edges between component folders | Only for Python, JavaScript and TypeScript (`scanImports`, `codeMap.ts`) | One generic regex reader for the major languages replaces those (Wave 5, COD-06). Dynamic imports and injected dependencies are never seen |
| **C4** key code | A person pinned it as `dp.code.key` (`[{path, name?, line?, note?}]`, at most 12 per component); or dp verified a hint or a BMO proposal against the file | No | Wave 5. Hints are heuristic: a file named like the component, a name mentioned by at least 3 other files, the longest file. A hint or proposal never saves itself |
| **C4** every other file | It maps to a component by path prefix, or it is unmapped. No decision is needed, so it does not count as review effort (`analysis.ts:337-360`) | Yes | — |

### What is deliberately not a signal

Complexity, LCOM, abstractness and distance (they need bodies and fields, which regular expressions read badly: COD-06, Wave 7); file roles; hiding shared helpers; language mix per object; Maven and Gradle reading; config facts from settings files. A lone `tools.py` is not mapped to anything: a component shows its **main files and functions**, not every helper (owner, 2026-11-20).

### Where the scan is blind today [Fact, with source]

- **Entry points and public interfaces.** No fact for `main()`, route registrations, CLI commands, queue consumers or schedulers. Only manifest entry facts and webhook-looking strings exist. BMO's excerpt ranking prefers files named `main`, `index`, `app`, `server` (`codeExcerpts.ts:67`) but that only picks what BMO reads, not what becomes a candidate.
- **Ignore rules.** The scan skips the folders in `SKIP_DIRS` (`codeMap.ts:34`) and `EXTRA_SKIP_DIRS` (`scan.ts:146`), binary extensions, hidden paths ([SEC-02](decisions.md#sec---02---hidden-paths-are-off-limits)), the intake's `scope.exclude` and `mustNotOpen`, and the import ignore list. It does **not** read `.gitignore` and does not detect generated code. Planned (Wave 15, PRO-19 N1): test, doc, example, script, migration, fixture, generated and third-party folders are kept from becoming C3 candidates by a separate list, while their files still count as evidence.
- **Two source-extension lists disagree.** `SOURCE_EXT` in `codeMap.ts:33` (16 extensions) and `LANG_BY_EXT` in `scan.ts` (wider; includes C, C++, Ruby, PHP, Swift, Scala).
- **Files over the size limit** are counted but not parsed (`maxFileBytes` 512 KB, `maxFiles` 20,000, `maxDepth` 25: `intake.ts:21-30`).

## 4. The readiness analysis (built; becomes the "Advanced" view with Wave 15)

`dp scan --plan` and the Import page read only files and git, never BMO, so the same commit and settings always give the same numbers. Per level it reports:

- **Done and left.** Done = candidates accepted into the model or explicitly rejected or ignored. Left = candidates not decided, unanswered intake questions, objects with no description, lines with no label (or "Uses"). Percent = done ÷ (done + left). "100%" means every candidate the scan can find is decided, not that the model is complete.
- **Your effort.** Review items are what is left plus the low-confidence items; minutes are items × a seconds-per-item setting (default 20 s, an assumed figure, not measured). Files that map by path are not effort.
- **BMO's reading.** Tokens ≈ bytes ÷ 4 (a rough rule [Training]); passes = tokens ÷ the backend's pass budget. Time is not estimated. Money is shown only when the person has entered a price per million tokens (`pricePerMTok` in the BMO settings, `estimateCost` in `settings.ts`, already used by the BMO preview). The readiness report does not show it yet; PRO-19 (N6) plans that, and with no price entered it shows nothing.
- **What it cannot see.** Files in languages whose imports dp does not read are "not analysable", so the C3 percent is a ceiling. Today that means everything except Python, JavaScript and TypeScript (`ANALYSABLE`, `scan.ts:106`); after the generic reader, it means languages not in its pattern table.
- **Step by step or in one go.** Step by step when more than 300 source files, more than 5 container candidates, any non-analysable language, more than one repository or system, or more than 2 BMO passes for a level. These thresholds are guesses to check on real repositories (U10 in [section 29 of the manual test plan](manual-test-plan.md#29-unverified-facts-what-was-never-run-or-measured)). The order is always C1 → C2 → C3 → C4, because each level is the scope of the next: containers define source roots, components define path mapping.
- **Finalizing a level.** A level can be marked final when every candidate is decided, `dp check` shows no error at that level, every object has a description (and technology, for containers and components), every line has a label that is not "Uses", no low-confidence item waits, and the person presses Finalize. It can be reopened. A person can stop at any level with `depth` in the intake; the model is valid at every stage because diagrams are computed per level.

## 5. Why a purpose-built import file (history, shortened) [Owner, 2026-11-15, delegated; COD-02]

| Option | For | Against |
|---|---|---|
| Our own workspace JSON | No translation | An LLM must invent ids, positions and `dp.*` properties; easy to get wrong |
| Structurizr DSL | Well known, readable, C4-native | The reference parser is Java; under the all-TypeScript rule dp would need its own parser for a language with variables, includes and scripts; mistakes are found late and reported by line, not by field; no place for evidence |
| **A small purpose-built file with a JSON Schema** (chosen) | Strict and versioned: unknown keys rejected, every error names the field, maps one-to-one onto `modelEdits.ts`, the schema ships in the package and checks offline | One more format to document and version |
| Markdown only | Natural for LLMs | Cannot be validated or merged |

The workspace format is the dependable part of Structurizr, and dp already stores the model in it; the import file is only a transport that ends in a draft. A Structurizr DSL input is not built (COD-02 changed when built: JSON only, no MCP, no DSL).

**Stability and accuracy rules** (still the contract): the same import file gives the same model (ids from the slug rules, fixed order, nothing random or time-based, no network); the importer rejects what it can prove wrong, lists what it cannot check, and does not guess or repair; no "inferred", "imported" or "confidence" label is stored in the model; the review level is computed by dp from checkable evidence, never reported by BMO; tests use hand-written import files, including a round trip and one fixture per error.

## 6. What the public "brain-dump" prompt contributed (history) [Owner, 2026-11-15]

The owner's input was a public prompt that has an agent explore a repository with its own file tools. Ideas reused: look at the tree and search before reading; skip vendor and build output; start from entry points; tie every claim to a file path; keep an assumptions list with confidence; carry state between sessions. Differences: its output is prose for another LLM, ours is a structured file for this tool; it asks nothing and we ask first (the intake, now the interview); it has no stopping rule and ours is the `depth` setting. Its content-hash anchors could drive drift detection, which is parked ([COD-07](decisions.md#cod---07---architecture-drift-is-parked-wave-6-builds-findings-and-acknowledgements-only)).

## 7. Analysing a very large codebase [Proposal; added 2026-11-20 after Q-C1b]

The owner's question: with no token cap (PRO-16), what are the ways to analyse a huge codebase, and can dp write `CLAUDE.md`-style documents so a later analysis does not need the whole codebase again? These are the methods, what exists, and one proposal. Nothing in the "Proposal" rows is built or scheduled. The only hard limit is the model's context window (Q-C1b).

| # | Method | What it does | State |
|---|---|---|---|
| 1 | **Narrow the scope** | Go level by level (C1, C2, C3) and, at C3, one container at a time, so one run reads one container's files | Built (`dp scan --prompt --level c3 --container <id>`; one draft per container) |
| 2 | **Facts first, no model** | The scan reads manifests, hosts, imports and entry facts without tokens; the model only names and explains | Built |
| 3 | **Ranked excerpts under a budget** | A digest of facts plus the most informative files (manifests, entry points, most-imported folders, a container's component folders), cut at a budget; what did not fit is listed as "left out" | Built (`src/assistant/codeExcerpts.ts`; budget `passBudgetTokens`, default 100,000) |
| 4 | **Ask the person's own coding agent** | The handoff writes a prompt and files; the person's agent explores with its own tools and manages its own context | Built (handoff backend) |
| 5 | **Search on demand** | Find a name as plain text; later a word index (BM25) chooses the context for a question | Planned (Wave 5 search, Wave 14 word index) |
| 6 | **Key code** | The person pins the few main files and functions per component; BMO reads those, not the folder | Planned (Wave 5, `dp.code.key`) |
| 7 | **Rounds with memory** | One round per part of the system; the person's answers carry forward | Planned (Wave 20) |
| 8 | **A repo map** | Only the names of definitions and imports per file, from the generic regex reader: a compact outline of a huge folder | Proposal (a by-product of Wave 5's pattern table; not specified there) |
| 9 | **Cached summaries ("digests")** | Write a short document per container and component once, remember what it was built from, and reuse it instead of the code | Proposal (below). This is the open "multi-pass summarising" item in the former backlog B4 (now in the wave files) |
| 10 | **Incremental refresh** | Re-read only what changed since the last run, found by a hash of each digest's files or by `git diff` | Proposal (part of 9) |
| 11 | **Sampling** | Read a random part of the code | Not recommended: for C4 a missed file looks like an absent one, so a sample gives a confident wrong picture |

### The `CLAUDE.md`-style idea: two different documents

**(a) Digests: documents dp writes for itself, so analysis does not re-read the code.**
- One short Markdown file per container and component, in `architecture/import/digests/<id>.md`, plus one `MAP.md` for the system (folders to a fixed depth, entry points, key code). They sit beside `evidence.json` as review data, **not in the model** (the model carries no import label, COD-02).
- Each digest has two parts. The first dp **computes**: the scan facts for the scope, entry points, key code, the names of definitions and the imports to and from it (class *computed* or *approximate*), the file count, and a hash of the files it was built from. The second is a summary **BMO proposes**, labelled as proposed and citing the files it used, until a person accepts it. An accepted summary can be promoted into the object's description or a note through the usual draft path.
- A later run (a Wave 20 round, a chat question, a re-import) sends the model text, the digests of the scope and its neighbours, and the code of only the component in focus. A huge repository then costs one pass to build the digests and small runs afterwards.
- A digest is stale when the hash of its files no longer matches. dp lists stale digests and refreshes only those. This is a cache check, not drift detection (drift stays parked, COD-07).

**(b) An agent instructions file: a document dp writes for coding agents outside dp.**
- Wave 2 plans `dp context`, which prints Markdown about an object or diagram. The same content could be written to a file at the repository root so a coding agent that opens the repository learns the architecture (the systems, containers, where each lives, the key code, the commands) without scanning everything. This is about help for other tools, not an IDE feature.
- Open: write it on request only (`dp context --write`), or keep it up to date after every apply.

### Trade-offs

- **A wrong digest poisons later runs.** Mitigations: the summary is labelled proposed and cites files; the computed part never depends on BMO; a stale hash marks it; a person can mark one verified. A digest is data, never instructions (COD-03).
- **Cost.** Building digests spends tokens once; the estimate is shown before it starts (PRO-16).
- **Secrets.** Redaction (COD-03) applies before anything is summarised; the summary in git is still text from the model, so it is reviewed like a note.
- **Size in git.** One small file per component; committable like `evidence.json`, or git-ignored if the team prefers.
- **More to maintain.** A new store, a staleness check and a UI list; this is a wave of its own (PRO-19, N13).

## 8. Where the scan is exact and where it guesses, by C4 level (moved from the deleted questions.md, 0.3)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in PRO-20.*

**Short answer.** dp is exact where the code states a fact:
- manifests and infrastructure files (C2 containers and their technology);
- known SDKs and hosts (C1 external systems);
- static imports (lines between components and files, in the languages dp reads);
- file paths (the code level).

It has to guess where the code has no field for the answer:
- people and the system boundary (C1);
- where one component ends and the next begins (C3);
- every name, description and line label;
- connections wired at run time (most lines between containers).

A **false positive** is something in the model that isn't true. A **false negative** is something true that is missing.

| Level or item | Where dp gets it today | Exact? | Typical false positives | Typical false negatives |
|---|---|---|---|---|
| C1 people | The intake (what you type) | No: judgment | Roles taken from marketing text in a README; permission flags taken for people | Admins, support staff, operators; anyone the code doesn't name |
| C1 system boundary | The intake | No: a decision | — | Other repositories of the same system, modelled as external |
| C1 external systems | Known SDKs (`src/import/knownServices.ts`); hosts in env samples and compose | Mostly, for SDKs and hosts on the list | An SDK declared but unused; test-only dependencies; one vendor counted twice (SDK and host) | Services called through a plain HTTP client with a URL from a secret store; services not on the list; inbound webhooks |
| C2 containers | Dockerfiles, compose, Kubernetes, manifests with an entry point, serverless | Yes, when those files are in the repo | Libraries in a monorepo taken for deployables; dev-only compose services (a local mail catcher) | Managed services set up in another repo or a console; two processes from one image (web and worker); clients outside the repo |
| C2 technology | Manifests and images | Yes | A base image taken for the runtime | — |
| C2 lines | Hosts in config that point at another service | Partly | Start-up order (`depends_on`) taken for a call; a URL that is set but never used | URLs from service discovery, a secret store or code; queues where each side knows only the broker |
| C3 components | Folders up to depth 2 with at least 2 files, a rule of thumb (`src/import/intake.ts:25-26`) | The folder list, yes; the boundary, no | Technical folders (utils, models, tests) as components; generated code | One component spread over layer folders (controllers, services, repositories); three real components in one folder |
| C3 lines | Imports between component folders (Python, JS/TS) | Yes, for static imports | Shared helpers making lines everywhere; imports used only for types | Dependency injection, plugin registries, reflection, dynamic imports, in-process event buses; languages dp doesn't read yet (Java) |
| Code level | Files mapped by path, and the imports between them | Yes | — | Files outside every component (the "unmapped" warning) |
| Names, descriptions, labels | BMO, or you | No | A plausible but wrong purpose ("handles payments" for a folder that formats receipts); out-of-date README text | — |

**Errors an LLM adds of its own** [Proposal; Training]
- **False positives:**
  - guessing from names ("PaymentService" must call a payment provider);
  - trusting old docs;
  - adding a "typical" piece that isn't there, such as a gateway or a cache;
  - merging two things with similar names.
- **False negatives:**
  - files left out because of the token budget: the run size limit (COD-08) and the chat's code cap of 24,000 tokens (`src/assistant/runTask.ts:324`);
  - "minor" dependencies summarised away;
  - wiring the LLM can't see either.
- **Variation:** the same prompt can group components differently on different runs or model versions. Temperature 0 reduces this but doesn't remove it, and the Anthropic API has no seed.

**What dp already does about it** [Fact]
- The scan and the readiness analysis never use an LLM (`scan.ts:1-19`).
- BMO's import file must cite evidence, and the tool works out the review level itself: verified, partly verified or unverified (`review.ts:174-300`).
- Unverified items need an explicit accept (`review.ts:754-773`).
- No confidence label is stored in the model (COD-02, COD-03).

**Not covered yet**
- Text answers (explain, ask, challenge, draft summary) have no citation check (`src/assistant/tasks.ts:271-288`). That is Wave 1.
- Lines that imports can't show (HTTP, queues, dependency injection) are not checked. Wave 6 reports them as "not checkable" instead of guessing.

**Your think-later question: "does creating C4 from a codebase need an LLM?"**
- By this table, these come from files without one: containers, technology, known external services, import lines and the code level.
- These need judgment, from a person or an LLM: people, the boundary, component boundaries and every name.
- A skeleton import without BMO is possible. Wave 6 builds one to fix drift.

**Owner's thinking:** For importing a codebase, people don't want to create diagrams by hand. When importing, make all the deterministic calls first, then ask the user questions. Show it as a UI with x/y questions: for example, show what dp was thinking of labelling certain items, and the user approves or disapproves. Questions can be grouped. Asking more questions is better than fewer, to get the right answer. Start with a few preliminary questions, either text answers or a choice between options: whatever gets the most context out of the user for this codebase. Assume the user knows the basics of the project, may know more, but probably doesn't.

**Applied [2026-11-18].** This becomes a new wave, [Wave 15: Guided import interview](waves/wave-15-guided-import-interview.md). It replaces "an intake form, then BMO" as the way a codebase comes in. The scan decides everything it can; the interview asks the rest, a few questions at a time, as "question x of y".

## 9. Config files and shared helpers such as `tools.py` (moved from the deleted questions.md, 0.2)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in PRO-20.*

**Short answer.** Neither is a C4 element on its own.

- **A config file is evidence.** It says which hosts, databases and queues a container uses, so it supports lines.
- **A shared helper is code inside a container.** It becomes a box only when it is built and versioned separately, as a library. Then MOD-02 already applies: the library is its own container or system, with a line from each user.

**What dp does today** [Fact]
- **`.env` files are never read**, because hidden paths are closed (SEC-02).
- **Env samples give names and hosts only.** These are files whose name has "env" and example, sample or template in it (`src/import/scan.ts:622-629`, `:659`).
- **Most config files are only counted.**
  - YAML is read only for compose, serverless and Kubernetes files.
  - package.json and pyproject.toml are parsed.
  - Other YAML, JSON, TOML and `.properties` files are counted but not read (`scan.ts:861-902`).
- **Settings modules are ordinary source.** In files such as `settings.py`, hosts and variable names are not picked up (`scan.ts:884-886`, `:907`).
- **Helper folders become components.** A folder such as `utils/` or `common/` with at least 2 files is an ordinary component candidate (`scan.ts:945-952`).
- **A lone helper file is "unmapped".** A `tools.py` at the root belongs to no component, so it shows in the "unmapped code" warning (`src/import/unmappedCode.ts:38-47`).
- **Every importer gets a line.** Each component that imports a shared helper gets an import edge to it.
  - Some checks drop a file that both sides map (`src/import/review.ts:162-163`, `src/core/codeMap.ts:296-321`).
  - The coding plan's check does not (`src/core/codingPlan.ts:229-234`).
- **Code diagrams don't show outside helpers.** A component's code diagram shows only imports between its own files (`codeMap.ts:8`, `:395-397`).

**What goes wrong** [Proposal]
- A "utils" component looks like a functional part of the system, but it is only a technical grouping. That is close to the "dumping ground" the book warns about (Entity Trap, notes `fundamentals-of-software-architecture-richards-ford.md:138`).
- Every component that imports the helper gets a line to it, so the component diagram becomes a hairball.

**Proposed (Wave 5)**
- **File roles.** Every file gets a role by fixed rules: source, test, config, build, infrastructure, generated, or shared helper. You can override any role in the intake.
- **Shared helpers are hidden by default.** They get a badge and are left out of the lines between components; a toggle shows them.
- **Shared code becomes a box only when it is really shared.**
  - A "shared" component is proposed only when many components use it.
  - Code that several containers share is proposed as its own container (MOD-02).
- **Config files feed line evidence**, for example "host orders-db, configured in settings.py:12". Only names and hosts are kept, never values.

See Q5.5 and Q5.6.

**Applied [2026-11-20].** Withdrawn: you do not want `tools.py` and similar mapped (Q5.5). File roles, hidden shared helpers and config facts are not built. A C3 component shows its main files and functions instead (key code, [Wave 5](waves/wave-05-code-search.md)). The facts above about what the scan does today are still true; the proposals are not.
