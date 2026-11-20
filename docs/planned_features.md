# Planned features

Work that has a clear scope and is meant to be built. Each entry says what exists today, what is missing and what is still open, so that someone new can pick one up. Ideas that are still being thought through are not here; for the history of how this list was made see the git log (the old `future_tasks.md` was split on 2026-11-20). For what dp is for and what 1.0.0 contains see [product-vision.md](product-vision.md).

Status: **draft, 2026-11-20.** Nothing in this file is decided or built unless an entry says so. An entry marked `proposed` is the author's reading of the owner's direction, for the owner to confirm.

## How to help

1. Pick an entry, or open an issue to propose one. For anything larger than a small fix, agree the approach first ([CONTRIBUTING.md](CONTRIBUTING.md)).
2. Read [decisions.md](decisions.md) for the entries named in **Links** before you change a design choice. A change that makes a new choice adds a decision at the bottom of that file.
3. Read the map of the source in [.claude/CLAUDE.md](../.claude/CLAUDE.md) (the architecture section) and the overview in [architecture.md](architecture.md) (a draft).
4. Branch from `main`. Run the checks listed in CONTRIBUTING before you send the change.

## The format of an entry

Every entry has these parts, in this order. Keep facts apart from interpretation: say where a fact comes from (a file, a decision number), and mark a proposal as a proposal.

| Part | What it holds |
|---|---|
| **Status** | `proposed`, `accepted`, `in progress` or `done` |
| **Why** | The problem, in a sentence or two |
| **What exists today** | Facts, each with a file or decision number |
| **What is missing** | What a first version must add |
| **Proposal** | The author's reading of how to build it; marked as interpretation |
| **Trade-offs** | What each choice gives and costs |
| **Open questions** | What the owner or contributors still have to answer |
| **Size** | S (days or less), M (about a week), L (more) |
| **Links** | Decision numbers, waves, other docs |

---

## A1. Live connections to Codacy, SonarQube and Jira

**Status:** proposed · **Size:** M

**Why.** Findings and tickets live in other tools. dp can already show them as linked work on the architecture; the connections should be live and cover the tools teams use.

**What exists today** (facts):
- Linked work can be pinned to elements, relationships, diagrams, flows or the project, with an overlay and a Work page, per project and across projects (DEC-085, DEC-086, DEC-088).
- Status can be refreshed on request from GitHub, GitLab, SonarQube and SonarCloud, and Jira (DEC-059, DEC-085); one adapter per tool is in `src/core/workTools/`.
- Report files can be imported with no network: SARIF, GitLab Code Quality, SonarQube issues and a dp JSON format (`dp work import`, DEC-085). The severity mapping is editable (DEC-087).
- Credentials are write-only and kept in the hub or project folder (`src/core/credentials.ts`); tool connections are in `.dp/integrations.json`, changed by architects only.

**What is missing:**
- A Codacy adapter (and Codacy's report format, if it is not covered by SARIF).
- "Live" in the sense of updates without a person pressing refresh: webhooks, unattended pushes with API keys, a refresh across every project from the hub's Work page. All are open items in the owner's ideas list (I2.5).
- GitHub security alerts as a source; creating issues from a draft.

**Open questions:** how often to refresh, and who pays the rate limits; whether a hosted webhook receiver is in scope for a tool that runs on the user's own machine; where tokens are kept when dp runs unattended in CI.

**Links:** DEC-059, DEC-063, DEC-085 to DEC-088. Cloud-provider integration (live cloud inventory) is a separate, later idea and is not part of this entry.

---

## A2. BMO on by default, with handoff for all tasks

**Status:** proposed (the owner confirmed the direction on 2026-11-20) · **Size:** M to L

**Why.** BMO, the assistant, is a fundamental part of dp, so it should be on from the start. The owner also wants people who have an LLM subscription but no API credits to be able to use it.

**What exists today** (facts):
- `DEFAULT_SETTINGS.enabled` is `false` (`src/assistant/settings.ts`, near line 82). The default backend is `handoff`.
- `canRun` also refuses when the backend is not `direct` (near line 332). So with the default settings the in-app buttons open an explanation instead of running. Turning `enabled` on alone would not change that for someone with no API key.
- `HANDOFF_TASKS` has three import tasks: `import-level`, `describe-to-model`, `suggest-labels` (`src/assistant/importTasks.ts`, line 32). The text tasks (explain, challenge, ask, draft summary, decision from draft) have no handoff route.
- DEC-093 (accepted, not built) defines `enabled` as "Use an LLM", off by default, with a deterministic BMO that answers commands from the model (`find`, `help`, `show`, `notes`, `decisions about`). The planned `dp find`, `dp help` and `dp context` do not exist yet.
- Nothing in the code import is blocked when BMO is off. See "Which import steps need an LLM today" in B7 below.
- Guarantees that exist: the server builds every prompt and picks every file; a run needs the hash of a preview; the CLI sends nothing without `--yes-send`; secrets are masked; cloud providers are pinned to their hosts; the settings file is outside git with mode 0600; only architects change settings; the handoff backend calls no model.

**What is missing:**
- A default of `enabled: true` while `backend` stays `handoff`, so that nothing is ever sent without a choice.
- A status that says which route is ready (`direct`, `handoff` or `none`), so the UI can say "ready through your own agent" instead of "cannot run".
- Handoff for the text tasks: the prompt is written to a file, the person's own agent or chat answers, and the answer is read back from `result.json`, checked by the task's validator and the hash in the manifest, and shown (a text answer is shown, not stored).
- The relabelled setting from DEC-093 ("Use an LLM").

**Proposal** [interpretation]: do the four things above; record a new decision that supersedes the "off by default" wording of DEC-001, DEC-051, DEC-065 and DEC-093.

**Places that assume "off by default"** (so the later change can find them): `README.md` (line 101), `.claude/CLAUDE.md` (line 74), `docs/CHANGELOG.md`, `demo/README.md`; unit tests `bmo-settings`, `bmo-api`, `cli-bmo` and `bmo-direct`; browser tests `bmo.spec.ts` and `import.spec.ts`.

**Trade-offs:** a subscription user with no API credits gets a working BMO. A "ready" label for a route that needs a copy-and-paste step may mislead. Text answers through a file are slower than a direct call.

**Open questions:** whether text answers that arrive by file should be stored; whether `dp context` and an MCP server replace the file route later (DEC-020); whether the deterministic BMO of DEC-093 is built first, so that "on" is useful with no LLM at all.

**Links:** DEC-001, DEC-020, DEC-051, DEC-064, DEC-065, DEC-093, DEC-094; [waves/wave-02-notes-context-help.md](waves/wave-02-notes-context-help.md).

---

## A3. Removing a project from a hub

**Status:** proposed (the owner chose "Remove from hub, plus an optional, separately confirmed step that also deletes the files", 2026-11-20) · **Size:** M

**Why.** A new hub includes the demo project (DEC-082), and a person must be able to remove it, or any other project, without editing a file by hand.

**What exists today** (facts):
- `initHub` adds the demo project to a new hub (`src/server/hub.ts`, lines 172 to 193). A single-project `dp serve` starts empty unless `--demo` is given (`src/cli.ts`; DEC-036).
- There is no `Hub` method, route, button or command that removes a project. DEC-082 says the project "can be removed by hand from `hub.json`".
- Adding a project is `Hub.addProject` and `POST /api/hub/projects`. The new-project dialog already offers "Demo bank" as a template, so a removed demo can be added again.
- The hub keeps one app per project (`apps` in `src/server/hub.ts`), each with a System Testing session that must be closed.

**What is missing:**
- `Hub.removeProject(id, {deleteFolder})`: refuse the shared catalog and an unknown id; close the project's app and testing session; drop its sync keys; rewrite `hub.json` (`writeHubFile`).
- `DELETE /api/hub/projects/:id` for architects, registered in `src/server/auth.ts`.
- A Remove action on the home-page project cards with two confirmations: "Remove from this hub", then, separately, "also delete the files", which names the folder (the `confirmDialog` pattern in `ui/src/pages/HomePage.tsx`).

**Proposal** [interpretation]: guards for deleting files: only a folder inside the hub, or the exact folder listed in `hub.json`; never follow a symlink; the folder must contain `architecture/`. Tests: remove, remove with files, catalog refused, a folder outside the hub kept, an unknown id, and viewers and engineers refused.

**Trade-offs:** unlisting is safe and reversible; deleting files is not, so it is a separate step. A removed project's entries in the users file and in `.dp/bmo.json` (`projects`) are either left (harmless, stale) or cleaned (more code).

**Open questions:** what to do with those entries; whether a single-project server should offer the demo from its home page; a new decision would amend DEC-082.

**Links:** DEC-036, DEC-054, DEC-057, DEC-082.

---

## A4. Using an LLM subscription (copying between dp and a chat app)

**Status:** proposed · **Size:** M

**Why.** Many people pay for an LLM app but not for API credits. The owner wants them to be comfortable using their own subscription, with the person as the go-between for dp and the Claude or OpenAI app or web page, and the text moved back and forth with as little effort as possible.

**What exists today** (facts):
- The handoff writes `prompt.md`, `evidence-digest.md`, `schema.json`, `intake.json` and `feedback.json` to `architecture/import/handoff/` and expects `result.json` back. The person gives their agent one line: "Read `architecture/import/handoff/prompt.md` and follow it; write the result to `architecture/import/handoff/result.json`." That assumes an agent that can read and write files.
- A result is refused if its manifest hash does not match the prompt that was shown.
- A smaller import for chat-only users (paste the digest, get the import file back in one reply) is listed in B4 below and not built.

**Comparison** [interpretation]:

| | Direct API | Subscription, through the person |
|---|---|---|
| Cost | Per token; a key and a balance | Included in the plan, within the plan's limits |
| Setup in dp | Credential, provider, model | None |
| Who moves the text | dp | The person, by copy and paste or by a file an agent reads |
| Size limit | Known (`runTokenLimit`) | The chat app's limit is not known to dp |
| Check of the result | Validator and manifest hash | The same, after the person pastes it back |
| How it fails | An HTTP error | A reply that is cut off, wrapped in prose or not valid JSON |

**Proposal** [interpretation] to reduce the back and forth:
- One copy button for one block, and the size shown against a limit the person can set.
- The prompt asks for the answer in a single fenced block.
- A large prompt is split into numbered parts that each fit.
- A paste box that checks the reply at once and says exactly what is wrong, so the person can paste that message back to the chat.
- dp remembers the chat app the person uses, so the instructions match it.

**Open questions:** whether the file route and the chat route share one prompt; how to keep a long import interview going across several replies; how to show context limits and token counts (B7).

**Links:** DEC-020, DEC-051, DEC-064, DEC-065; entry A2 above; waves 15 and 20.

---

## A5. Manage users and roles from the UI

**Status:** proposed · **Size:** M

**Why.** Only architects should be able to change things by default, and architects should be able to give other people other roles. Today that works only on the command line.

**What exists today** (facts):
- With sign-in off, every request acts as architect (`src/server/auth.ts`). With sign-in on there are three roles: architect, engineer and viewer (DEC-041). In a hub there is also a role per project, which can be `none` (the project is hidden).
- Users are managed only with `dp users init|add|passwd|remove|role|list`. `dp users add` requires `--role`; there is no default.
- BMO settings and integration settings are changed by architects only.
- There is no users route in the API and no Users page in the UI.

**What is missing:** a Users page for architects (add, set a role, set a role per project, remove), with the same rules as `dp users`; the command line stays for first set-up and CI.

**Open questions:** the default role for a new user (viewer is the safe choice); what the page shows when sign-in is off; whether sign-in should be on by default.

**Links:** DEC-041, DEC-057, DEC-063.

---

# Scheduled work, in compact tables

Moved from the old `future_tasks.md` on 2026-11-20 (the file was deleted; its history is in git). Items with a clear scope that are meant to be built. The detailed entries above (A1 to A5) are the long format; these tables keep each item's facts, source marker and rough size. Work that is parked, postponed or still open is not here: it is in the owner's private ideas list.

Source markers: **[Owner]** stated by the project owner · **[Proposal]** our interpretation, not yet confirmed · **[Review]** raised in a stage review · **[Notes]** from the book notes in `docs/notes/` · **[Training]** from model training data, not re-verified. Size is a rough guess [Proposal]. Nothing here is a promise; items are re-ordered after owner feedback on each release.

## B1. The owner's list of 2026-11-17, planned as waves

The owner's list of 22 things to build is planned as 14 waves, plus Waves 15 to 20 (guided import interview; images and files, architecture commits, drafts that keep up, lenses for roles, and the back-and-forth about an existing system, the last five from the vision), in [waves/](waves/README.md). Each wave has a brief for one agent and questions for the owner ([waves/questions.md](waves/questions.md)). The wave files stay until the owner deletes them before 1.0.0. Releases stay inside 0.5.x: 0.5.1 (Waves 1, 2, 3, 16, 4), 0.5.2 (5, 15, 6, 7, 8), 0.5.3 (9, 11, 17, 18, 19), 0.5.4 (13, 14, 20), then 1.0.0. Deployment diagrams (parked, ideas I1) are infrastructure, so they are not scheduled before 1.0.0 unless the owner says so.

| Wave | What it builds | Size |
|---|---|---|
| 1 | Grounded BMO answers: fixed prompt templates, context packs, citations dp checks, labels (the evaluation set was deferred, see I2.0 in the ideas list) | M–L |
| 2 | Notes, context and help: sticky notes stored in the model, BMO reads notes and comments, a Notes page, BMO without an LLM, `dp context`, help about dp | M–L |
| 3 | Reference notes (patterns, anti-patterns) and links on Decisions, including references to local files | M |
| 4 | Roles, data and variants: CRUD per modelled role, conditions, A/B variant flows | M |
| 5 | Code search, key code and one generic regex reader: find a name in the code with no LLM, a component's main files and functions, imports and definitions for the major languages from one pattern table (owner, 2026-11-20) | M–L |
| 6 | Findings and acknowledgements: one Finding shape, acknowledgements in the model, the existing warnings as findings. **Drift moved to the ideas list (I2.2) (owner, 2026-11-20)** | M |
| 7 | Model metrics: coupling, instability and cycles computed from the model; no code-based metrics | S–M |
| 8 | Rules and presets, and anti-patterns dp detects itself | L |
| 9 | Characteristics table: needed vs current, compared across drafts and decisions | M |
| 11 | BMO reviews: the anti-pattern button, a check of decisions ("ADR broken or violated"), proposed ratings. Suggested risks wait for Wave 10 | M |
| 13 | Contracts: tell consumers when a producer's output changes | M–L |
| 14 | Local runtimes and the word index: OpenAI-compatible local servers, GPU status, bounded settings, BM25 for choosing context (no embeddings) | M |
| 15 | Guided import interview: deterministic scan first, then "question x of y" cards the user approves or answers, then a draft | L |
| 16 | Images and files on notes, comments, decisions and diagrams: up to 10 MB each, anyone can attach, stored in the project or referenced on the user's own computer and opened in its default app; BMO gets a list and redacted text files | M–L |
| 17 | Architecture commits: a Commit button, `dp commit`, an opt-in commit when a draft is applied (amends DEC-018) | M |
| 18 | Drafts that keep up: rebase onto main, a merge editor, undo that restores the draft | M–L |
| 19 | Lenses for roles: DevOps, Security and Business | S–M |
| 20 | A real back-and-forth about an existing system: rounds planned from the system's size, more questions as it grows | L |

## B2. Order already decided by the owner

| # | Task | What it covers | Source | Size |
|---|---|---|---|---|
| 2 | **Small batch** (no longer after 1: the vision puts deployment after 1.0.0) | Technology shown on connections (a toggle); owner inherited from the parent; descriptions on tag groups; an "appears in diagrams" list per object; CSV export of model objects (name, type, technology, owner, tags). Already done: the `?` help card lists every keyboard shortcut. | [Proposal, DEC-028] | Small each |
| 3 | **Static HTML export** (after 2) | `dp export html`: the built UI plus a snapshot of the model, opened without a server, publishable from CI. Needs a static data path in the UI. The export includes everything in the model (notes, costs, links), so it needs a review step before publishing. | [Owner, DEC-024, DEC-028] | Medium–large |

## B3. Planned-change workflow (from the limits in planned-change.md)

| Task | Why | Source | Size |
|---|---|---|---|
| **Rebase a draft onto the current main** and a merge editor for conflicts (feature C of the vision; planned in Wave 18) | Today a conflict is only reported when the draft is applied, and "main +N" is shown but cannot be resolved in place. A partial apply of an import draft already rebases what it keeps (DEC-065); the general case is not built. Also open in the sign-in notes. | [Review, stage-c, prod-p4] | Medium |
| **Undoing an apply also restores the draft** (planned in Wave 18) | Undo restores the model only, not the code files the apply wrote and not the deleted draft. | [Review, stage-c] | Small–medium |
| **Compare a draft's planned code edits with the code as it was when the draft started** | Today they are compared with the code folder as it is now, so a file changed since then is a conflict. | [planned-change.md limits] | Medium |
| **Deeper code check in the coding plan** | The plan sees files and Python/JS/TS relative imports only. Calls through HTTP, queues or dependency injection are checked by hand. The import scan (0.5.0) already reads more (manifests, compose, hostnames); feeding it into the plan check is not done. | [planned-change.md limits; Proposal] | Medium |

## B4. Finish the code import and BMO round (0.5.0)

Built in 0.5.0: `dp scan`, `dp import`, the import file (JSON, schema v1), review levels, the Import page, and BMO with handoff and direct backends (Claude API, OpenAI API, Ollama). What is left, from DEC-065:

| Task | Note | Source | Size |
|---|---|---|---|
| **A per-level URL on the Import page** | So a level can be linked to or reloaded directly. | [Proposal, listed as not built in the backlog] | Small |
| **Scan languages beyond Python and JS/TS** (Java, Go, C#) | **Planned differently (owner, 2026-11-20): no code per language.** Wave 5 part C replaces the Python and JS/TS readers with one generic regex reader, a pattern table for the major languages, approximate and labelled; Java is covered that way. Reading `pom.xml` and Gradle files (build manifests) is not planned; say if you want it. | [Owner, 2026-11-17 (Java); 2026-11-20 (answer)] | — |
| **Who keeps the known-services list up to date** | `src/import/knownServices.ts` turns SDK package names into external systems; it is what makes C1 candidates deterministic, and it needs upkeep. Open: who adds entries, and whether a project can add its own. | [Proposal, DEC-051 open question] | Small |
| **A smaller import for chat-only users** | A user whose assistant cannot read files could paste the evidence digest and get the import file back in one reply. Weaker than the file route, but it works. Not built. | [Proposal, DEC-051] | Small |
| **Multi-pass summarising for very large repositories** | A run over the token limit is refused today; the user narrows the scope instead. → Wave 20 plans rounds, each small enough to fit, with the person in the loop; a single-run whole-repository summary stays here. | [DEC-065] | Large |

## B5. Small, well-defined additions

| Task | What it covers | Source | Size |
|---|---|---|---|
| **Business, Security and DevOps lens presets** | The lens mechanism is built; only Engineer, Architect and Overview ship. The vision names a DevOps lens (feature D). → Planned in Wave 19 (DevOps, Security, Business). | [Owner, 2026-11-13; 2026-11-19] | Small |
| **CODEOWNERS → owner proposals** | The scan already reads `CODEOWNERS` as evidence; turning it into proposed `owner` values on mapped objects is not done. | [Proposal] | Small |
| **SARIF import → linked work** (built, not yet released, DEC-085) | `dp work import <file> --format sarif` reads SARIF 2.1.0 (also GitLab Code Quality JSON, SonarQube issues and a dp JSON format). Findings go to the element whose code paths hold their file, and arrive as linked work, so the existing Work overlay shows them. A separate "Security findings" overlay with counts by severity is not built. | [Proposal] | — |
| **Coverage overlay** | Cobertura XML → percent per object, in bands. | [Proposal] | Small |
| **Line routing, stage 2** | Route straight, curved and smooth lines in the same pass; give ELK the label sizes; optional hops where lines cross; an itemised "Line shape" row in the change list; Make room / Spread out for selected boxes only. Stage 1, lanes, label avoidance (DEC-052, DEC-061) and "a change by hand moves only what it touches" (DEC-067) are done. | [Proposal, DEC-052, DEC-061] | Medium–large |
| **Light theme** | The app is dark only (`color-scheme: dark` in `ui/src/styles/tokens.css`). | [Review, prod-p5] | Medium |
| **Automated accessibility audit** | Labels, focus and keyboard reach were checked by hand and only partly by tests. | [Review, prod-p5] | Small–medium |
| **Characteristic rating targets**, one-off costs and cost per environment | So overlays can show gaps against a target. → Targets ("needed" stars) planned in Wave 9; costs stay here. | [Review, stage-a3; Owner, 2026-11-17 (targets)] | Medium |
| **Ratings on relationships and whole flows** | Today objects only. | [Review, stage-a3] | Medium |
| **Add a pipeline as a connector from the palette** by picking two ends | | [Review, release-0.2] | Small |
| **Per-diagram hiding of elements** | Today a diagram shows everything at its level. | [Review, stage-a] | Medium |


## B6. Left from the interaction fixes (2026-11-16)

| Task | What it covers | Source | Size |
|---|---|---|---|
| **Slow double-click on a selected box's name** | A second click after about 350 ms starts a rename where a double-click to open was meant. Not reproduced in a test (timing). | [Review] | Small |
| **Arrow keys in the Move dialog** | The list has `role="option"` rows but no arrow-key movement; Enter in the filter works. | [Review] | Small |
| **Hub pages while a deleted draft is open (single project)** | Catalog, history and credentials calls still carry the open draft's version; if that draft was deleted elsewhere they fail. Home and the project list no longer do. | [Review] | Small |
| **Home page "needs a look" and proposed decisions** | The server's list uses warning flags only; the top bar badge counts proposed decisions too (DEC-079). Align them once the owner has answered. | [Review] | Small |


## B7. From the owner's notes of 2026-11-20

Facts as found on 2026-11-20. Kind: *planned* is meant to be built; *chore* is a small repository task.

| Note | Kind | Facts |
|---|---|---|
| Codebase import without BMO: what needs an LLM and what does not | planned | Nothing blocks import when BMO is off today (table below). Open: should the UI label each step "no LLM" or "needs an LLM"? |
| Show LLM information: context limit, token count, token usage | planned | Facts: the BMO preview shows an estimated token count (`ui/src/common/BmoSheet.tsx`, near line 198) and a finished run shows tokens in and out (near line 231); a per-run size limit exists (`runTokenLimit`, `src/assistant/settings.ts`); prices are typed by the person, none are built in; a model's context limit is **not** shown and dp keeps no table of models. Open: a small table of limits (goes stale), asking the provider (a network call), or letting the person type it. |
| What are the questions and the chat like? What happens when the model is unsure? **The model defers to the user.** | planned | Facts: the importer rejects what it can prove wrong, lists what it cannot check and does not guess or repair (DEC-051); review levels (verified, partly verified, unverified) come from checkable evidence (`src/import/review.ts`); an item without a decision waits and a partial apply keeps it (DEC-065); Wave 15 plans the "question x of y" interview with a bank of standing questions per level; Wave 20 plans rounds sized from the repository, with more questions as it grows. Proposal [Proposal]: an answer that is unsure must say so and carry a question; dp shows each as a card and writes nothing to the model until the person answers; the answer is stored as an ordinary intake or review decision. Open: how the chat and the cards share one state; how "unsure" is expressed (a field in the import file schema, or a separate list of questions); how many questions per round. |
| How to analyse and import massive codebases | planned | Facts: a run over the token limit is refused; the step-by-step rule fires above 300 source files, 5 container candidates or 2 passes; passes are estimated tokens divided by the pass budget; multi-pass summarising of a very large repository is open (B4); Wave 5 adds search and key code; Wave 20 adds rounds. Open: per-container scoping, sampling, incremental re-scan, and what "done" means on 10,000 files. Enterprise scale goes to the private ideas file. |
| Move `.gitlab-ci.yml` to `config/` and set up GitLab | chore | References to update: `.claude/CLAUDE.md` (line 42), `docs/CONTRIBUTING.md` (line 77), DEC-089 (history), a comment in `scripts/ci-local.ts`. [Training, not verified on a real GitLab project] GitLab reads `.gitlab-ci.yml` at the root unless the project setting "CI/CD configuration file" points to another path; the alternative is a root file that only says `include: local: config/gitlab-ci.yml`. The file's own header says it was never run. It has one job (`test`) with a Node 20 and 22 matrix. |
| A changelog standard, and a scrollable release view as on GitHub | chore | Standard proposed in `docs/CONTRIBUTING.md` ("Changelog standard"). Facts: `docs/CHANGELOG.md` is Keep-a-Changelog-like with decision numbers, an em dash in dates and no comparison links; `docs/CONTRIBUTING.md` already says a release is a `vX.Y.Z` tag plus a GitHub release, but the repository has no tags yet. The scrollable view people know from GitHub is GitHub Releases, not the file. Open: create a release for each version. |

Which import steps need an LLM today (facts):

| Step | Needs an LLM? |
|---|---|
| `dp scan`, the readiness analysis, intake, import file check, import to a draft, review, writing the handoff prompt, reading `result.json` | No: deterministic, no network |
| The "Ask BMO" tab, "Describe", "Suggest labels" run directly, `dp bmo run` | Yes: the direct backend with a provider (the handoff route needs the person's own agent) |

