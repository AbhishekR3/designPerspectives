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

## Out of scope

- An attacker who already has a shell on the machine as the same user. Such an attacker can read the same files directly.
- Denial of service by a signed-in user, such as very large requests or many requests in a loop.
- Problems that appear only when you deliberately expose the server on a network without HTTPS.
