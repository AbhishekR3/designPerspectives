# Wave 25: BMO for people with a subscription and no API credits

| | |
|---|---|
| **Status** | Planned 2026-11-20 from planned_features A2 (the owner confirmed the direction on 2026-11-20) and the first half of A4. The design is a Proposal. Three questions below carry recommendations that hold if left blank. Ready after Waves 1 and 2 |
| **Branch** | `feat/w25-bmo-own-subscription`, from `main` after Waves 1 and 2 are merged |
| **Size** | M–L (split point: 25a handoff for text tasks, route status and the default; 25b the paste box) |
| **Release** | 0.7.0 (with Waves 24, 1, 2, 29) |
| **Depends on** | Wave 1 (the citation checker must also check a handoff result; **and Wave 1's real-run gate must have passed**, so the contract is known to work against a real model before BMO is switched on for everyone) and Wave 2 (the deterministic BMO and the "Use an LLM" setting of COD-10, so "on" is useful with no LLM at all). Wave 2 deliberately leaves the default as one constant and writes no "off by default" text; this wave changes that constant and the tests that follow it (second look at the waves, 2026-11-20) |
| **Owner items** | "BMO is a fundamental part of dp, so it should be on from the start", and people with an LLM subscription but no API credits must be able to use it. Feature L of [../product-vision.md](../product-vision.md). [../planned_features.md](../planned_features.md) A2 and A4 |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

BMO is on from the start, and a person with a chat subscription and no API key can use every BMO task, with themselves as the go-between. Nothing is ever sent anywhere without a choice: the default backend stays `handoff`.

## What exists today [Fact; anchors from planned_features A2 and A4, re-anchor first]

- `DEFAULT_SETTINGS.enabled` is `false` (`src/assistant/settings.ts`, near line 82); the default backend is `handoff`. `canRun` also refuses when the backend is not `direct` (near line 332), so with default settings the in-app buttons open an explanation instead of running.
- `HANDOFF_TASKS` has three import tasks: `import-level`, `describe-to-model`, `suggest-labels` (`src/assistant/importTasks.ts`, near line 32). The text tasks (explain, challenge, ask, draft summary, decision from draft) have no handoff route.
- The handoff writes `prompt.md`, `evidence-digest.md`, `schema.json`, `intake.json` and `feedback.json` to `architecture/import/handoff/` and expects `result.json`; a result is refused if its manifest hash does not match the prompt that was shown. The person gives their agent one line, which assumes an agent that can read and write files.
- COD-10 (accepted, not built; Wave 2 builds it) defines `enabled` as "Use an LLM", with a deterministic BMO that answers commands from the model.
- Guarantees that exist and must stay: the server builds every prompt and picks every file; a run needs the hash of a preview; the CLI sends nothing without `--yes-send`; secrets are masked; cloud providers are pinned to their hosts; settings are outside git with mode 0600; only architects change settings; the handoff backend calls no model.
- Places that assume "off by default": `README.md` (near line 101), `.claude/CLAUDE.md` (near line 74), `docs/CHANGELOG.md`, `demo/README.md`; unit tests `bmo-settings`, `bmo-api`, `cli-bmo`, `bmo-direct`; browser tests `bmo.spec.ts` and `import.spec.ts`.

## Design [Proposal]

**25a**
1. **A default of "on" with `backend: handoff`**, using Wave 2's relabelled setting ("Use an LLM"; the deterministic BMO is available either way).
2. **A route status** (`direct`, `handoff` or `none`) in the BMO status, so the UI says "ready through your own agent" instead of "cannot run".
3. **Handoff for the text tasks.** The prompt is written to a file, the person's agent or chat answers, and the answer is read back from `result.json`, checked by the task's validator, Wave 1's citation checker and the hash in the manifest, then shown (a text answer is shown, not stored; COD-08).
4. **A new decision entry** that supersedes the "off by default" wording of PRO-01, COD-02, COD-08 and COD-10 (each gets a "Now:" line).

**25b, the paste box (the first half of planned_features A4)**
5. One copy button for one block, with the size shown against a limit the person can set.
6. The prompt asks for the answer in a single fenced block.
7. A paste box that checks the reply at once and says exactly what is wrong (cut off, wrapped in prose, not valid JSON, wrong hash), so the person can paste that message back to the chat.
8. dp remembers which chat app the person uses (a local preference), so the instructions match it.

Splitting a long prompt into numbered parts and keeping a multi-reply interview going belong to Wave 15, which has the interview.

## Determinism

The route status, the hash check, the validators and the citation check are computed. Everything the person's agent writes is **proposed** and labelled as before. Add rows to `docs/determinism.md`.

## Owner answers

The direction of A2 (2026-11-20).

## Questions, options and answers

### Q25.1. Are text answers that arrive by file stored?

**Options**
1. Shown, not stored (as for the direct route, COD-08).
2. Stored in `architecture/import/` with the manifest.

**Recommended.** Option 1: one rule for both routes; nothing BMO wrote enters the repository by itself.

**Owner's thinking:** *(blank: the recommendation holds)*

### Q25.2. Does the deterministic BMO come first?

**Why it matters.** "On" with no LLM is only useful if Wave 2's deterministic commands exist.

**Recommended.** Yes, which is why this wave runs after Wave 2. If Wave 2 slips, this wave still builds 25a's handoff and the status, and leaves the default off until Wave 2 lands.

**Owner's thinking:** *(blank: the recommendation holds)*

### Q25.3. Do `dp context` and an MCP server replace the file route later?

**Recommended.** Keep the file route for people whose agent cannot read the folder; revisit with PRO-12 after Wave 2's `dp context` exists. Not part of this wave.

**Owner's thinking:** *(blank: the recommendation holds)*

## Stop and ask if

- Turning the default on would send anything without a hash-checked preview.
- A text task cannot be given a validator (it must not have a handoff route without one).
- Wave 2 has changed the setting's name or meaning from COD-10.

## Steps and agents

| Step | Agent | Work |
|---|---|---|
| 1 | Explore · Haiku | Re-anchor `settings.ts`, `importTasks.ts`, `handoffBackend.ts`, `canRun`; list the tests and docs that assume "off" |
| 2 | general-purpose · Opus | Route status, the handoff for text tasks with the citation check, the default change (trust boundary) |
| 3 | general-purpose · Sonnet | UI strings and states, `BmoSheet`, CLI text, the paste box (25b) |
| 4 | general-purpose · Sonnet (a different agent from 2 and 3) | Tests; update the tests that assumed "off" |
| 5 | the wave agent, with the owner | **One real handoff round trip before the wave closes** (second look at the waves, 2026-11-20): write a text-task prompt, give it to a real chat app or agent the owner uses, paste the reply into the box, and check that the answer is accepted or refused for the right reason. Wave 1's real run proves the contract on one route; the paste route is a different way for text to arrive (wrapped in prose, cut off, pasted with fences) and was never run either. Write what the chat app did wrong, if anything, into the review file and into the paste box's error messages |
| 6 | the wave agent | `/code-review` (high) and `/security-review`; fix findings |

## Required in this wave

- New non-GET routes get `ROUTE_RULES` entries; only architects change settings.
- Works in a hub with per-project roles and with `--read-only`.
- Nothing is sent without the hash of a preview; nothing is stored from a text answer.
- Output is byte-stable; new UI is keyboard reachable.

## Tests

- With defaults, status reports `handoff` ready and the UI says so; with a key and `direct`, status reports `direct`.
- Each text task has a handoff round trip: write prompt, read a valid `result.json`, show; a wrong hash is refused; a forged cite is held back.
- The paste box names each failure (cut off, prose-wrapped, invalid JSON, wrong hash).
- The updated tests that assumed `enabled: false` pass with the new default; no request leaves the machine in the default.

## Docs

- **New decision entry** (COD topic, BMO) with "Now:" lines on PRO-01, COD-02, COD-08 and COD-10. **README**, **CLAUDE.md**, **demo/README.md**, **manual-test-plan**, **planned_features.md** A2 and A4 (first half): mark built. `docs/determinism.md` rows.

## Out of scope

- Splitting a long prompt into parts and multi-reply interviews (Wave 15).
- Sending anything without a choice; a default `direct` backend.
- Reading the person's subscription or account in any way.

## Start prompt

```
Run Wave 25 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-25-bmo-own-subscription.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
