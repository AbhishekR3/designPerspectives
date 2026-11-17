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
- Read `docs/decisions.md` before you change a design choice. It records each decision and its trade-off. If your change makes a new choice, add an entry at the bottom.

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

CI runs the same checks on Ubuntu and macOS with Node 20 and 22. The format, built-UI, test list, demo and
package checks run on Ubuntu with Node 22 only.

## Git process

Decided for this repository in DEC-063.

- Branch from `main` for each change. Do not commit to `main`.
- One pull request per change. No stacked branches.
- A change to the UI rebuilds `static/` (`cd ui && npm run build`) in the same commit. CI fails if `static/` is out of date.
- A change to model or demo code regenerates `demo/` (`npm run make-demo`) in the same commit. CI fails if `demo/` is out of date.
- CI runs the checks above, including `dp check --strict` on the demo.
- The owner merges.
- A release is a `vX.Y.Z` tag on `main`, with a GitHub release that names the changes from `docs/CHANGELOG.md`.

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

`.claude/CLAUDE.md` has an Architecture section that maps each source folder and file to its job. `docs/README.md` indexes the rest of the documentation, including the decisions, the future tasks and backlog, and the stage reviews in `docs/reviews.md`. `demo/README.md` explains the demo and sample files.

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
- Integration credentials are kept in `.dp/credentials.json` (mode 0600, ignored by git). They are plain text on disk unless `DP_SECRET_KEY` is set, which encrypts them with AES-256-GCM. Their values are never sent to the browser or printed; only architects manage them.
- The server reaches out to the network in three cases only, each started by a person: **Refresh status from GitHub** (it calls `api.github.com` for the GitHub links in linked work, with the stored `github` credential if there is one), a BMO run with the `direct` backend (below), and a call that passes an intercept point in System Testing mode (below).

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

## Out of scope

- An attacker who already has a shell on the machine as the same user. Such an attacker can read the same files directly.
- Denial of service by a signed-in user, such as very large requests or many requests in a loop.
- Problems that appear only when you deliberately expose the server on a network without HTTPS.
