# Security Policy

## Supported versions

Only the latest release receives security fixes. Please check that your version is the latest before you report.

## How to report

Report vulnerabilities privately with GitHub's private vulnerability reporting: go to the repository, choose **Security**, then **Report a vulnerability**.

Do not open a public issue for a security problem.

## What to expect

- We acknowledge your report within one week.
- We then confirm the problem and either publish a fix or a plan for one, and we tell you the timeline.
- We credit reporters in the release notes, unless you ask us not to.

## Threat model

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
- The server reaches out to the network only when someone clicks **Refresh status from GitHub**: it calls `api.github.com` for the GitHub links in linked work, with the stored `github` credential if there is one.

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
  lists: `handoff/` and `handoff-description.txt`. The text typed for a description draft is kept as
  `architecture/import/files/<draft>.source.txt`, which that `.gitignore` does not list. Check it before you commit.
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
