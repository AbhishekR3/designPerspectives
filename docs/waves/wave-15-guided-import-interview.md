# Wave 15: Guided import interview

| | |
|---|---|
| **Status** | Owner answers applied (0.3 on 2026-11-18; Q15.1 to Q15.5 answered 2026-11-20: questions depend on the codebase and there are always a few; the card approval is final, with room for free-text context and file references; answers saved locally). Ready after Waves 5 and 1 |
| **Branch** | `feat/w15-guided-import-interview`, from `main` after Waves 5 and 1 are merged |
| **Size** | L. Split point: 15a is the interview and the import without BMO (steps 2 to 5); 15b adds BMO-proposed cards (step 6) |
| **Release** | 0.8.0 (with Wave 5) |
| **Depends on** | Wave 5 (code search and key code: the "main files and functions" cards), Wave 1 (labels and citations for the BMO cards in 15b). Wave 3's `local:` link kind is reused for file references |
| **Owner items** | Answer 0.3 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave. Also read [../import-design.md](../import-design.md) (what the import is for and what matters to C4 at each level) and the import choices N1 to N15 in [DEC-103](../decisions.md#pro-19--dec-103--code-import-and-bmo-choices-and-the-080-split-n1-to-n15), which change what this wave builds (see its "Decided" section if it has one).

## Goal

People don't want to draw diagrams by hand, so importing a codebase has to do most of the work and ask for the rest in a way anyone can answer. This wave replaces "fill in a form, then ask BMO" with an interview:

1. **dp first makes every call it can make from the files**, with no model and no network.
2. **Then it asks the user**, in a screen that shows "Question 7 of 23". Many questions are fine: more is better than a wrong model.
3. **The answers build the draft**, without BMO. BMO can add proposals as extra cards (15b), and the interview works with the handoff backend too.

The reader is assumed to know the basics of the project, may know more, and probably doesn't know the details. So every question says what dp saw (file and line), what dp proposes, and why it is asking. Every question has an "I don't know" answer.

## Owner request covered

> For importing codebase people don't want to manually create diagrams. When importing the codebase, make all the deterministic calls, then ask questions to the user. Show it as a UI with x/y questions. Like you can show the user what you were thinking of labelling certain items and the user can approve disaprove. You can ask grouped values. It's alright asking more questions than less to ensure you are getting the correct answer. You can ask a preliminary questions that involve text based responses or choosing between options. Whatever you think is the best way to get context out of the user for this codebase. Make an assumption the user knows basic info about the project, but may know more, but probably doesn't.

Which levels are exact and which are guesses is in [import-design.md](../import-design.md) section 8 (the table by C4 level). The interview asks about the guesses and confirms the exact facts in bulk.

## What exists today [Fact; anchors from the survey of 2026-11-18, two marked ~ are approximate]

**Intake** (`src/import/intake.ts`)
- The shape: system name and purpose, audience, scope, depth, ownership, runtime, glossary, `mustNotOpen`, services and settings (`:32-46`). The file is `architecture/import/intake.json` (`:283`). The parser is strict: unknown keys are errors (`:83-90`).
- Limits: 5,000 characters of text, 500 list entries, 300 characters per glob (`:72-74`).
- **DEC-064 rule:** `intakeLoosened()` (`:310-336`) says what counts as loosening: removing `mustNotOpen` or `scope.exclude` entries, widening `scope.include`, raising caps. `PUT /api/import/intake` refuses a loosening unless the caller is an architect (`src/server/routes/import.ts:106-117`).
- Routes: `POST /api/import/scan` (`:101`), `GET /api/import` (`:87`). `ROUTE_RULES` (`src/server/auth.ts:164-176`): action `import` for scan and intake, `edit` for review items, `import.final` (architect only) for ignore and levels.

**Analysis** (`src/import/analysis.ts`)
- `INTAKE_QUESTIONS` (`:196-207`) lists five unanswered-intake questions. `analyse()` (`:209`) is pure and gives candidates, decided, left and review time per level (`:352-389`).
- C1 candidates: system, host, webhook (`:242-290`). C2: grouped by name (`:292-308`). C3: component folders (`:310-324`).

**Scan** (`src/import/scan.ts`)
- No fact says who the people are. Code owners are read (`:912`) but never become candidates.
- Names the scan already proposes: the C1 system name from the known-services lookup (`analysis.ts:250`), the C2 name from the first fact (`:297-298`), the C3 name from the folder path (`:324`).
- **The scan proposes no description and no line label.** Labels today come only from BMO's `suggest-labels`.

**Review and apply**
- `review.ts`: the review level (verified, partly verified, unverified) comes from evidence (`:174`); `setDecision` (`:717`) records accept or reject per item, with who decided; unverified items need an explicit accept (`:754`).
- Typed text counts as evidence (`typedTexts`, `:496-516`), so what the user types in the interview can back an item (DEC-064).
- `importer.ts`: `importToDraft()` (`:339`) turns a checked import file into a draft. The import file also carries `questions` and `assumptions` (`schema.ts:199-200`), which go to the checklist (`importer.ts:351-353`), never to the model.
- The checklist (`src/core/checklist.ts`) already holds BMO's questions, with `typedAnswers()` and `answerNotes()` (`:470`, `:481`) feeding the next BMO turn (DEC-084).

**UI**
- `ui/src/pages/ImportPage.tsx` is **not a stepper**. It is a list of collapsible sections: scan, readiness, "about" (the intake form), bring in a level, describe, better labels, import drafts (`:151-188`).
- Reusable parts: `Section`, `Fields`, `TextField`, `TagInput`, `Modal` in `ui/src/panels/formParts.tsx`. There is no import hook; `App.tsx:1090` passes state down.

**Decisions that bind this wave**
- DEC-051: one level at a time, and no inferred labels.
- DEC-064: typed-text rule; who may loosen limits.
- DEC-084: the checklist, and typed answers as evidence.

## Design [Proposal; settle Q15.1 to Q15.5 first]

### The flow

```
Scan (no questions)  →  1. About the system  →  2. Confirm what dp found  →  3. Fill the gaps  →  4. Names and lines  →  Draft
        automatic        text and choices       approve / change / reject      judgment calls         labels, descriptions
```

The screen shows "Question 7 of 23", the section name, and a bar per section. The total can grow when an answer opens follow-up questions ("not a component" asks "then which component does it belong to?"). The screen says so: "23 questions so far; some answers add more."

### Step 1. About the system (preliminary questions)

A fixed list in code, in plain words. Most answers go to existing intake fields.

| Question | Answer type | Goes to |
|---|---|---|
| What is the system called? | text, prefilled from the root manifest or folder name | `system.name` |
| What is it for, in one sentence? | text; dp shows the first lines of the README and offers "use this" | `system.purpose` |
| Who uses it? | tick-list (customers, staff or admins, other systems, only developers) and a text box | people for C1 |
| Is this the whole system, or one repository of several? | choice, and a text box for the others | `scope.otherRepos`, the boundary |
| Where does it run? | choice (a cloud, own servers, laptop only, I don't know) and text | `runtime` |
| How much detail do you want first? | choice with a picture of each level (people and systems; plus the deployable parts; plus the parts inside) | `depth` |
| Which team owns it? | text | `ownership` |
| Anything that must never be opened (secrets, customer data)? | list | `mustNotOpen` (tightens only) |
| Words in this code that mean something special? | rows of term and meaning | `glossary` |
| Which folders should we leave out? | tick-list, proposed from what the scan saw (tests, vendored, generated) | `scope.exclude` (tightens only) |

### Step 2. Confirm what dp found (grouped cards)

The scan's exact facts are shown as **grouped cards**, one group per kind, so the user can approve a whole group, or open it and decide one by one.

| Group | A card shows | The user can |
|---|---|---|
| External systems | "The code uses the Stripe SDK (`package.json:12`). dp would add **Stripe**, payments, as an external system." | Approve · Rename · Not used · It's part of our system |
| Deployable parts | "A Dockerfile and `main.py` (`api/Dockerfile`) make a container **api**, Python." | Approve · Rename · It is a library, not deployed · Same as another container |
| Looks dev-only | "`compose.yml` has `mailcatcher`. It looks like a local test tool." | Include · Leave out |
| Component folders, per container | "`api/orders/` has 14 files and would be a component **orders**." | Approve · Rename · Part of another component (pick) · Not a component |
| Main files and functions (Wave 5), one card per component | "`api/orders/` is the component **orders**. dp suggests these as its main files: `orders.py` (named like the component), `service.py` (mentioned by 5 other files here)." | Approve · Pick other files (search by name) · Add a function (search by name) · None |
| Lines between parts | "`api` has host `orders-db` in `settings.py:12`. dp would draw **api → orders-db**." | Approve · Not a real connection · Change direction |

Each card has a "what dp saw" fold-out with the file and line, and a "why am I being asked" sentence. Groups open with the count ("6 external systems found") and a "Approve all of these" button, which still records one decision per item.

### Step 3. Fill the gaps (what the code cannot say)

Questions that come from the guesses in questions 0.3, asked as choices or text:

- **People.** One card per kind of user the user ticked in Step 1: a name, a description, and which system or container they use. dp proposes nothing it cannot back, so these start from the user's answers.
- **Missing pieces.** "Is there a database, queue, or other service the code does not show?" (text, repeatable). "Does a worker and a web server run from the same image?" is asked when a start script or compose service suggests it.
- **Layers or features?** Asked when the folders look like layers (`controllers`, `services`, `repositories`): "Group by feature instead?" with the folder list shown.
- **Calls dp cannot see.** For a web, queue or webhook sign without a visible target: "Who calls this?" or "Where does this send to?" (pick an existing element, type a new one, or I don't know).
- **Anything else.** BMO's `questions` and `assumptions` from an import (15b) appear last, in a group "Questions from BMO". They are read and answered through the existing checklist, not a second store.

### Step 4. Names, descriptions and line labels

- **Names** are already proposed by the scan (Step 2). Here the user fixes them.
- **Descriptions.** dp offers text it can quote (a README line, a docstring) with its source shown, or the user types one. A skipped description stays empty, and the checklist rule for descriptions (DEC-084) picks it up later.
- **Line labels.** A fixed choice per line kind ("reads from", "writes to", "calls", "publishes to", "sends email through") chosen by the user from rules on the evidence (a host in a database setting suggests "reads from and writes to"), or typed. dp never invents a label (DEC-051).
- In 15b, BMO can propose names, descriptions and labels as cards marked "BMO suggests", shown beside dp's own proposal. Nothing from BMO is pre-approved.

### How many questions, and where they come from (owner, 2026-11-20)

- **Dependent on the codebase** (Q15.1). A card exists only because the scan found something to ask about: no broker found, no broker question; folders that look like layers, the layers question. The list is computed from the scan, as before.
- **Lean toward asking** (Q15.1). When a fact could be asked about or assumed, dp asks. dp also asks about every object it would create: a name check, a one-line description and, for each line, a label. "Approve all" stays, per group, and still records one decision per item.
- **A floor of 6 questions per level's interview** (Q15.1: "definitely at least a few"). If the scan yields fewer, dp fills up to the floor from a **fixed bank of standing questions** per level, worded in code, never generated: for example, at C1 "Which outside systems or services does it talk to that the code does not show?", "Who runs or supports it (admins, support, on-call)?", "Does anything call into it from outside?"; at C2 "Is there a database, queue or cache the code does not show?", "Do the web part and the background workers run from one deployable?"; at C3 "Which folders are layers rather than features?", "What is not part of this container?". The bank has at least 8 questions per level, each shown only when no card already asks it. Step 2 writes the bank; the owner reviews its wording (ideas list O).
- **The count is honest.** The screen says "Question 7 of 23" and, when the floor added questions, "6 standing questions added because the scan found little to ask about".

### Adding context (owner, 2026-11-20, Q15.2)

The card approval is the final accept. Beside it the person can add context:

- **A note on a card.** Free text that stays with that item. It counts as typed text, so it can back the item as evidence (DEC-064). It is stored in `interview.json`.
- **General context.** A "Anything else dp should know?" box at the end of Step 1 and at the end of each level: free text up to 5,000 characters. It is stored in `interview.json`, which is committed, so dp refuses to save a text that contains a secret-looking value (as a decision does, DEC-064) and the screen says "saved in the project and committed with it". It does not count as evidence for any item. It reaches BMO (15b, Wave 20) only inside data blocks, after redaction, and the preview shows it.
- **File references**, on a card or in the general context. Two kinds:
  - **A file inside the code root.** Stored as a path. Text files up to 100 KB are read through the file gate (hidden-path rule, the intake's closed paths, redaction) and can go to BMO as data. Other types are listed by name only.
  - **A file anywhere else on this computer** (`local:`, Wave 3's link kind; DEC-095). dp keeps the path text only. It never reads, copies or sends the file. It shows the name with Copy path, and Open where DEC-095 allows.

### Parts the code only hints at (moved from backlog.md, 2026-11-20) [Proposal]

Code shows outside parts only as clients, URLs and settings, so the interview asks about them directly and checks the answers against the scan. These are candidates for the Step 3 cards and for the standing-question bank; the owner reviews the wording with the rest of the bank (ideas list O).

- **Kinds to ask about:**
  - third-party services and APIs (payments, identity and login, email and SMS, analytics, search, maps, LLM providers, feature flags, monitoring and error tracking);
  - cloud-managed services the team configures and a provider runs (databases, queues, object storage, CDN, DNS), modelled as the team's own containers, tagged as managed, with the provider noted;
  - other teams' internal services and shared platforms, modelled as separate systems (DEC-023);
  - inbound parties: customers' systems calling the API, webhook senders, partner file drops, browsers and mobile apps as people or systems;
  - things outside any repository: jobs set up in a console, manual steps, spreadsheets, people in the loop.
- **For each one, ask:** direction; what flows ("Sends payment requests", not "Uses"); protocol; who owns it; whether the team controls the contract; and the evidence (an SDK dependency, a host or variable name in configuration, a route for a webhook, an infrastructure resource).
- **Ownership has three answers, not one:** owned by this team, owned by another team in the company, or a vendor. Step 1's "Which team owns it?" gets a follow-up per external part.
- **Existing material.** Ask for READMEs, ADRs, older diagrams (Mermaid, PlantUML, Structurizr DSL), wiki or ticket links the scan cannot reach, and the team's own names for things against the names in code. These become file references (Adding context, above). ADRs found in the repository could be offered as proposed decisions; that is a new import-file field, so it needs a decision before it is built.
- **Names only for settings.** Environment variable **names** are written, never values.

### How answers become a draft

1. Each answer is stored by a stable id taken from the scan fact (so a re-scan keeps answers for unchanged items).
2. **`src/import/fromInterview.ts`** turns the approved cards and typed answers into an import file (schema v1) and runs it through the existing `checks.ts` and `importToDraft()`. This works with no BMO.
3. An approval in the interview is the user's explicit accept: it records an `accepted` decision with who made it (`setDecision`). Items the user typed carry the typed text as evidence (DEC-064). The review screen afterwards still lists every item, with its review level computed from evidence as today.
4. "Not right" and "Not used" are remembered in the interview file, and the item is not imported. A re-import keeps the person's edits (`lastImport.ts`).
5. Nothing about the interview, confidence or BMO is written into the model (DEC-051, DEC-064). Answers are saved **locally**, on this machine and sent nowhere (Q15.3): all of it in `architecture/import/interview.json`, next to the intake and committed with it so a team and CI see what was decided: the answers, the card notes, the general context and the paths of referenced files (paths written with `~/` where possible).
6. **Key code.** An approved "main files and functions" card becomes `dp.code.key` on the component (Wave 5). The import file schema (v1) gets an optional `keyCode` list per element. Old files stay valid; a file that uses it is refused by an older dp, which the CHANGELOG says.

### Rules for the question list

- **Computed, not generated.** The set of questions, their order and their wording come from fixed templates and the scan. The same scan and answers give the same list, byte for byte. Order: step, then level, then group, then path.
- **No LLM needed to run it.** BMO adds cards; it never decides which questions appear.
- **Stop and resume.** Answers are saved on each card. The user can leave, come back, go back one card, or finish later; unanswered cards stay "left" in the readiness count.
- **Skip is honest.** "I don't know" records no fact and leaves the item out of the draft, with a checklist item so it is not forgotten.
- **Keyboard.** Enter approves, keys 1 to 4 pick the answers, arrows move between cards.
- **Small codebases still get the floor.** Groups with one card are shown as plain questions, and the standing questions bring the level up to 6.

## Determinism

| Output | Class |
|---|---|
| The question list, its order and wording, the floor and the standing bank | computed |
| Proposed names, labels and groupings from rules | computed; folder-name rules are heuristic and say so on the card |
| Suggested main files (named like the component, mentioned by others, longest) | heuristic, and say so on the card |
| Notes and context the person adds | the person's own text, kept as typed |
| "Approve all" | a user's decision per item |
| Descriptions quoted from a README or docstring | computed (quoted with source) |
| Cards from BMO (15b) | proposed |

## Owner answers

- **0.3:** Make all the deterministic calls first, then ask the user. A UI with "x of y" questions. Show what dp would label and let the user approve or disapprove. Grouped questions. More questions rather than fewer. Preliminary text and choice questions. Assume the user knows basic information about the project.
- **Q15.1 (2026-11-20):** "The interview should be dependent on the codebase. Tend to lean towards more questions than less. Definitely need at least a few questions per interview." Applied: questions come from what the scan finds; dp asks when in doubt; a floor of 6 per level's interview, filled from a fixed bank of standing questions. The "one interview, a draft per level" shape (option 1) is kept, since the answer says "per interview" and DEC-051 wants one level at a time.
- **Q15.2:** "Yes it is final accept, but users can also add some additional context as a free-form text or reference local files." Applied: the card approval is the accept (still not for items the scan could not back with evidence under "Approve all of these"); a note on each card, general context, and file references (see "Adding context").
- **Q15.3 ("save the answers locally", then "include it as well"):** everything in `architecture/import/interview.json`, committed with the intake, including the general context and file references. Because it is committed, a context text with a secret-looking value is refused and the screen says where it is saved.
- **Q15.4 and Q15.5 (best thinking):** as recommended. A "Guide me" button at the top of the Import page, with the current sections under "Advanced"; 15a (the interview and the draft without BMO) first, then 15b (BMO cards, "BMO suggests", never pre-approved, BMO's own questions last).
- **Lines between parts (2026-11-20, later):** component-to-component lines in the cards come from the scan's import graph, which Wave 5 part C now builds with one generic regex reader for the major languages (approximate; the card says "found by pattern").
- **Shared helpers (2026-11-20):** the Wave 5 file-role cards are gone with Wave 5's roles; the new per-component card is "main files and functions".
- **Vision:** this wave is feature H, and the clearest answer to "understanding an existing codebase is hard".

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in DEC-104.*

*New: it comes from your answer to 0.3. These have recommendations and none changes the direction you set.*

### ★Q15.1 One interview, or one per level?

**Analysis.** DEC-051 brings a codebase in one C4 level at a time, with a draft per level. Your answer asks for one flow with "x of y" questions.

**Options**
1. **One interview, a draft per level.** Steps 1 and 2 are asked once. Then each level is answered and imported on its own, so the model stays reviewable (DEC-051). "x of y" counts the current level, with the later levels listed as "still to come".
2. **One interview, one draft.** Faster to click through, but one very large draft to review.

**Recommended.** Option 1.

**Owner's thinking:** The interview should be dependent on the codebase. Tend to lean towards more questions than less. Definitely need at least a few questions per interview.

**Applied [2026-11-20].** Questions come from what the scan finds, so a codebase with a broker gets broker questions and one without gets none. When a fact could be asked or assumed, dp asks, and dp asks about every object it would create. **A floor of 6 questions per level's interview**: if the scan yields fewer, dp fills up from a fixed bank of standing questions (at least 8 per level, worded in code, never generated), and the screen says it did. The wording of the bank is added to ideas list O for your review. I kept 'one interview, a draft per level' (option 1), reading 'per interview' that way and because DEC-051 wants one level at a time. [Wave 15](wave-15-guided-import-interview.md) is updated.

### ★Q15.2 Is a click in the interview the final accept?

**Analysis.** Today an unverified item needs an explicit accept in the review (`review.ts:754`). If the user has already approved the card, asking again is noise; but a card approved quickly with "Approve all" is a weaker check than the review.

**Options**
1. **The card approval is the accept** and is recorded with who made it. The review screen still shows every item and its level.
2. **The interview only proposes.** Everything is reviewed again afterwards.

**Recommended.** Option 1, but "Approve all of these" never covers items the scan could not back with evidence. Those need their own click.

**Owner's thinking:** Yes it is final accept, but users can also add some additional context as a free-form text or reference local files.

**Applied [2026-11-20].** The card approval is the final accept (a group's 'Approve all of these' still never covers items the scan could not back with evidence). Beside it: a **note on each card** (typed text, which can back that item as evidence), **general context** in a free-text box, and **file references**. A file inside the code root is read through the file gate (text only, redacted) and can go to BMO as data; a file elsewhere on the computer is kept as a path only, never read or sent (the `local:` kind of Q3.5, DEC-095).

### Q15.3 Where the answers live

**Recommended.** `architecture/import/interview.json`, next to the intake, outside the model and with a fixed key order. BMO's questions stay in the checklist and appear in the interview as one group.

**Owner's thinking:** Save the answers to the questions locally, go with your best thinking

**Applied [2026-11-20].** Everything goes in `architecture/import/interview.json`, committed with the intake: the answers, the card notes, the general context and the file references (your 'include it as well'; the earlier split with a git-ignored file is dropped). Nothing is sent anywhere. **Because it is committed,** dp refuses to save a context text that contains a secret-looking value (as a decision does, DEC-064), and the screen says 'saved in the project and committed with it'. A file outside the code root is kept as a path, written with `~/` where possible, so a user name does not end up in git.

### Q15.4 Where it sits on the Import page

**Recommended.** A "Guide me" button at the top that opens the interview full width. The current sections (scan, readiness, bring in a level, labels) stay under "Advanced" for people who want the manual route and for the handoff file.

**Owner's thinking:** Go with your best decisions

**Applied [2026-11-20].** As recommended: a 'Guide me' button at the top of the Import page; the current sections stay under 'Advanced' for the manual route and the handoff file.

### Q15.5 BMO's part

**Recommended.** Build 15a first: the interview and the draft without BMO. Then 15b: BMO adds name, description and label cards marked "BMO suggests", never pre-approved, and BMO's own questions appear last.

**Owner's thinking:** Go with your best decisions

**Applied [2026-11-20].** As recommended: 15a (the interview and the draft without BMO) first, then 15b (BMO adds name, description and label cards marked 'BMO suggests', never pre-approved; BMO's own questions last).

## Stop and ask if

- The interview would need to write anything into the model that is not an element, relationship, view or `dp.*` property (for example a confidence label or a BMO marker). DEC-051 and DEC-064 forbid it.
- An answer would loosen the intake for someone who is not an architect (DEC-064). The card should say who can approve it instead.
- Q15.1 (one interview or one per level) is changed to something that breaks "one level at a time" (DEC-051).
- The general context or a referenced file's content would reach BMO anywhere but inside a data block after redaction, or a file outside the code root would be read.

## Steps and agents

There is no cap on how many agents run at once. Steps 3 and 4 can run in parallel after step 2 has settled the shared types.

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed, differences listed |
| 2 | Design check: the card catalog, the interview state shape, the shared types | Plan · Opus | `src/shared/types.ts`, `src/import/analysis.ts`, `intake.ts` | A written card catalog and types, reviewed by the main session |
| 3 | Plan builder (cards from scan and analysis, the standing-question bank and floor, main-files cards), answer store, context store, `fromInterview.ts`, optional `keyCode` in the import schema | general-purpose · Sonnet | `src/import/interview.ts`, `interviewState.ts`, `fromInterview.ts`, `schema.ts`, `importer.ts` | Same scan gives the same list; every level reaches the floor; a draft builds without BMO |
| 4 | Routes, `ROUTE_RULES` and the loosening rule on answers | general-purpose · Opus | `src/server/routes/import.ts`, `src/server/auth.ts`, `intake.ts` | Answers that loosen are refused for non-architects; read-only refuses writes |
| 5 | The interview UI: stepper, cards, groups, progress, resume, keyboard | general-purpose · Sonnet | `ui/src/pages/ImportInterview.tsx`, `ui/src/hooks/useInterview.ts`, `ui/src/pages/ImportPage.tsx`, `ui/src/styles/pages.css` | Works with the keyboard; the older sections stay under "Advanced" |
| 6 | BMO cards (15b): suggest names, descriptions and labels as cards; questions from BMO as a group | general-purpose · Sonnet | `src/assistant/importTasks.ts`, `tasks.ts`, interview UI | Handoff and direct backends both work; nothing BMO writes is pre-approved |
| 7 | Tests (not the authors of steps 3 to 6) | general-purpose · Sonnet | `tests/unit/interview*.test.ts`, `tests/browser/interview.spec.ts` | Tests as listed below |
| 8 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, README, CLAUDE.md | All docs updated |
| 9 | Review | main session | — | `/code-review` (high) and `/security-review` findings fixed |

Only one agent builds the UI or runs `cd ui && npm run build` at a time, because parallel builds overwrite `static/`.

## Required in this wave

- **Routes.** Roughly: `GET /api/import/interview` (the plan and the answers), `PUT /api/import/interview/answers` (a batch), `POST /api/import/interview/build` (make the draft). Each needs a `ROUTE_RULES` entry in `src/server/auth.ts`; the first two use action `import`, building uses the same as the existing import to draft route. Settle in step 4.
- **Roles.** Answers that change `mustNotOpen` or scope follow the DEC-064 loosening rule. Viewers cannot answer.
- **Hub** and **`--read-only`.** The interview is shown read-only with the answers so far; building a draft is refused.
- **Model units, diff, merge.** The model is unchanged by the interview itself, so `modelUnits.ts` is not touched. The draft it builds goes through the normal path.
- **Byte-stable.** `interview.json` has a fixed key order.
- **Security model.** No new outbound calls. Typed answers are treated as repository data when they reach BMO: only inside data blocks (`tests/unit/bmo-core.test.ts:89`).
- **CLI.** `dp scan` prints how many questions are waiting ("23 questions; open the Import page"). No CLI interview.
- **Static export.** Not included: the interview is a working screen, not part of the model.
- **Windows.** Paths in answers use forward slashes.

## Tests

- **List stability.** The same scan and the same answers give the same list and order, twice.
- **Cards from facts.** Each group's cards come from the right facts: external systems, containers, dev-only services, components, main files, lines. A fact that is absent produces no card.
- **The floor.** A tiny codebase gets at least 6 questions at each level, the extra ones from the standing bank, and the screen says so. A codebase that already gives more gets no standing question that a card already asks.
- **Main files.** The hints fire on fixtures and not on controls; an approved card writes `dp.code.key` through the draft.
- **Context.** A card note counts as typed evidence. General context is saved in `interview.json`; a text with a secret-looking value is refused. A file inside the code root is read through the gate (a closed path is refused); a file outside is stored as a path and never read.
- **Follow-ups.** "Part of another component" adds the "which one" card; the total goes up and the screen says so.
- **Draft without BMO.** Approved cards and typed answers make an import file that passes `checks.ts` and a draft with the expected elements.
- **Rejections.** "Not right" and "Not used" items are not imported and stay rejected after a re-scan.
- **Re-scan.** Answers stay attached to unchanged items by id; a removed item's answer is dropped with a note.
- **"I don't know."** Leaves the item out and adds a checklist item.
- **Loosening.** A non-architect cannot remove a `mustNotOpen` entry through an answer.
- **Read-only and viewer.** Writes refused; the screen opens.
- **Browser.** Answer every kind of card with the keyboard; leave and come back to the same question; finish and see the draft.
- **15b.** A fake backend's proposals appear as "BMO suggests", unapproved.

## Docs

- **New DEC:** the guided interview; deterministic first; answers stored in `architecture/import/interview.json` and never in the model; an approval in the interview is the explicit accept; the question list is computed, not generated. Amends how DEC-051 describes the intake.
- **README:** the import section ("Guide me" and the question flow).
- **CLAUDE.md:** the new files in `src/import/` and the UI.
- **CHANGELOG** and **reviews.md:** this wave's entries, including what was asked of a real codebase (the owner runs one).
- **`docs/determinism.md`:** rows for this wave.
- **planned_features.md:** row 15 done; the "skeleton import without BMO" idea (2.0) is answered.

## Decided (DEC-103, 2026-11-20; assistant's reasoning, the owner may overrule)

- **N1.** The scan skips test, doc, example, script, migration, fixture, generated and third-party folders by name when it finds C3 candidates (list in DEC-103, in `EXTRA_SKIP_DIRS` of `scan.ts` only). The candidate review lists what was skipped, each with "add back".
- **N3.** Layered folders get no rule: the interview asks "are these folders one component?" when names look layered.
- **N6.** The readiness report keeps minutes, tokens and passes, and shows money only when `pricePerMTok` is set.
- **N11.** Each import step shows a fixed "no LLM" or "needs an LLM" badge.

## Out of scope

- Importing from drawings or other tools (ideas list I2.1).
- A command-line interview.
- Scanning more than one repository at a time.
- Models that ask the questions on their own: BMO adds cards; it never chooses the questions.
- Changes to what the scan reads, and drift (parked in the ideas list).

## Start prompt

```
Run Wave 15 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-15-guided-import-interview.md, and follow them. Branch from main as the
header says, run the steps with the agents and models in the table (up to 3 agents at once,
but only one builds the UI), brief each subagent with files and line ranges and the words
"never run git stash, never push", run the checks, update the docs, and commit by path. If
the wave runs long, stop at the split point (after step 5), commit, and tell me. Stop and ask
me if a "Stop and ask if" condition is met or an answer this wave needs is missing.
```
