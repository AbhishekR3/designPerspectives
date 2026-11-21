# Wave 29: System Testing, traces and the demo system off by default

| | |
|---|---|
| **Status** | Accepted 2026-11-20 as an entry (planned_features A8, PRO-20: scope decisions B3, B4, B7) and made a wave on the owner's request the same evening, so that it has a start prompt like the others. PRO-20 had refused a wave for it ("one flag and some documents"); the owner overruled that. The two open choices below were decided by the assistant's reasoning at the owner's request and are Proposals. Ready to run |
| **Branch** | `feat/w29-testing-switch`, from `main` |
| **Size** | S–M |
| **Release** | 0.7.0 (with Waves 24, 1, 2, 25). Run it **last in the group**, so the suites and docs of the other four waves are written first and this wave changes them once |
| **Depends on** | Nothing in the code |
| **Owner items** | The vision's non-goal ("debugging a running service in dp is not a 1.0.0 goal", [../product-vision.md](../product-vision.md)); PRO-20 B3, B4, B7. [../planned_features.md](../planned_features.md) A8 |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

System Testing is the largest part of dp outside software architecture and the only one with a listener that forwards live traffic. It is built and tested, so it is **hidden, not deleted**: a default install shows no **Test** button, starts no intercept listener, and answers the testing and trace routes as if they did not exist. One switch turns it on. The demo's five services start only when asked.

## What exists today [Fact; counted on 2026-11-20 in planned_features A8, re-anchor first]

- System Testing (RUN-06, RUN-07): `src/core/testing.ts`, `src/core/endpoints.ts`, `src/server/interceptProxy.ts`, `src/server/testSession.ts`, `src/server/routes/testing.ts`, `ui/src/testing/`, `ui/src/hooks/useTesting.ts`: 3,361 lines in 19 files, 13 routes, 74 automated test rows and 12 manual rows. Local targets only; architects and engineers only; main model only.
- Traces (RUN-02, RUN-03): `src/core/traces.ts`, `src/server/routes/traces.ts`, `ui/src/testing/TraceView.tsx`: 608 lines in 3 files, 7 test rows. The viewer lives inside System Testing's screens.
- The demo system (RUN-09): `src/demo/demoSystem.ts`, 283 lines, 9 test rows (`demo-system`, `demo-testing`); `dp serve --demo` starts its five services on ports 4200 to 4204.
- `dp.run.url` (RUN-07) and `dp.endpoints` are model properties that other features read: `dp.run.url` is listed in the static export's review report (Wave 21) and Wave 13 has one optional "Live calls" step that uses it. They stay properties either way.
- `createApp(projectDir, {codeRoot, readOnly})` builds the shared context and mounts the route modules in a fixed order; `registerTesting` and `registerTraces` are mounted there (`src/server/app.ts`, `src/server/routes/`). The hub builds one app per project (`src/server/hub.ts`).

## Design [Proposal]

1. **One switch for the mode and the traces: `dp serve --testing`.** Read once in `createApp`'s options, passed into the shared context, and handed on by the hub to each project's app. Off (the default): `registerTesting` and `registerTraces` register nothing, so their routes answer 404 like any unknown route; no `TestSession` and no intercept listener is ever created; the state response carries `testingEnabled: false` and the UI shows no **Test** button, no trace picker and no testing strip.
2. **A flag only, not a setting** (decided here). A flag is simpler and cannot be left on by an old file; a person who wants it every time puts it in their start command. A `.dp/` setting can be added later if people ask, and then needs an architect-only route. (The cost: it does not survive a restart on its own.)
3. **`dp serve --demo` starts the five demo services only with `--with-system`** (separate from `--testing`, decided here): the flag starts five more listeners, which is a different thing from turning the mode on. `--with-system` without `--testing` still starts the services and says in one line that the Test button needs `--testing`. The demo tour (`demo/README.md`) moves its System Testing chapter behind both flags and says how to start it.
4. **Wave 13's "Live calls" step is shown only when the mode is on** (a one-line check on the same flag).
5. **Docs call the mode experimental:** README, the demo tour, and CONTRIBUTING's security model (the proxy is listed as off by default and what turning it on opens).
6. **No code is removed.** `ROUTE_RULES` entries stay; the tests keep running in CI.

## Determinism

Not applicable (a switch). Add a row to `docs/determinism.md` only if Wave 1's file lists System Testing.

## Owner answers

- **2026-11-20:** hide by default (PRO-20 B3, B4, B7); make it a wave with a start prompt ("Yes"); the two open choices are left to the assistant's reasoning, recorded above (flag only; `--with-system` separate).

## Questions, options and answers

### Q29.1. A flag only, or also a setting?

**Options**
1. A command-line flag only.
2. A flag and a `.dp/` setting.

**Recommended.** Option 1 (above). **Owner's thinking:** *(delegated: "go with best reasoning")*

### Q29.2. One flag for the mode, traces and the demo system, or two?

**Options**
1. One flag for all three.
2. `--testing` for the mode and traces, `--with-system` for the demo services.

**Recommended.** Option 2 (above): the demo flag starts five listeners. **Owner's thinking:** *(delegated: "go with best reasoning")*

## Stop and ask if

- A route or a screen other than testing and traces turns out to need the testing session (it would then need the switch too, or be separated).
- Hiding the mode would change a result in a hub that does not use it (for example the home page's counts).

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | `src/server/app.ts`, `routeContext.ts`, `routes/testing.ts`, `routes/traces.ts`, `hub.ts`, `src/cli.ts`, `src/demo/demoSystem.ts`, `ui/src/hooks/useTesting.ts`, `ui/src/App.tsx`, `src/shared/types.ts` | Anchors confirmed; the places that mount or mention testing are listed |
| 2 | The switch: options, context, route registration, the state flag, the hub, `--testing`, `--with-system` | general-purpose · Opus | `src/server/app.ts`, `routeContext.ts`, `hub.ts`, `routes/testing.ts`, `routes/traces.ts`, `src/cli.ts`, `src/shared/types.ts` | Off: the routes answer 404 and no listener starts; on: nothing changes |
| 3 | UI: hide the Test button, the strip and the trace picker when `testingEnabled` is false | general-purpose · Sonnet | `ui/src/App.tsx`, `ui/src/testing/`, `ui/src/hooks/useTesting.ts`, `ui/src/common/` (the help card and search entries) | Nothing of the mode is reachable by keyboard or search when off; `cd ui && npm run build` result committed |
| 4 | Tests (not the author of 2 and 3): the suites run with the switch on; a few check the routes and the button are absent with it off | general-purpose · Sonnet | `tests/helpers.ts`, `tests/unit/testing-*.test.ts`, `demo-*.test.ts`, `tests/browser/testing-mode.spec.ts` | Both modes covered; `ROUTE_RULES` test still passes |
| 5 | Docs and the manual test plan | general-purpose · Haiku | README, `demo/README.md`, CONTRIBUTING (security model), CLAUDE.md, decisions.md (a decision entry amending RUN-06, RUN-09), manual-test-plan section 14 and the security rows ("start with `--testing`"), section 27 (the mode is hidden), planned_features A8 | All docs updated |
| 6 | Review | main session | — | `/code-review` (high) and `/security-review` (the listener cannot start with the switch off) findings fixed |

Only one agent builds the UI or runs `cd ui && npm run build` at a time. Step 3 is the only UI step.

## Required in this wave

- **Routes.** None added. The testing and trace routes keep their `ROUTE_RULES` entries (a test fails for a non-GET route without one); with the switch off they are not mounted.
- **Hub.** The flag applies to every project of a hub started with it; per-project roles are unchanged.
- **Read-only mode.** Unchanged (testing is already refused there).
- **Model data.** None. `dp.run.url` and `dp.endpoints` stay as they are; the demo model still ships them.
- **Static export.** Unchanged: the review report still lists `dp.run.url`.
- **Demo.** `npm run make-demo` must not change `demo/` because of this wave (the model does not change); if it does, find out why before committing.

## Tests

- **Off (default).** `GET /api/testing/*` and `GET /api/traces*` answer 404; no intercept listener is created; the state response says `testingEnabled: false`; the browser shows no **Test** button; `dp serve --demo` starts no demo service.
- **On.** The existing System Testing, trace and demo-system suites pass unchanged with `--testing` (and `--with-system` for the demo ones).
- **`--with-system` alone** starts the five services and prints the one-line note.
- **Hub.** One flag, two projects: both have the mode; without it, neither.
- **ROUTE_RULES.** The existing test still passes.

## Docs

- **A new decision entry** (RUN topic): the mode is off by default behind `dp serve --testing`; the demo services behind `--with-system`; a flag only; amends RUN-06 and RUN-09 (their "Now" lines already point at PRO-20).
- **README, `demo/README.md`, CONTRIBUTING (security model), CLAUDE.md**, the manual test plan (section 14, the security rows, section 27), planned_features A8: mark built.
- **The review file** (not the CHANGELOG, which the release change writes): notes for the release entry.

## Out of scope

- Removing any System Testing code, tests or routes.
- A `.dp/` setting for the switch (Q29.1), or one flag for everything (Q29.2).
- The parked extensions: saved cases, `dp test`, HTTPS and gRPC intercept points, a collector (ideas list I2.7).

## Start prompt

```
Run Wave 29 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-29-system-testing-switch.md, and follow them: branch from main as the
header says, run the steps with the agents and models in the table, brief each subagent
with files and line ranges and the words "never run git stash, never push", run the checks,
update the docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is
met or an answer this wave needs is missing.
```
