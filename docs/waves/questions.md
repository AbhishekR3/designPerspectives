# Questions for the owner: the waves of 2026-11-17

**How to answer.** Type your thinking under each "Your thinking:" line. ★ marks the questions whose answer changes what gets built. A question you leave blank uses its recommendation. When you're done, tell Claude "apply my answers in docs/waves/questions.md" (see [README.md](README.md)).

**How to read the analysis.** Facts carry a source: a `file:line`, a DEC in [../decisions.md](../decisions.md), a line of the book notes in [../notes/](../notes/), or a web page checked on 2026-11-17. [Proposal] marks our interpretation or recommendation. [Training] marks model knowledge that was not re-checked.

## Contents

- **Part 0. Answers to the questions you asked me**
  - 0.1 A/B tests, feature flags and conditional services in C4
  - 0.2 Config files and shared helpers such as `tools.py`
  - 0.3 Where LLM false positives and negatives appear, by C4 level
  - 0.4 GPU acceleration
  - 0.5 A vector DB
  - 0.6 Better fixed context prompts
- **Part A. Cross-cutting questions:** ★A1 to A10
- **Part B. Questions per wave:** Q1.x to Q14.x

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

**Your thinking (optional):**

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

**Your thinking (optional):**

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

**Your thinking (optional):**

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

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

### A6. How BMO's output is labelled

**Recommended**
- Labels appear in the UI and in review files only, for example: "BMO · model · 5 of 7 statements cited · not checked by a person".
- Nothing is stored as a label in the model (DEC-051, DEC-064).
- Once you accept something, it is yours.

**Your thinking:**

### A7. Items that are in both of your lists

**Analysis.** "Risk analysis" and "anti-patterns through telemetry" appear in both the build list and the think-later list.

**Recommended**
- The waves build a first cut: risk storming in Wave 10, telemetry rules in Wave 12.
- future_tasks.md keeps the wider questions: continuous risk tracking; logs and metrics as well as traces.

**Your thinking:**

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

**Your thinking:**

### A9. Agent models

**Recommended.** As you asked on 2026-11-14:
- Opus for unsettled design, security and merge logic;
- Sonnet for well-specified building;
- Haiku for docs.

Each wave file names the model for each step. Fable is used only if you ask.

**Your thinking:**

### A10. Deleting these planning files

**Recommended**
- `questions.md` is deleted once its answers live in the wave files or DECs.
- Each wave file is deleted when its reviews.md section lands. CLAUDE.md says not to commit superseded plans, and commit 47b33a2 did the same with the earlier questions file.
- The alternative is to keep these files in the git-ignored `local/`.

**Your thinking:**

---

## Part B. Questions per wave

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

**Your thinking:**

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

**Your thinking:**

#### ★Q1.3 Who builds the evaluation set, and who runs it with real models?

**Analysis**
- No LLM is used in development or CI [Owner] (`docs/backlog.md:19`).
- The fake backend gives canned answers (`src/assistant/fakeBackend.ts`).
- Proposed setup:
  - **Fixtures written by hand:** the demo and two small repositories, each with known right answers (the containers, the lines, which statements are true).
  - **CI checks the checkers:** the citation checker and the scorer, run on canned answers.
  - **Real runs by you only:** `dp bmo eval --yes-send`, with the results written into the wave's reviews.md section.

**Recommended.** As proposed. Your thinking could add which providers you will run; each real run costs money.

**Your thinking:**

#### Q1.4 Temperature and seed

**Recommended.** Temperature 0 everywhere, and a seed where the API has one (OpenAI and Ollama do; the Anthropic API has none [Training]). Both go into the run log. dp never claims a run can be repeated exactly.

**Your thinking:**

#### Q1.5 Can BMO cite the repository's own docs?

**Recommended.** Yes. Markdown files under the code root (README, docs, ADRs kept in the repo) can be quoted and cited. They go through the same file gate as code: redaction, must-not-open, and DEC-064.

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

#### Q2.3 What `dp context` prints

**Proposed**
- The command is `dp context <object or diagram> [--for explain|review|code] [--json]`. It prints the same fixed pack BMO would get, without the system text.
- The pack holds the object, its parents and lines, its notes, the decisions about it and its code paths. `--code` adds redacted excerpts.
- It is for coding agents such as Claude Code, and for people. It gives agents the model without building an MCP server (DEC-020).

**Recommended.** Yes, as Markdown, with `--json` as an option.

**Your thinking:**

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

**Your thinking:**

#### Q2.5 Help without an LLM

**Recommended.** Yes. A search box in the help card, and `dp help <words>`, show the matching sections of the docs. BMO writes an answer only when it is set up.

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

#### Q4.3 dp's own roles

**Recommended.** A table in the help card, generated from `src/server/auth.ts`, showing what Architect, Engineer and Viewer can see and do. Nothing more.

**Your thinking:**

#### ★Q4.4 A/B variants as separate flows?

**Analysis** [Fact]
- Flows are linear, and dp renumbers them on every save (`flows.ts:171-205`).
- Structurizr's dynamic views have no branch.

**Options**
1. **Each variant is its own flow.** Variant flows are grouped by a shared key and labelled "A", "B" or "control". The flow player shows them as tabs and marks the steps that differ.
2. **Branches inside one flow.** This needs a new step format, which Structurizr's own tools would show as a flat list. It also needs protecting from renumbering.

**Recommended.** Option 1.

**Your thinking:**

#### Q4.5 Conditions on lines

**Proposed.** An optional condition on a line: a flag and a value, or free text ("checkout-v2 = on", "10% of users"). It shows as a chip on the line, and a diagram filter shows or hides conditional lines.

**Recommended.** Yes.

**Your thinking:**

#### Q4.6 Canary and blue/green

**Recommended.** Wait for deployment diagrams (see ★A2).

**Your thinking:**

### Wave 5: Code facts

#### ★Q5.1 How should dp read code?

**Analysis** [Fact]
- dp reads code with small hand-written tokenizers and regular expressions, and has no parser dependency (`src/core/codeMap.ts:98-232`, `package.json:39-43`).
- JS and TS imports come from one regular expression over the raw text (`codeMap.ts:36`, `:245`). So commented-out imports count, and dynamic imports are missed.

**Options**
1. **A tokenizer per language.** No dependency and the same result every time, but unusual syntax is missed.
2. **tree-sitter grammars compiled to WebAssembly.** Real syntax trees for many languages, called from TypeScript. It adds a dependency and a few MB to the package [Training].
3. **Reports from each language's own tools.**

**Recommended.** Option 1, including a JS/TS tokenizer that drops comments and strings, as the Python one does. Every approximate result is labelled. Revisit option 2 if Wave 7's complexity and LCOM numbers need it.

**Your thinking:**

#### ★Q5.2 Which languages after Java?

**Recommended**
- Java now, with Kotlin imports in the same pass; they use the same syntax.
- Go next: `go.mod` is already read (`src/import/scan.ts:431-452`).
- C# later.

This depends on who dp is for (★A1).

**Your thinking:**

#### Q5.3 Java builds

**Proposed**
- **Maven:** `pom.xml` modules, packaging and dependencies.
- **Gradle:** `settings.gradle` includes, and dependencies in their common forms. Gradle files are code, so only the common forms can be read.
- **Container candidates:** a module with an entry point (a `main` method or a Spring Boot application class), or one packaged as a war.
- **Two approximations, labelled:**
  - classes in the same package need no import, so those lines come from same-package names;
  - a wildcard import gives a line to the whole package.

**Recommended.** Yes.

**Your thinking:**

#### ★Q5.4 Java sample code

**Analysis** [Fact]
- CLAUDE.md says: "Everything is TypeScript. Do not add Python or other-language code."
- The demo already has Python sample code (`demo/sample_code/api`, `pipeline`). It is data that gets scanned, not dp code.
- CI has no Java runtime, and the demo system's services are TypeScript (DEC-077).

**Options**
1. Java only as test fixtures.
2. Also a small Java service in `demo/sample_code`, scanned but never run.

**Recommended.** Option 1. Choose option 2 if you want the demo to show Java.

**Your thinking:**

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

**Your thinking:**

#### Q5.6 Config files as evidence

**Recommended**
- Keep names and hosts only, passed through the same redaction as BMO (`src/assistant/redact.ts`). Never keep values.
- `.env` and `.github/` stay closed (DEC-031).
- This covers Java's `application.yml` and `.properties` files, and Python settings modules.

**Your thinking:**

#### Q5.7 Content hashes

**Analysis** [Fact]
- `evidence.json` stores file sizes, not hashes (`scan.ts:932`). An edit that keeps a file's size is invisible.
- `evidence.json` is committed.

**Options**
1. Hashes in `evidence.json`. Every edit changes it, which makes noisy diffs.
2. Hashes in a git-ignored `.dp/cache/`. Fine on one machine, but CI can't say what changed since a given point.

**Recommended.** Option 2. Wave 13 stores the contract fingerprints it needs in the model instead.

**Your thinking:**

### Wave 6: Drift and findings

#### ★Q6.1 Acknowledgements as model data

**Analysis.** See ★A5.

**Recommended.** Yes: `dp.acks` on the object the finding is about.

**Your thinking:**

#### ★Q6.2 Three outcomes: found, not found, not checkable

**Analysis** [Fact]
- Imports show the lines between components that run in one process.
- Most lines between containers (HTTP, queues) don't appear in imports.
- dp reads hosts only from env samples and compose (`scan.ts:919-925`).

**Proposed.** Every drift check answers found, not found or not checkable, and says why. For example, an HTTP line between containers with no host in config is "not checkable", never "missing".

**Recommended.** Yes.

**Your thinking:**

#### Q6.3 What drift compares against

**Recommended.** A fresh scan of the working tree by default. `--ref <git ref>` compares against a branch instead, using the existing git reader.

**Your thinking:**

#### ★Q6.4 How drift is fixed

**Proposed**
- **"Update the model from code"** writes an ordinary import file from the findings you pick.
- **It reuses the import path.** The file goes through the existing checks, importer and review, so scan facts make those items "verified" by themselves (DEC-051, DEC-064). There is no second way into a draft.
- **Names come from the code** (service and folder names). Placeholders are flagged.
- **BMO can be asked to name and describe** the new objects, labelled as proposed.

**Recommended.** Yes.

**Your thinking:**

#### Q6.5 Drift in CI

**Recommended.** `dp drift --fail-on new` exits 1 only for findings that aren't acknowledged. A CI example goes in `demo/ci-examples/`.

**Your thinking:**

### Wave 7: Metrics

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

**Your thinking:**

#### Q7.2 Where metrics show

**Recommended.**
- A "Code metrics" section in the panel.
- An overlay.
- `dp metrics --json|--csv`.

A chart of abstractness against instability (the "main sequence") comes later.

**Your thinking:**

#### Q7.3 Speed on large repositories

**Recommended**
- Heavy work runs in the CLI or a worker thread, with a cache. It never runs inside a web request.
- A test on a generated repository of 20,000 files.

**Your thinking:**

#### Q7.4 Thresholds

**Recommended.** Thresholds are sidecar settings:
- complexity warns at 10;
- D warns at 0.7 [Proposal];
- cycles are always reported.

**Your thinking:**

### Wave 8: Rules and presets

#### ★Q8.1 Can a rule ever block a save?

**Analysis** [Fact]. Model errors block any save that adds an error (`src/core/validate.ts:28-39`, `src/core/project.ts:169-170`).

**Recommended.** No. Rules make findings for the UI and `dp check` only. CI fails through `dp check --strict` or `--fail-on`.

**Your thinking:**

#### ★Q8.2 Move the checklist's rules into the registry?

**Analysis** [Fact]
- 16 checklist rules exist as code (`src/core/checklistRules.ts:65-168`).
- DEC-084 says those rules are fixed and can only be skipped.

**Recommended.** Yes. One registry with the same ids, so checklist items keep working. This amends DEC-084 in a new DEC.

**Your thinking:**

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

**Your thinking:**

#### ★Q8.4 Silencing a finding

**Recommended.** Silencing means acknowledging the finding with a reason (★A5).
- Anyone who may edit the model can do it. Engineers do it in drafts.
- `dp check` output counts acknowledged findings, for example "3 acknowledged".

**Your thinking:**

#### Q8.5 Heuristic detectors

**Recommended.** Shown as hints only, for example:
- names that look like the Entity Trap;
- "architecture by implication": containers with no decision.

**Your thinking:**

#### Q8.6 Style templates

**Analysis.** Style templates would be starter models for a style, such as "layered" or "microservices".

**Recommended.** Later (future_tasks).

**Your thinking:**

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

**Your thinking:**

#### Q9.2 Expected impact in decisions

**Proposed.** A decision can say what it should do to characteristics, for example `impacts: [scalability:+1, simplicity:-1]`. The table shows that expected change beside the draft's real ratings.

**Recommended.** Yes.

**Your thinking:**

#### Q9.3 Hints from metrics

**Recommended.** Hints only. For example, modularity from D and cycles, or testability from a coverage report. Hints never set stars.

**Your thinking:**

#### Q9.4 More than seven driving characteristics

**Recommended.** A warning. The book suggests about seven (notes `fundamentals…md:89`).

**Your thinking:**

#### Q9.5 Older versions of dp

**Analysis** [Fact]. An older dp drops the new "needed" value when it saves, because it drops keys it doesn't know.

**Recommended.** Accept it and say so in the CHANGELOG. A team should upgrade together.

**Your thinking:**

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

**Your thinking:**

#### Q10.2 Scale

**Recommended.** 3×3, as in the book (notes `fundamentals…md:404-405`):
- rate impact first;
- an unknown likelihood counts as 3;
- 1–2 is low, 3–4 medium, 6–9 high;
- show shading as well as colour.

**Your thinking:**

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

**Your thinking:**

#### Q10.4 The grid's columns

**Recommended.** Containers for now. The book prefers domains, and groups come later (future_tasks 2.1).

**Your thinking:**

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

**Your thinking:**

#### ★Q11.2 Where the results go

**Recommended.** They show in a sheet. Nothing is written unless you press one of these actions:
- add as a risk;
- add as a checklist item;
- add as linked work;
- add as a comment.

**Your thinking:**

#### Q11.3 Proposed ratings and suggested risks

**Recommended.** Accepted row by row, and labelled "proposed by BMO" until then.

**Your thinking:**

### Wave 12: Runtime

#### ★Q12.1 Where telemetry comes from

**Analysis** [Fact]. Today dp reads two sources:
- trace files (OTLP JSON) from a folder, keeping the newest 2,000 traces (`src/core/traces.ts:31-32`);
- System Testing's run log: 200 calls, in memory only (`src/server/testSession.ts:44-50`).

**Recommended.** These two only. A live collector (OTLP over HTTP) stays in future_tasks 2.7.

**Your thinking:**

#### Q12.2 Thresholds

**Recommended.** Rule settings in the registry:
- repeated calls in one trace (N+1);
- chain depth;
- fan-out.

**Your thinking:**

#### Q12.3 Variants from telemetry

**Recommended.** Read span events that carry the feature-flag attributes now (see 0.1). Read OTLP log files later.

**Your thinking:**

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

**Your thinking:**

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

**Your thinking:**

#### ★Q13.3 How a consumer marks a change as checked

**Proposed**
- The consumer's line stores the fingerprint it has checked (`dp.contract.seen`).
- When the current fingerprint differs, the consumer "needs a look".
- "Mark as checked" is an ordinary model edit: engineers make it in drafts, architects on main.

**Recommended.** Yes.

**Your thinking:**

#### Q13.4 How people are told

**Recommended**
- A computed "needs a look" item, on the home page and in the bell's "Now".
- A badge on the consumer.
- Optional linked work on the consumer (DEC-085).
- `dp contracts --fail-on breaking` in CI.
- No email, chat or webhooks: the bell keeps no stored list per person (DEC-080).

**Your thinking:**

#### Q13.5 Breaking changes

**Recommended.** For JSON Schema and OpenAPI, dp computes these:
- a removed field;
- a type change;
- a new required request field;
- a removed endpoint.

Anything else is "changed, impact unknown".

**Your thinking:**

### Wave 14: Retrieval and local models

#### ★Q14.1 The gate

**Recommended.** Build this wave only if Wave 1's evaluation shows BMO missing context it needed, or if you say go.

**Your thinking:**

#### ★Q14.2 A vector DB, or a flat index?

**Recommended.** A flat index in `.dp/index/`, with no database server (see 0.5).

**Your thinking:**

#### ★Q14.3 Embeddings

**Recommended.** Local only (Ollama). Cloud embeddings would send the whole index past the preview.

**Your thinking:**

#### ★Q14.4 GPU

**Recommended.** No CUDA or MPS code in dp. Instead (see 0.4):
- local model servers;
- the GPU share as Ollama reports it;
- bounded runtime settings;
- setup notes.

**Your thinking:**

#### Q14.5 Word index first

**Recommended.** BM25 first. Add embeddings on top only if the evaluation shows they help.

**Your thinking:**
