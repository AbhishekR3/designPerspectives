# designPerspectives

designPerspectives is an open-source (MIT) architecture tool based on the [C4 model](https://c4model.com).
You describe your system once, as a model: people, software systems, containers, components and the
connections between them. Every diagram is a view of that model, so a change made once shows
everywhere.

- **Start from an empty canvas.** Build the model by adding and connecting boxes.
- **Plan a change in a draft.** Edit a copy of the model, see what was added, changed and removed,
  then apply it to the main model.
- **Lenses** show the same model differently for different audiences.
- **Comments, ideas and questions** on any box, line or diagram, with replies and a resolved state.
- **Decision records** explain why the architecture is the way it is: the choice, the alternatives,
  and when another option would win. One Markdown file per decision, reviewed in drafts like the rest.
- **Your files, on your machine.** The model is two JSON files in your repository (`architecture/`),
  written for a clean `git diff`. Nothing is sent anywhere.

![A container diagram with the object panel open](docs/images/canvas.png)

![A draft compared with the main model: one container added, one changed](docs/images/draft-changes.png)

Version **0.5.0**. Changes per version: [docs/CHANGELOG.md](docs/CHANGELOG.md). How to contribute, the code of conduct
and how to report a security problem: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Install

You need Node.js 20.11 or later. The browser UI ships inside the package, so nothing else is needed.

```bash
npm install -g github:AbhishekR3/designPerspectives
dp --version
```

From a clone of the repository instead:

```bash
npm ci
npm link
```

## Five-minute start

Try the sample first. Make an empty folder and start the demo in it:

```bash
mkdir bank-demo && cd bank-demo
dp serve --demo
```

This creates the sample model, its sample code and a made-up git history, then opens the app at
`http://127.0.0.1:8765`. It also starts a demo bank web app at `http://127.0.0.1:4200`, used by the
live UI step of the tour.

The app opens on the **System landscape**: every person and software system, and how they connect.
Then try three things:

1. **Open a container diagram.** Double-click **Internet Banking System**. Its containers are the
   things you deploy: the web app, the payments service, a Kafka topic, a cache and a database.
2. **See a draft.** Under **Drafts**, open *Tell customers when a payment is held*. It adds a container,
   changes a description and proposes a decision. Turn on the changes view to see each change, and
   switch between **Since it started** and **Against main now**.
3. **Search.** Press **Ctrl/Cmd+K** and type `fraud`, `redis` or `kafka`.

[demo/README.md](demo/README.md) is a guided tour of the demo, about 30 minutes, with a stop for
each feature.

To start your own model, run `dp serve` in your project folder. It starts empty and shows a
"Start your architecture" card with three steps. `dp serve PATH` does the same in another folder.

## Bring in an existing codebase

`dp scan` reads a code folder and records what it can see: dependencies, Dockerfiles, compose services,
folders and imports. It uses no network and no model. Then:

1. **Scan.** Run `dp scan`, or **Run scan** on the Import code page. A readiness table shows, per C4
   level, the candidates, what is decided, what is left and the order to go in.
2. **Intake.** Answer what the code cannot tell you: the system's name and purpose, who uses it, what
   to leave out. The answers go into every prompt.
3. **Bring in one level at a time.** Start with C1 (people and systems), then C2 (containers), then C3
   (components). Either give the level to your own coding agent (dp writes the prompt and the files),
   or paste an import file (`dp import FILE`). Either way the result is a draft, not the model.
4. **Review.** Each item is marked *verified*, *partly verified* or *unverified*, from what dp can check
   in the files. Accept all verified items at once. Go through the low-confidence items one at a time:
   accept, reject, verify again, or tell BMO what is wrong.
5. **Apply.** The accepted items go into the model. The rest stay in the draft; accept them later and
   apply again.

Nothing imported is labelled in the model: there is no "imported" or "confidence" field. What came from
the code, and the review, is kept in `architecture/import/`. Commands: `dp scan [PATH]`, `dp import FILE`,
and `dp import --schema`, which prints the JSON Schema of the import file.

## BMO, the optional assistant

BMO is the assistant in dp. It is **off by default**. An architect turns it on under **Credentials**, in
the BMO section, or with `dp bmo set --enabled`. It works in one of two ways:

- **Handoff.** dp writes the prompt and its files into `architecture/import/handoff/`. You run the prompt
  in your own coding agent and bring the result back. dp calls no model, needs no key and makes no network
  call.
- **Direct.** dp calls the Claude API, the OpenAI API or a local Ollama model. The cloud providers need a
  key, which you store in the credentials store; Ollama needs none.

BMO can import a level of the model from the code, make a draft from a description of up to 60 KB of text,
explain a diagram, an element or a relationship, challenge a diagram, propose a decision inside a draft,
summarise a draft for a pull request, and suggest labels for relationships that say only "Uses".

Before anything is sent, a sheet shows where it goes, which files and how many bytes, how many values were
hidden, and the full prompt. You send it or cancel. Code excerpts leave the machine only in direct mode, and
only after this step. Answers are proposals: a text answer is shown and not stored; an import file or a
decision goes into a draft that you review and apply.

The settings live on the server in `.dp/bmo.json`, outside git, and only architects change them. They also
list the roles that may run BMO; all three are allowed by default. Text tasks (explain, challenge, the
summary) work for every allowed role, including viewers. Tasks that make a draft need the right to create
one, so viewers cannot run them.

## Commands

| Command | What it does | Main options |
|---|---|---|
| `dp serve [PATH]` | Serve the model in the browser. Creates an empty model if the folder has none. | `--demo` sample model, code and history; `--port` (8765); `--host` (127.0.0.1); `--read-only`; `--insecure`; `--users FILE`; `--code-root DIR`; `--hub` serve a hub folder; `--allow-host NAME`; `--allow-ui-host NAME`; `--traces DIR`; `--no-open` |
| `dp init [PATH]` | Create the model without starting the server. | `--demo`; `--empty` (default); `--name NAME`; `--hub` create a hub (with `--demo`, the demo hub) |
| `dp check [PATH]` | Check the model, its drafts and its code mapping. Also `dp validate`. Exit code 0 OK, 1 problems, 2 no model. | `--strict` also fail on warnings; `--code-root DIR`; `--hub` check every project and the catalog |
| `dp diff [PATH]` | What changed since a git branch, tag or commit. | `--base REF`; `--head REF`; `--format md\|json`; `--out FILE`; `--exit-code`; `--no-code`; `--code-root DIR` |
| `dp plan DRAFT [PATH]` | The coding plan of a draft: what to build, connect, change or remove. | `--check` how much the code already does (exit 1 while steps are open); `--against REF`; `--format md\|json`; `--out FILE`; `--code-root DIR` |
| `dp scan [PATH]` | Scan the code for what a C4 model needs: dependencies, Dockerfiles, compose, folders and imports. No network, no model. Writes `architecture/import/evidence.json` and `analysis.json`. Exit code 0 OK, 1 problem, 2 no model. | `--plan` print the readiness table; `--prompt` write the handoff files for one level; `--level c1\|c2\|c3` (with `--prompt`); `--container ID` (with `--prompt --level c3`); `--json`; `--code-root DIR` |
| `dp import FILE [PATH]` | Check a JSON import file and bring it into the model as a draft. Nothing reaches the main model until its items are accepted and the draft is applied. Exit code 0 OK, 1 problems, 2 no model. | `--check` check only, create nothing; `--title TITLE`; `--schema` print the JSON Schema and exit (no file needed); `--code-root DIR` |
| `dp bmo status [PATH]` | Show the BMO settings and whether a run is possible. Never prints a key. | |
| `dp bmo set [PATH]` | Change the BMO settings in `.dp/bmo.json`. Only the options given change. | `--enabled` / `--disabled`; `--backend handoff\|direct`; `--provider anthropic\|openai\|ollama`; `--model NAME`; `--endpoint URL`; `--clear-endpoint`; `--allow-custom-endpoint`; `--credential NAME`; `--roles LIST` (architect, engineer, viewer); `--budget TOKENS` |
| `dp bmo run TASK [PATH]` | Run one BMO task: `import-level`, `describe-to-model`, `explain`, `decision-from-draft`, `draft-summary`, `challenge` or `suggest-labels`. Shows what would be sent and sends nothing without `--yes-send` (exit code 1). | `--yes-send`; `--show-prompt`; `--level c1\|c2\|c3`; `--container ID`; `--diagram KEY`; `--element ID`; `--relationship ID`; `--lens NAME`; `--draft ID`; `--text-file FILE` (at most 60 KB); `--code-root DIR` |
| `dp users init [PATH]` | Turn on sign-in: create architect, engineer and viewer with random passwords (printed once). | `--users FILE` |
| `dp users add NAME [PATH]` | Add a user. | `--role architect\|engineer\|viewer`; `--password-stdin` |
| `dp users passwd NAME [PATH]` | Set a new password. Signs that user out. | `--password-stdin` |
| `dp users remove NAME [PATH]` | Remove a user (not the last architect). | |
| `dp users role NAME ROLE [PATH]` | Set a role everywhere, or in one hub project. | `--project ID`: `none` (no access) or `default` (remove the project role) |
| `dp users list [PATH]` | List users and roles. | |
| `dp credentials list [FOLDER]` | List credentials: names, providers and scopes, never values. | |
| `dp credentials add NAME [FOLDER]` | Add a credential. The value is read from standard input. | `--provider NAME`; `--scopes LIST`; `--note TEXT` |
| `dp credentials rotate NAME [FOLDER]` | Give a credential a new value, read from standard input. | |
| `dp credentials remove NAME [FOLDER]` | Remove a credential. | |
| `dp --version` | Show the version. | |

Examples:

```bash
dp serve --port 9000 --no-open
dp serve --code-root ../my-service     # the folder the components' code paths point into
dp serve --read-only                   # nobody can change anything
dp check --strict                      # warnings (missing or hidden code paths) also fail
dp diff --base origin/main --exit-code # exit code 1 when the model changed
dp plan tell-customers-when-a-payment-is-held --check
dp users add sam --role engineer --password-stdin < password.txt
dp users role sam viewer --project payments
dp credentials add github-token --provider github < token.txt   # the value stays out of your shell history
```

**Network access.** `dp serve` listens on `127.0.0.1` by default, and the server answers only requests
addressed to localhost. A `--host` on any other interface (for example `0.0.0.0`) is refused unless one
of these holds:

- sign-in is on (`dp users init`), so every change needs a user;
- `--read-only` is given, so nothing can be changed; or
- `--insecure` is given, which says that anyone who can reach the server can change everything.

Even with sign-in, the server speaks plain HTTP. Put a TLS proxy in front before you use a network.
Hidden files and folders (names starting with a dot) in the code folder cannot be opened.

Model files written by the earlier Python version (0.2) open unchanged.

## Home page, hub and shared catalog

`#/home` (the house link at the top of the sidebar) is the home page: a card per project with a
picture of its landscape, what needs a look (model problems, drafts behind main, decisions due or
with a trigger met, shared tables written by several projects, copies that drifted from the
catalog), what is being watched, and the latest decisions.

A **hub** serves several projects from one folder:

```json
// hub.json
{ "version": 1, "name": "Acme Retail Bank", "catalog": "catalog",
  "projects": [{ "id": "onboarding", "path": "onboarding" }, { "id": "payments", "path": "payments" }] }
```

Each project is an ordinary project folder, inside the hub folder. Architects can add one from the
home page (blank or the demo), and it is created as a folder inside the hub. A `hub.json` you write by
hand is trusted: its paths are checked when the hub loads, but only write entries for folders you
trust (see the [security model](docs/CONTRIBUTING.md#security-model)).

`catalog/` holds the elements several projects share (people, systems, databases). A project keeps a
**linked copy** of each one it uses: its name, description and technology come from the catalog and
are copied into every project as soon as the catalog changes; the rest is the project's own. Elements
list their **data** (tables, topics, buckets; shared on a catalog element, private on a project's
copy), and each relationship says which data it **reads or writes**. The **Shared catalog** page shows
who uses each shared element and who reads and writes each table.

One sign-in (`<hub>/.dp/users.json`) covers every project, and a person's role can differ per project
(`dp users role NAME ROLE HUB --project ID`), including `none`: no access, and the project is hidden
from that person everywhere in the hub.

**History** (`#/history`) lists the git commits that changed the models, each with what it changed
(added, changed, removed objects, by project) and a link to that version compared with the one
before, plus what is not committed yet. dp only reads git; commit with your usual tools.

**Credentials** (architects): tokens dp uses to reach other services, kept in `.dp/credentials.json`,
never in git and never shown again after saving. They are plain text on disk (file mode 0600) unless
you set `DP_SECRET_KEY`, which encrypts them. The first use: **Refresh status from GitHub** under an
object's Linked work reads the state of every linked GitHub issue and pull request (with a stored
`github` credential, or public repositories only).

## Sign-in and roles (optional)

Sign-in is off by default. A project turns it on by having a users file at `.dp/users.json`, which
`dp users init` creates. The app then asks for a name and password, and the role decides what each
person can change. The server checks every change, so the browser cannot bypass the rules.

| Role | Can do |
|---|---|
| Architect | Everything: the main model, any draft (change, discard, apply), real code files, credentials and catalog |
| Engineer | Reads everything; creates drafts; changes and discards only the drafts they started; cannot change the main model, write code files or apply a draft |
| Viewer | Reads everything; changes nothing |

Drafts made before sign-in was turned on have no author, so only architects can change them. Every
role can write comments; a viewer can too. Git versions are read-only for everyone. Sessions end after
12 hours without activity and are lost when the server restarts. Five failed sign-ins lock a name for
30 seconds.

What it is not:

- Not real-time. Two people editing the same thing: the last write wins, and the other sees it when the window regains focus.
- Not data hiding. A lens chooses what is shown first; a viewer can still read costs and notes through the API.
- Not safe on a network without HTTPS. Passwords travel in clear text, so put a TLS proxy in front of the server.

The users file holds password hashes and must not be committed. `.dp/` is added to `.gitignore`.

## Files

| File | What it holds |
|---|---|
| `architecture/workspace.json` | A [Structurizr](https://github.com/structurizr/structurizr) workspace: elements, relationships, views, positions, flows. Readable IDs (`api-application`), stable formatting for `git diff`. |
| `architecture/comments.json` | Comments, ideas and questions about elements, relationships and diagrams, with replies and resolved state. Created with the first comment. Not part of the model. |
| `architecture/designperspectives.json` | Tag groups, lenses, the list of characteristics and cost settings (data Structurizr has no place for). |
| `architecture/decisions/NNNN-title.md` | One decision record each: a short front matter (`status`, `kind`, `date`, `deciders`, `affects`, `supersedes`, `tags`, `review-by`, `decide-by`, `expires`, `applies-to`), then `# Title` and the sections Context, Decision, Alternatives (`### Option` with "Why not now" and "Would choose if"), Consequences and Revisit triggers (a checklist). Other sections are kept. Part of the model: drafts, diffs and undo include them. |
| `architecture/drafts/<id>/` | A draft (planned change): its own `workspace.json`, `designperspectives.json` and `decisions/`, `draft.json` (title, description, date, and optional `branch` and `link`) and `base/` (the main model when the draft was made, used when applying it). `code.json` and `code/` hold planned code edits, kept out of your code folder until apply. |
| `hub.json` (hub folder) | The projects of a hub and its catalog folder. |
| `.dp/users.json` | Sign-in users and password hashes. Not in git. |
| `.dp/credentials.json` | Integration credentials. Not in git; mode 0600; encrypted with `DP_SECRET_KEY` when that is set. |
| `.dp/bmo.json` | BMO settings (on or off, backend, provider, model, endpoint, the credential to use, the roles allowed to run it). Not in git; mode 0600; changed by architects only. |
| `.dp/bmo/runs/` | A record of each direct BMO run. Not in git; it holds code excerpts. |
| `architecture/import/` | Code import review data, kept out of the model: `evidence.json`, `analysis.json`, `intake.json`, `ignore.json`, `levels.json`, `ledger.json`, `reviews/`, `files/`. Committable, except `handoff/` and the typed description, which `.gitignore` lists. |

designPerspectives data stored inside the workspace as Structurizr element properties:
`dp.owner`, `dp.links`, `dp.tag.<Group>` (e.g. `dp.tag.Risk = High`), `dp.archType` (symbol),
`dp.notes`, `dp.tradeoffs`, `dp.usage`, `dp.sensitive`, `dp.code.paths`, `dp.characteristics`, `dp.cost`,
`dp.work`, and on relationships `dp.kind`, `dp.stages` (the steps inside a pipeline or protocol, each with
optional sample data), `dp.example` and `dp.format` (a sample of the data the relationship carries),
`dp.endpoints` (HTTP calls it carries, for the live UI inspector), `dp.data.access` (which data at either
end it reads or writes) and `dp.work`; elements can have `dp.ui.url` (where their UI runs), `dp.data` (the
tables, topics or buckets they hold) and `dp.catalog` (the shared catalog element they are a copy of).

The sidecar also holds per-object `styles` (colours, line style, text size) and per-diagram
`layouts` (box sizes, line anchors/bends/label positions, the default line shape; box positions for
connector and code diagrams).

## Features

### Model and diagrams

- Model people, software systems, containers, components and relationships.
- Landscape, context, container and component diagrams. Double-click to go down a level; the breadcrumb
  goes back. Connections between elements inside boxes show at higher levels as dashed *derived* lines.
- The sidebar lists the levels: C1 (landscape, context), C2 (containers), C3 (components, connector
  detail), C4 (code), each indented under its parent. Every software system is listed; one with no
  containers is marked "(empty)".
- Moves: a container can move to another software system, and a component to another container. A
  move is refused when the name is already taken there.
- Readable IDs: the first rename of a new box also renames its ID, so `new-system` becomes `loans`.
- Object panel: name, description, technology, owner, links, tags, details tables, incoming and outgoing
  connections, decisions about the object.
- Technology as tags (suggestions from the model), **symbols** per architecture type (database, queue,
  pipeline, web, mobile, cache, storage, cloud, document, service), **notes**, **tradeoffs**, **usage**
  (who, how often), and **sensitive** labels (public to restricted) on objects.
- Export a diagram as SVG or PNG (Download menu).

### Editing on the canvas

- Start empty. A new landscape shows a "Start your architecture" card. `dp serve --demo` loads the sample.
- Add palette (left of the canvas): Container, Service / API, Web app, Mobile app, Database, Cache,
  Queue / stream, Pipeline / job, File storage, Cloud service, Document, and, where they fit, Component,
  Software system, External system, Person, Stage. Drag one onto the diagram, or click it to add it in
  the nearest free spot. Its name is ready to type.
- Connect to empty space: drag from a box's dot to an empty part of the diagram to add a new box there,
  already connected. A person or software system added on a context, container or component diagram
  comes with its line. Dragging a line onto empty canvas offers the kinds the diagram can add.
- Rename: select a box, then click its name (or press F2). The bar above a selected box changes its
  symbol, opens what is inside, duplicates or deletes it.
- Several boxes: Shift+click or Ctrl/Cmd+click boxes, or Shift+drag over empty canvas, to select them.
  Move, nudge or delete them together, with one undo step. Ctrl/Cmd+click and Shift+click do the same.
- Direct editing: resize boxes, connect from any side, drag line ends to any point on a box, bend lines,
  slide a line's label, colours, line style and width, text size, arrows, duplicate, undo/redo
  (Ctrl/Cmd+Z), copy/paste (Ctrl/Cmd+C/V/D), arrow-key nudge, Back/Forward between diagrams, drag the
  sidebar edges.
- Right-click menus on a box, a line and empty canvas. Items that do not apply (read-only server, flows,
  objects from a compared version) are left out. Arrow keys, Enter and Escape work in the menu.
- Auto-layout is layered (ELK) with room for labels; new boxes go in the nearest free spot; a box dropped
  on another moves to the nearest free spot. **Make room** and **Spread out** move boxes that are too
  close: the selected boxes when two or more are selected, otherwise the whole diagram. Each is one undo step.

### Lines

- Automatic lines are drawn with rounded right angles, go around other boxes, and spread their ends along
  each side of a box. Lines that share a gap are kept apart, and labels avoid other lines.
- Each diagram has a default line shape (set in the diagram details panel). A line can have its own:
  straight, curved through a bend point, smooth S-curve, right angles, rounded right angles.
- Line patterns: solid, dashed, dotted, dash-dot, long dash. Arrowheads: filled, open, diamond, open
  diamond, circle, bar.
- Line labels slide along their line only.
- Click a line for its details; double-click a line to open its connector.

### Connectors, sample data and flows

- **Connectors have an inside**: double-click a line to open its connector detail: the stages of a
  pipeline or protocol (e.g. consume, mask, load), each optionally linked to the component that
  implements it. A line drawn between higher-level boxes opens where its relationship is drawn.
- **Sample data**: click a line to see a sample of what it carries. For a pipeline, the sample entering
  it and the sample leaving each stage, with the fields each stage adds, removes or changes marked.
- **Flows**: ordered steps over relationships, with a step-through player (Introduction, Step n of N,
  Conclusion; Restart, Back, Next). Each step can carry example data.

### Lenses and overlays

- Lenses: the built-in **Architect** (all levels and sections), **Overview** (landscape and context only,
  fewer sections) and **Engineer**. The default is Architect until the model has a container, then
  Engineer. You can add your own (visible levels, default overlay, hidden tag groups, what each box
  shows). Your pick is remembered per project folder. A lens is a default view: it hides no data.
- Overlay dock (bottom left): **Tags**, **Technology**, **Characteristics**, **Cost** and **Work**
  colour the boxes by one property at a time, with a count per value. **Focus** dims the rest;
  **Hide** removes those boxes. Overlays stay on while a flow plays. Every coloured box also carries a
  text badge.
- Architecture characteristics ("-ilities"): rate an object 1–5 on scalability, deployability,
  testability and others (the 1–5 scale Richards & Ford use for architecture styles), mark the
  *driving* ones, and note why. The list is editable.
- Cost: monthly cost lines per object; systems and containers show the total of everything inside them.
  Cost bands (Free to Very high) and the currency are editable.
- Linked work: link boxes and lines to security issues, pull requests, issues, backlog items and
  required updates (title, link, status, severity). Boxes show open items; the **Work** overlay colours
  boxes by their most severe open item.

### Code level

- Map a component or connector to files or folders. The C4 code diagram shows the files as boxes and the
  imports between them (Python and JS/TS scanned).
- Double-click a file to edit it in the browser. It saves to the file on disk, only inside the code folder,
  keeping its permissions and line endings.
- In a draft, the same editor saves to the draft (`code/`), not to your code folder.

### Live data

- **Live UI inspector**: give a UI element the address it runs at and click **Inspect live UI**. The app
  opens inside dp; click in it and the side panel lists the HTTP calls each click made, the relationships
  they match (endpoints such as `POST /api/payments`), the data sent and returned next to the documented
  example, what those calls lead to in the model, and the flows involved. A call the model does not know
  can be added as an endpoint in one click. It works in a browser on the machine running `dp serve`; apps
  on other hosts need `--allow-ui-host <name>`.
- **Traces**: dp reads OpenTelemetry trace files (OTLP JSON, as the Collector's file exporter writes
  them, in `PATH/traces` by default). The inspector shows the path a request really took through the
  model, element by element, marking steps and services the model does not have.
- **Backtrack**: from any pipeline stage or flow step, go back through the earlier steps: each step's
  sample data, one field's value through every step, the code behind each step with its functions, and
  the git commits that changed that code or that part of the model. Recent changes are marked.

### Drafts and review

- **Drafts**: start a draft from the sidebar (Drafts → + New draft). It is a copy of the model you edit
  like the main one, with its own undo history. The main model is not touched. A draft has a title, an
  optional description, an author (from `git config user.name` without sign-in) and a date. Rename,
  edit the description or discard it from the row menu.
- **Changes overlay**: boxes and lines are coloured added / changed / changed inside / removed against
  the main model. Removed objects stay on the diagram as faded, read-only ghosts. The panel lists every
  change; a changed object shows its fields before and after.
- **Compare**: the draft strip compares the draft in one of two ways. **Since it started** shows only what
  the draft changed. **Against main now** also shows what main has changed since the draft started
  (the draft row shows "main +N").
- **Apply or discard**: Apply merges the draft into the main model as one undoable step. Changes made to
  the main model since the draft was made are kept; if both changed the same object, Apply is refused and
  lists the conflicts. The apply dialog can also write the planned code edits ("Also write the planned
  code edits"); it starts unticked when the draft has a branch. Discard deletes the draft.
- **Coding plan**: the draft strip → **Coding plan…** lists the work the draft implies (build, remove,
  change, connect, disconnect, flow, file). Paths and imports are checked automatically. Set the branch
  the code will be written on, check against the code folder or a branch, or copy the plan as Markdown.
  On the command line: `dp plan <draft>`.
- **Compare with git**: when the project is in a git repository, pick a branch, tag or commit under
  Drafts → Git (or **Other…** to type any ref) and press **Compare** to see what changed since then.
  **Open** shows that version read-only. Needs the `git` command.
- **Decision records**: the **Decisions** page lists the model's decisions with filters, each decision's
  record, and a form to write one. Six kinds: choice, conditional, deferred (decide by a date),
  time-boxed (expires), policy (applies to) and reversal (accepting it marks the decisions it replaces
  as superseded). A decision can be watched through its revisit triggers. Accepted decisions stay editable.
- **Comments, ideas and questions**: right-click a box, a line or empty space and choose **Comment…**.
  Threads can be replied to and resolved. Comments are stored separately from the model, in
  `architecture/comments.json`, with no undo step and no place in drafts.
- **In CI**: `dp check` fails the build on model problems; `dp diff --base <ref>` writes a Markdown summary
  for a pull request comment. Sample workflows are in [demo/ci-examples/](demo/ci-examples/).

### Using the app

- **Search**: Ctrl/Cmd+K opens a search dialog over names, descriptions and technology.
- **Keyboard**: press `?` for every shortcut.
- **Newer versions picked up**: when the window regains focus, the UI reloads if the model changed, for
  example after a git checkout, in another tab or from the CLI.
- **Safer version switching**: a draft or git ref that cannot load keeps the previous version on screen,
  with the error shown.
- **Read-only**: `dp serve --read-only` gives a viewer role: nothing can be changed.

Plan and limits: [docs/planned-change.md](docs/planned-change.md). Future work: [docs/backlog.md](docs/backlog.md).

## Develop

Everything is TypeScript: the server, the CLI and the browser UI share one set of API types
(`src/shared/types.ts`), so a change to a response shape is checked on both sides by the compiler.

```bash
npm ci                          # server, CLI and test tools (also builds dist/)
npm run typecheck
npm run lint
npm run format:check            # Prettier (npm run format writes)
npm test                        # unit, API and CLI tests (vitest, tests/unit/)
npm run dp -- serve             # run the CLI from source (tsx), e.g. `npm run dp -- check`

cd ui && npm ci && npm run dev  # UI dev server on :5173, proxies /api to dp serve on :8765
npm run build                   # (in ui/) writes the UI into static/ (committed)

npx playwright install chromium # or set DP_E2E_CHROME to a Chrome/Chromium binary
npm run test:browser            # browser tests (Playwright, tests/browser/; need the built UI)
npm run test:list               # regenerate tests/TESTS.csv, the list of every test
npm run make-demo               # regenerate the bundled demo model (demo/)
```

Contributor steps, the Git process and the rules that surprise people are in
[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md). Tool settings (TypeScript, ESLint, Prettier, Vitest, Playwright) are in `config/`.

Layout:

| Path | What it holds |
|---|---|
| `src/shared/types.ts` | API types and constants used by both the server and the UI |
| `src/core/` | The model: `workspace.ts` file format, `designPerspectivesFile.ts` (designperspectives.json), `modelEdits.ts` all edits and rules, `diagrams.ts` what each level shows, `connectors.ts`, `flows.ts`, `validate.ts`, `project.ts` files and undo, `drafts.ts`, `merge.ts`, `diff.ts`, `codeMap.ts` code mapping, `codeFiles.ts`, `decisions.ts`, `catalog.ts`, `credentials.ts`, `users.ts`, `history.ts`, `git.ts` (read-only) |
| `src/server/` | `app.ts` the HTTP app (Hono), `routeContext.ts` the shared context, `requestProtection.ts` request checks, `auth.ts` sign-in and roles, `hub.ts` the hub of projects, `routes/` one module per area (readModel, drafts, model, sidecar, code, decisions, inspect, comments, hub, import, bmo, ui) |
| `src/import/` | Codebase import (DEC-051): `scan.ts`, `knownServices.ts`, `intake.ts`, `analysis.ts`, `schema.ts`, `checks.ts`, `importer.ts`, `lastImport.ts`, `review.ts`, `importStatus.ts`, `unmappedCode.ts` |
| `src/assistant/` | BMO, the optional assistant: `tasks.ts`, `prompts.ts`, `runTask.ts`, `backend.ts`, `handoffBackend.ts`, `providerBackend.ts` (Claude API, OpenAI API, Ollama), `settings.ts`, `redact.ts`, `codeExcerpts.ts`, `modelText.ts`, `importTasks.ts`, `fakeBackend.ts` (tests) |
| `src/cli.ts` | the `dp` command |
| `src/demo/` | the demo bank web app and the made-up git history |
| `ui/src/` | React UI with xyflow and elkjs. Folders: `canvas/` (drawing, line routing, palette, overlay dock), `panels/` (property panels), `pages/` (home, catalog, credentials, history, decisions, sign-in), `drafts/` (draft list, change list, apply dialog), `inspect/` (live UI inspector), `hooks/`, `common/` (shared dialogs and widgets), `styles/`; builds into `static/` |
| `demo/` | everything for learning the tool: the demo model, its sample code, a sample draft, a demo hub, an example import file, example CI jobs and the guided tour ([demo/README.md](demo/README.md)) |
| `scripts/` | `make-demo.ts` and `make-demo-hub.ts` (regenerate `demo/`), `list-tests.ts` (writes `tests/TESTS.csv`) |
| `tests/` | `unit/` (Vitest: logic, API, CLI; no browser) and `browser/` (Playwright: the real UI in Chromium); `TESTS.csv` lists every test ([tests/README.md](tests/README.md)) |
| `config/` | tool settings: TypeScript, ESLint, Prettier, Vitest, Playwright |
| `docs/` | decisions, backlog, reviews, changelog, contributing guide, notes |

## Credits

The demo model starts from the Internet Banking System ("Big Bank plc") example of the C4 model by Simon
Brown (Apache License 2.0); see [demo/README.md](demo/README.md#credits) for the full attribution.
