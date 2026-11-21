# Wave 21: Static HTML export

| | |
|---|---|
| **Status** | Planned 2026-11-20 from the owner's answer D1 ("static export will be done before deployment of v1", PRO-17). The four open choices (D16 to D19) were decided on 2026-11-20 by the assistant's reasoning, at the owner's request (PRO-18). The design is otherwise a Proposal. Ready to run after Wave 20 |
| **Branch** | `feat/w21-static-export`, from `main` after the previous wave is merged |
| **Size** | M–L (split point: 21a the export build, the folder form and the review step; 21b the single file and the CI examples) |
| **Release** | 0.13.0 (its own release, the last feature wave before 1.0.0; PRO-18, PRO-19, PRO-22). [Wave 28b](wave-28-quality-for-1-0.md) (0.14.0) follows it, because its accessibility audit also audits the exported single file |
| **Depends on** | Waves 2, 3, 6, 8, 9, 13, 16 and 27 for what the export carries (27, the small batch, ships earlier, in 0.8.0, and adds the technology toggle and the inherited owner to what a snapshot shows) (it can be built before them and gain rows as they land, but it should be run last so it is built once against their final shape). Hard dependency: none |
| **Owner items** | PRO-13, PRO-14, scope decision P3 (PRO-20). Not one of the twelve features: it is how a model is shared with people who cannot run Node, and it supports features B and E |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

`dp export html` writes a snapshot of one project that opens in a browser with no server: the same UI, read-only, showing every diagram, element, note, decision and the other data the waves added. A person can attach it to an email, host it on any static web host, or publish it from CI next to `dp check` and `dp diff`. Before anything is written, dp shows the person exactly what will be in it, because an export contains everything the model contains.

## Owner request covered

> D1 - Static export will be done before deployment of v1 [2026-11-20]

PRO-13 (2026-11-14) set the design: the built UI plus a snapshot of the model, no server, a review step before publishing. PRO-17 moved it from "after the deployment stage" to "before 1.0.0".

## What exists today [Fact]

- **Sharing today is `dp serve --read-only`** (PRO-13). It needs Node and a running server; there is no export command (`src/cli.ts` has no `export`).
- **The UI reaches the server in one place.** `ui/src/api.ts:129-136`, the `request` function, is the only call to `fetch` in `ui/src`, and it sends the model version in the headers `X-DP-Model`, `X-DP-Compare` and `X-DP-Project`. No `EventSource` is used.
- **The server already answers every read with one function per route.** About 37 `app.get` routes across `src/server/routes/`; the ones a viewer of a model needs are `/api/state`, `/api/diagrams/:key`, `/api/decisions`, `/api/decisions/:id`, `/api/comments`, `/api/work`, `/api/checklist`, `/api/code/*`, `/api/history`, `/api/hub`, `/api/home`, `/api/catalog`. Diagram keys are computed from the model (`src/core/diagrams.ts`, documented at its top).
- **The UI already has a read-only mode.** `/api/state` carries `readOnly` and an `access` map of what the viewer may do (`src/server/routes/readModel.ts:16`, `src/server/routeContext.ts:76-93`); buttons that write are hidden when it says no.
- **The UI uses hash routes** (`ui/src/Router.tsx`, `useNavigation.ts`), so it needs no server-side routing.
- **The built UI is three files:** `static/assets/app.js` (about 1.0 MB), `app.css` (about 0.1 MB) and `diagram-layout.js` (about 1.5 MB, the lazily loaded elkjs: `ui/src/canvas/layout.ts:19`).
- **The built page cannot open from a disk folder as it is.** `static/index.html` loads `<script type="module" crossorigin src="/assets/app.js">`: an absolute path, as a module script. The consequence for a page opened as a `file:` address (browsers refuse module scripts and `fetch` there, and an absolute path points at the disk root) is [Training, not verified here; step 1 checks it in Chrome, Firefox and Safari].
- **Redaction exists** for text that goes to BMO (`src/assistant/redact.ts`, COD-03): it masks values that look like secrets.
- **Precedent for a report before an outward step:** the BMO preview shows the exact prompt and its hash before anything is sent (COD-08).
- **Local-file references** (`local:` paths, SEC-03, Wave 3 and Wave 16) store a path that can show a user name.

## Design [Proposal]

1. **Command.** `dp export html [PATH] --out DIR [--version main|ref:<git ref>] [--with LIST] [--without LIST] [--single-file] [--yes]`.
   - **Default is a report, not a write.** Without `--yes` dp prints the review report (item 4) and exits with code 0 and writes nothing. With `--yes` it writes `DIR`. A CI job uses `--yes` and `--without` to make its choice explicit and stable.
   - `--version main` (the default) is the model on disk; `ref:<git ref>` reads the committed model through `src/core/git.ts`, so a pipeline exports exactly the commit it runs on. A draft is never exported (a draft is a proposal, not a published state).
2. **Data path: a snapshot of the answers.** The export builder calls the same read functions the routes call, once per diagram key and once per list, and writes the results as JSON keyed by the route and the model version. In the exported page `ui/src/api.ts` answers a GET from that snapshot and refuses any other method. The UI is otherwise the same code. [Trade-off, below.]
   - The page knows it is an export from a global the export writes (`window.__DP_EXPORT__`), which also carries what is shown in the banner: the project name, the commit (when `ref:` was used) and the date given by the person or by `--date` (never the clock, so the same input gives the same bytes).
   - `/api/state` in the snapshot has `readOnly: true` and an `access` map with every write off, so the UI hides Add, Edit, Undo, Draft, Test, Import, Ask BMO and Credentials with the code it already has. Step 3 lists any control that is still shown.
3. **Two shapes, both built** (D18, PRO-18). Both come from one **second UI build target**, `ui/vite.export.config.ts`, next to the one that makes `static/`: a classic (non-module) script with relative paths, the model data as `.js` files that set a global instead of being fetched, and elkjs as a separate classic script added with a script tag. [Proposal; the claim that classic scripts and script tags load from a `file:` address where module scripts and `fetch` do not is Training, not verified here. Step 1 checks it in three browsers.] The target's output is committed and shipped like `static/` (in `static-export/`, added to `package.json` `files` and to the CI check that a build leaves the committed files unchanged), and `dp serve` keeps using `static/` unchanged.
   - **A folder** (21a), for a web host (GitHub Pages, GitLab Pages, an intranet server) **and** for opening `index.html` from disk. This is the point of the second build target: the folder is not limited to people who have a web server.
   - **A single file** (21b, `--single-file`), for an email attachment or a chat message: the same page with the script, style, data and elkjs inline in one `.html`. About 2.6 MB plus data.
4. **The review step (PRO-13).** The report is the guard against publishing something by accident. It lists, from the model as it will be exported:
   - **Counts** by kind: elements, relationships, diagrams, flows, decisions (by status), notes and stickies, comments, linked work items, library entries, attachments (names and sizes).
   - **What commonly should not leave the team**, each with a count and the first five examples: cost lines (`dp.cost`), sensitive-data markers (`dp.sensitive`, `dp.data`), run addresses (`dp.run.url`), links (`dp.links`), `local:` paths and the user names in them, linked-work URLs and keys, owner names and e-mail addresses in `dp.owner`.
   - **Secret-looking values** found by the redaction rules of COD-03 in any text field. These **refuse the export** (exit code 1) until the field is changed or the person adds `--allow-secret-looking` and names the field.
   - **What was left out** by `--without` and by the defaults below.
   - A hash of the exported content, so the report a person approved and the files a pipeline wrote can be compared.
5. **Defaults and options** (D17, PRO-18). The rule: the export shows what the diagrams and panels show about the architecture; anything that is not the model itself, or that carries the most risk of leaving by accident, is opt-in. Two lists, with no overlap:
   - **Included by default, removable with `--without`:** the model (elements, relationships, diagrams, flows, tags, technology, characteristics ratings), and, each with its switch, `notes` (notes and stickies), `decisions`, `links` (`dp.links`), `owners` (`dp.owner`), `addresses` (`dp.run.url`), `library`, `keycode`, `findings` (findings and acknowledgements), `contracts` (references). The characteristics table has no switch: it is the ratings.
   - **Left out by default, added with `--with`:** `comments` (a conversation, not the model: REC-01), `attachments` (still only those referenced by what is exported), `work` (linked work: ticket keys and URLs), `costs` (cost lines and the cost overlay's figures), `local-paths` (without it a `local:` reference shows its file name only), `code` (files from the code root), `checklist`, `import-review`, `bmo-runs`.
   - **Always refused:** a secret-looking value (item 4). **Never exported:** `.dp/` contents, credentials, users, `integrations.json`, drafts, comments' author sign-in data.
6. **What each wave contributes.** Taken from the line "Static export" in each wave file, as the rule in [README.md](README.md#rules-for-every-wave-agent) asks:

   | Wave | In the export |
   |---|---|
   | 2 Notes | Stickies and object notes |
   | 3 Library | The library, read-only. Attachment file types stay out unless chosen |
   | 4 Variants | Conditions, variants, CRUD letters and the matrix |
   | 5 Key code | Key code, not search |
   | 6 Findings | Acknowledgements |
   | 7 Metrics | Not included unless the owner asks (D17) |
   | 8 Rules | The findings list, read-only |
   | 9 Characteristics | The table |
   | 13 Contracts | Contract references, not fingerprints |
   | 16 Attachments | Only attachments referenced by what is exported, only after this review |
   | 19 Lenses | The default lens |
   | 1, 11, 14, 15, 17, 18, 20 | Not affected or not included |

7. **No request leaves the page.** The export loads no font, script or image from another site. A `<meta http-equiv="Content-Security-Policy">` with `default-src 'none'` and `script-src` set to the hash of the inline script (single file) or `'self'` (folder) is written into the page. Attachments that are included are served from the export's own files; a PDF is a download, an image is shown through `<img>` (Wave 16's rules).
8. **A hub** is exported one project at a time: `dp export html PATH` where PATH is the project folder (D19, PRO-18). The home page, the catalog and the cross-project Work page are not part of an export. A project that links to catalog entries shows its linked copies, which are in its own model. One export never mixes projects, so it cannot carry a project the person was not meant to publish (SEC-05 gives each project its own roles).
9. **CI examples.** `demo/ci-examples/` gets a GitLab Pages job and a GitHub Pages workflow that run `dp export html --version ref:HEAD --out public --yes`. They are product examples, not this repository's CI.
10. **Banner.** A thin bar at the top of every page says "Read-only snapshot of <project>", the commit when there is one, and the date. It cannot be dismissed, so a copy of a page cannot pass as a live model.

## Determinism

| Output | Class |
|---|---|
| The files of an export (same input, same bytes, no clock) | computed |
| The report's counts and its hash | computed |
| Secret-looking values found | approximate (a rule known to miss cases: COD-03's rules) |
| "Commonly should not leave" lists | heuristic (a hint by field name, not a judgement) |

## Added by later waves

- **Wave 22 (digests):** the digests in `architecture/import/digests/` are left out of an export by default and added with `--with digests`; add `digests` to the opt-in list of PRO-18 when Wave 22 is built.

## Owner answers

- **D1 (2026-11-20, PRO-17):** the export is part of 1.0.0, built before it. Scope review P3 becomes "keep".
- **D16 to D19 (2026-11-20, PRO-18; the owner asked for the assistant's best reasoning):** its own release (0.11.0, moved to 0.12.0 by PRO-19, then to 0.13.0 by PRO-22); the two lists of item 5; both shapes, from a second build target; one project at a time.

## Carried from the backlog (moved from planned_features.md, 2026-11-21)

- **Static HTML export** (was B2 task 3; medium to large). `dp export html`: the built UI plus a snapshot of the model, opened without a server, publishable from CI. Needs a static data path in the UI. The export includes everything in the model (notes, costs, links), so it needs a review step before publishing. Owner, 2026-11-20 (D1, PRO-17): in 1.0.0, no longer after the deployment stage. Release 0.13.0; defaults, shapes and hubs decided in PRO-18. [Source: Owner, PRO-13, PRO-14, PRO-17.]

## Stop and ask if

- The check in step 1 shows that a classic script, or a script added with a script tag, does not load from a `file:` address in one of the three browsers. Then the folder needs a web host and the single file is dropped, or it ships without automatic layout (positions are stored in the model, so a diagram still draws). Tell the owner which.
- A write route or a control that needs the server is still reachable in an exported page.
- The secret check finds a value in the demo model. That would be a bug in the check or in the demo.
- Someone asks to include System Testing, BMO or drafts in an export. They need a server by nature.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor, and check the `file:` behaviour of the current build in three browsers | Explore · Haiku, then the main session | The files above, `static/index.html` | Anchors confirmed; the check is written in the review file |
| 2 | Snapshot builder: which routes, keyed by version; byte-stable output | general-purpose · Opus | `src/core/exportHtml.ts` (new), `src/server/routes/*` (read) | Every route the UI calls in read-only mode has an entry; two runs give identical bytes |
| 3 | UI export mode: the `api.ts` switch, the banner, hidden controls | general-purpose · Sonnet | `ui/src/api.ts`, `ui/src/App.tsx`, `ui/src/exportMode.ts` (new) | An exported demo opens, every diagram and page reads, no control writes |
| 4 | Review report, `--without`, `--with`, the secret refusal, the CLI | general-purpose · Opus | `src/core/exportReport.ts` (new), `src/cli.ts` | The report matches the content; the refusal works on a planted secret |
| 5 | The export build target (21a: step 3 needs it) and the single-file inlining (21b) | general-purpose · Sonnet | `ui/vite.export.config.ts` (new), `ui/package.json`, `package.json` (`files`), `scripts/ci-local.ts`, `.gitlab-ci.yml` | The folder and the single file open from disk in three browsers; the CI check that committed build output is current covers `static-export/` |
| 6 | CI examples, docs | general-purpose · Haiku | `demo/ci-examples/`, README, CLAUDE.md, decisions.md, the review file (notes for the release entry, not the CHANGELOG) | Docs updated |
| 7 | Tests, by a different subagent from steps 2 to 4 | general-purpose · Sonnet | `tests/unit/export-*.test.ts`, `tests/browser/export.spec.ts` | As listed below |
| 8 | Review | main session | — | `/code-review` (high) and `/security-review` findings fixed |

## Required in this wave

- **Routes.** None: the export is a CLI command and reads the project from disk. (A UI "Export…" dialog would need a route and a `ROUTE_RULES` entry for architects; it is out of scope.)
- **Hub** and **read-only mode:** `dp export html` works on a project folder of a hub and on a read-only project; it writes only to `--out`, which must not be inside `architecture/`, `.dp/` or the code root.
- **Model data.** None added.
- **Security model** in `docs/CONTRIBUTING.md`: the export as a path by which the model leaves the machine, the review, the refusal and the options.
- **Windows:** paths in `--out` and in the snapshot's keys.
- **Performance.** A test on a generated project of 2,000 elements with 200 diagrams: the time and the output size, written down in the review file.

## Tests

- **Bytes.** Two exports of the demo are identical. A one-word change in a note changes only the files that carry it.
- **Reads.** Every diagram of the demo opens in the exported page; every page the read-only UI offers opens.
- **No writes.** In the exported page no `POST`, `PUT`, `PATCH` or `DELETE` is sent (the test fails on any); the controls for writing are not shown.
- **Report.** Counts match a hand-counted small model; a `local:` path, a cost line and a `dp.run.url` each appear under their heading; `--without links` removes `dp.links` from the files and the report says so; with no `--with costs`, no cost value is in any file, and with it the cost lines appear.
- **Secret refusal.** A planted token-shaped value in a note refuses the export with the field named; `--allow-secret-looking` names it and goes ahead.
- **Versions.** `ref:<git ref>` exports the committed model, not the working tree.
- **No outward request.** The page loads nothing from another origin (browser test with requests recorded).
- **Single file** (if built). The file opens from a `file:` address in Chromium and shows a diagram.

## Docs

- **New decision entry:** the snapshot design, the report as the guard, the defaults, the single file if built. It amends PRO-13.
- **README:** `dp export html`. **CLAUDE.md:** `exportHtml.ts`, `exportReport.ts`, `exportMode.ts`. **CONTRIBUTING.md:** the security model paragraph.
- **Backlog:** the "Static HTML export" item in this file's "Carried from the backlog" section is done. **demo/README.md:** one paragraph.
- **`docs/determinism.md`:** rows for this wave.

## Out of scope

- A UI button or route that writes an export.
- Hosting: dp does not publish anywhere; the person or the pipeline does.
- A live, auto-updating site (that is `dp serve --read-only`).
- Exporting a hub as one site, or a folder per project with an index page (D19; revisit after 1.0.0).
- Search over the code, System Testing, BMO, drafts, the History page and anything else that needs a server or git.

## Start prompt

```
Run Wave 21 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-21-static-export.md, and follow them: branch from main as the header says,
run the steps with the agents and models in the table, brief each subagent with files and
line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
