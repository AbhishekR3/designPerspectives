# Planned features

Features with a clear scope that are meant to be built. Each entry says what exists today, what is missing and what is still open, so that someone new can pick one up. Ideas that are still being thought through are not here. Scheduling (which release or wave builds what) is in [waves/README.md](waves/README.md), together with the work that no feature entry covers. For what dp is for and what 1.0.0 contains see [product-vision.md](product-vision.md).

Status: **draft, 2026-11-21.** Nothing in this file is decided or built unless an entry says so.

## How to help

1. Pick an entry, or open an issue to propose one. For anything larger than a small fix, agree the approach first ([CONTRIBUTING.md](CONTRIBUTING.md)).
2. Read [decisions.md](decisions.md) for the decisions named in **Technical Notes** before you change a design choice. A change that makes a new choice adds a decision at the end of its topic in that file.
3. Read the map of the source in [.claude/CLAUDE.md](../.claude/CLAUDE.md) (the architecture section) and the overview in [architecture.md](architecture.md) (a draft).
4. Branch from `main`. Run the checks listed in CONTRIBUTING before you send the change.

## The format of an entry

Each feature has a heading `# [Feature Code] - [Feature Code Title]`, then one section `## [Feature Code] - [XX]` with these parts, in this order. Keep facts apart from interpretation: say where a fact comes from (a file, a decision number), and mark a proposal as a proposal.

| Part | What it holds |
|---|---|
| **Status** | `Proposed`, `Accepted`, `Development`, `Testing` or `Completed` |
| **Feature Information** | What the feature is, in plain words |
| **Value this feature provides** | The problem it solves and for whom |
| **Current implementation** | To what extent the current tool and features already give that value (facts, each with a file or decision number) |
| **Proposal** | A high-level rundown of how to implement it and how to validate it |
| **Technical Notes** | Files, trade-offs, open technical questions, size (S: days or less, M: about a week, L: more) and decision numbers |
| **Non-technical notes** | Owner decisions, scope, wording, documents to change, open questions for the owner |

---

# A1 - Live connections to Codacy, SonarQube and Jira

## A1 - 01

- Status: Proposed
- Feature Information: Findings and tickets live in other tools. dp shows them as linked work on the architecture. This feature makes the connections live and extends them to the tools teams use: a Codacy adapter, updates without a person pressing refresh (webhooks, unattended pushes with API keys, a refresh across every project from the hub's Work page), GitHub security alerts as a source, and creating issues from a draft.
- Value this feature provides: Architects see the current state of findings and tickets on the diagram without leaving dp or refreshing by hand, across the tools their teams use.
- Current implementation: Largely there for the tools that are built.
  - Linked work can be pinned to elements, relationships, diagrams, flows or the project, with an overlay and a Work page, per project and across projects (WRK-02, WRK-03, WRK-05).
  - Status can be refreshed on request from GitHub, GitLab, SonarQube and SonarCloud, and Jira (WRK-01, WRK-02); one adapter per tool is in `src/core/workTools/`.
  - Report files can be imported with no network: SARIF, GitLab Code Quality, SonarQube issues and a dp JSON format (`dp work import`, WRK-02). The severity mapping is editable (WRK-04).
  - Credentials are write-only and kept in the hub or project folder (`src/core/credentials.ts`); tool connections are in `.dp/integrations.json`, changed by architects only.
  - Not there: a Codacy adapter (and Codacy's report format, if SARIF does not cover it), any unattended refresh, GitHub security alerts, issue creation from a draft.
- Proposal: [interpretation] Add a Codacy adapter next to the others in `src/core/workTools/`, with strict link matching and a pinned API root. Add an optional refresh across all projects from the hub's Work page. Treat webhooks and unattended pushes as a second step, after the question of where tokens live in CI is answered. Validate with adapter tests against recorded responses, as the existing adapters do, and one manual check per tool against a real account.
- Technical Notes:
  - Size: M.
  - Links: WRK-01, WRK-02 to WRK-05, PRO-15.
  - Open: how often to refresh and who pays the rate limits; whether a hosted webhook receiver is in scope for a tool that runs on the user's own machine; where tokens are kept when dp runs unattended in CI.
  - The Codacy adapter is a small addition to the work adapters. The live parts are not needed for 1.0.0.
- Non-technical notes: Vision feature J names GitHub, SonarQube and Jira, and those are built. Cloud-provider integration (live cloud inventory) is a separate, later idea and is not part of this entry.

---

# A2 - BMO on by default, with handoff for all tasks

## A2 - 01

- Status: Proposed (the owner confirmed the direction on 2026-11-20)
- Feature Information: BMO, the assistant, is on from the start, with `handoff` as the default backend so that nothing is sent without a choice. Every task, text tasks included, can run through the person's own agent or chat: dp writes the prompt to a file, the agent answers, and dp reads the answer back, checks it and shows it. A status says which route is ready (`direct`, `handoff` or `none`). The setting is relabelled "Use an LLM" (COD-10).
- Value this feature provides: BMO is a fundamental part of dp, so it should work from the first run. People who have an LLM subscription but no API credits can use it.
- Current implementation: Partly. The handoff route exists for import tasks only, and BMO is off by default.
  - `DEFAULT_SETTINGS.enabled` is `false` (`src/assistant/settings.ts`, near line 82). The default backend is `handoff`.
  - `canRun` also refuses when the backend is not `direct` (near line 332). With the default settings the in-app buttons open an explanation instead of running, so turning `enabled` on alone would not help someone with no API key.
  - `HANDOFF_TASKS` has three import tasks: `import-level`, `describe-to-model`, `suggest-labels` (`src/assistant/importTasks.ts`, line 32). The text tasks (explain, challenge, ask, draft summary, decision from draft) have no handoff route.
  - COD-10 (accepted, not built) defines `enabled` as "Use an LLM", off by default, with a deterministic BMO that answers commands from the model (`find`, `help`, `show`, `notes`, `decisions about`). The planned `dp find`, `dp help` and `dp context` do not exist yet.
  - Nothing in the code import is blocked when BMO is off.
  - Guarantees that exist: the server builds every prompt and picks every file; a run needs the hash of a preview; the CLI sends nothing without `--yes-send`; secrets are masked; cloud providers are pinned to their hosts; the settings file is outside git with mode 0600; only architects change settings; the handoff backend calls no model.
- Proposal: [interpretation]
  1. Default to `enabled: true` while `backend` stays `handoff`.
  2. Add a route status (`direct`, `handoff` or `none`) so the UI can say "ready through your own agent" instead of "cannot run".
  3. Add handoff for the text tasks: the prompt is written to a file, the person's own agent or chat answers, and the answer is read back from `result.json`, checked by the task's validator and the hash in the manifest, and shown (a text answer is shown, not stored).
  4. Relabel the setting as in COD-10.
  5. Record a new decision that supersedes the "off by default" wording of PRO-01, COD-02, COD-08 and COD-10.

  Validate with the unit and browser tests listed below updated to the new default, plus one real handoff round trip through the agent the owner uses.
- Technical Notes:
  - Size: M to L.
  - Links: PRO-01, PRO-12, COD-02, COD-03, COD-08, COD-10, COD-11.
  - Places that assume "off by default" (so the change can find them): `README.md` (line 101), `.claude/CLAUDE.md` (line 74), `docs/CHANGELOG.md`, `demo/README.md`; unit tests `bmo-settings`, `bmo-api`, `cli-bmo` and `bmo-direct`; browser tests `bmo.spec.ts` and `import.spec.ts`.
  - Trade-offs: a subscription user with no API credits gets a working BMO. A "ready" label for a route that needs a copy-and-paste step may mislead. Text answers through a file are slower than a direct call.
  - Open: whether `dp context` and an MCP server replace the file route later (PRO-12).
- Non-technical notes: Open for the owner: whether text answers that arrive by file should be stored, and whether the deterministic BMO of COD-10 is built first, so that "on" is useful with no LLM at all. See A4 for the second half of the subscription work.

---

# A3 - Removing a project from a hub

## A3 - 01

- Status: Proposed (the owner chose "Remove from hub, plus an optional, separately confirmed step that also deletes the files", 2026-11-20)
- Feature Information: A Remove action on the home-page project cards. Two confirmations: "Remove from this hub", then, separately, "also delete the files", which names the folder. Behind it, `Hub.removeProject(id, {deleteFolder})` and `DELETE /api/hub/projects/:id` for architects.
- Value this feature provides: A new hub includes the demo project (HUB-05). A person must be able to remove it, or any other project, without editing `hub.json` by hand.
- Current implementation: None for removal; adding exists.
  - `initHub` adds the demo project to a new hub (`src/server/hub.ts`, lines 172 to 193). A single-project `dp serve` starts empty unless `--demo` is given (`src/cli.ts`; HUB-01).
  - There is no `Hub` method, route, button or command that removes a project. HUB-05 says the project "can be removed by hand from `hub.json`".
  - Adding a project is `Hub.addProject` and `POST /api/hub/projects`. The new-project dialog already offers "Demo bank" as a template, so a removed demo can be added again.
  - The hub keeps one app per project (`apps` in `src/server/hub.ts`), each with a System Testing session that must be closed.
- Proposal: [interpretation]
  - `Hub.removeProject(id, {deleteFolder})`: refuse the shared catalog and an unknown id; close the project's app and testing session; drop its sync keys; rewrite `hub.json` (`writeHubFile`).
  - `DELETE /api/hub/projects/:id` for architects, registered in `src/server/auth.ts`.
  - The two-step confirmation in `ui/src/pages/HomePage.tsx` (the `confirmDialog` pattern).
  - Guards for deleting files: only a folder inside the hub, or the exact folder listed in `hub.json`; never follow a symlink; the folder must contain `architecture/`.
  - Tests: remove, remove with files, catalog refused, a folder outside the hub kept, an unknown id, and viewers and engineers refused.
- Technical Notes:
  - Size: M.
  - Links: HUB-01, HUB-04, HUB-05, HUB-07. A new decision would amend HUB-05.
  - Trade-offs: unlisting is safe and reversible; deleting files is not, so it is a separate step. A removed project's entries in the users file and in `.dp/bmo.json` (`projects`) are either left (harmless, stale) or cleaned (more code).
- Non-technical notes: Open: what to do with those stale entries; whether a single-project server should offer the demo from its home page.

---

# A4 - Using an LLM subscription (copying between dp and a chat app)

## A4 - 01

- Status: Proposed
- Feature Information: Make it comfortable to use a paid LLM app (the Claude or OpenAI app or web page) as the model behind dp, with the person as the go-between and the text moved back and forth with as little effort as possible. Parts: one copy button for one block with the size shown against a limit the person can set; a prompt that asks for the answer in a single fenced block; a large prompt split into numbered parts that each fit; a paste box that checks the reply at once and says exactly what is wrong, so the person can paste that message back to the chat; dp remembers the chat app the person uses so the instructions match it; a smaller import for chat-only users (paste the digest, get the import file back in one reply).
- Value this feature provides: Many people pay for an LLM app but not for API credits. They can use their own subscription with dp.
- Current implementation: The file route works for agents that can read and write files; the chat route does not exist.
  - The handoff writes `prompt.md`, `evidence-digest.md`, `schema.json`, `intake.json` and `feedback.json` to `architecture/import/handoff/` and expects `result.json` back. The person gives their agent one line: "Read `architecture/import/handoff/prompt.md` and follow it; write the result to `architecture/import/handoff/result.json`." That assumes an agent that can read and write files.
  - A result is refused if its manifest hash does not match the prompt that was shown.
  - The smaller import for chat-only users is not built.

  Comparison [interpretation]:

  | | Direct API | Subscription, through the person |
  |---|---|---|
  | Cost | Per token; a key and a balance | Included in the plan, within the plan's limits |
  | Setup in dp | Credential, provider, model | None |
  | Who moves the text | dp | The person, by copy and paste or by a file an agent reads |
  | Size limit | Known (`runTokenLimit`) | The chat app's limit is not known to dp |
  | Check of the result | Validator and manifest hash | The same, after the person pastes it back |
  | How it fails | An HTTP error | A reply that is cut off, wrapped in prose or not valid JSON |
- Proposal: [interpretation] Build the items in Feature Information on top of A2's handoff for text tasks. The paste box and single-block answers come first; splitting a long prompt into parts, replies across several turns and the chat-only import come second. Validate with unit tests of the reply checker (cut-off, prose-wrapped, invalid JSON, wrong hash) and a manual round trip through a real chat app.
- Technical Notes:
  - Size: M.
  - Links: PRO-12, COD-02, COD-03, COD-08; entry A2.
  - Context limits are decided (PRO-16, PRO-19 N12 and N15, PRO-23): the person types the window; a typed window is a limit and a larger request is refused, naming the window, the estimate and what to narrow; with none typed dp shows "limit not set" and only warns; the pass-budget refusal (`runTokenLimit`, COD-08) stays. A chat app is the same case: its limit is whatever the person types for the copy button, and dp never claims one it does not know. Reading a model's own window from a local server waits for manual check U27.
  - Open: whether the file route and the chat route share one prompt; how to keep a long import interview going across several replies.
- Non-technical notes: The owner wants people to be comfortable using their own subscription. A chat app's size limit is not known to dp, so the limit is typed by the person.

---

# A5 - Manage users and roles from the UI

## A5 - 01

- Status: Proposed
- Feature Information: A Users page for architects: add a user, set a role, set a role per project in a hub, remove a user, with the same rules as `dp users`. The command line stays for first set-up and CI.
- Value this feature provides: Only architects can change things by default, and architects can give other people other roles. Today that works only on the command line.
- Current implementation: Command line only.
  - With sign-in off, every request acts as architect (`src/server/auth.ts`). With sign-in on there are three roles: architect, engineer and viewer (SEC-04). In a hub there is also a role per project, which can be `none` (the project is hidden).
  - Users are managed only with `dp users init|add|passwd|remove|role|list`. `dp users add` requires `--role`; there is no default.
  - BMO settings and integration settings are changed by architects only.
  - There is no users route in the API and no Users page in the UI.
- Proposal: [interpretation] Add architect-only users routes that call the same functions as `dp users`, and a Users page in the UI. Guard the last architect so it cannot be removed or demoted. Validate with API tests for each role (viewers and engineers refused) and a browser test of add, role change, per-project role and remove.
- Technical Notes:
  - Size: M.
  - Links: SEC-04, HUB-07, PRO-15.
- Non-technical notes: Open: the default role for a new user (viewer is the safe choice); what the page shows when sign-in is off; whether sign-in should be on by default. Hosted accounts are a different, later entry: A6.

---

# A6 - Hosted (cloud) accounts

## A6 - 01

- Status: Proposed, after 1.0.0 (the owner, 2026-11-20, answer D2: "local accounts for now, will be doing the cloud/hosted accounts in the future"; PRO-17)
- Feature Information: Accounts for people in different places who want to sign in to one service without anyone running a server or sharing a folder: the "different accounts" of vision feature E, in full. A hosted service needs a place to run it, sign-up and sign-in (probably through an existing identity provider), recovery, an organisation and a project as owned things, the same three roles, storage for models and comments (git remains the store for the model itself), TLS, rate limits, backups, and the terms under which anyone else's models are kept.
- Value this feature provides: For 1.0.0 an account is a user in the local users file of one project or hub (SEC-04). That fits a team that shares a folder or a server it runs itself. It does not fit people who are apart and want one service.
- Current implementation: Only the local, self-hosted form.
  - Sign-in is optional and off by default. With no `.dp/users.json` every request acts as architect (`src/server/auth.ts`). Passwords are scrypt hashes; sessions are in memory, end after 12 hours idle, and are lost on restart (SEC-04).
  - Roles: architect, engineer and viewer, plus a role per hub project that can be `none` (HUB-07, SEC-05). Users are managed with `dp users` only (A5 would add a page).
  - dp binds to 127.0.0.1 by default. A non-loopback `--host` refuses to start unless users exist, or `--read-only` or `--insecure` is given (PRO-15). Passwords travel in clear text unless a TLS proxy is in front (SEC-04).
  - There is no hosted server, no sign-up, no password reset, no e-mail, and no sharing of a model between organisations except through git.
- Proposal: [interpretation] Do not build accounts of our own. Offer sign-in through a standard identity protocol (OpenID Connect) to the self-hosted server that exists today, so a team can put dp behind its own provider. Decide whether dp is ever offered as a hosted service after that. Validate the OpenID Connect step with a test provider in automated tests and one real provider by hand.
- Technical Notes:
  - Size: L.
  - Links: PRO-01, SEC-04, SEC-05, HUB-07, PRO-17; entry A5; [product-vision.md](product-vision.md) feature E.
  - Trade-offs: OpenID Connect for a self-hosted server is a small, bounded change and avoids storing passwords. A hosted service is a large commitment (running it, securing other people's architecture, supporting it) for an open-source tool that makes no money (PRO-01's reason).
  - Open: which identity providers matter first; whether roles come from the provider's groups or stay in dp.
- Non-technical notes: Hosting is a business and operating decision more than a feature. Open for the owner: whether dp is ever hosted by the project; what a viewer outside the organisation may see.

---

# A7 - Credentials are always encrypted

## A7 - 01

- Status: Accepted, not built (owner, 2026-11-20, answer D6; SEC-07)
- Feature Information: Every saved secret is sealed with a key, with no setup step. The key comes from `DP_SECRET_KEY`, else from a key file dp creates (32 random bytes, mode 0600, in a mode 0700 folder under `$XDG_CONFIG_HOME/dp/` or `~/.config/dp/`, `%APPDATA%\dp\` on Windows; never in a project or hub folder). Saving is refused, with the reason, when neither source works; there is never a fallback to plain text. Existing plain values are sealed the first time a writable server or a `dp credentials` command opens the store, and `dp credentials seal` does it on request; `dp check` and the page warn until then.
- Value this feature provides: Three features keep secrets in the credentials store: BMO's provider keys, tool connections and linked-work status. Without `DP_SECRET_KEY` the values sit in `.dp/credentials.json` as plain text (mode 0600). The owner wants credentials saved in the tool, encrypted and secure, without a setup step.
- Current implementation: The encryption exists but is optional.
  - `src/core/credentials.ts`: AES-256-GCM, a key from scrypt with a fresh salt per value, name and provider as associated data; `seal` and `open`. The store takes the secret as a constructor argument, defaulting to `process.env.DP_SECRET_KEY`; with none, `stored()` writes the value as plain text.
  - Places that build the store from the variable: `src/server/routeContext.ts:384`, `src/server/hub.ts:216`, `src/server/routes/hub.ts:210`, `src/cli.ts:655`.
  - The list carries `encryptsNew` (`src/shared/types.ts`, near line 1290) and the page and `dp credentials list` say the values are not encrypted when it is false (`src/cli.ts:300`).
  - A value sealed with another key shows as `locked`; the masked hint (the last four characters of a value of 12 or more) is stored in plain text beside the value.
  - Documented in `README.md` (lines 222, 272), `docs/CONTRIBUTING.md` (security model), `.claude/CLAUDE.md` and the manual test plan (MT-DRAFT-163, MT-DRAFT-181, gap G-36).
- Proposal: [interpretation] One small change in `credentials.ts` (a `KeySource` with the two routes, injected for tests) and the call sites above; `encryptsNew` goes away and a new `plainValues` count takes its place. Build it before the first real provider call is made (manual test plan U1), so the first key ever saved is already sealed. Validate with tests that pass the key or the key file's path, so none touches a real home folder: a new key, a missing folder, a read-only folder, an old plain file, another key (locked), and file modes. Change the documents above in the same commit.
- Technical Notes:
  - Size: S to M.
  - Links: SEC-06, SEC-07, PRO-15; manual test plan section 29 (U1).
  - Trade-offs: the key file is on the same machine as the values, so this protects against the folder leaving the machine (a commit, a zip, a backup elsewhere), not against someone on the account; `DP_SECRET_KEY` from a secret manager is the stronger setting. Losing the key file locks every value. An operating-system keychain is better protection and needs per-system code; it can be a third key source later.
  - Open: whether to drop the four-character hint; whether `dp credentials rekey` (a new key for all values) is worth building now.
- Non-technical notes: Released as a security fix before any real provider call.

---

# A8 - System Testing, traces and the demo system are off by default

## A8 - 01

- Status: Accepted, not built (owner, 2026-11-20, scope decisions B3, B4 and B7; PRO-20, PRO-23)
- Feature Information: One switch turns the mode on: a command-line flag `dp serve --testing`. Off, the **Test** button is not shown, the intercept listener never starts, and the testing and trace routes answer as if they did not exist. `dp serve --demo` starts the five demo services only with a separate flag, `--with-system`. The code is hidden, not deleted.
- Value this feature provides: The vision's non-goal says debugging a running service in dp "is not a 1.0.0 goal". System Testing is the largest item outside software architecture and the only part of dp with a listener that forwards live traffic, so it should not be on in a default install.
- Current implementation: Built and tested, always on. Counted on 2026-11-20:
  - System Testing (RUN-06, RUN-07): `src/core/testing.ts`, `src/core/endpoints.ts`, `src/server/interceptProxy.ts`, `src/server/testSession.ts`, `src/server/routes/testing.ts`, `ui/src/testing/`, `ui/src/hooks/useTesting.ts`. 3,361 lines in 19 files (1,697 server, 1,664 UI), 13 routes, 74 automated test rows and 12 manual rows. Local targets only; architects and engineers only; main model only.
  - Traces (RUN-02, RUN-03): `src/core/traces.ts`, `src/server/routes/traces.ts`, `ui/src/testing/TraceView.tsx`; 608 lines in 3 files, 7 test rows. The viewer lives inside System Testing's screens.
  - The demo system (RUN-09): `src/demo/demoSystem.ts`, 283 lines, 9 test rows (`demo-system`, `demo-testing`); `dp serve --demo` starts its five services on ports 4200 to 4204.
  - `dp.run.url` (RUN-07) and `dp.endpoints` are model properties that other features read: `dp.run.url` is listed in the static export's review report, and the contracts feature has one optional "Live calls" step that uses it.
- Proposal: [interpretation] Read the switch once in `createApp`'s shared context and pass it to `registerTesting` and `registerTraces`, which register nothing when it is off; the UI reads the flag from the state response. No code is removed. The "Live calls" step of contracts is shown only when the mode is on. The demo tour (`demo/README.md`) moves its System Testing chapter behind the flag and says how to start it. Validate: the System Testing suites run with the switch on; a few tests check that the routes and the button are absent with it off; `ROUTE_RULES` entries stay; rows in the manual test plan (section 14 and the related security rows) say which switch to start with, and its section 27 lists the mode as hidden.
- Technical Notes:
  - Size: S to M.
  - Links: RUN-02, RUN-03, RUN-06, RUN-07, RUN-09, PRO-20, PRO-23.
  - Trade-offs: a second mode to test (the suites need the switch on, a few need it off); the default demo cannot pause a live call until the person adds `--with-system` and `--testing`; the code stays in the package, so the size saved is in what runs and what is promised, not in the download.
  - Decided: a command-line flag only (no setting in `.dp/`; a flag is simpler, a setting would survive a restart); `--with-system` is separate from `--testing` because it starts five more listeners.
- Non-technical notes: Docs that call the mode experimental: `README.md`, the demo tour, CONTRIBUTING's security model (the proxy is listed as off by default). PRO-20 had refused a separate piece of work for this (a flag and some documents); the owner overruled that on 2026-11-20 (PRO-23). Parked ideas that extend the mode (saved cases, `dp test`, HTTPS and gRPC intercept points) stay in the ideas list (I2.7). See [product-vision.md](product-vision.md) (the non-goal).
