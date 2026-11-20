# Code import: the design record

Moved from the old `future_tasks.md` (section 4) on 2026-11-20. The code import and BMO were built in 0.5.0 (DEC-051, DEC-064, DEC-065). The decisions are in [decisions.md](decisions.md); this file keeps the reasoning that is not there. Where it says "YAML or JSON" or `intake.yaml`, what was built is JSON only (`architecture/import/intake.json`). The thresholds below are guesses to adjust on real repositories (see "Check the thresholds on real repositories" in the owner's tasks).

### Why a purpose-built import file [Owner, 2026-11-15, delegated; DEC-051]

| Option | For | Against |
|---|---|---|
| Our own workspace JSON | No translation | An LLM must invent ids, positions and `dp.*` properties; easy to get wrong |
| Structurizr DSL | Well known to LLMs, readable, diff-friendly, C4-native | The reference parser is Java, so under the all-TypeScript rule dp needs its own parser for a language with variables, includes and scripts; a mistake (identifier, nesting, arrow syntax) is found late and reported by line, not by field; no place for evidence, only free properties |
| **A small purpose-built file with a JSON Schema** (chosen) | Strict and versioned: unknown keys are rejected; every error names the field; maps one-to-one onto `modelEdits.ts`; the schema ships in the package, so an editor and the importer check the same thing offline | One more format to document and version |
| Markdown only | Natural for LLMs | Cannot be validated or merged |

**Why not "offload to Structurizr".** The dependable part of Structurizr is its workspace format, and dp already stores the model in it. The import file is only a transport that ends in a draft; once accepted, the objects are ordinary workspace elements. A DSL stays useful as an input for repositories that already have `.dsl` files, which are also evidence for an agent. Route [Proposal, not verified]: Structurizr's own CLI can export a DSL file to workspace JSON [Training], and dp can read a workspace file into a draft. A built-in DSL parser is in 2.1.

**Stability and accuracy rules** [Owner, 2026-11-15]: the same import file gives the same model (ids from the slug rules, fixed order, nothing random or time-based, no network); the importer rejects what it can prove wrong and lists what it cannot check, and does not guess or repair; no "inferred", "imported" or "confidence" label is stored in the model; tests use hand-written import files, including a round trip and one fixture per error.

### The readiness analysis [Owner, 2026-11-15; the design is a Proposal]

`dp scan --plan` and the Import page read only files and git, never BMO, so the same commit and settings always give the same numbers. What is counted per C4 level:

| Level | Candidates (rule) | BMO would read | Needs BMO? |
|---|---|---|---|
| C1 Context | External systems: SDK packages in manifests that match the shipped lookup list, hostnames and variable names in config samples, webhook routes, provider resources in IaC. People: intake answers, plus role names in access-control code | Manifests, config samples, docs | Yes, for names, descriptions and what flows |
| C2 Containers | Deployables: Dockerfiles, compose services, Kubernetes workloads, package manifests with an entry point, serverless functions; datastores and queues from compose and IaC | Those files | Yes, for names, technology and line labels |
| C3 Components | Per container: directories up to depth 2 under its source root holding at least 2 source files (both numbers are settings); import edges between them from the import scan | Source of that container | Yes, for names and descriptions; edges are measured |
| C4 Code | Source files after the ignore rules (`.gitignore`, vendor, build, generated) | Nothing | No. A file under a component's path maps by path prefix; what is left is files outside every component, to assign or ignore |

What it reports, per level and in total:
- **Done and left.** Done is candidates accepted into the model or explicitly rejected or ignored. Left is candidates not yet decided, plus unanswered intake questions, objects with no description and lines with no label (or "Uses"). Percent is done ÷ (done + left).
- **Your effort.** Review items are what is left plus the low-confidence items. Minutes are items × a seconds-per-item setting (default 20 s, an assumed figure, not measured). C4 files that map by path are not counted as effort.
- **BMO's reading.** Tokens ≈ bytes ÷ 4 (a rough rule [Training]); passes are tokens ÷ the backend's pass budget. Money only if the user enters a price per million tokens. Time is not estimated.
- **What it cannot see.** Files in languages whose imports dp does not read are "not analysable", so the C3 percent is stated as a ceiling. Anything the code does not show (people, manual steps, systems outside the repository) cannot be counted. "100%" means every candidate the scan can find is decided, not that the model is complete, and the report says so.

**Step by step or in one go.** Step by step is recommended when any of these holds: more than 300 source files; more than 5 container candidates; any file language not analysable; more than one repository or system in scope; more than 2 BMO passes for one level. One go is offered only when none holds. The report prints which rules fired. The order is always C1 → C2 → C3 → C4, because the result of one level is the scope of the next: containers define source roots for components, and components define the path mapping for files.

**Finalizing a level and stopping at one.** A level can be marked final when: every candidate is decided; `dp check` shows no error at that level; every object has a description (and technology, for containers and components); every line has a label that is not "Uses"; no low-confidence item is waiting; and the person presses Finalize. It can be reopened. If a finalized level changes after a deeper level was finalized, the analysis says what broke (for example "3 components now have no container"). The person can stop at any level with `depth` in the intake. The model is valid at every stage, since diagrams are computed per level. `dp check` and the unmapped-code warning apply only to levels inside `depth`. Shown per level: not started, in progress, final, stopped here.

### What the public brain-dump prompt contributed [Owner, 2026-11-15]

The owner's input was a public "codebase brain dump" prompt. Reused ideas: the agent explores with its own file tools instead of pasting the repository; look at the tree and search before reading; skip vendor and build output; start from entry points and end-to-end tests; every claim tied to a file path; an assumptions table with confidence; a state block and a continue request between sessions. Differences: its output is prose for another LLM and ours is a structured file for this tool; it asks the user nothing and we start with the intake; it has no stopping rule and ours is the depth setting. Its anchors carry a content hash, which could also drive drift detection (parked, see the owner's ideas list). Its master notes document could become an optional `architecture/import/notes.md` that feeds descriptions; Wave 2's notes may make that unnecessary.

