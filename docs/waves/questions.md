# Questions for the owner: the waves of 2026-11-17

**How to answer.** Type your thinking under each "Your thinking:" line. ★ marks the questions whose answer changes what gets built. A question you leave blank uses its recommendation. When you're done, tell Claude "apply my answers in docs/waves/questions.md" (see [README.md](README.md)).

**Status [2026-11-19].** Parts 0, A and C are answered and applied (each "Your thinking" is filled and followed by an "Applied" line). Part B was left blank at first. **Waves 1 to 3 of Part B were answered on 2026-11-19 and applied** (see the "Applied" lines under Q1.1 to Q3.5); the other waves' questions are still blank, so each uses its recommendation, with the exceptions listed at the top of Part B. **Part C (questions raised by the product vision) was answered on 2026-11-19 and applied.** This file stays in `docs/` until you delete it before 1.0.0 (answer A10).

**Update [2026-11-20].** You answered Part B for Waves 4 to 15; each answer is filled in below with an "Applied [2026-11-20]" line, and Waves 4 to 9, 11, 13, 14, 15 and 20 are changed to match. Three of your answers reach beyond their own wave:
- **dp reads code by search and by one generic regex reader, not per language** (Q5.1, Q5.2, Q5.5, then Q5.8). [Wave 5](wave-05-code-search.md) becomes "Code search, key code and one generic code reader": offline name search that marks definitions, a component's main files and functions, and a table of patterns for the major languages that replaces the Python and JS/TS readers. File roles, config facts, Maven and Gradle reading are not built, and [Wave 7](wave-07-metrics.md) measures the model. Recorded as DEC-096.
- **Architecture drift moved to [future_tasks.md](../future_tasks.md) 2.2.** [Wave 6](wave-06-findings.md) keeps only the Finding shape and acknowledgements that Waves 8, 11 and 13 need. Recorded as DEC-097.
- **Wave 4's data half is kept**: you answered Q4.1 to Q4.3, and that is read as overruling the scope review's "later" for P4. An old `write` now becomes C, U and D at once.

**How to read the analysis.** Facts carry a source: a `file:line`, a DEC in [../decisions.md](../decisions.md), a line of the book notes in [../notes/](../notes/), or a web page checked on 2026-11-17. [Proposal] marks our interpretation or recommendation. [Training] marks model knowledge that was not re-checked.

## Contents

- **Part 0. Answers to the questions you asked me**
  - 0.1 A/B tests, feature flags and conditional services in C4
  - 0.2 Config files and shared helpers such as `tools.py`
  - 0.3 Where LLM false positives and negatives appear, by C4 level *(answered: Wave 15)*
  - 0.4 GPU acceleration *(answered: local runtimes, Wave 14)*
  - 0.5 A vector DB *(answered: word index only, Wave 14)*
  - 0.6 Better fixed context prompts
- **Part A. Cross-cutting questions:** ★A1 to A10 *(answered and applied)*
- **Part B. Questions per wave:** Q1.x to Q15.x *(answered and applied: Waves 1 to 3 on 2026-11-19, the rest on 2026-11-20; Q5.8 answered later the same day)*
- **Part C. Questions from the product vision:** ★C1 to C8 *(answered and applied)*

---

## Part 0. Answers to the questions you asked me

These need no reply. Write under "Your thinking (optional)" if you disagree.

### 0.1 How do A/B tests, feature flags and other conditional services fit C4?

**Short answer.** C4 diagrams show structure: what exists and what talks to what. Which path a request takes at run time is not structure: variant A or B, a flag on or off, the canary or the stable version. So C4 shows conditional behaviour in four places, each at its own level.

1. **The flag or experiment service is a box.** If a third party runs it, it is an external software system; if you run it, it is a container. Everything that reads flags has a line to it ("reads flag rules from").
2. **Variants are boxes only when they are deployed separately.** Checkout v1 and Checkout v2 as two services are two containers, and the line from the router to each carries the condition ("10% of users, experiment checkout-v2"). When the variant is an `if` inside one component, which is the usual case, no box changes. That detail is below C4's level on purpose; show it in a flow or a note.
3. **Dynamic diagrams show one path at a time.** dp's flows are Structurizr dynamic views: an ordered list of steps with no "else" branch. So each variant is its own flow, for example "Checkout, variant A" and "Checkout, variant B".
4. **Canary and blue/green releases are a deployment matter.** The same container runs twice in one environment, with traffic split between them. They belong on deployment diagrams (the C4 book, chapter 8; notes `c4-model-brown.md:123-132`).

Measuring the experiment means sending exposure and conversion events to an analytics store. That is an ordinary data flow with its own lines.

**What dp has today** [Fact]
- There is no condition, weight, variant or flag anywhere in `src/` or `ui/src/`.
- A flow step is `{id, description, order, response}` (`src/shared/types.ts:363-370`), and dp renumbers its own flows "1" to "n" on every save (`src/core/flows.ts:171-205`). Any branch notation would be flattened.
- The only conditions are:
  - System Testing breakpoints, which pause a call (`src/core/testing.ts:319-362`);
  - the "conditional" kind of decision (`src/shared/types.ts:547-569`).
- Deployment diagrams are decided (DEC-019, DEC-022) but not built.

**Telemetry** [Fact]
- OpenTelemetry's feature-flag conventions (status: Release Candidate) record each flag evaluation as a `feature_flag.evaluation` event through the logs API.
- The event carries `feature_flag.key` and `feature_flag.result.variant` (opentelemetry.io, semantic conventions for feature flags, checked 2026-11-17).
- dp reads trace files only (`src/core/traces.ts`). It sees a variant only when an app also puts these attributes on its spans.

**Proposed**
- Wave 4: an optional condition on lines, and A/B variants as grouped flows, with a short guide.
- Wave 12: the observed split from telemetry, when the telemetry carries it.
- Canary and blue/green wait for deployment diagrams.

See Q4.4 to Q4.6 and Q12.3.

**Your thinking (optional):**

### 0.2 How do config files and shared helpers such as `tools.py` show up?

**Short answer.** Neither is a C4 element on its own.

- **A config file is evidence.** It says which hosts, databases and queues a container uses, so it supports lines.
- **A shared helper is code inside a container.** It becomes a box only when it is built and versioned separately, as a library. Then DEC-023 already applies: the library is its own container or system, with a line from each user.

**What dp does today** [Fact]
- **`.env` files are never read**, because hidden paths are closed (DEC-031).
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
  - Code that several containers share is proposed as its own container (DEC-023).
- **Config files feed line evidence**, for example "host orders-db, configured in settings.py:12". Only names and hosts are kept, never values.

See Q5.5 and Q5.6.

**Your thinking (optional):**

**Applied [2026-11-20].** Withdrawn: you do not want `tools.py` and similar mapped (Q5.5). File roles, hidden shared helpers and config facts are not built. A C3 component shows its main files and functions instead (key code, [Wave 5](wave-05-code-search.md)). The facts above about what the scan does today are still true; the proposals are not.

### 0.3 Where do LLM false positives and negatives appear, and which levels are guesses?

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
  - files left out because of the token budget: the run size limit (DEC-065) and the chat's code cap of 24,000 tokens (`src/assistant/runTask.ts:324`);
  - "minor" dependencies summarised away;
  - wiring the LLM can't see either.
- **Variation:** the same prompt can group components differently on different runs or model versions. Temperature 0 reduces this but doesn't remove it, and the Anthropic API has no seed.

**What dp already does about it** [Fact]
- The scan and the readiness analysis never use an LLM (`scan.ts:1-19`).
- BMO's import file must cite evidence, and the tool works out the review level itself: verified, partly verified or unverified (`review.ts:174-300`).
- Unverified items need an explicit accept (`review.ts:754-773`).
- No confidence label is stored in the model (DEC-051, DEC-064).

**Not covered yet**
- Text answers (explain, ask, challenge, draft summary) have no citation check (`src/assistant/tasks.ts:271-288`). That is Wave 1.
- Lines that imports can't show (HTTP, queues, dependency injection) are not checked. Wave 6 reports them as "not checkable" instead of guessing.

**Your think-later question: "does creating C4 from a codebase need an LLM?"**
- By this table, these come from files without one: containers, technology, known external services, import lines and the code level.
- These need judgment, from a person or an LLM: people, the boundary, component boundaries and every name.
- A skeleton import without BMO is possible. Wave 6 builds one to fix drift.

**Your thinking (optional):** For importing a codebase, people don't want to create diagrams by hand. When importing, make all the deterministic calls first, then ask the user questions. Show it as a UI with x/y questions: for example, show what dp was thinking of labelling certain items, and the user approves or disapproves. Questions can be grouped. Asking more questions is better than fewer, to get the right answer. Start with a few preliminary questions, either text answers or a choice between options: whatever gets the most context out of the user for this codebase. Assume the user knows the basics of the project, may know more, but probably doesn't.

**Applied [2026-11-18].** This becomes a new wave, [Wave 15: Guided import interview](wave-15-guided-import-interview.md). It replaces "an intake form, then BMO" as the way a codebase comes in. The scan decides everything it can; the interview asks the rest, a few questions at a time, as "question x of y".

### 0.4 What can GPU acceleration speed up here?

**Short answer.** In dp, a GPU helps a lot with one kind of work only: running an LLM and computing embeddings. That work happens inside the model runtime, not in dp. Ollama, for example, uses Metal on Apple Silicon and CUDA on NVIDIA cards by itself [Training].

dp's own work is scanning files, import graphs, metrics, diffs and layout. That is branching graph work on small data, which a GPU doesn't speed up. Node also has no practical GPU path without native add-ons, and those would break the all-TypeScript, plain `npm install` setup.

**Facts**
- dp calls Ollama's `/api/chat` with `num_ctx` and `num_predict` only. It sends no GPU option (`src/assistant/providerBackend.ts:475-491`).
- Ollama's `/api/ps` lists the loaded models with `size` and `size_vram`, so the share on the GPU is `size_vram / size`.
  - There is no field that names the processor.
  - On some recent builds the number is reported too low.
  - Sources, checked 2026-11-17: docs.ollama.com/api/ps; ollama issues #8644, #19089, #19204.
- Diagram layout runs in the browser (`static/assets/diagram-layout.js`).

**Options**

| Option | Trade-off |
|---|---|
| CUDA or MPS code inside dp | Native add-ons per platform, to speed up work dp doesn't do. Not recommended |
| A model in the browser on WebGPU | Large downloads, slower than a local runtime, a heavy dependency. Not now |
| **Make local runtimes first-class** | Show whether the model sits on the GPU. Offer bounded runtime settings (context size, how long a model stays loaded). Add a provider for local servers that speak the OpenAI chat API, loopback only by default as DEC-065 pins hosts. Write setup notes per platform. **Recommended (Wave 14)** |

**Your thinking (optional):** Make local runtimes first-class.

**Applied [2026-11-18].** The third option, as recommended. No CUDA or MPS code in dp. [Wave 14](wave-14-retrieval-local-models.md) is now about local runtimes and the word index; Q14.4 is answered by this. It is no longer gated on Wave 1's evaluation.

### 0.5 What would a vector DB speed up?

**Short answer.** A vector DB doesn't make the LLM faster. It helps choose which pieces of code and docs go into a prompt when the words in a question don't match the names in the code. A smaller, better-chosen prompt is faster and cheaper, and that is the whole gain.

**Facts**
- dp chooses context by fixed rules today: the objects you name, their parents and neighbours, their code paths, and excerpts ranked by rules (`src/assistant/runTask.ts:375-474`, `src/assistant/codeExcerpts.ts:272-345`).
- There is no embedding or retrieval code in the repository.
- The server has three runtime dependencies (`package.json:39-43`).

**Trade-offs**
- **Embeddings need a model.**
  - A local one, through Ollama, keeps code on the machine.
  - A cloud embedding service would send the whole indexed codebase at once. The per-run preview and its hash can't show that (DEC-064).
- **The index goes stale when code changes.** It must be rebuilt, and filtered by the current intake rules at every query.
- **Similar is not the same as evidence.** Retrieval only picks what BMO reads. Citations (Wave 1) still decide what counts.
- **A database server or a native extension adds install weight.** A flat file with exact cosine search in TypeScript is likely fast enough for tens of thousands of pieces [Proposal; to be measured].
- **A word index (BM25) needs no model and gives the same answer every time.** It works well on code, where names matter.

**Recommended (Wave 14, gated)**
- A word index first.
- Optional local embeddings, in a flat file under `.dp/index/`.
- No database server.
- Build it only if Wave 1's evaluation shows that choosing context is what holds answers back.

**Your thinking (optional):** Do only the word indexing.

**Applied [2026-11-18].** The word index (BM25) only. Dropped from Wave 14: local embeddings, the flat vector file, fusion, and the embeddings call to Ollama. Nothing else changes: no database server, no cloud calls. Embeddings can come back later as their own task if Wave 1's evaluation shows the word index misses what BMO needs (the evaluation comparison stays in Wave 14). This also answers Q14.1 (go), Q14.2, Q14.3 and Q14.5.

### 0.6 What makes a better fixed context prompt?

You asked that the prompts stay hard-coded for specific situations and never be written by an LLM. That is already how dp works [Fact]:
- every system text is a fixed TypeScript builder (`src/assistant/prompts.ts:130-261`, `PROMPT_VERSION` 1.0.0 at `:23`);
- data goes only into fenced, redacted blocks (`prompts.ts:42-53`);
- a test checks that system text never contains repository data (`tests/unit/bmo-core.test.ts:89`).

What makes a fixed prompt give better answers [Proposal, common practice]:

1. **One template per situation:** explain an object, explain a diagram, compare two versions, review drift, check anti-patterns, answer a question about dp. Each has an id and a version, shown in the preview.
2. **A fixed order:** the task, the rules, the shape of the answer, then the data from most to least important.
3. **A budget for each block**, so a big code excerpt can't push the model out. Whole items are dropped, never cut in half.
4. **A list of what was included, what was left out and why** ("12 files left out: budget"). The model can then say "I wasn't shown that" instead of guessing, which means fewer false positives.
5. **Stable ids for everything that can be quoted:** object ids, file and line, decision numbers, note ids. The answer cites them, and dp checks the citations.
6. **An explicit "say you don't know" rule**, with open questions at the end.
7. **Short worked examples, written by hand and kept in code**, for the hardest tasks.
8. **An evaluation set:** fixed inputs with known right answers, so a prompt change is measured, not guessed.

Proposed: Wave 1. See Q1.1 to Q1.4.

**Your thinking (optional):**

---

## Part A. Cross-cutting questions

### ★A1. Should the product vision come first?

**Why it matters.** You marked the product vision "MOST IMPORTANT" and put it in the think-later list. Some waves only pay off for some kinds of user.

**Analysis** [Proposal]

The list pulls toward at least four products:
- **A modelling and decision tool for architects:** notes, ADRs, the reference library, characteristics, risk (Waves 2, 3, 9, 10).
- **A model-and-code consistency checker for tech leads, run in CI:** code facts, drift, metrics, rules (Waves 5 to 8).
- **An assistant that explains and reviews:** BMO (Waves 1, 11, 14).
- **A runtime companion:** System Testing, telemetry, contracts (Waves 12, 13).

Waves 1 to 6 help all four. Waves 12 to 14 depend on the vision most.

One candidate sentence: "dp is a modelling tool with deterministic checks; data dp doesn't own (complexity, coverage, runtime) arrives as report files." The backlog's project direction already says "Target own system first" [Owner] (`docs/backlog.md:19`).

**Recommended.** Write a one-page vision before Wave 7: who it's for, the three jobs it must do well, what it won't do, and how you'll know it works. Waves 1 to 6 go ahead meanwhile. Claude can give you a template of questions to fill in.

**Your thinking:** As developers move away from hand-coding each function and file, because LLMs write more of it, software architects are needed more. But understanding an existing system, its codebase, and the decisions behind a design (ADRs and similar) is hard. That is the opening. Version 1.0.0 is for software architecture only; data architecture and infrastructure come later. Twelve features (A to L): C4 modelling; a single source of truth; architecture change proposals; lenses (architect, DevOps, other SDLC members); collaboration and notes with different accounts adding notes, images and files; contracts between services; an ADR page; codebase importing; git-style commits for architecture; links to GitHub, SonarQube and Jira; a catalog shared between projects; and BMO, the architecture-intelligence agent (the "-ilities", metrics, anti-pattern detection, explaining components, code and context, and ADRs that are broken or violated). Call out anything planned or built outside software architecture in a .md file for manual review. Non-goal: this is not an IDE.

**Applied [2026-11-19].**
- The vision is written up in [../product-vision.md](../product-vision.md), with the twelve features checked against what is built and planned. It is recorded as DEC-090.
- Everything built or planned outside software architecture is in [v1-scope-review.md](v1-scope-review.md), one row per item, with a column for your decision.
- Gaps the twelve features exposed: **E** (images and files: new [Wave 16](wave-16-attachments.md)); **L** ("ADR broken or violated": added to [Wave 11](wave-11-bmo-reviews.md)); **D** (a DevOps lens), **C** (rebase and merge editor) and **I** (git-style commits) are in no wave. They are Part C questions.
- The earlier recommendation, "write a vision before Wave 7", is done.

### ★A2. Where do the waves go relative to the order you decided earlier?

**Why it matters.** future_tasks.md 1.1 holds an order you decided: deployment diagrams, then the small batch, then the static HTML export (DEC-019, DEC-022, DEC-024, DEC-028).

**Analysis**
- Canary and blue/green releases (Waves 4 and 12) need deployment diagrams, and so does drift per environment.
- The static export must decide what it includes (notes, risks, attachments). That is easier after Waves 2, 3 and 10.

**Options**
1. The waves after the earlier order.
2. The waves first, then the earlier order.
3. Interleave: Waves 1 to 11, then deployment diagrams, then Waves 12 to 14, then the small batch and the static export.

**Recommended.** Option 3, recorded in a new DEC that amends DEC-028's order.

**Your thinking:** Go with whatever you think is best.

**Applied [2026-11-19].** Option 3 (interleave), adjusted by the vision. Deployment diagrams are infrastructure, so they leave the order for now and wait for your decision on item P1 in [v1-scope-review.md](v1-scope-review.md) (recommended: after 1.0.0). The small batch (P2) no longer waits behind them. The static export (P3) is recommended for after 1.0.0 too. This amends the order in DEC-028; DEC-090 records it.

### ★A3. Is this wave order right?

**Analysis** [Proposal]
- **Wave 1 first.** It changes no file format, it hardens the 8 BMO tasks that exist, and every later BMO feature needs its citation check and labels.
- **Waves 2 and 3 next.** They are cheap and visible, and Wave 11 needs the reference library.
- **Wave 4 is independent.**
- **Two chains:** 5 → 6 → 7 → 8, and 9 → 10 → 11.
- **The last three:** 12 and 13 come after drift's Finding shape; 14 is gated.

**Alternatives**
- Visible features first: Waves 2, 3, 4 and 9, then Wave 1.
- Drift first: Waves 5 and 6, then the rest.

The cost of building BMO features before Wave 1 is redoing their prompts later.

**Recommended.** The order in [README.md](README.md).

**Your thinking:** Go with whatever you think is best.

**Applied [2026-11-19].** The order in [README.md](README.md), with three changes from your other answers: Wave 16 (images and files) goes after Wave 3; Waves 10 and 12 are parked (A7); and Wave 15 sits with Waves 5 to 8, after 5. The README has the release each wave belongs to.

### ★A4. Determinism classes on every result?

**Analysis.** You asked for as much determinism as possible, and for LLM use to be called out. One small vocabulary, used everywhere, does both:

| Class | Meaning |
|---|---|
| **computed** | Same input, same output |
| **approximate** | Computed, with known misses shown |
| **heuristic** | A hint |
| **proposed** | BMO's, labelled until accepted |

`docs/determinism.md` (Wave 1) lists every feature and its class. Every wave adds rows. The cost is one more label in the UI.

**Recommended.** Yes, recorded in a DEC.

**Your thinking:** Go with whatever you think is best.

**Applied [2026-11-19].** Yes. The four classes are in [README.md](README.md#determinism-classes). Wave 1 writes `docs/determinism.md` and the DEC that records them, as its file says.

### ★A5. One Finding and one way to acknowledge it, for every check?

**Analysis.** Drift (Wave 6), rules (8), runtime (12), contracts (13) and BMO reviews (11) all say the same kind of thing: "something about object X needs a look". Built separately, each would bring its own overlay, bell item and way to silence it.

**Proposed**
- **One Finding shape** in `src/shared/types.ts`: rule, target, severity, class, outcome, evidence, and what could not be checked. Built in Wave 6.
- **Acknowledgements are model data.** "Seen, and here is why it's fine" is stored on the target as a `dp.*` property. Project-wide findings are stored on the workspace, the way `dp.work` is (`src/core/work.ts:48-75`).
- **So acknowledgements behave like any edit:**
  - they go through drafts, undo and `dp diff`;
  - only people who may edit the model can silence a finding.

  future_tasks 2.2 warns against "a way to hide real problems"; this keeps silencing reviewable.
- **The cost:** acknowledgements show up in model diffs, which is the point.

**The alternative** is a side file like `checklist.json`. Anyone with checklist rights could then silence drift on main without a review.

**Recommended.** Yes.

**Your thinking:** Go with whatever you think is best.

**Applied [2026-11-19].** Yes. One Finding shape, and acknowledgements stored as model data (`dp.acks`). Wave 6 builds it and records the DEC. Waves 8, 11 and 13 reuse it. Wave 12 would have too; it is parked.

### A6. How BMO's output is labelled

**Recommended**
- Labels appear in the UI and in review files only, for example: "BMO · model · 5 of 7 statements cited · not checked by a person".
- Nothing is stored as a label in the model (DEC-051, DEC-064).
- Once you accept something, it is yours.

**Your thinking:** Go with whatever you think is best.

**Applied [2026-11-19].** As recommended: labels in the UI and review files only; nothing stored in the model (DEC-051, DEC-064).

### A7. Items that are in both of your lists

**Analysis.** "Risk analysis" and "anti-patterns through telemetry" appear in both the build list and the think-later list.

**Recommended**
- The waves build a first cut: risk storming in Wave 10, telemetry rules in Wave 12.
- future_tasks.md keeps the wider questions: continuous risk tracking; logs and metrics as well as traces.

**Your thinking:** Push these to future_tasks.md.

**Applied [2026-11-19].** Read as: risk analysis and anti-patterns through telemetry are not built in this plan. So **[Wave 10 (risk storming)](wave-10-risk-storming.md) and [Wave 12 (runtime)](wave-12-runtime-telemetry.md) are parked**: their files stay in this folder, marked "Parked", and their ideas are in [../future_tasks.md](../future_tasks.md) (2.3 and 2.7, and section 1.0). Knock-on changes: Wave 11 loses "add as a risk" and the `suggest-risks` task; Wave 4's note about the observed A/B split goes to future_tasks; the Risk tag group and trade-off risks stay as they are. The owner confirmed this reading on 2026-11-19 (C6b: do not build either for 1.0).

### A8. Releases

**Options**
1. A release after every wave.
2. Grouped releases:

   | Release | After |
   |---|---|
   | 0.6.0 | Waves 1–4 |
   | 0.7.0 | Waves 5–8 |
   | 0.8.0 | Waves 9–11 |
   | 0.9.0 | Waves 12–14 |
   | 1.0.0 | The 1.0 checklist (future_tasks 2.0) |

Fewer releases mean fewer release chores, but longer waits for an installable version.

**Recommended.** Option 2.

**Your thinking:** Releases should all be within 0.5.x.

**Applied [2026-11-19].** Grouped releases, numbered inside 0.5.x until 1.0.0: **0.5.1** (Waves 1, 2, 3, 16, 4), **0.5.2** (Waves 5, 6, 15, 7, 8), **0.5.3** (Waves 9, 11), **0.5.4** (Waves 13, 14), then **1.0.0** when the 1.0 checklist (future_tasks 2.0) is met. If more waves join after your review (Part C, the scope review), they add a 0.5.x number, not a 0.6. The table is in [README.md](README.md#releases).

### A9. Agent models

**Recommended.** As you asked on 2026-11-14:
- Opus for unsettled design, security and merge logic;
- Sonnet for well-specified building;
- Haiku for docs.

Each wave file names the model for each step. Fable is used only if you ask.

**Your thinking:** Fable will not be used; the rest is fine. Choose the bigger model rather than the smaller if on the fence.

**Applied [2026-11-19].** Fable is never used (it was "only if asked"; now not at all). When a step could go to either of two models, it goes to the larger: Sonnet becomes Opus, Haiku becomes Sonnet. Steps in the wave files keep their listed model; the rule in [README.md](README.md#agents-and-models) applies when a step is in doubt.

### A10. Deleting these planning files

**Recommended**
- `questions.md` is deleted once its answers live in the wave files or DECs.
- Each wave file is deleted when its reviews.md section lands. CLAUDE.md says not to commit superseded plans, and commit 47b33a2 did the same with the earlier questions file.
- The alternative is to keep these files in the git-ignored `local/`.

**Your thinking:** Keep questions.md for now, and the relevant .md files in docs/. I will choose what to delete before the 1.0 release.

**Applied [2026-11-19].** Nothing is deleted when a wave ships or when answers are applied. [README.md](README.md) no longer says to delete `questions.md` or each wave file. The owner deletes planning files before 1.0.0. (CLAUDE.md's "do not commit superseded plans" is left as it is; this is a standing owner exception for `docs/waves/` until then.)

---

## Part B. Questions per wave

**Status [2026-11-19].** **Waves 1 to 3 are answered and applied** (Q1.1 to Q3.5, below). For the other waves, a blank question uses its recommendation. The exceptions, all from the vision or your answers:

- **Wave 1 to 3 answers that changed the plan:**
  - **Q1.3:** the evaluation set leaves Wave 1 for future_tasks.
  - **Q2.1:** sticky notes become architecture data that BMO reads.
  - **Q2.2:** BMO always sees notes.
  - **Q2.5:** BMO works without an LLM, behind a setting.
  - **Q3.4:** the page stays "Decisions".
  - **Q3.5:** links in Wave 3; files in [Wave 16](wave-16-attachments.md); and a reference to a file on your own computer instead of a copy.
- **Q4.1 to Q4.3:** the data half of Wave 4 (CRUD letters, the role × data matrix) is on the review list (P4). Their recommendations hold if you keep it. **Answered 2026-11-20: kept.**
- **Q10.x and Q12.x:** the waves are parked (A7); their recommendations are kept for when they return.
- **Q11.2:** "add as a risk" is dropped while Wave 10 is parked. Q11.1 gains a decisions review (feature L, "ADR violated").
- **Q13.1:** still asks you before a YAML dependency is added.
- **Q5.4:** option 1 (Java as test fixtures only), as recommended. **Superseded 2026-11-20:** no Java at all (Q5.1, Q5.2).

**Answered 2026-11-20 (Waves 4 to 15).** Every question below now has your thinking and an "Applied" line. What changed the plan:
- **Q4.1:** an old `write` becomes C, U and D at once; no `W`.
- **Q4.1 to Q4.3 answered:** the data half of Wave 4 is kept.
- **Q5.1, Q5.2, Q5.5, Q5.8:** code is searched, and read by one generic regex reader for the major languages; key code instead of file roles. Q5.3, Q5.4, Q5.6, Q5.7 follow (no Maven or Gradle, no Java samples, no config facts, no hash cache).
- **Wave 6:** drift parked (future_tasks 2.2); Findings and acknowledgements stay.
- **Wave 7:** model coupling only (Q7.1 to Q7.4).
- **Q8.x, Q9.x, Q11.x, Q13.x, Q14.x:** your best-thinking answers hold the recommendations, with the follow-on changes noted per question. **Q13.1:** JSON only, no YAML dependency.
- **Q10.x, Q12.x:** the waves are parked.
- **Q15.1 to Q15.5:** the interview depends on the codebase, has a floor of 6 questions per level, adds notes, context and file references, and saves locally.

### Wave 1: Grounded BMO answers

#### ★Q1.1 What must carry a citation, and what happens to a sentence without one?

**Analysis** [Fact]
- **Only import items carry evidence today** (`src/import/review.ts:174-300`).
- **Text answers are plain text.** The only checks are that the text is not empty and is under 100,000 characters (`validateText`, `src/assistant/tasks.ts:271-288`).
- **The material is already citable:**
  - object ids are written next to names (`src/assistant/modelText.ts:88`);
  - code excerpts carry their path and line numbers (`codeExcerpts.ts:209-211`, `:332-334`);
  - scan facts have ids.

**Options**
1. Every statement must cite, or it is dropped.
2. Every statement that names a file, an object or a number must cite. Other statements are shown, marked "not cited".
3. Citations are optional and shown when present.

**What dp checks, in every option**
- A cited object exists in the version shown.
- A cited file and its lines were really in what was sent, after redaction.
- The quoted text is found there.
- A citation link only moves around inside dp.

**Recommended.** Option 2. The answer comes back as a list of statements, so dp never needs an LLM to split sentences.

**Your thinking:** Every statement needs a citation when referring to things.

**Applied [2026-11-19].** Read as option 2 with a wide meaning of "things", plus the strict half of option 1.
- **What counts as referring to a thing:** the statement names an object, a relationship, a file or path, a decision, a note, a doc section or a number that was in what was sent. dp finds this by matching the names, ids, paths and numbers of the pack in the statement's text, so no LLM is involved.
- **What happens:** such a statement must carry a cite that dp verifies. One without a valid cite is **not shown in the answer**. The answer ends with "N claims without a valid citation", which opens to list them, each marked "no citation" or "bad cite".
- **General statements** that refer to nothing in the pack (a definition, advice) are shown and marked "general".
- **My reading, [Proposal]:** I took "needs" to mean hidden until the person asks. Showing them inline, marked, is the milder alternative and a one-line change.
- [Wave 1](wave-01-grounded-bmo.md) is updated.

#### ★Q1.2 Where do the prompt templates live, and who can change them?

**Analysis**
- **In code.** `prompts.ts` grows into a registry of templates, one per situation.
  - Each is versioned and shown read-only in the preview, for example "explain-object v2".
  - It changes only through a code change, is never written by an LLM, and has no per-project override.
- **The alternative:** templates per project that architects can edit.
  - It is flexible.
  - But runs could no longer be compared.
  - And it opens a path for repository text into system text, which the test at `bmo-core.test.ts:89` forbids.

**Recommended.** In code only.

**Your thinking:** In code.

**Applied [2026-11-19].** As recommended: templates live in code only, never per project, never written by an LLM.

#### ★Q1.3 Who builds the evaluation set, and who runs it with real models?

**Analysis**
- No LLM is used in development or CI [Owner] (`docs/backlog.md:19`).
- The fake backend gives canned answers (`src/assistant/fakeBackend.ts`).
- Proposed setup:
  - **Fixtures written by hand:** the demo and two small repositories, each with known right answers (the containers, the lines, which statements are true).
  - **CI checks the checkers:** the citation checker and the scorer, run on canned answers.
  - **Real runs by you only:** `dp bmo eval --yes-send`, with the results written into the wave's reviews.md section.

**Recommended.** As proposed. Your thinking could add which providers you will run; each real run costs money.

**Your thinking:** Delay this to future_tasks.md. I need to think through testing and evaluation much more deeply.

**Applied [2026-11-19].** The evaluation set is out of Wave 1 and is now an idea to think through.
- **Removed from Wave 1:** the fixtures with known right answers, the scorer, `dp bmo eval`, `eval.ts`.
- **Added to [../future_tasks.md](../future_tasks.md) 2.0:** "Testing and evaluating BMO", with the open points listed.
- **Kept in Wave 1:** ordinary unit tests of dp's own code. These are the context packs, the citation checker (with canned answers from the fake backend) and the providers' answer handling. They test our code, not how good a model is, so they are not the evaluation you deferred.
- **Wave 1 shrinks** from L to M–L.
- **Knock-on:** [Wave 14](wave-14-retrieval-local-models.md) planned to measure the word index with Wave 1's evaluation, with and without the index. That measurement moves to the same future_tasks item. The index still ships.

#### Q1.4 Temperature and seed

**Recommended.** Temperature 0 everywhere, and a seed where the API has one (OpenAI and Ollama do; the Anthropic API has none [Training]). Both go into the run log. dp never claims a run can be repeated exactly.

**Your thinking:** Yes, that works.

**Applied [2026-11-19].** As recommended.

#### Q1.5 Can BMO cite the repository's own docs?

**Recommended.** Yes. Markdown files under the code root (README, docs, ADRs kept in the repo) can be quoted and cited. They go through the same file gate as code: redaction, must-not-open, and DEC-064.

**Your thinking:** Yes.

**Applied [2026-11-19].** As recommended.

### Wave 2: Notes, context and help

#### ★Q2.1 What does "a note for each object at each level" mean?

**Analysis** [Fact]
- `dp.notes` already exists: one note per box or line, the same on every diagram.
  - Stored at `src/core/modelEdits.ts:967`; edited in `ui/src/panels/listEditors.tsx:101-103`.
  - Boxes and lines show a badge when they have one.
- A diagram can hold `dp.*` data, as linked work does (`src/core/work.ts:48-75`).
- Sticky notes on a diagram (DEC-070) are comments, not model data. They never reach BMO.

**Options**
1. Keep one note per object, and add one note per diagram ("diagram notes"). These are model data, so they go through drafts and diffs.
2. A separate note for each object on each diagram. For example, "Payments" has one note on the context diagram and another on the container diagram.
   - This needs storage per diagram per object.
   - Today only layout is stored that way, and diffs only count it (`src/core/modelUnits.ts:52`).

**Recommended.** Option 1. Did you mean option 2?

**Your thinking:** Sticky notes on diagrams need to be stored as well, as part of the architecture. They need to be analyzed by BMO as well. Notes can be stuck to objects or diagrams as sticky notes.

**Applied [2026-11-19].** The separate "one note per diagram" field is dropped. A **sticky note** is now how a note goes on a diagram, and it is architecture data.
- **What it is:** a short Markdown card with a position on one diagram. It is either **stuck to an object** (a box or a line on that diagram; it keeps its offset and moves with the object) or **stuck to the diagram** (free). A diagram can have any number.
- **Where it is stored:** in the model, as `dp.stickies` on the diagram's view, the way linked work is stored (`dp.work`). It is not in `comments.json`. So stickies go through drafts, undo, `dp diff`, merge and the static export. A computed diagram gets a stored view when its first sticky is added.
- **BMO reads them** (see Q2.2): a diagram's stickies go in that diagram's pack, and an object's stickies go in that object's pack.
- **Object notes stay as they are.** `dp.notes` is one note per box or line, the same on every diagram, with a badge. [Proposal] A sticky is for a remark you want to see on one diagram.
- **Two consequences** [Proposal]. The owner confirmed the first and changed the second on 2026-11-19 (see the follow-up below):
  1. **Who writes them.** Stickies are model data, so only those who edit the model write them: architects on main, engineers in a draft. This follows your C6a answer ("notes are model data; every other account uses comments"). Viewers keep comments. **Confirmed.**
  2. **Placed comments (DEC-070) stay.** Comments placed on a diagram remain conversation, open to every role. The right-click menu offers both "Add sticky note here" and "Add comment here". An architect can turn a placed comment into a sticky. **They now reach BMO too** (follow-up below).
- **A cost:** moving a sticky is a model edit, so it shows in a draft's change list. Moving a comment pin never did.
- [Wave 2](wave-02-notes-context-help.md) and [Wave 16](wave-16-attachments.md) are updated. DEC-092 amends DEC-070.

#### ★Q2.2 Should BMO always see the notes?

**Analysis** [Fact]
- BMO gets notes only when the lens shows the notes section (`modelText.ts:112`, `:150`). The Overview lens hides them (`src/core/designPerspectivesFile.ts:146`).
- DEC-073 says BMO's context follows the lens.
- Notes are cut to 2,000 characters and joined into one line (`modelText.ts:112`).

**Options**
1. Always.
2. Follow the lens.
3. Follow the lens, with an "include notes" switch in the preview. The preview's hash covers the switch (DEC-064).

**Recommended.** Option 3, with the switch on by default for the Engineer and Architect lenses. Keep the notes' line breaks.

**Your thinking:** Always.

**Applied [2026-11-19].** Option 1. BMO sees every note, object notes and sticky notes, whatever the lens shows. There is no "include notes" switch.
- **Lenses:** the Overview lens still hides notes in the UI, but not from BMO.
- **How notes go in:** notes are text from people who edit the model, so they go in data blocks like all repository text, through redaction.
- **Budget:** notes get a share of the pack budget. Whole notes are dropped, never cut, and the manifest lists any left out. Line breaks are kept.
- **Amends** DEC-073 ("BMO's context follows the lens") for notes only (DEC-092).

**Follow-up [2026-11-19].** You said: "Comments should be reachable by BMO; everything a person can visualize on screen should be reachable by BMO." Applied as a general rule, **screen parity** (DEC-094).
- **The rule:** every kind of thing the UI shows about a scope has a place in that scope's pack, by default or through the lens and preview choices. The manifest says what was left out and why. A computed test walks the fields the panels show and checks each is in the pack or named in the manifest. [Wave 1](wave-01-grounded-bmo.md) builds the pack so a new kind of data is added in one place, and its first step lists the panel data no pack carries today.
- **Comments now go to BMO:** the threads on the object or diagram in scope, with kind, author, time, status and replies. Placed comments are included with their diagram. Resolved threads come last and are dropped first under budget.
- **How they go in:** each in a data block labelled "comment by <author>, not reviewed", after redaction. The author can be "Anonymous". New cite kinds `comment:<id>` and `sticky:<id>` are checked by the verifier.
- **Why this is safe enough** [Proposal]: the worry behind C6a was text from any account steering BMO. dp already treats all repository text as data and never as instructions (DEC-064). BMO's output is only a proposal, the preview shows the exact prompt before anything is sent, and citations are checked. A comment is more data of the same kind. What remains is that a comment can mislead an answer, which the label and the cites make visible.
- **One exception I kept** [Proposal; overrule it if you want]: attachments (Wave 16) are always listed to BMO with name, type, size and who added them, and a text file's content goes in after redaction. The contents of images, PDFs and Office files are not sent, because dp cannot scan them for secrets (DEC-064). Sending them would need a vision-capable model and a decision about unscannable content.

#### Q2.3 What `dp context` prints

**Proposed**
- The command is `dp context <object or diagram> [--for explain|review|code] [--json]`. It prints the same fixed pack BMO would get, without the system text.
- The pack holds the object, its parents and lines, its notes, the decisions about it and its code paths. `--code` adds redacted excerpts.
- It is for coding agents such as Claude Code, and for people. It gives agents the model without building an MCP server (DEC-020).

**Recommended.** Yes, as Markdown, with `--json` as an option.

**Your thinking:** Do what you think is best.

**Applied [2026-11-19].** As recommended: Markdown, with `--json` as an option.

#### ★Q2.4 Which docs ship so BMO can answer questions about dp?

**Analysis** [Fact]
- The package ships `dist`, `static`, `demo`, `README.md` and `LICENSE` (`package.json:15-21`). `docs/` does not ship.
- `docs/` is about 3,800 lines; `decisions.md` alone is 846.

**Recommended**
- **Ship:**
  - README;
  - `planned-change.md`;
  - the security-model part of CONTRIBUTING;
  - CHANGELOG;
  - `decisions.md`, for questions like "why does dp do X?";
  - generated CLI help and the UI's help hints.
- **Leave out:** the backlog, the reviews and the book notes.

**Your thinking:** Yes, that works.

**Applied [2026-11-19].** As recommended.

#### Q2.5 Help without an LLM

**Recommended.** Yes. A search box in the help card, and `dp help <words>`, show the matching sections of the docs. BMO writes an answer only when it is set up.

**Your thinking:** Yes. It should support non-LLM usage as well, and this can be turned on and off in the settings. If turned off, BMO can just be a simple search, or whatever deterministic commands you want to do.

**Applied [2026-11-19].** Yes, and it reaches beyond help: BMO gets an LLM switch (DEC-093).
- **The switch:** the existing `enabled` flag in the BMO settings (`src/assistant/settings.ts`), relabelled "Use an LLM". It stays off by default, and architects change it.
- **Switch off:** BMO is still there, as a deterministic assistant. No prompt is built, nothing is sent, no handoff file is written. It answers a fixed list of commands from the model, notes, decisions, reference notes and docs: `find`, `help`, `show`, `notes`, `decisions about`. A free-text question is run as a search, and the chat says it searched and did not answer.
- **Switch on:** handoff or direct, as today.
- **Later waves** add their own deterministic commands to the same list (drift, findings and so on).
- **Class:** computed.
- [Wave 2](wave-02-notes-context-help.md) is updated.

### Wave 3: Reference library and ADRs

#### ★Q3.1 Where does the library live, and who edits it?

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

**Your thinking:** What is a library?

**Applied [2026-11-19].** The word was unclear, so here it is in plain words.
- **"The library" is the reference library:** your curated set of write-ups on patterns and anti-patterns that architects fall into (Entity Trap, Big Ball of Mud, and so on). It is what you asked for as "a reference notes section curated by me". Each entry is one Markdown page inside dp: a summary, signs to look for, why it hurts, what to do instead. It is a small built-in wiki that everyone can read and architects edit.
- **"Where does it live" means which folder the entry files are in, and who may edit them:**
  1. Per project, in `architecture/reference/`. It travels with the project's git repository.
  2. Per hub, shared by every project on a hub.
  3. Per person, outside git.
  4. Both 1 and 2, where a project entry beats a hub entry of the same name.
- **No change to the plan.** Option 4 still holds, since the question was about the word and not about the options. Tell me if the explanation changes your mind.
- **The label:** I'll call the page "Reference notes", your own words, and not "library".

#### ★Q3.2 Should dp ship starter entries?

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

**Your thinking:** Yes, that works for now, but still add this into future_tasks.md so I can review these later.

**Applied [2026-11-19].** As recommended: an opt-in starter set of about 10 anti-patterns and 5 patterns, in our own words, with book and page references, and an Opus copy check. Added to [../future_tasks.md](../future_tasks.md) 1.5 ("Checks that only the owner can run"): review the starter entries and curate them.

#### Q3.3 The entry template

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

**Your thinking:** Do whatever you think is best.

**Applied [2026-11-19].** As proposed.

#### ★Q3.4 Should the section be called "ADRs"?

**Analysis** [Fact]
- The toolbar button and the page are called "Decisions" (`ui/src/App.tsx:946-950`, `:357`).
- The files are `architecture/decisions/NNNN-slug.md` (DEC-050). The CLI and the API say "decisions".
- You asked for "a section called ADR Architectural Decision Records".

**Options**
1. Label the button "ADRs" and the page "Architecture decision records (ADRs)". Keep the paths.
2. Keep "Decisions", and make a search for "ADR" find it.

"ADR" is architect jargon, and people on the Overview lens may not know it.

**Recommended.** Option 1. It is what you asked for, and the people who write decisions are architects.

**Your thinking:** Leave it as the Decisions page.

**Applied [2026-11-19].** Option 2. The button and the page stay "Decisions". Searching for "ADR" or "architecture decision record" finds the page. The help card and the README say "Decisions (architecture decision records, ADRs)", and paths and API names stay. The vision's feature G ("an ADR page") is the Decisions page. [Wave 3](wave-03-reference-and-adrs.md), Wave 11 and the vision file are updated.

#### ★Q3.5 Attachments: links, or files too?

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

**Your thinking:** Options 1 and 2, but also allow users to just reference another file on their local machine, so they don't need duplicates.

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

#### Q3.6 A "Compliance" section in decisions

**Proposed.** The book's ADR template has a Compliance section: how the decision is checked, by hand or by an automated test (notes `fundamentals…md:386`). In dp it would be an optional section that can name a rule from Wave 8.

**Recommended.** Yes.

**Your thinking:**

### Wave 4: Roles, data and variants

#### ★Q4.1 CRUD letters on data access

**Analysis** [Fact]
- Data access on a line is "read" or "write" today (`src/shared/types.ts:259-262`; `cleanAccess`, `src/core/modelEdits.ts:1320-1330`).
- A hub flags data that several projects write (`src/core/catalog.ts:139-144`).

**Proposed**
- Access becomes letters: C, R, U and D.
- Old files stay valid:
  - read becomes R;
  - write becomes W, meaning "changes it; the letters aren't chosen yet". W counts as a writer until someone picks C, U or D.
- dp writes both the letters and the old read/write value, so an older dp still reads the file correctly.
- "Several writers" counts C, U, D and W.

**Recommended.** Yes.

**Your thinking:** W should change to C U D right now. CRUD choosing works.

**Applied [2026-11-20].** No `W`. An old `write` is read as C, U and D from the start, and the person narrows it by choosing letters; an old `read` is R. An untouched file is not rewritten (it stays byte-identical); once an entry is saved, dp writes the letters and the old read/write value so an older dp still reads it. **Trade-off:** until someone narrows it, an old write shows all three letters, so the matrix over-reports deletes and the check 'data nobody creates' cannot fire for that data. The matrix marks such cells 'legacy write, not yet narrowed'. [Wave 4](wave-04-roles-data-variants.md) is updated.

#### ★Q4.2 People as roles, and "can reach"

**Analysis** [Fact]
- A C4 person is a plain element with no role field (`src/core/workspace.ts:15`).
- The Data section is hidden for people (`ui/src/panels/ElementPanel.tsx:106`).
- Access is recorded per line.

**Proposed**
- **A role is a C4 person.**
- **A matrix page:**
  - rows are people; a second tab shows containers;
  - columns are data, grouped by the element that holds it.
- **Each cell shows two things:**
  - the letters set explicitly on the person's own line;
  - greyed out, the letters the person **can reach** through the containers they use. For person → web app → database, these are the web app's letters. They are computed, and they say what the path allows, not what the role is allowed to do.
- **Checks:**
  - sensitive data a person can delete;
  - data nobody creates;
  - access to data neither end holds (this exists today).

**Open:** do you also want "allowed" (a policy you set) beside "does" (what the path allows)? That would be a second set of letters per person.

**Recommended.** Yes to the proposal; no policy letters for now.

**Your thinking:** Go with your best thinking.

**Applied [2026-11-20].** As proposed: a role is a C4 person; a matrix page with the letters set on the person's own lines and, greyed, the letters they can reach through the containers they use; the three checks as `dp check` warnings. No policy letters ('allowed'): a second set of letters per person would be a second thing to keep true, and the model can say what a path permits, not what a role may do. Answering Q4.1 to Q4.3 is read as keeping the data half of Wave 4 (scope review P4 is marked keep; overrule it there if that is wrong).

#### Q4.3 dp's own roles

**Recommended.** A table in the help card, generated from `src/server/auth.ts`, showing what Architect, Engineer and Viewer can see and do. Nothing more.

**Your thinking:** Yes.

**Applied [2026-11-20].** A table in the help card, generated from `src/server/auth.ts`: what Architect, Engineer and Viewer can see and do.

#### ★Q4.4 A/B variants as separate flows?

**Analysis** [Fact]
- Flows are linear, and dp renumbers them on every save (`flows.ts:171-205`).
- Structurizr's dynamic views have no branch.

**Options**
1. **Each variant is its own flow.** Variant flows are grouped by a shared key and labelled "A", "B" or "control". The flow player shows them as tabs and marks the steps that differ.
2. **Branches inside one flow.** This needs a new step format, which Structurizr's own tools would show as a flat list. It also needs protecting from renumbering.

**Recommended.** Option 1.

**Your thinking:** Option 1.

**Applied [2026-11-20].** Each variant is its own flow. Variants share a key, are labelled A, B or control, and show as tabs in the flow player with the differing steps marked.

#### Q4.5 Conditions on lines

**Proposed.** An optional condition on a line: a flag and a value, or free text ("checkout-v2 = on", "10% of users"). It shows as a chip on the line, and a diagram filter shows or hides conditional lines.

**Recommended.** Yes.

**Your thinking:** Yes.

**Applied [2026-11-20].** An optional condition on a line, shown as a chip, with a diagram filter.

#### Q4.6 Canary and blue/green

**Recommended.** Wait for deployment diagrams (see ★A2).

**Your thinking:** Go with your best thinking.

**Applied [2026-11-20].** Wait for deployment diagrams, which are infrastructure and not scheduled before 1.0.0 (scope review P1). Until then a canary or blue/green split is modelled with the condition on a line (Q4.5) and a note.

### Wave 5: Code search and key code (the questions below were asked about code facts)

#### ★Q5.1 How should dp read code?

**Analysis** [Fact]
- dp reads code with small hand-written tokenizers and regular expressions, and has no parser dependency (`src/core/codeMap.ts:98-232`, `package.json:39-43`).
- JS and TS imports come from one regular expression over the raw text (`codeMap.ts:36`, `:245`). So commented-out imports count, and dynamic imports are missed.

**Options**
1. **A tokenizer per language.** No dependency and the same result every time, but unusual syntax is missed.
2. **tree-sitter grammars compiled to WebAssembly.** Real syntax trees for many languages, called from TypeScript. It adds a dependency and a few MB to the package [Training].
3. **Reports from each language's own tools.**

**Recommended.** Option 1, including a JS/TS tokenizer that drops comments and strings, as the Python one does. Every approximate result is labelled. Revisit option 2 if Wave 7's complexity and LCOM numbers need it.

**Your thinking:** Remove non-LLM reading of code. It can search and show you specific searches like if I search the name of a function in BMO offline (no-LLM) it'll show me the file for it. Much more simple for no-LLM code reading

**Applied [2026-11-20].** **Revised later the same day (see Q5.8).** The first reading was 'dp reads no language at all'; your follow-up says regexes generalised to the major languages are wanted. Final: remove the per-language readers (tokenizers and resolvers) and replace them with **one generic regex reader**, a table of patterns for the major languages run the same way on every code file, with every result labelled approximate. Plain-text search comes first (offline BMO `where <name>`, `dp find <name> --code`), shows files and lines, and marks hits that look like a definition. Recorded as DEC-096. [Wave 5](wave-05-code-search.md) is rewritten as 'Code search, key code and one generic code reader'.

#### ★Q5.2 Which languages after Java?

**Recommended**
- Java now, with Kotlin imports in the same pass; they use the same syntax.
- Go next: `go.mod` is already read (`src/import/scan.ts:431-452`).
- C# later.

This depends on who dp is for (★A1).

**Your thinking:** The above should be applicable to any programming language, nothing should be programming language specific.

**Applied [2026-11-20].** 'Any programming language' is met by one pattern table for the major languages (Python, JavaScript and TypeScript, Java, Kotlin, Scala, C#, Go, Rust, C and C++, Ruby, PHP, Swift) and no module, file or branch per language. A language that is not in the table still gets search. Adding a language means adding patterns and a test string. The earlier 'Java now, Go next, C# later' becomes 'all of those at once, approximately'.

#### Q5.3 Java builds

**Proposed**
- **Maven:** `pom.xml` modules, packaging and dependencies.
- **Gradle:** `settings.gradle` includes, and dependencies in their common forms. Gradle files are code, so only the common forms can be read.
- **Container candidates:** a module with an entry point (a `main` method or a Spring Boot application class), or one packaged as a war.
- **Two approximations, labelled:**
  - classes in the same package need no import, so those lines come from same-package names;
  - a wildcard import gives a line to the whole package.

**Recommended.** Yes.

**Your thinking:** Do we still need Java builds/sample code with the above in mind? (asked once for Q5.3 and Q5.4)

**Applied [2026-11-20].** No Maven or Gradle reading for now: they are build manifests, not source code, and your later answer was about reading code with regexes. Java source is read by the generic reader. Say so if you want `pom.xml` and Gradle files read as well; that would be a small manifest reader like the one for `package.json`.

#### ★Q5.4 Java sample code

**Analysis** [Fact]
- CLAUDE.md says: "Everything is TypeScript. Do not add Python or other-language code."
- The demo already has Python sample code (`demo/sample_code/api`, `pipeline`). It is data that gets scanned, not dp code.
- CI has no Java runtime, and the demo system's services are TypeScript (DEC-077).

**Options**
1. Java only as test fixtures.
2. Also a small Java service in `demo/sample_code`, scanned but never run.

**Recommended.** Option 1. Choose option 2 if you want the demo to show Java.

**Your thinking:** (Answered with Q5.3: do we still need Java sample code?)

**Applied [2026-11-20].** No Java sample code and no Java fixtures, and CLAUDE.md's 'everything is TypeScript' needs no exception. Tests write small plain-text fixtures from strings into a temporary folder, in no particular language.

#### ★Q5.5 How `tools.py` and other shared helpers are treated

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

**Your thinking:** Since I no longer care about how the code specific things work, i dont think we should be mapping tools.py and such. I only want to see the main files and functions related to a C3 object with that in mind (asked once for Q5.5, Q5.6 and Q5.7)

**Applied [2026-11-20].** The shared-helper rule (folder names, N = 3, intake overrides), the file roles and the badges are dropped. A component instead shows **key code**: its main files and functions, stored as `dp.code.key`. A person pins them (from a search result or the file picker); dp checks each file still exists and holds the name; dp offers hints without an LLM (a file named like the component, mentioned by several of its files, the longest); BMO can propose entries, and dp verifies the path and the name before they can be pinned. `tools.py` is a code file like any other: no box, no role, and no special line. If it matters to a component, someone pins it.

#### Q5.6 Config files as evidence

**Recommended**
- Keep names and hosts only, passed through the same redaction as BMO (`src/assistant/redact.ts`). Never keep values.
- `.env` and `.github/` stay closed (DEC-031).
- This covers Java's `application.yml` and `.properties` files, and Python settings modules.

**Your thinking:** (Answered with Q5.5.)

**Applied [2026-11-20].** Config facts are dropped with the language readers. The scan's existing reading of env samples and compose stays as it is; `.env` and `.github/` stay closed (DEC-031).

#### Q5.7 Content hashes

**Analysis** [Fact]
- `evidence.json` stores file sizes, not hashes (`scan.ts:932`). An edit that keeps a file's size is invisible.
- `evidence.json` is committed.

**Options**
1. Hashes in `evidence.json`. Every edit changes it, which makes noisy diffs.
2. Hashes in a git-ignored `.dp/cache/`. Fine on one machine, but CI can't say what changed since a given point.

**Recommended.** Option 2. Wave 13 stores the contract fingerprints it needs in the model instead.

**Your thinking:** (Answered with Q5.5.)

**Applied [2026-11-20].** No content-hash cache in Wave 5: search needs none. Wave 14 hashes what it indexes, and Wave 13 computes a fingerprint from a small JSON file when asked.

#### ★Q5.8 What happens to the code reading that is already built?

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

**Your thinking:** Remove the non-LLM reading of code, just do the regex expressions and things can be generalized to all types of major coding languages

**Applied [2026-11-20].** Option 2 in spirit, with a replacement. The per-language tokenizers, resolvers and function lookup (Python, JS/TS) are removed. **One generic regex reader** (a pattern table plus one engine, no code per language) takes over `scanImports` and `findFunctions`, so the code diagram, the scan's component lines, the unmapped-code warning and the coding plan's import check keep working and now cover the major languages, not only Python and JS/TS. Everything it returns is approximate and says so. The demo's results may change slightly; step 1 of Wave 5 records the old results as a baseline, step 6 lists every difference, and the demo is regenerated. **Trade-off:** regexes without a tokenizer can read a commented-out or string-embedded import as real (a generic comment cut helps but is not exact), and the resolver matches a specifier to files by path, so two files with the same path tail are ambiguous (dp draws no line then, and says so). The old Python tokenizer was exact for Python; that exactness is traded for breadth. [Wave 5](wave-05-code-search.md) part C.

### Wave 6: Findings and acknowledgements (drift parked)

#### ★Q6.1 Acknowledgements as model data

**Analysis.** See ★A5.

**Recommended.** Yes: `dp.acks` on the object the finding is about.

**Your thinking:** (Answered by A5: yes.) Wave 6: Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** Kept: `dp.acks` stay model data. [Wave 6](wave-06-findings.md) is now 'Findings and acknowledgements'.

#### ★Q6.2 Three outcomes: found, not found, not checkable

**Analysis** [Fact]
- Imports show the lines between components that run in one process.
- Most lines between containers (HTTP, queues) don't appear in imports.
- dp reads hosts only from env samples and compose (`scan.ts:919-925`).

**Proposed.** Every drift check answers found, not found or not checkable, and says why. For example, an HTTP line between containers with no host in config is "not checkable", never "missing".

**Recommended.** Yes.

**Your thinking:** Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** The three outcomes (found, not found, not checkable) stay in the Finding shape for the later waves. Wave 6's own checks are the warnings dp already makes, so they are always 'found'.

#### Q6.3 What drift compares against

**Recommended.** A fresh scan of the working tree by default. `--ref <git ref>` compares against a branch instead, using the existing git reader.

**Your thinking:** Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** Not built. Kept in future_tasks 2.2 for your review.

#### ★Q6.4 How drift is fixed

**Proposed**
- **"Update the model from code"** writes an ordinary import file from the findings you pick.
- **It reuses the import path.** The file goes through the existing checks, importer and review, so scan facts make those items "verified" by themselves (DEC-051, DEC-064). There is no second way into a draft.
- **Names come from the code** (service and folder names). Placeholders are flagged.
- **BMO can be asked to name and describe** the new objects, labelled as proposed.

**Recommended.** Yes.

**Your thinking:** Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** Not built. 'Update the model from code' is kept in future_tasks 2.2 as part of the drift design.

#### Q6.5 Drift in CI

**Recommended.** `dp drift --fail-on new` exits 1 only for findings that aren't acknowledged. A CI example goes in `demo/ci-examples/`.

**Your thinking:** Push architecture drift to future_tasks.md for me to review later.

**Applied [2026-11-20].** Not built. `dp drift` and its CI example are in future_tasks 2.2.

### Wave 7: Model metrics (the questions below were asked about code metrics)

#### ★Q7.1 Which metrics are computed, approximate or imported?

**Analysis** [Fact]
- **No metric is computed today.**
- **The raw material exists:**
  - the file import graph (`codeMap.ts:235-249`);
  - the folder graph (`scan.ts:966-975`);
  - line counts (`codeMap.ts:251-256`);
  - rough function ranges (`codeMap.ts:484-523`).
- **What the book says** (notes `fundamentals…md:50-55`, `:102`):
  - instability I = Ce ÷ (Ca + Ce);
  - abstractness A, and distance D = |A + I − 1|;
  - LCOM measures structural cohesion, not logical cohesion;
  - complexity: the industry norm is below 10; the authors prefer below 5.

**Per metric**
- **Ca, Ce, I and cycles: computed** from imports. They are exact for what the import graph sees, with a coverage note such as "JS/TS: relative imports only".
- **A and D:** computed where a language has abstract types (Java, and TypeScript interfaces and abstract classes). Approximate for Python ABCs and Protocols.
- **Complexity: approximate.** Decision points per function, counted from tokens the way common tools count them [Training]. Tested on fixtures with known values.
- **LCOM4: approximate.** It counts groups of methods linked by the fields they share, read from tokens. Java fields used without `this.` are a known miss.
  - The alternative is importing it from a Java metrics report where a team has one.
  - Few tools report LCOM for Python or TypeScript [Training].

**Recommended.** Compute Ca, Ce, I, cycles, A and D. Compute complexity and LCOM4 as approximate, with labels. Import from reports later, if teams have them.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** Changed by Q5.1 and Q5.2. Ca, Ce, instability and cycles are **computed from the model's own lines**, per level, so they work for any language. LCOM, complexity, abstractness and distance need a per-language parser, so they are not built; importing a report from a tool that already measures them is an idea (future_tasks 2.5). [Wave 7](wave-07-metrics.md) is rewritten as 'Model metrics'.

#### Q7.2 Where metrics show

**Recommended.**
- A "Code metrics" section in the panel.
- An overlay.
- `dp metrics --json|--csv`.

A chart of abstractness against instability (the "main sequence") comes later.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended, renamed 'Coupling': a panel section, an overlay and `dp metrics --json|--csv`.

#### Q7.3 Speed on large repositories

**Recommended**
- Heavy work runs in the CLI or a worker thread, with a cache. It never runs inside a web request.
- A test on a generated repository of 20,000 files.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** No worker thread, cache or 20,000-file test: the work is linear in the model, which is small. A test with a generated model of 5,000 elements and 20,000 lines under a written time budget replaces them.

#### Q7.4 Thresholds

**Recommended.** Thresholds are sidecar settings:
- complexity warns at 10;
- D warns at 0.7 [Proposal];
- cycles are always reported.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** Thresholds move to Wave 8's rules as rule parameters, so the limits live in one place. The complexity and distance thresholds are gone with those metrics.

### Wave 8: Rules and presets

#### ★Q8.1 Can a rule ever block a save?

**Analysis** [Fact]. Model errors block any save that adds an error (`src/core/validate.ts:28-39`, `src/core/project.ts:169-170`).

**Recommended.** No. Rules make findings for the UI and `dp check` only. CI fails through `dp check --strict` or `--fail-on`.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: rules never block a save.

#### ★Q8.2 Move the checklist's rules into the registry?

**Analysis** [Fact]
- 16 checklist rules exist as code (`src/core/checklistRules.ts:65-168`).
- DEC-084 says those rules are fixed and can only be skipped.

**Recommended.** Yes. One registry with the same ids, so checklist items keep working. This amends DEC-084 in a new DEC.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: the checklist's 16 rules move into one registry with the same ids, and a new DEC amends DEC-084.

#### ★Q8.3 Presets, and which are on by default

**Proposed.** Rule packs, written in code:

| Preset | Rules |
|---|---|
| **C4 basics** | Descriptions, technology, labels that aren't "Uses", no mixed levels (from the C4 checklist ideas, future_tasks 2.2) |
| **Structure** | Cycles, layers by tag group, caps on dependencies |
| **Data** | Several writers, a shared database, paths to sensitive data |
| **Microservices** | A shared database, chatty pairs, long synchronous chains, too many services |
| **Event-driven** | Event loops, topics nobody reads |
| **Security basics** | External-facing containers, sensitive data on technology tagged unencrypted |

The sidecar holds which presets are on, plus the severity and settings of each rule.

**Recommended.** C4 basics on by default; the others opt-in.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: C4 basics on by default, the others opt-in. The 'zone of pain or uselessness' detector is gone (it needs abstractness). The Data and Security basics presets touch data and infrastructure, which the scope review may move out.

#### ★Q8.4 Silencing a finding

**Recommended.** Silencing means acknowledging the finding with a reason (★A5).
- Anyone who may edit the model can do it. Engineers do it in drafts.
- `dp check` output counts acknowledged findings, for example "3 acknowledged".

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: silencing is acknowledging with a reason; `dp check` counts acknowledged findings.

#### Q8.5 Heuristic detectors

**Recommended.** Shown as hints only, for example:
- names that look like the Entity Trap;
- "architecture by implication": containers with no decision.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: heuristic detectors show as hints only.

#### Q8.6 Style templates

**Analysis.** Style templates would be starter models for a style, such as "layered" or "microservices".

**Recommended.** Later (future_tasks).

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: style templates later (future_tasks).

### Wave 9: Characteristics table

#### ★Q9.1 Scale and scope

**Analysis** [Fact]
- Ratings are whole stars 1–5 per element, with a "driving" flag and a note (`src/core/modelEdits.ts:533-553`).
- There is no target.
- People and lines have no ratings.

**Proposed**
- Add "needed" stars beside "current", per element.
- A container without its own target shows its system's, labelled "from the system".
- Gap = needed − current.
- Ratings on lines and flows come later (future_tasks 1.4).

**Recommended.** Yes.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: needed stars beside current, per element, with inheritance from the system.

#### Q9.2 Expected impact in decisions

**Proposed.** A decision can say what it should do to characteristics, for example `impacts: [scalability:+1, simplicity:-1]`. The table shows that expected change beside the draft's real ratings.

**Recommended.** Yes.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: a decision can state its expected impact on characteristics.

#### Q9.3 Hints from metrics

**Recommended.** Hints only. For example, modularity from D and cycles, or testability from a coverage report. Hints never set stars.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended, with the source changed: hints come from the model's cycles and instability (Wave 7), not from distance. Hints never set stars.

#### Q9.4 More than seven driving characteristics

**Recommended.** A warning. The book suggests about seven (notes `fundamentals…md:89`).

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: more than seven driving characteristics gives a warning.

#### Q9.5 Older versions of dp

**Analysis** [Fact]. An older dp drops the new "needed" value when it saves, because it drops keys it doesn't know.

**Recommended.** Accept it and say so in the CHANGELOG. A team should upgrade together.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: accept it and say so in the CHANGELOG.

### Wave 10: Risk and risk storming

#### ★Q10.1 Where risks live

**Analysis** [Fact]
- Trade-offs already have a "risk" kind (`src/core/modelEdits.ts:184`).
- The demo has a "Risk" tag group, and a lens whose default overlay is "Risk" (`demo/designperspectives.json:5`, `:82`).

**Options**
1. **`dp.risks` per object.**
   - Each risk holds: characteristic, impact 1–3, likelihood 1–3, mitigation, owner, status, links.
   - Project-wide risks sit on the workspace.
   - The trade-off risks move over.
2. **A separate risks file, like decisions.** This breaks the `dp.*` rule and duplicates the trade-off risks.

**Recommended.** Option 1.
- The Risk overlay is computed from the risks: the highest score per box.
- The Risk tag group stays, for models that use it by hand.

**Your thinking:** Risk and Risk Storming has been pushed to future_tasks.md so no need to implement it in this waves situation.

**Applied [2026-11-20].** Parked (as in A7 and C6b). The recommendation is kept for when the wave returns.

#### Q10.2 Scale

**Recommended.** 3×3, as in the book (notes `fundamentals…md:404-405`):
- rate impact first;
- an unknown likelihood counts as 3;
- 1–2 is low, 3–4 medium, 6–9 high;
- show shading as well as colour.

**Your thinking:** (Wave 10 is pushed to future_tasks.md.)

**Applied [2026-11-20].** Parked.

#### ★Q10.3 Private scores in risk storming

**Analysis** [Fact]. Sign-in is optional (DEC-041). Without it, dp can't tell people apart.

**Proposed**
- **One session per characteristic.**
- **Each signed-in participant scores privately.**
  - Scores are kept in `.dp/`, not in git.
  - Nobody sees them before the reveal, architects included.
- **The reveal** shows the spread and the disagreements.
- **The agreed score becomes the risk,** and the private scores are deleted.
- **Without sign-in,** a session runs on one machine, with people taking turns. Scores are then hidden on trust only.

**Recommended.** Yes.

**Your thinking:** (Wave 10 is pushed to future_tasks.md.)

**Applied [2026-11-20].** Parked.

#### Q10.4 The grid's columns

**Recommended.** Containers for now. The book prefers domains, and groups come later (future_tasks 2.1).

**Your thinking:** (Wave 10 is pushed to future_tasks.md.)

**Applied [2026-11-20].** Parked.

### Wave 11: BMO reviews

#### ★Q11.1 The anti-pattern review needs a scope

**Analysis** [Fact]
- A run over the size limit is refused.
- There is no multi-pass yet (DEC-065).

**Proposed**
- **You pick entries from the library.** Entries marked "check by default" are pre-selected.
- **You pick a scope:** a diagram, a selection, a container or a draft.
- **The run uses Wave 1's fixed template and citations.**
- **Each entry gets a result:** "present", "possible", "not found" or "can't tell", with cited evidence.
- **dp's own findings are shown beside it,** and any disagreement is pointed out.

**Recommended.** Yes.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended. The pack now holds the scope's key code and Wave 7's coupling instead of drift.

#### ★Q11.2 Where the results go

**Recommended.** They show in a sheet. Nothing is written unless you press one of these actions:
- add as a risk;
- add as a checklist item;
- add as linked work;
- add as a comment.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended, without 'add as a risk' (Wave 10 is parked).

#### Q11.3 Proposed ratings and suggested risks

**Recommended.** Accepted row by row, and labelled "proposed by BMO" until then.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: ratings accepted row by row, labelled 'proposed by BMO' until then. Suggested risks wait for Wave 10.

### Wave 12: Runtime

#### ★Q12.1 Where telemetry comes from

**Analysis** [Fact]. Today dp reads two sources:
- trace files (OTLP JSON) from a folder, keeping the newest 2,000 traces (`src/core/traces.ts:31-32`);
- System Testing's run log: 200 calls, in memory only (`src/server/testSession.ts:44-50`).

**Recommended.** These two only. A live collector (OTLP over HTTP) stays in future_tasks 2.7.

**Your thinking:** Go with what you think is best. (Wave 12 is parked.)

**Applied [2026-11-20].** Parked. The recommendation is kept for when the wave returns.

#### Q12.2 Thresholds

**Recommended.** Rule settings in the registry:
- repeated calls in one trace (N+1);
- chain depth;
- fan-out.

**Your thinking:** Go with what you think is best. (Wave 12 is parked.)

**Applied [2026-11-20].** Parked.

#### Q12.3 Variants from telemetry

**Recommended.** Read span events that carry the feature-flag attributes now (see 0.1). Read OTLP log files later.

**Your thinking:** Go with what you think is best. (Wave 12 is parked.)

**Applied [2026-11-20].** Parked.

### Wave 13: Contracts and consumer notifications

#### ★Q13.1 Which contract formats first?

**Analysis** [Fact]
- No schema exists today:
  - `dp.endpoints` is a method and a path (`src/shared/types.ts:445-448`);
  - `dp.example` is a sample.
- There is no YAML library; the scan reads YAML line by line.

**Options**
- OpenAPI and JSON Schema in JSON first.
- YAML through a new dependency.
- AsyncAPI and protobuf later.
- As a weak fallback, the top-level shape of the samples (`ui/src/inspect/SamplePayload.tsx:26-33`).

**Recommended.** JSON first, and ask you before adding a YAML dependency. Are your OpenAPI files YAML?

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** JSON only (OpenAPI and JSON Schema); no YAML dependency in this wave, so the server keeps three runtime dependencies. **Trade-off:** most real OpenAPI files are YAML, so those teams export to JSON in CI first. Reading YAML directly is a line in future_tasks 2.1, and the dependency is then your decision. The earlier question 'are your OpenAPI files YAML?' no longer blocks the wave.

#### ★Q13.2 What "the output of service A" means

**Proposed.** A's output is three things:
1. **The responses of A's endpoints,** read by the callers.
2. **The messages A publishes,** read by whoever reads the topic, through the broker (DEC-065 `via`).
3. **The data A writes,** read by its readers (DEC-055).

So dp finds who is affected through endpoints and data, not through which way a line points.

Requests and responses break in opposite ways:
- a new required request field breaks callers;
- a removed response field breaks readers.

**Recommended.** Yes.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: a service's output is its endpoint responses, the messages it publishes and the data it writes.

#### ★Q13.3 How a consumer marks a change as checked

**Proposed**
- The consumer's line stores the fingerprint it has checked (`dp.contract.seen`).
- When the current fingerprint differs, the consumer "needs a look".
- "Mark as checked" is an ordinary model edit: engineers make it in drafts, architects on main.

**Recommended.** Yes.

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: the consumer's line stores the fingerprint it has checked (`dp.contract.seen`).

#### Q13.4 How people are told

**Recommended**
- A computed "needs a look" item, on the home page and in the bell's "Now".
- A badge on the consumer.
- Optional linked work on the consumer (DEC-085).
- `dp contracts --fail-on breaking` in CI.
- No email, chat or webhooks: the bell keeps no stored list per person (DEC-080).

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: a computed 'needs a look' item, a badge, optional linked work and `dp contracts --fail-on breaking`. No email or webhooks.

#### Q13.5 Breaking changes

**Recommended.** For JSON Schema and OpenAPI, dp computes these:
- a removed field;
- a type change;
- a new required request field;
- a removed endpoint.

Anything else is "changed, impact unknown".

**Your thinking:** Go with what you think is best.

**Applied [2026-11-20].** As recommended: removed fields, type changes, new required request fields and removed endpoints; anything else is 'changed, impact unknown'.

### Wave 14: Retrieval and local models

#### ★Q14.1 The gate

**Recommended.** Build this wave only if Wave 1's evaluation shows BMO missing context it needed, or if you say go.

**Your thinking:** Answered by 0.4 and 0.5: go, for local runtimes and the word index. No gate.

#### ★Q14.2 A vector DB, or a flat index?

**Recommended.** A flat index in `.dp/index/`, with no database server (see 0.5).

**Your thinking:** Answered by 0.5: only the word index. No vector file at all for now. The word index still lives in `.dp/index/`, with no database server.

#### ★Q14.3 Embeddings

**Recommended.** Local only (Ollama). Cloud embeddings would send the whole index past the preview.

**Your thinking:** Answered by 0.5: no embeddings, local or cloud, in this wave.

#### ★Q14.4 GPU

**Recommended.** No CUDA or MPS code in dp. Instead (see 0.4):
- local model servers;
- the GPU share as Ollama reports it;
- bounded runtime settings;
- setup notes.

**Your thinking:** Answered by 0.4: make local runtimes first-class, as recommended.

#### Q14.5 Word index first

**Recommended.** BM25 first. Add embeddings on top only if the evaluation shows they help.

**Your thinking:** Answered by 0.5: BM25 only. Embeddings are not planned.

### Wave 15: Guided import interview

*New: it comes from your answer to 0.3. These have recommendations and none changes the direction you set.*

#### ★Q15.1 One interview, or one per level?

**Analysis.** DEC-051 brings a codebase in one C4 level at a time, with a draft per level. Your answer asks for one flow with "x of y" questions.

**Options**
1. **One interview, a draft per level.** Steps 1 and 2 are asked once. Then each level is answered and imported on its own, so the model stays reviewable (DEC-051). "x of y" counts the current level, with the later levels listed as "still to come".
2. **One interview, one draft.** Faster to click through, but one very large draft to review.

**Recommended.** Option 1.

**Your thinking:** The interview should be dependent on the codebase. Tend to lean towards more questions than less. Definitely need at least a few questions per interview.

**Applied [2026-11-20].** Questions come from what the scan finds, so a codebase with a broker gets broker questions and one without gets none. When a fact could be asked or assumed, dp asks, and dp asks about every object it would create. **A floor of 6 questions per level's interview**: if the scan yields fewer, dp fills up from a fixed bank of standing questions (at least 8 per level, worded in code, never generated), and the screen says it did. The wording of the bank is added to future_tasks 1.5 for your review. I kept 'one interview, a draft per level' (option 1), reading 'per interview' that way and because DEC-051 wants one level at a time. [Wave 15](wave-15-guided-import-interview.md) is updated.

#### ★Q15.2 Is a click in the interview the final accept?

**Analysis.** Today an unverified item needs an explicit accept in the review (`review.ts:754`). If the user has already approved the card, asking again is noise; but a card approved quickly with "Approve all" is a weaker check than the review.

**Options**
1. **The card approval is the accept** and is recorded with who made it. The review screen still shows every item and its level.
2. **The interview only proposes.** Everything is reviewed again afterwards.

**Recommended.** Option 1, but "Approve all of these" never covers items the scan could not back with evidence. Those need their own click.

**Your thinking:** Yes it is final accept, but users can also add some additional context as a free-form text or reference local files.

**Applied [2026-11-20].** The card approval is the final accept (a group's 'Approve all of these' still never covers items the scan could not back with evidence). Beside it: a **note on each card** (typed text, which can back that item as evidence), **general context** in a free-text box, and **file references**. A file inside the code root is read through the file gate (text only, redacted) and can go to BMO as data; a file elsewhere on the computer is kept as a path only, never read or sent (the `local:` kind of Q3.5, DEC-095).

#### Q15.3 Where the answers live

**Recommended.** `architecture/import/interview.json`, next to the intake, outside the model and with a fixed key order. BMO's questions stay in the checklist and appear in the interview as one group.

**Your thinking:** Save the answers to the questions locally, go with your best thinking

**Applied [2026-11-20].** Everything goes in `architecture/import/interview.json`, committed with the intake: the answers, the card notes, the general context and the file references (your 'include it as well'; the earlier split with a git-ignored file is dropped). Nothing is sent anywhere. **Because it is committed,** dp refuses to save a context text that contains a secret-looking value (as a decision does, DEC-064), and the screen says 'saved in the project and committed with it'. A file outside the code root is kept as a path, written with `~/` where possible, so a user name does not end up in git.

#### Q15.4 Where it sits on the Import page

**Recommended.** A "Guide me" button at the top that opens the interview full width. The current sections (scan, readiness, bring in a level, labels) stay under "Advanced" for people who want the manual route and for the handoff file.

**Your thinking:** Go with your best decisions

**Applied [2026-11-20].** As recommended: a 'Guide me' button at the top of the Import page; the current sections stay under 'Advanced' for the manual route and the handoff file.

#### Q15.5 BMO's part

**Recommended.** Build 15a first: the interview and the draft without BMO. Then 15b: BMO adds name, description and label cards marked "BMO suggests", never pre-approved, and BMO's own questions appear last.

**Your thinking:** Go with your best decisions

**Applied [2026-11-20].** As recommended: 15a (the interview and the draft without BMO) first, then 15b (BMO adds name, description and label cards marked 'BMO suggests', never pre-approved; BMO's own questions last).

---

## Part C. Questions from the product vision

*New on 2026-11-19. They come from your twelve features and the non-goal. Each has a recommendation; a blank uses it.*

#### ★C1. What are "git-style commits for software architecture"?

**Analysis** [Fact]
- dp reads git and never writes it (DEC-018). The History page lists the commits that changed a model and what each changed (DEC-058, `src/core/history.ts`). `dp diff --base <ref>` summarises changes since a ref.
- A draft is a copy of the model (like a branch). Applying it is a three-way merge and one undo step on main (DEC-016, DEC-032). A draft records its author (DEC-040).
- So today: branches (drafts), diff, merge (apply) and log (History) exist. A commit with a message, made by dp, does not. Making one means changing DEC-018.

**Options**
1. **Keep git read-only.** History stays as built. Add a suggested commit message from the change list, so a person commits with git themselves. Nothing in DEC-018 changes.
2. **Commit on apply, opt-in.** An architect can switch on "commit when a draft is applied". dp commits only `architecture/` with a message built from the draft's title and description, never pushes, never touches other files. Off by default.
3. **dp's own commit log, separate from git.** A message, an author and a date kept in the model, with revert. This duplicates git and drifts from it.

**Recommended.** Option 2. It makes "draft → apply" read as "branch → commit" without a second history. It needs a DEC that amends DEC-018, a check that the working tree has no other staged changes, and a refusal when git is missing or the folder is not a repository. If you want git to stay read-only, take option 1.

**Your thinking:** Yes.

**Applied [2026-11-19].** Option 2. New [Wave 17](wave-17-architecture-commits.md): an opt-in "commit when a draft is applied", plus a manual Commit button and `dp commit`. dp commits only `architecture/`, never pushes, amends or skips hooks. DEC-091 amends DEC-018.

#### ★C2. Which gaps in the change-proposal feature (C) go into 1.0.0?

**Analysis** [Fact]. [future_tasks.md](../future_tasks.md) 1.2 lists what drafts cannot do yet:
- rebase a draft onto a main that has moved, and a merge editor for conflicts (today a conflict is reported only when the draft is applied) [Medium];
- undo of an apply restores the model but not the code files it wrote nor the deleted draft [Small–medium];
- compare a draft's planned code edits with the code as it was when the draft started [Medium].

With several accounts working in drafts (feature E), the first is the one people meet.

**Options.** Pick any: (a) rebase and merge editor, (b) undo restores the draft, (c) compare against the code at the start of the draft.

**Recommended.** (a) and (b) in 1.0.0, as a new wave after Wave 4. (c) later.

**Your thinking:** Go with your best decision.

**Applied [2026-11-19].** (a) rebase and merge editor and (b) undo that restores the draft, as recommended, in new [Wave 18](wave-18-drafts-keep-up.md). (c) stays later.

#### ★C3. Which lenses does 1.0.0 ship?

**Analysis** [Fact]
- A lens is a default view: it picks levels, sections and a default overlay, and hides no data (DEC-008, DEC-063). Three ship: Engineer, Architect, Overview (DEC-008, DEC-038).
- Business and Security presets are in the backlog (future_tasks 1.4, small). There is no DevOps lens.

**Proposal.** Ship presets for the roles your vision names. A DevOps lens would show containers and technology, run addresses, endpoints, linked work and contracts, and hide cost and trade-offs. The other presets (Business, Security, and Developer if Engineer is not that) follow the same pattern.

**Options**
1. DevOps only.
2. DevOps, Security and Business.
3. Also Compliance and QA.

**Recommended.** Option 2, in a small wave after Wave 4 (or inside it). Tell me what each role must see first and I will write the presets from that.

**Your thinking:** Go with your best decisions.

**Applied [2026-11-19].** Option 2: DevOps, Security and Business, in new [Wave 19](wave-19-lenses-for-roles.md). I chose the settings (levels, sections, overlay for each); they are a table in that file for you to review.

#### ★C4. Who may attach images and files?

**Analysis.** Attaching writes a file to the repository's disk (see [Wave 16](wave-16-attachments.md)). Comments are open to every role, viewers included (DEC-049). A viewer's text comment is a few kilobytes; a viewer's upload is up to a file cap.

**Options**
1. Whoever may comment may attach to a comment, viewers included. Others attach where they may edit.
2. As option 1, but **not viewers**.
3. Only architects, and engineers inside drafts.

**Recommended.** Option 2, with a per-project size cap.

**Your thinking:** Anyone can attach files, up to 10 MB per file, and files must be stored locally so dp can pull them up directly.

**Applied [2026-11-19].** Option 1, including viewers: every role can attach to a comment; where someone may edit a thing, they attach to it. Files are stored in `architecture/attachments/` and opened through dp's own page (images in the page, PDFs in a tab, text in a dialog, Office files download). See C5.

#### C5. Which file types, and how big?

**Recommended.** Images shown inline: PNG, JPEG, GIF, WebP. Download only: PDF, text, Markdown, CSV, JSON, Office files. SVG, HTML, scripts and archives refused. About 3.5 MB per file, because a file is sent as base64 inside the 5 MB request that also keeps other websites out. Do you need larger files, such as a 20 MB specification PDF? That needs a different upload route and its own security review.

**Your thinking:** (see C5; applied together)

**Applied [2026-11-19].** 10 MB per file instead of 3.5 MB. That cannot go as base64 inside the 5 MB JSON limit, so [Wave 16](wave-16-attachments.md) now uses a raw upload route with its own limit and its own cross-site rule (a custom header that another website cannot send without a preflight, which dp refuses). Other limits: a per-project total (proposal 500 MB) and an upload rate limit, because viewers can now write to disk.

#### ★C6. Two readings of your answers that I want you to confirm

**(a) Notes from every account.** The vision says different accounts add notes to diagrams.
- Today `dp.notes` are model data: architects write them, and engineers write them in a draft. Notes also go into BMO's context when the lens shows them.
- Comments are open to every account, but they are not model data and never reach BMO.
- If every account wrote model notes, text from anyone would flow into BMO's context unreviewed. DEC-064 treats text from outside the architects as data, never as instructions, and a note is exactly that kind of text.

Options: (1) **notes are model data, written by those who edit the model; every other account uses comments** (with images and files from Wave 16); (2) every account writes notes, kept in a side file like comments, never sent to BMO.
**Recommended.** Option 1.

**(b) Pushing risk and telemetry to future_tasks (A7).** I read "push these to future_tasks.md" as parking Wave 10 (risk storming) and Wave 12 (runtime telemetry). Waves 11 and 13 do not depend on Wave 12. Wave 11 loses its risk parts. If you meant only the wider questions, not the first cuts, say so and the two waves return to the plan.
**Recommended.** Keep both parked: neither is among the twelve features, and runtime telemetry is outside the software-architecture line (see [v1-scope-review.md](v1-scope-review.md)).

**Your thinking:** (a) Yes. (b) The owner did not understand the question; it was asked again in plain words, and the answer was: **do not build either for 1.0** (stay parked).

**Later change [2026-11-19].** You then said comments should be reachable by BMO ("everything a person can visualize on screen"). So the reasoning in (a) that kept comments away from BMO no longer holds: comments reach BMO as labelled data (see the follow-up under Q2.2, DEC-094). Who may write what is unchanged: model notes and stickies by those who edit the model, comments by every account.

**Applied [2026-11-19].** (a) Notes are model data, written by those who edit the model; every other account uses comments with images and files. (b) Waves 10 and 12 stay parked in future_tasks; nothing changes from last time.

#### ★C7. How does BMO tell that a decision is "broken or violated"?

**Analysis** [Fact]
- A decision links to elements and relationships it is about, with a status, alternatives and triggers (DEC-050). `decisionsAbout` finds the decisions for an object (`src/core/decisions.ts`).
- Nothing today compares a decision with the model or the code.
- Wave 3 adds an optional Compliance section that can name a rule (Q3.6). Wave 8 adds rules that produce Findings.

**Options**
1. **Computed only.** A decision whose Compliance names a rule shows "possibly violated" when that rule has a finding on one of its targets. No BMO.
2. **BMO only.** BMO reads the accepted decisions in a scope and the model and code, and gives a verdict per decision with citations (present, possible, not found, can't tell), like the anti-pattern review.
3. **Both,** with disagreements pointed out, as Wave 11 already does for anti-patterns.

**Recommended.** Option 3. It is now a task in [Wave 11](wave-11-bmo-reviews.md) (`check-decisions`). A decision with no Compliance rule is checked by BMO only, and labelled as proposed.

**Your thinking:** Yes.

**Applied [2026-11-19].** Option 3: a computed "possibly violated" signal plus BMO's check, disagreements shown. It is the `check-decisions` task in [Wave 11](wave-11-bmo-reviews.md).

#### C8. Does "understanding an existing system" need more than the import and the explain tasks?

**Analysis** [Fact]. The vision's first problem is understanding an existing system. What dp has or plans: the scan and the guided interview build the model (Waves 5, 6, 15); BMO explains an object, a diagram or a draft from the model and code excerpts (Wave 1 makes them cited); `dp context` prints the same pack for coding agents (Wave 2). A run over the token limit is refused, and multi-pass summarising for a whole large repository is not built (DEC-065, future_tasks 1.3, Large).

**Options**
1. As planned: explain one scope at a time.
2. Add a "system tour" task: BMO explains the system from the model first, then walks the containers one by one, each a small cited run.
3. Build multi-pass summarising for whole repositories.

**Recommended.** Option 1 for 1.0.0, then option 2 if real runs show people want one page about the whole system. Option 3 is large and not needed by the twelve features. Note that no real LLM run has been made yet; 1.0.0's checklist should include a real run per provider you support.

**Your thinking:** Have a true back and forth, not just one scope at a time. As code becomes larger or more complex, you can ask more questions to the user. Add this to the checklist.

**Applied [2026-11-19].** A new wave, [Wave 20: a real back-and-forth about an existing system](wave-20-system-conversation.md). dp plans rounds from facts about the system (containers, components, files, cycles, unmapped code); each round is one previewed BMO run on one scope that returns cited statements and questions for the person; the number of questions allowed grows with size and tangle, and the person can ask for more, go deeper or stop; the person's answers carry into later rounds. Nothing is written until a button is pressed. "Add this to the checklist" is applied twice: an item on the in-app "Importing a codebase" list that ticks itself when every round is answered, skipped or ended, and a line on the 1.0.0 release checklist in [../future_tasks.md](../future_tasks.md) 2.0.
