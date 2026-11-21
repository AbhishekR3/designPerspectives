# Wave 20: A real back-and-forth about an existing system

| | |
|---|---|
| **Status** | Owner answer applied (questions C8, 2026-11-19: a true back-and-forth, with more questions as the code grows; add it to the checklist). Design is a proposal; the open points are listed below. Ready after Waves 1, 2, 5 and 15 |
| **Branch** | `feat/w20-system-conversation`, from `main` after Wave 15 is merged |
| **Size** | L. Split point: 20a is the round planner and the loop with the handoff and direct backends (steps 2 to 4); 20b is the actions that write to the model (step 5) |
| **Release** | 0.11.0 (with Waves 13, 14, 22; after Wave 22) |
| **Depends on** | Wave 1 (templates, packs, citations, labels), Wave 5 (key code and code search), Wave 15 (the interview, `interview.json` and the context file). Wave 7 (model coupling), Wave 2 (notes) and Wave 14 (the word index for choosing excerpts) and Wave 22 (digests of the parts not in focus) improve it and are not required |
| **Owner items** | Feature H and the vision's opening problem: "understanding an existing system architecture/codebase is difficult" (answer C8) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave. Also read [../import-design.md](../import-design.md) (what the import is for and what matters to C4 at each level) and the import choices N1 to N15 in [DEC-103](../decisions.md#pro-19--dec-103--code-import-and-bmo-choices-and-the-080-split-n1-to-n15), which change what this wave builds (see its "Decided" section if it has one).

## Goal

Understanding an existing system is a conversation, not one question about one scope. dp and BMO talk with the person in rounds. Each round looks at one part of the system, says what BMO sees, and asks the person what the code cannot say. The bigger or more tangled the system, the more rounds and questions there are, and the person can always ask for more or stop. What the person says carries into later rounds and can end up as notes, decisions or model changes, only when the person says so.

## Owner request covered

> Have a true back and forth, not just one scope at a time. As code becomes larger or more complex, you can ask more questions to the user. Add this to the checklist.

## What exists today [Fact]

- **BMO chat** (DEC-073): ask about named objects; every message is previewed (the exact prompt and its hash) and sent only when confirmed (DEC-064). A chat message gets at most 24,000 tokens of code (`src/assistant/runTask.ts:324`).
- **A run over the size limit is refused**; there is no multi-pass (`src/assistant/settings.ts:100-103`, DEC-065, planned_features B4).
- **Import tasks** work one C4 level at a time, with a scan that decides what it can without a model (`src/import/scan.ts`, `analysis.ts`).
- **The checklist** (DEC-084) already holds BMO's questions from an import (`checklist.ts` `addFromImport`).
- **Wave 15 (planned)** is the deterministic interview: plain questions, then approve/disapprove cards; BMO's cards come last (15b). It is one pass, per level.
- **Answers a person types** reach BMO as user text inside data blocks, never in system text (`prompts.ts`, `tests/unit/bmo-core.test.ts:89`).

## Design [Proposal]

1. **Rounds, planned by dp.** A round is one BMO run with one scope: the system, then each container, then the components that matter in it. dp plans the rounds from facts, with no model: the number of containers, components and files, unmapped code, key code pinned or missing (Wave 5), and, where Wave 7 is merged, the model's cycles and coupling. None of these needs a language reader. A small system gets a few rounds; a large one gets one per container and extra rounds where the facts show something tangled. The plan is shown as "Round 3 of about 12", and the person can add a round for any object ("go deeper here") or skip one.
2. **Every round is previewed and confirmed**, as everywhere (DEC-064): the sheet shows the prompt, the files and bytes, and a hash. A plan of rounds is not a blanket permission. Each round stays under the run limit by construction: dp splits a scope that would not fit, and never sends a cut-off one.
3. **A fixed template per round kind** (Wave 1's registry): system overview, container, component, and "follow up". Each has a version and its own answer shape.
4. **The answer is two lists, both checked.**
   - **Statements** with citations, checked by the Wave 1 verifier, shown with the usual labels.
   - **Questions for the person**, each `{id, text, kind: choice or text, options, why, cites}`. A question must say what prompted it ("`billing/` imports `orders/` in 14 places but the model has no line"); a question without a cite is marked "no evidence given". dp can drop a question that asks for something the scan already knows.
5. **More questions as the system grows.** The number of questions allowed in a round is computed: a base, plus a step for the scope's size and for each tangle found (model cycles, unmapped code, components with no key code), up to a cap. The person can raise the cap, ask "more questions" in a round, or press "enough". BMO is told the cap in the prompt, and dp discards extra questions beyond it.
6. **The person answers** by choice or text, or skips, or says "I don't know". Skipped and unknown stay visible as open.
7. **Memory between rounds.** A fixed block, "What you told me", holds the person's answers in order, as user text in a data block, within a budget (the oldest are dropped whole and listed in the manifest). The statements BMO made earlier and the person accepted are carried the same way.
8. **Nothing is written until a button is pressed.** After a round the person can:
   - **save an answer as a note** on an object (`dp.notes`, through a draft for engineers);
   - **turn the round into model changes**: an import file for the objects it found or corrected, through the existing import path, check and review (DEC-051, DEC-064), so it ends in a draft;
   - **propose a decision** from an answer (the `decision-from-draft` path, in a draft);
   - **add an open question to the checklist** (the existing route).
9. **State.** `architecture/import/conversation.json`, next to `interview.json`, outside the model, fixed key order: the plan, each round's selectors and hash, the person's answers and who gave them, and what was saved where. It never holds a prompt, a code excerpt or a secret (the prompt is rebuilt from selectors and answers).
10. **Both backends.** With the handoff backend, a round is a prompt file and a `result.json` brought back, and the loop reads the same answer shape. With a direct backend, it is one call per round.
11. **Where it lives in the UI.** "Talk it through" on the Import page and in a diagram's menu: a column of rounds, the current round's statements with chips, its questions as cards ("question 2 of 5 in this round"), and buttons: answer, skip, more questions, go deeper, enough.
12. **The checklist.** The in-app "Importing a codebase" starter list gets an item "Talk through the system with BMO until you're satisfied" that dp ticks itself when every planned round is answered, skipped or marked enough. It is a checklist item, not a model change. The 1.0.0 release checklist in ideas list I2.0 gets the same wording.

## Determinism

| Output | Class |
|---|---|
| The round plan, the question cap, the packs, the verifier | computed |
| BMO's statements and questions | proposed, labelled, cited |
| The person's answers | the person's own text, kept as typed |

## Owner answers

- **C8:** a true back and forth, more questions as code grows, added to the checklist. The checklist is read as the in-app list (item above) **and** the 1.0.0 release checklist.
- **2026-11-20:** the facts that plan rounds include import cycles only where Wave 5's generic reader finds them (approximate), and no longer include shared helpers (not singled out). The person's context from Wave 15 (general context and referenced files) joins "What you told me", inside data blocks after redaction.
- Open (assumed): the person answers in a round before the next is previewed, so every round sees the answers; "ask me everything now" in one go is not built.

## Questions, options and answers (moved from questions.md)

*Moved from the deleted `questions.md` on 2026-11-20, with the owner's words as written. In the quotes, `future_tasks.md` and `backlog.md` mean the old backlog, now [planned_features.md](../planned_features.md) and the owner's private ideas list; `docs/waves/v1-scope-review.md` was decided in DEC-104.*

### C8. Does "understanding an existing system" need more than the import and the explain tasks?

**Analysis** [Fact]. The vision's first problem is understanding an existing system. What dp has or plans: the scan and the guided interview build the model (Waves 5, 6, 15); BMO explains an object, a diagram or a draft from the model and code excerpts (Wave 1 makes them cited); `dp context` prints the same pack for coding agents (Wave 2). A run over the token limit is refused, and multi-pass summarising for a whole large repository is not built (DEC-065, planned_features B4, Large).

**Options**
1. As planned: explain one scope at a time.
2. Add a "system tour" task: BMO explains the system from the model first, then walks the containers one by one, each a small cited run.
3. Build multi-pass summarising for whole repositories.

**Recommended.** Option 1 for 1.0.0, then option 2 if real runs show people want one page about the whole system. Option 3 is large and not needed by the twelve features. Note that no real LLM run has been made yet; 1.0.0's checklist should include a real run per provider you support.

**Owner's thinking:** Have a true back and forth, not just one scope at a time. As code becomes larger or more complex, you can ask more questions to the user. Add this to the checklist.

**Applied [2026-11-19].** A new wave, [Wave 20: a real back-and-forth about an existing system](wave-20-system-conversation.md). dp plans rounds from facts about the system (containers, components, files, cycles, unmapped code); each round is one previewed BMO run on one scope that returns cited statements and questions for the person; the number of questions allowed grows with size and tangle, and the person can ask for more, go deeper or stop; the person's answers carry into later rounds. Nothing is written until a button is pressed. "Add this to the checklist" is applied twice: an item on the in-app "Importing a codebase" list that ticks itself when every round is answered, skipped or ended, and a line on the 1.0.0 release checklist in ideas list I2.0.

## Stop and ask if

- A round would need more code than the run limit allows even for the smallest scope. That is the multi-pass design (planned_features B4), a separate decision.
- The conversation file would need to hold a prompt, an excerpt or a secret.
- A question's answer would be written into the model without a button press, or labelled in the model as BMO's (DEC-051, DEC-064 forbid it).
- The person asks for the plan to run without a preview per round.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files in "What exists today" | Anchors confirmed or corrected |
| 2 | Design check: round planner and question cap | Plan · Opus | `src/import/analysis.ts`, `src/assistant/runTask.ts`, `contextPack.ts` (Wave 1) | One agreed rule for rounds and the cap, with worked examples on the demo and two fixtures |
| 3 | Planner, templates, packs, memory block, answer shape and verifier | general-purpose · Opus | `src/assistant/conversation.ts` (new), `prompts.ts`, `tasks.ts`, `runTask.ts`, `citations.ts` | Byte-stable packs; cap enforced; answers verified; text in data blocks only |
| 4 | State, routes, CLI | general-purpose · Sonnet | `src/server/routes/bmo.ts` or a `conversation` area, `src/server/auth.ts`, `src/shared/types.ts`, `src/cli.ts`, state reader | `ROUTE_RULES` entries; state byte-stable |
| 5 | Actions that write: note, import file, decision, checklist | general-purpose · Opus | `modelEdits.ts`, `src/import/importer.ts` path, `decisions` path, `checklist.ts` | Each writes only on a press; drafts for engineers |
| 6 | UI | general-purpose · Sonnet | `ui/src/pages/ImportPage.tsx`, `ui/src/common/` (a `Conversation.tsx`), `hooks/useBmo.ts` | Keyboard reachable; every round previewed |
| 7 | Tests (not the authors of 3 to 6) | general-purpose · Sonnet | `tests/unit/conversation*.test.ts`, `tests/browser/conversation.spec.ts` | As listed below |
| 8 | Docs and checklist item | general-purpose · Sonnet | decisions.md, CHANGELOG, reviews.md, CLAUDE.md, README, `checklist.ts` `STARTERS`, ideas list I2.0 | Docs and both checklists updated |
| 9 | Review | main session | — | `/code-review` (high) and `/security-review` findings fixed |

## Required in this wave

- **Routes.** Each new non-GET route has a `ROUTE_RULES` entry; BMO's allowed roles apply (DEC-065).
- **Hub.** BMO settings are hub-level (DEC-064); the conversation is per project.
- **Read-only mode.** Rounds still run; every writing action is refused.
- **Security model.** In CONTRIBUTING: answers are user text in data blocks; the conversation file holds no prompts or code; every round is previewed.
- **Static export.** Not included.

## Tests

- **Planner.** Same facts, same plan; a bigger fixture gets more rounds and a higher cap; the person's "go deeper" adds a round.
- **Cap.** Extra questions beyond the cap are dropped; "more questions" raises it.
- **Packs.** Byte-identical; "What you told me" within budget, oldest dropped whole and listed; text never in system text (the existing test).
- **Verifier.** A question with no cite is marked; a forged cite is refused.
- **State.** Round trip byte-stable; no prompt, code or secret in it.
- **Actions.** None writes before its button; an engineer's goes into a draft; the import file passes the existing checks.
- **Checklist.** The item ticks when every round is answered, skipped or "enough".
- **Browser.** With the fake backend: run two rounds, answer, go deeper, press enough, save an answer as a note.

## Docs

- **New DEC:** the conversation (rounds, question cap, memory, actions, state file). **CHANGELOG**, **reviews.md**, **CLAUDE.md** (`conversation.ts`, `Conversation.tsx`), **README** (BMO section).
- **docs/determinism.md:** rows. **checklist.ts** `STARTERS` and ideas list I2.0: the checklist items.

## Out of scope

- Multi-pass summarising of a whole repository in one run (planned_features B4).
- Questions asked without a preview.
- Voice or email.
- Keeping BMO's chat history across sessions beyond this file.

## Start prompt

```
Run Wave 20 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-20-system-conversation.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
