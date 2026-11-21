# Contributing, conduct and security

This one file covers how to work on designPerspectives, how we treat each other, and how to report a security problem.

- [Contributing](#contributing)
- [Code of conduct](#code-of-conduct)
- [Reporting a security problem](#reporting-a-security-problem)
- [Security model](#security-model)

# Contributing

Thanks for looking at the project. This part explains how to set up, check and send a change.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Read `docs/decisions.md` before you change a design choice. It records each decision and its trade-off. If your change makes a new choice, add an entry at the end of its topic.

## Setup

You need Node.js 20.11 or later.

```bash
npm ci
cd ui && npm ci
```

`npm ci` also builds `dist/` (the `prepare` script).

## Run it

Start the server on a sample model:

```bash
npm run dp -- serve --demo my-demo
```

To work on the browser UI, run the server and the UI dev server in two terminals:

```bash
npm run dp -- serve --demo my-demo   # terminal 1: API on 127.0.0.1:8765
cd ui && npm run dev                 # terminal 2: UI on :5173, proxies /api to the server
```

## Where the tool settings are

The root holds only what tools require there (`package.json`, `package-lock.json`, `.gitignore`, `LICENSE`).
The other settings are in `config/`: TypeScript (`tsconfig.base.json`, plus a small `tsconfig.json` in `src/`,
`tests/` and `scripts/` so editors find the right settings), ESLint, Prettier, Vitest and Playwright. The npm
scripts pass these paths, and `.vscode/settings.json` points the ESLint and Prettier editor extensions at them.

## Tests

`tests/unit/` runs in Node with no browser (core logic, the API, the CLI); `tests/browser/` drives the real UI in
Chromium. `tests/TESTS.csv` lists every test and what it checks. See [tests/README.md](../tests/README.md).

## Checks to run before a pull request

Run these from the repository root unless a line says otherwise.

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run format:check` (Prettier; `npm run format` writes the fixes)
- [ ] `npm test`
- [ ] `npm run test:list` if you added, renamed or removed a test (then commit `tests/TESTS.csv`)
- [ ] `cd ui && npm run build`
- [ ] `npx playwright install chromium` (once per machine)
- [ ] `npm run test:browser`
- [ ] `npm run make-demo` (then commit any change in `demo/`)
- [ ] `npm run dp -- check --strict` on the demo (`npm run dp -- init --demo my-check`, then `npm run dp -- check --strict my-check`)

`npm run ci` runs all of the above, plus the package install test, in one go on this machine (about two minutes);
`npm run ci -- --quick` skips the browser tests and the package test. `npm run hooks:install` makes `git push`
run it first (skip once with `git push --no-verify`). It uses this machine's Node only, so it does not replace CI
on other Node versions or systems.

CI is `.gitlab-ci.yml`: the same checks on Linux with Node 20 and 22 (there is no macOS job). The format,
built-UI, test list, demo and package checks run with Node 22 only. To run it, add the GitLab project as a second
remote and push to it (`git remote add gitlab <url>`, then `git push gitlab <branch>`); GitHub stays the main
remote and runs no checks.

## Git process

Decided for this repository in DEC-063.

- Branch from `main` for each change. Do not commit to `main`.
- One pull request per change. No stacked branches.
- A change to the UI rebuilds `static/` (`cd ui && npm run build`) in the same commit. CI fails if `static/` is out of date.
- A change to model or demo code regenerates `demo/` (`npm run make-demo`) in the same commit. CI fails if `demo/` is out of date.
- CI runs the checks above, including `dp check --strict` on the demo.
- The owner merges.
- A release is a `vX.Y.Z` tag on `main`, with a GitHub release that names the changes from `docs/CHANGELOG.md`. The steps are in [Making a release](#making-a-release).

## More than one session in one checkout

Decided 2026-11-20 (DEC-100, answer D9). It applies to people and to coding-agent sessions that share one working tree. The cost of breaking it has been a repair each time: a second session once had 27 uncommitted documentation edits on `main` while a clean-up ran, and `docs/reviews.md` records the same for DEC-050 and DEC-051.

- **One branch per session.** Start on a branch of your own from `main`, or in your own worktree (`git worktree add ../dp-<topic> -b <branch> main`, then `npm ci` there). Never work on `main`.
- **Never edit a file that another session has modified and not committed.** Run `git status --short` before you start and note what is already modified. A modified file you did not change is off limits: leave it, say so, and wait or work in a worktree. A shared file you must change anyway (`docs/decisions.md`, `docs/planned_features.md`) is edited in a worktree and merged by the owner.
- **Commit by path.** `git add <path>…` and `git commit <path>…`, never `git add -A` or `git add .`. Before committing, `git diff --cached --stat` must list only your files.
- **Never run `git stash`, `git reset --hard`, `git checkout -- <path>` or a force push.** Each destroys or hides another session's uncommitted work.
- **Counters and generated files.** Check the next free DEC id in `docs/decisions.md` when you write an entry, not when you start. Regenerate `tests/TESTS.csv`, `demo/` and `static/` instead of merging them by hand, and build the UI and run browser tests one session at a time, because both write `static/`.

## Making a release

Decided 2026-11-20 (DEC-100, answer D7). The tag and the release are on GitHub, which holds the repository; the GitLab remote only runs CI (DEC-089). dp is installed from GitHub, not from npm (DEC-063), so the tag is the release. **Nothing below is pushed, merged or tagged until the owner says go.** The version is `0.X.Y` before 1.0.0 (DEC-098): a group of features raises X, a fix-only release raises Y. The first release made this way is 0.6.0, which also needs the version bump listed in step 2.

**Before you start**
- Every wave of the group is merged to `main`, and its notes are in its review file (`docs/waves/wave-NN-review.md`, DEC-105; the older stages' limits are in section 31 of the manual test plan, and their full reviews are in git history: `git show 24bbca1:docs/reviews.md`).
- `git fetch`; local `main` equals `origin/main`; `git status` is clean.
- `gh auth status` shows the account that owns the repository.

**Steps**
1. **Branch.** `git switch -c release/x.y.z main`.
2. **One small commit: the release change.** Nothing else goes in it.
   - `npm version x.y.z --no-git-tag-version` (changes `package.json` and `package-lock.json`, makes no tag).
   - The line `Version **x.y.z**` in `README.md`.
   - Once Wave 28a is merged ([wave plan](waves/wave-28-quality-for-1-0.md)): a compatibility fixture folder for the version being released, `tests/fixtures/compat/x.y.z/`, copied from a project that version wrote (the compatibility test then keeps every released version opening byte for byte), and a regenerated public-surface snapshot (`npm run surface:update`) if the release changed it on purpose.
   - The section `## [x.y.z] - Month - DD - YYYY` at the top of `docs/CHANGELOG.md`, in the format of [DEC-098](decisions.md) and written from what shipped, using the "Notes for the release entry" in the review files of the group (and `docs/reviews.md` for the older stages). The date is the day the tag is made (0.6.0 keeps the date DEC-098 gave it). Only built, tested, working things are listed.
3. **Check.** `npm run ci` (the full run: typecheck, lint, format, tests, test list, UI build, browser tests, demo, package install). It must end with "All CI checks passed", and `static/`, `demo/` and `tests/TESTS.csv` must be unchanged from what is committed. Optional but recommended until the first GitLab pipeline has passed: push the branch to the GitLab remote (`git push gitlab release/x.y.z`) for the run on Linux with Node 20 and 22. A failure there blocks the release.
4. **Walk the manual test plan** for what changed in this group ([manual-test-plan.md](manual-test-plan.md)), and at least the demo tour (`npm run dp -- serve --demo`). Write the result in the plan's Result column. A row that fails is fixed before the tag, or the release notes name it.
5. **Pull request.** `git push origin release/x.y.z`, then `gh pr create --base main --title "Release x.y.z" --body-file <the changelog section>`. The owner reviews and merges (a merge commit, so the tagged commit is on `main`).
6. **Tag.** `git switch main && git pull --ff-only`. Check that `package.json` says x.y.z and the top changelog heading says x.y.z. Then `git tag -a vx.y.z -m "designPerspectives x.y.z"` and `git push origin vx.y.z`.
7. **GitHub release.** Extract the section as the notes and publish it:
   ```
   awk -v h="## [x.y.z]" 'index($0,h)==1{f=1;next} /^## \[/{f=0} f' docs/CHANGELOG.md | sed '/./,$!d' > "${TMPDIR:-/tmp}/dp-notes.md"
   gh release create vx.y.z --title "x.y.z" --notes-file "${TMPDIR:-/tmp}/dp-notes.md" --verify-tag
   ```
   The notes are the changelog section word for word; do not use generated notes. A release is a normal release (no pre-release flag), because installs are by tag.
8. **Check the install.** In an empty folder: `npm install -g github:AbhishekR3/designPerspectives#vx.y.z`, then `dp --version`, `dp init --demo demo-check` and `dp serve demo-check`. This is the one check that CI cannot make, and it has not been run yet (manual test plan, unverified facts). Write the result in `docs/reviews.md`.
9. **Close.** Delete the release branch (`git branch -d release/x.y.z`; `git push origin --delete release/x.y.z`). Mark the waves of the group done in `docs/waves/README.md`.

**Rules**
- A tag is never moved or re-made. A mistake is fixed in the next version (a new `0.X.Y`), and the wrong release is edited to say so.
- Only the latest release gets fixes ([Supported versions](#supported-versions)), so a fix release always branches from `main`.
- Tag only a commit on `main` whose `static/`, `demo/` and `tests/TESTS.csv` are committed and current.
- No `npm publish` (DEC-063). If that is ever decided, it is a seventh action after step 7 and gets its own decision.
- **1.0.0** adds to the list: the 1.0.0 checklist (ideas list I2.0), the owner deleting the planning files in `docs/waves/` (DEC-090), and the static export working on the demo ([Wave 21](waves/wave-21-static-export.md)).

## Changelog standard

Decided 2026-11-20 (DEC-098). `docs/CHANGELOG.md` follows [Semantic Versioning](https://semver.org).

- One file, newest version first. Each version is `## [x.y.z] - Month - DD - YYYY` (for example `## [0.6.0] - November - 17 - 2026`).
- Under it, in this order and only the ones that are used: `### Added`, `### Fixed`, `### Changed`, `### Deprecated`, `### Remove`. Security items go under the heading they belong to, with the prefix "Security:".
- Before 1.0.0 every release is `0.X.Y`, with no ceiling on X: a feature release raises X, a fix-only release raises Y.
- Only what is built, tested and working in the repository is listed. There is no `Unreleased` section and planned work is never announced there (it belongs in [planned_features.md](planned_features.md)).
- A line says what a person can now do or what changed for them, in one or two sentences. Keep the decision number in brackets (for example "(DEC-069)").
- The section for a version is written when the release is made (version in `package.json`, README and the heading, in one small change), from what shipped.
- A release is a `vX.Y.Z` tag with notes taken from this file, copied word for word into a GitHub release ([Making a release](#making-a-release)). This repository has no tags yet; 0.6.0 will be the first.

## Ideas and planned features

- [planned_features.md](planned_features.md) lists work with a clear scope; the long entries (A1 to A7) use a fixed format (status, why, what exists, what is missing, proposal, trade-offs, open questions, size, links). Pick one up, or open an issue to propose a new entry.
- [planned_features.md](planned_features.md) also holds the scheduled work in compact tables (section B), grouped by area, with source markers and rough sizes.
- An idea that is not yet scoped can be raised in an issue. The maintainer keeps a private list of ideas that are still being thought through; it is not part of the repository.
- To see how the code is laid out before you start, read the architecture section of [../.claude/CLAUDE.md](../.claude/CLAUDE.md) and the draft overview in [architecture.md](architecture.md).

## Rules that surprise people

- The built UI in `static/` is committed. After a UI change, run `cd ui && npm run build` and commit the new `static/` files. The file names are fixed (`app.js`, `app.css`, `diagram-layout.js`). CI fails if `static/` is out of date.
- `demo/` must be regenerated (`npm run make-demo`) when model code changes. CI fails if it is out of date.
- Everything is TypeScript. Do not add code in other languages.
- All edits to the model go through `src/core/modelEdits.ts`. Routes in `src/server/routes/` call it.
- New per-object data is stored as `dp.*` properties in the workspace file, not in new files.
- API response shapes live in `src/shared/types.ts`. The UI re-exports them, so `tsc` checks both sides.
- A new file goes in the folder for its area (DEC-062). A file under about 50 lines with one user is folded into that user.
- Do not name or compare other tools or products in repository files, commit messages or pull requests. Describe ideas in our own terms.

## Pull requests

Describe:

- what changed,
- why it changed,
- how you checked it (the commands above),
- screenshots or a short recording for any UI change,
- the decision entry in `docs/decisions.md`, if you made a design choice.

The pull request template lists these items.

## Where things are

`.claude/CLAUDE.md` has an Architecture section that maps each source folder and file to its job. `docs/README.md` indexes the rest of the documentation, including the decisions, the future tasks, and the manual test plan. `demo/README.md` explains the demo and sample files.

# Code of conduct

designPerspectives is a small open-source project. We want people to be able to ask questions, report problems and propose changes without fear of being belittled.

## Expected behaviour

- Be respectful and patient, especially with people who are new to the project or to architecture work.
- Give specific, constructive feedback on code, designs and documents. Criticise the idea, not the person.
- Assume good intent, and say clearly when something is unclear.
- Credit others' work and respect licences.

## Unacceptable behaviour

- Harassment, insults, or personal attacks, in any channel.
- Unwelcome sexual content or comments about someone's identity.
- Publishing someone's private information without permission.
- Repeatedly pushing a position after the discussion has been settled, or disrupting the work of others.

## Scope

This code applies to issues, pull requests, reviews, discussions and any other project space, and to anyone acting for the project in public.

## Reporting a conduct concern

To report a concern, open a private security advisory on the GitHub repository (Security, then Report a vulnerability), or contact the maintainer through their GitHub profile. Include what happened, where, and any links. Do not post the details in a public issue.

## What maintainers will do

We read every report and reply within a week. We may ask for more details, and we will keep the reporter's identity private where we can. We may ask someone to stop a behaviour, remove a comment, or leave the project for a period. Repeated or serious breaches lead to a permanent ban. A person who disagrees with a decision can ask for it to be reviewed once.

# Reporting a security problem

## Supported versions

Only the latest release receives security fixes. Please check that your version is the latest before you report.

## How to report

Report vulnerabilities privately with GitHub's private vulnerability reporting: go to the repository, choose **Security**, then **Report a vulnerability**.

Do not open a public issue for a security problem.

## What to expect

- We acknowledge your report within one week.
- We then confirm the problem and either publish a fix or a plan for one, and we tell you the timeline.
- We credit reporters in the release notes, unless you ask us not to.

# Security model

designPerspectives is a local tool. In plain words:

- `dp serve` listens on `127.0.0.1` by default.
- The server refuses requests that do not address localhost by host name (unless you name another host with `--allow-host`), and refuses requests from other websites (cross-site and cross-origin requests).
- It reads and writes the model in `architecture/` in the project folder.
- For the code level, it reads and writes files only under the code folder (`--code-root`, default the project folder). It never opens files or folders whose names start with a dot.
- Sign-in is optional. `dp users init` turns it on. It has three roles (architect, engineer, viewer), and the server enforces them on every change. The browser cannot bypass them. An engineer changes only the drafts they started. Without sign-in, anyone who can use the app can change the model.
- A lens is a default view. It does not hide data: a viewer can still read any field through the API, including costs and notes.
- With `--host` set to another interface (not 127.x, `::1` or `localhost`), `dp serve` refuses to start unless sign-in is on (a users file with at least one user), `--read-only` is given, or `--insecure` is given to say an open server is meant (it then prints a warning).
- With `--host` set to another interface, the server speaks plain HTTP. Passwords and session cookies then travel in clear text. Put the server behind HTTPS (a TLS proxy) before you expose it.
- To compare versions, it runs the `git` command. It only reads from git and never changes the repository.
- In a hub (`dp serve --hub`), no project folder may hold the hub folder or another project, so one project's code routes cannot reach another's model, `hub.json` or the shared catalog. No project folder may be hidden (such as `.dp` or `.git`), as written or through a link, and a project added from the browser must be a folder inside the hub.
- `hub.json` is trusted. It is checked when the hub loads, but a hand-written entry can still point outside the hub folder. Write only entries you trust.
- Integration credentials are kept in `.dp/credentials.json` (mode 0600, ignored by git). They are plain text on disk unless `DP_SECRET_KEY` is set, which encrypts them with AES-256-GCM. Their values are never sent to the browser or printed; only architects manage them. **Planned (DEC-101, owner, 2026-11-20): values are always encrypted**, with `DP_SECRET_KEY` or a key file dp creates in the user's config folder, never in a project or hub folder; this paragraph changes when that is built.
- Tool connections for linked work are kept in `.dp/integrations.json` (mode 0600 in a 0700 `.dp/`, ignored by git; the hub's in a hub) and changed by architects only (`dp integrations`, the integrations routes). They are never in the model or the sidecar, because an engineer can edit a draft and could otherwise point a token at another host. A connection names a stored credential by name only.
- The severity mapping for linked work (DEC-087) is in the sidecar (`work.severity`) because it holds only names and levels, no host, token or path, so anyone with edit rights may change it. `GET /api/hub/work` (DEC-088) lists only the projects the user may see, the same rule as the home page (DEC-060).
- The server reaches out to the network in three cases only, each started by a person: **Refresh status** of linked work (below), a BMO run with the `direct` backend (below), and a call that passes an intercept point in System Testing mode (below).

## System Testing mode

These rules apply when someone turns on **Test** and opens an intercept point (DEC-075).

**What dp listens on.** Each intercept point is one more port on `127.0.0.1`, opened when a person asks for it. A point answers only requests addressed to itself on this machine; a request that reaches it under another host name gets 403.

**Where it forwards.** Only to the address the element runs at in the main model (`dp.run.url`). The address never comes from a request and never from a draft. It must be on this machine, unless its host was named at start with `--allow-target-host`. Link-local and cloud metadata addresses are always refused. dp's own session cookie is never forwarded.

**Who may use it.** Architects and engineers, and only from a browser on the machine that runs `dp serve`. Viewers and `--read-only` servers cannot open a point, see a call or release one. Whoever may change the main model decides where a point forwards, because the address is part of the model.

**dp can change live requests.** A person with the testing right can change a paused request or reply, answer a call themselves, drop it, or send a logged call again. These have real effects in the target system. Use the mode against local and test systems.

**What is kept.** Calls and their bodies are kept in server memory only (the newest 200 calls, 32 MB of bodies) and are gone when dp stops. `.dp/testing.json` (mode 0600, ignored by git) holds port numbers, breakpoints, watched fields and the hold time.

**Hidden values and their limit.** The browser gets values that look secret as `•••`: fields whose names look secret at every depth of a JSON or form body, the query, and the headers `Authorization`, `Cookie`, `Set-Cookie` and `X-Api-Key`. A value left as `•••` in an edit keeps the real value; `•••` anywhere else is refused. Hiding is by field name: a secret inside a plain-text body, or under a name that does not look secret, is shown to everyone with the testing right. **Save as the example** writes the shown text into the model, and so into git.

**A paused call cannot hang a system for ever.** It is released unchanged after 120 seconds (settable from 10 to 600), at most 20 calls are paused at once, and all are released when no testing page is open or dp stops.

**The demo system.** `dp serve --demo` also starts five small services on `127.0.0.1`, ports 4200 to 4204 (DEC-077). They hold made-up data, serve only their own fixed files and call only each other, or an intercept point of the same dp. Without `--demo` nothing of this starts.

**Limits.** A point speaks plain HTTP/1.1. Bodies over 1 MB, compressed request bodies, event streams and WebSocket connections pass through and cannot be paused. dp removes `Accept-Encoding` from the requests it forwards. An allowed host name is not checked again after it is resolved.

## Code import and BMO

These rules apply when you use code import (`dp scan`, `dp import`, the Import code page) or BMO.

**What is read.** The scan and BMO read files only through the code root (`--code-root`, default the project
folder). Hidden paths (names starting with a dot, such as `.dp`, `.git` or `.env`) are never read. Files
that match the intake's must-not-open list, its scope exclusions, the import ignore list, or a deny-list of
names that usually hold secrets (for example `*secret*`, `*.pem`, `*.key`, `id_rsa*`, `credentials*`) are
never read. A symlink is resolved first, and the rules apply to the file it really points to. Binary files
are counted, not read.

**What can leave the machine, and when.** Nothing leaves the machine unless BMO is on and its backend is
`direct`. Then a run sends the prompt you were shown in the preview, and only to the provider the settings
name. The Claude API and the OpenAI API go to their own fixed hosts; another address for them needs
`--allow-custom-endpoint`. Ollama goes to an address you choose, and a non-loopback address must use https.
The key is sent only to its provider's host, and a redirect is an error. Every run needs a confirmation of
the exact prompt, the provider, the host and the model. The handoff backend sends nothing: dp writes files
into `architecture/import/handoff/`, and you give them to your own coding agent.

**Redaction and its limit.** Before a file excerpt, a digest or a description is sent or written to a
handoff folder, dp masks values that look like secrets: the value of a key or variable whose name looks like
a secret, token-shaped strings (AWS access key IDs, PEM blocks, long random-looking strings) and passwords in
URLs. A secret written as a plain word, outside a key and value form, is **not** detected. For such files,
add the path to the must-not-open list.

**Where things are stored.**
- `architecture/import/` holds the review data: evidence, analysis, intake, the ledger, the review state of
  each import draft and the files behind it. It is meant to be committed, except what `architecture/import/.gitignore`
  lists: `handoff/`, `handoff-description.txt` and `files/*.source.txt` (the text typed for a description draft).
- `.dp/bmo.json` (the settings) and `.dp/bmo/runs/` (the run log, which holds code excerpts from direct runs)
  are in `.dp/`, which is not committed. The settings file is mode 0600 and changed by architects only.

**Model output is untrusted.** A model's answer must match the import schema, and dp checks it with its own
rules. The review level is computed by dp from checkable evidence, not taken from the answer. An item dp
cannot verify stays unverified until a person accepts it. Nothing in an answer chooses an address, a provider,
a file to read or a file to write. An answer is shown as text, never as HTML.

## Linked work status (DEC-085)

These rules apply when someone presses **Refresh status** on linked work (on an object, or on the Work page).

**Where it calls.** Only to a connection's API root: api.github.com for github.com, `<base>/api/v3` for GitHub Enterprise, `<base>/api/v4` for GitLab, `<base>/api` for SonarQube and SonarCloud, `<base>/rest/api/2` for Jira. The built-in connections are github.com, gitlab.com and sonarcloud.io. Any other address comes from `.dp/integrations.json` and must use https (http only for this machine), with no user name, password, query or fragment, and never a link-local or cloud metadata address.

**Which links.** A link is read only when it has the connection's exact scheme, host, port and base path, and its tool's adapter matches its path strictly. The path must be unchanged by URL parsing (no `.` or `..` segments, no backslashes, no encoded dots), and its parts use tight character classes (no `%`, so no encoded slash). Sonar keys come from the query. The API address is built from encoded parts and checked again to start with the connection's API root. Nothing in a link, the model or the sidecar chooses a host.

**Which token.** A connection sends only the credential it names. A built-in connection sends the first credential of its provider (github, gitlab, sonarqube) that no connection names, so a token meant for a team's own server never goes to a public host. A named credential that is missing or locked means that connection's links are not called.

**How.** No redirects (a 3xx is an error). 10 seconds per request, 4 at once, at most 200 links per refresh. Answers over 1 MB are refused. An error is a short reason that names the tool; it never repeats the answer's body or the token. Values never reach the browser.

**What is written.** The status, the tool's words (`remote`), the time (`checked`) and, for Sonar and Jira, the severity, into the model. Only when one of them changed. A refresh that finds nothing new writes nothing.

## Out of scope

- An attacker who already has a shell on the machine as the same user. Such an attacker can read the same files directly.
- Denial of service by a signed-in user, such as very large requests or many requests in a loop.
- Problems that appear only when you deliberately expose the server on a network without HTTPS.
