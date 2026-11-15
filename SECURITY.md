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
- The server refuses requests that do not address localhost by host name, and refuses requests from other websites (cross-site and cross-origin requests).
- It reads and writes the model in `architecture/` in the project folder.
- For the code level, it reads and writes files only under the code folder (`--code-root`, default the project folder). It never opens files or folders whose names start with a dot.
- Sign-in is optional. `dp users init` turns it on. It has three roles (architect, engineer, viewer), and the server enforces them on every change. The browser cannot bypass them.
- With `--host` set to another interface, the server speaks plain HTTP. Passwords and session cookies then travel in clear text. Put the server behind HTTPS (a TLS proxy) before you expose it.
- To compare versions, it runs the `git` command. It only reads from git and never changes the repository.

## Out of scope

- An attacker who already has a shell on the machine as the same user. Such an attacker can read the same files directly.
- Denial of service by a signed-in user, such as very large requests or many requests in a loop.
- Problems that appear only when you deliberately expose the server on a network without HTTPS.
