# Wave 23: Credentials are always sealed

| | |
|---|---|
| **Status** | Planned 2026-11-20 from planned_features A7 (owner answer D6, DEC-101: "credentials saved in the tool, encrypted and secure, without a setup step"). The design is a Proposal. Two small questions below carry recommendations that hold if left blank. Ready to run after the 0.6.0 release change |
| **Branch** | `feat/w23-sealed-credentials`, from `main` |
| **Size** | S–M |
| **Release** | 0.6.1 (a security fix: values that sit as plain text become sealed, so a patch under DEC-098) |
| **Depends on** | The 0.6.0 release change. Nothing else. Runs **before Wave 1** and before the owner's first real provider call (manual test plan U1), so the first key ever saved is already sealed |
| **Owner items** | D6 and DEC-101. Feature J and L both keep secrets here (tool connections, BMO provider keys). [../planned_features.md](../planned_features.md) A7 |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

A secret saved in dp is never on disk as plain text, and a person does not have to set anything up for that. Without `DP_SECRET_KEY`, dp makes and keeps its own key outside every project and hub folder. If neither a key from the environment nor a key file can be used, dp refuses to save a secret and says why; it never falls back to plain text.

## Owner request covered

> D6: credentials are saved in the tool, encrypted and secure, without a setup step.

## What exists today [Fact; anchors from planned_features A7, re-anchor first]

- `src/core/credentials.ts` seals with AES-256-GCM, a key from scrypt with a fresh salt per value, and the name and provider as associated data (`seal`, `open`). The store takes the secret as a constructor argument, default `process.env.DP_SECRET_KEY`; with none, `stored()` writes the value as plain text.
- The store is built from the variable in four places: `src/server/routeContext.ts` (near line 384), `src/server/hub.ts` (near 216), `src/server/routes/hub.ts` (near 210) and `src/cli.ts` (near 655).
- The list carries `encryptsNew` (`src/shared/types.ts`, near line 1290); the Credentials page and `dp credentials list` say values are not encrypted when it is false (`src/cli.ts`, near line 300).
- A value sealed with another key shows as `locked`. The masked hint (last four characters of a value of 12 or more) is stored in plain text beside the value.
- Documented in `README.md`, `docs/CONTRIBUTING.md` (security model), `.claude/CLAUDE.md` and the manual test plan (MT-DRAFT-163, MT-DRAFT-181, gap G-36).

## Design [Proposal]

1. **A key source order.** `DP_SECRET_KEY`; else a key file dp creates: 32 random bytes, mode 0600, in a mode 0700 folder under `$XDG_CONFIG_HOME/dp/` or `~/.config/dp/` (`%APPDATA%\dp\` on Windows). Never in a project or hub folder.
2. **A `KeySource` in `credentials.ts`** with those two routes, injected for tests so no test touches a real home folder.
3. **A refusal with the reason** when neither works (read-only home, no folder). Saving fails; reading plain values already on disk still works.
4. **Sealing of existing plain values** the first time a writable server or a `dp credentials` command opens the store, and `dp credentials seal` for doing it on demand. `dp check` and the Credentials page warn while plain values remain.
5. **`encryptsNew` goes away**; a `plainValues` count replaces it in the list and in `src/shared/types.ts`.
6. **The documents above change in the same commit.**

## Determinism

Computed: same key and value, a valid sealed value; the check for plain values is a count. Nothing here is BMO's. Add a row to `docs/determinism.md`.

## Owner answers

None yet beyond D6 and DEC-101.

## Questions, options and answers

### Q23.1. Keep the four-character hint?

**Why it matters.** The hint is stored in plain text beside a sealed value; for a 12-character token it reveals a third of the end.

**Options**
1. Keep it (it helps a person tell two keys apart).
2. Drop it and show only the provider and name.
3. Keep it only for values of 20 characters or more.

**Recommended.** Option 3: it keeps the useful case (long API keys) and removes it where it leaks most.

**Owner's thinking:** *(blank: the recommendation holds)*

### Q23.2. Build `dp credentials rekey` now?

**Why it matters.** A new key for all values is needed when the key file is lost or leaked; it is not needed to meet D6.

**Options**
1. Not now; a lost key means re-entering values (they show as `locked`).
2. Build it now.

**Recommended.** Option 1. Re-entry is rare and the command is a security-sensitive path of its own; add it when someone asks.

**Owner's thinking:** *(blank: the recommendation holds)*

## Stop and ask if

- The key file route needs a place that works differently on a platform you cannot test (record it as "not verified" instead of guessing).
- Any existing test relies on plain storage in a way that cannot be changed without hiding a real regression.
- An operating-system keychain looks easy (it is a later third key source, not this wave).

## Steps and agents

| Step | Agent | Work |
|---|---|---|
| 1 | Explore · Haiku | Re-anchor the files and lines above; list every test that builds a credentials store |
| 2 | general-purpose · Opus | `KeySource`, sealing of old values, the refusal, `dp credentials seal` (security-sensitive) |
| 3 | general-purpose · Sonnet | The four call sites, the types, the page and the CLI text; docs |
| 4 | general-purpose · Sonnet (a different agent from 3) | Tests |
| 5 | the wave agent | `/code-review` (high) and `/security-review`; fix findings |

## Required in this wave

- No route is added; if one is, it gets a `ROUTE_RULES` entry (README rules).
- Works in a hub with per-project roles and with `--read-only` (a read-only server never writes a key file or seals).
- File modes (0600 file, 0700 folder) are set on creation and checked in tests; paths work on Windows (the Windows route is written but marked not verified).
- Nothing logs a key or a value.

## Tests

- A new key is created with the right modes; a second open reads the same key.
- `DP_SECRET_KEY` wins over a key file.
- A missing folder is created; a read-only folder refuses a save with the reason and never writes plain text.
- An old plain file is sealed on first writable open and the plain count falls to 0; `dp credentials seal` does the same.
- A value sealed with another key shows as `locked`.
- A read-only server leaves an old plain file untouched.
- Tests pass the key or the key file's path; none reads the real home folder.

## Docs

- **New DEC** at the end of the secrets subtopic (SEC): the key source order and the refusal; it updates DEC-056 and DEC-063 with "Now:" lines. **README**, **CONTRIBUTING** security model, **CLAUDE.md**, **manual-test-plan** (MT-DRAFT-163, MT-DRAFT-181, G-36), **planned_features.md** A7: mark built. `docs/determinism.md` row. The review file's "Notes for the release entry" carry the 0.6.1 lines.

## Out of scope

- An operating-system keychain (a later third key source).
- Hosted key management (A6, after 1.0.0).
- Protecting against someone who has the account (the key file sits on the same machine; the entry says so).

## Start prompt

```
Run Wave 23 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-23-sealed-credentials.md, and follow them: branch from main as the header
says, run the steps with the agents and models in the table, brief each subagent with files
and line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
