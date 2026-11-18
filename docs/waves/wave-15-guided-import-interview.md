# Wave 15: Guided import interview

| | |
|---|---|
| **Status** | Owner answer applied (questions 0.3, 2026-11-18). Design questions Q15.1 to Q15.5 ([questions.md](questions.md)) have recommendations and are open |
| **Branch** | `feat/w15-guided-import-interview`, from `main` after Waves 5 and 1 are merged |
| **Size** | L. Split point: 15a is the interview and the import without BMO (steps 2 to 5); 15b adds BMO-proposed cards (step 6) |
| **Depends on** | Wave 5 (file roles and config facts make better cards), Wave 1 (labels and citations for the BMO cards in 15b) |
| **Owner items** | Answer 0.3 ([README.md](README.md#where-each-item-went)) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

People don't want to draw diagrams by hand, so importing a codebase has to do most of the work and ask for the rest in a way anyone can answer. This wave replaces "fill in a form, then ask BMO" with an interview:

1. **dp first makes every call it can make from the files**, with no model and no network.
2. **Then it asks the user**, in a screen that shows "Question 7 of 23". Many questions are fine: more is better than a wrong model.
3. **The answers build the draft**, without BMO. BMO can add proposals as extra cards (15b), and the interview works with the handoff backend too.

The reader is assumed to know the basics of the project, may know more, and probably doesn't know the details. So every question says what dp saw (file and line), what dp proposes, and why it is asking. Every question has an "I don't know" answer.

## Owner request covered

> For importing codebase people don't want to manually create diagrams. When importing the codebase, make all the deterministic calls, then ask questions to the user. Show it as a UI with x/y questions. Like you can show the user what you were thinking of labelling certain items and the user can approve disaprove. You can ask grouped values. It's alright asking more questions than less to ensure you are getting the correct answer. You can ask a preliminary questions that involve text based responses or choosing between options. Whatever you think is the best way to get context out of the user for this codebase. Make an assumption the user knows basic info about the project, but may know more, but probably doesn't.

Which levels are exact and which are guesses is in [questions.md](questions.md) 0.3. The interview asks about the guesses and confirms the exact facts in bulk.

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
| Shared helpers (Wave 5 roles) | "`utils/` is imported by 6 folders. It looks like shared helper code." | Keep hidden from lines · Make it a component · Make it its own container |
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

### How answers become a draft

1. Each answer is stored by a stable id taken from the scan fact (so a re-scan keeps answers for unchanged items).
2. **`src/import/fromInterview.ts`** turns the approved cards and typed answers into an import file (schema v1) and runs it through the existing `checks.ts` and `importToDraft()`. This works with no BMO.
3. An approval in the interview is the user's explicit accept: it records an `accepted` decision with who made it (`setDecision`). Items the user typed carry the typed text as evidence (DEC-064). The review screen afterwards still lists every item, with its review level computed from evidence as today.
4. "Not right" and "Not used" are remembered in the interview file, and the item is not imported. A re-import keeps the person's edits (`lastImport.ts`).
5. Nothing about the interview, confidence or BMO is written into the model (DEC-051, DEC-064). Interview answers live in `architecture/import/interview.json`.

### Rules for the question list

- **Computed, not generated.** The set of questions, their order and their wording come from fixed templates and the scan. The same scan and answers give the same list, byte for byte. Order: step, then level, then group, then path.
- **No LLM needed to run it.** BMO adds cards; it never decides which questions appear.
- **Stop and resume.** Answers are saved on each card. The user can leave, come back, go back one card, or finish later; unanswered cards stay "left" in the readiness count.
- **Skip is honest.** "I don't know" records no fact and leaves the item out of the draft, with a checklist item so it is not forgotten.
- **Keyboard.** Enter approves, keys 1 to 4 pick the answers, arrows move between cards.
- **Small codebases are short.** Fewer than the groups' thresholds means groups with one card are shown as plain questions.

## Determinism

| Output | Class |
|---|---|
| The question list, its order and wording | computed |
| Proposed names, labels and groupings from rules | computed; folder-name rules are heuristic and say so on the card |
| "Approve all" | a user's decision per item |
| Descriptions quoted from a README or docstring | computed (quoted with source) |
| Cards from BMO (15b) | proposed |

## Owner answers

- **0.3:** Make all the deterministic calls first, then ask the user. A UI with "x of y" questions. Show what dp would label and let the user approve or disapprove. Grouped questions. More questions rather than fewer. Preliminary text and choice questions. Assume the user knows basic information about the project.
- Open design questions Q15.1 to Q15.5 use their recommendations until answered.

## Stop and ask if

- The interview would need to write anything into the model that is not an element, relationship, view or `dp.*` property (for example a confidence label or a BMO marker). DEC-051 and DEC-064 forbid it.
- An answer would loosen the intake for someone who is not an architect (DEC-064). The card should say who can approve it instead.
- Q15.1 (one interview or one per level) is changed to something that breaks "one level at a time" (DEC-051).

## Steps and agents

The owner allows up to 3 agents at once. Steps 3 and 4 can run in parallel after step 2 has settled the shared types.

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files above | Anchors confirmed, differences listed |
| 2 | Design check: the card catalog, the interview state shape, the shared types | Plan · Opus | `src/shared/types.ts`, `src/import/analysis.ts`, `intake.ts` | A written card catalog and types, reviewed by the main session |
| 3 | Plan builder (cards from scan and analysis), answer store, `fromInterview.ts` | general-purpose · Sonnet | `src/import/interview.ts`, `interviewState.ts`, `fromInterview.ts` (new), `importer.ts` | Same scan gives the same list; a draft builds without BMO |
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
- **Cards from facts.** Each group's cards come from the right facts: external systems, containers, dev-only services, components, shared helpers, lines.
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
- **future_tasks:** row 15 done; the "skeleton import without BMO" idea (2.0) is answered.

## Out of scope

- Importing from drawings or other tools (future_tasks 2.1).
- A command-line interview.
- Scanning more than one repository at a time.
- Models that ask the questions on their own: BMO adds cards; it never chooses the questions.
- Changes to what the scan reads (Wave 5) or to drift (Wave 6).

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
