# Manual test plan (draft)

> **Status: Draft, not run.** Written from the README, the demo tour and `tests/TESTS.csv`. Extended on 2026-11-20 with sections 20 to 27, a **gap register (section 28)** that calls out everything not confirmed, including borderline items, and **section 29, the unverified facts** (what was never run or measured), so you can decide item by item whether to test it. Rows 1 to 170 were spot-checked against the code on 2026-11-20 (labels, commands, options); the rows added on 2026-11-20 were written from the code and the docs the same way. **No step has been run.** Fix any step that does not match the app.

## How to use

1. Start the demo in a new empty folder (the command is from `README.md` and `demo/README.md`):

   ```bash
   mkdir bank-demo && cd bank-demo
   dp serve --demo
   ```

   From a clone of the repository, use `npm run dp -- serve --demo` instead. The app opens at `http://127.0.0.1:8765`. The demo system (a banking page and four services) runs on ports 4200 to 4204; its page is `http://127.0.0.1:4200/`.
2. Run the rows of one section in order. Each row is one action.
3. Write the result in the last column: **Pass**, **Fail**, **Skip** (not run, say why) or **N/A** (does not apply). A row marked *needs own key*, *needs account*, *needs a second machine* or *needs a real repository* may be a Skip; the gap register (section 28) has a "Your decision" column (Test, Skip, Later) for those.
4. Record the date and the version at the top of each test run. **Which build:** `package.json` says 0.5.0 but `docs/CHANGELOG.md` lists 0.6.0 as the newest version (the release change was not made yet). Test Mode, the checklist, the Work page, placed notes, the BMO chat and the $8,690 cost figure belong to 0.6.0, so test a clone of `main` and write its commit hash in the Notes column; `dp --version` alone will say 0.5.0.
5. Some sections need the demo folder in a state the earlier sections changed. Start a fresh demo folder when a section says so.

| Run date | dp version | Tester | Browser and OS | Notes |
|---|---|---|---|---|
| | | | | |

IDs are `MT-DRAFT-nn`. They are stable: do not renumber when you add a row; add new ones at the end of a section.

## Coverage by automated tests

Counts come from `tests/TESTS.csv` (1134 tests). "Unit/API/CLI" is everything except Browser. A row with 0 browser tests has no real-browser check; a row with a low unit count is checked mostly through the browser.

| Feature area (sections below) | Areas in TESTS.csv | Unit/API/CLI tests | Browser tests | Only one kind? |
|---|---|---|---|---|
| 1 Start-up and empty project | Owner checklist, From scratch, Model files, Validate | 51 | 7 | both |
| 2 C4 modelling, editing, shortcuts | Model edits, Multi edit, Diagrams, Model units, Stage A2 features, Canvas, Interactions, Dialogs, Model sync | 81 | 81 | both |
| 3 Lines and layout | Routing, Line editing, Line layout, Line shape, Line colours, Make room and Spread out, Layout, Colour | 144 | 41 | both |
| 4 Tags, lenses, overlays | Characteristics cost, Overlays | 10 | 6 | both (few) |
| 5 Flows and connectors | Flows, Flow step info, Flow step, Backtrack | 23 | 2 | mostly unit |
| 6 Drafts | Drafts, Drafts ui, Diff and merge, Planned code | 39 | 15 | both |
| 7 Decisions | Decisions | 14 | 2 | both (few browser) |
| 8 Comments and notes | Comments, Comment notes | 18 | 5 | both |
| 9 Shared catalog and hub | Hub and shared catalog, Credentials | 23 | 14 | both |
| 10 Code level | Code level | 10 | 0 | **API only** |
| 11 Code import | Code import, Command line: Import | 120 | 8 | both |
| 12 BMO | BMO assistant, Command line: Bmo | 147 | 16 | both; no real provider |
| 13 Linked work | Work api, Work import, Work settings, Work tools, Linked work status, Integrations, Command line: Work, Work | 72 | 7 | both |
| 14 System Testing | Testing api, Testing core, Testing decor, Testing mode, Intercept proxy, API endpoints, Traces, Demo system, Demo testing | 73 | 7 | both |
| 15 Checklist | Checklist | 14 | 5 | both |
| 16 Roles and sign-in | Sign-in and roles, Security | 56 | 12 | both |
| 17 History and git compare | Git compare (History page: History work tests in Linked work status) | 5 | 1 | thin |
| 18 CLI | Command line: Check diff 5, Import 10, Bmo 7, Work 6, Credentials 1, Integrations 1, Sign-in and roles 4 (CLI rows), plus `api.test.ts` for `dp --version` and `dp init` | about 34 | 0 | **CLI only** |
| 19 Install checks | none in TESTS.csv; `scripts/ci-local.ts` installs the packed tarball | 0 | 0 | **owner only** (the GitHub-URL install is untested) |
| 20 Security and request protection | Security, Sign-in and roles (counted in row 16) | in row 16 | in row 16 | both, but not on a real server |
| 21 Concurrency and sessions | none | 0 | 0 | **none** |
| 22 Failure modes | scattered (Drafts, Planned code, Decisions, Hub, Git compare) | few | 0 | **thin** |
| 23 Scale and performance | none (a few `SIZES` loops in spread and import-review tests) | 0 | 0 | **none** |
| 24 Accessibility and input | only the search dialog's focus trap (`overlays.spec.ts`) | 0 | 1 | **thin** |
| 25 Browsers, platforms, packaging | none; Chromium only; `ci-local.ts` for the tarball | 0 | Chromium | **thin** |
| 26 Flags and features with no step so far | partly (`cli-*` tests); bell, `credentials rotate`: none | few | 0 | **thin** |

## 1 Start-up and empty project

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-01 | In a new empty folder run `dp serve --demo`. | The browser opens at `http://127.0.0.1:8765` on the System landscape. Folders `architecture/` and `sample_code/` exist. The terminal says the demo system started (or names a busy port). | tests/unit/api.test.ts, tests/unit/demo-system.test.ts | |
| MT-DRAFT-02 | Open `http://127.0.0.1:4200/` in a second tab. | A small "Internet banking" page with made-up data. | tests/unit/demo-system.test.ts | |
| MT-DRAFT-03 | In the demo folder run `git log --oneline`. | Four made-up commits, the last one two days old. | none found | |
| MT-DRAFT-04 | Make an empty folder, run `dp serve` in it. | An empty landscape with a three-step "Start your architecture" card. | tests/browser/from-scratch.spec.ts | |
| MT-DRAFT-05 | In the empty project, add a person and a software system from the card or palette. Reload the page. | Both stay after the reload. `architecture/workspace.json` and `architecture/designperspectives.json` exist. | tests/unit/from-scratch.test.ts | |
| MT-DRAFT-06 | Run `dp serve --port 9000 --no-open` in another folder. | The server listens on 9000 and no browser opens. | none found | |
| MT-DRAFT-07 | In a folder with a model, edit `workspace.json` by hand (change a description), then focus the browser window. | The UI reloads and shows the new description. | tests/browser/model-sync.spec.ts | |
| MT-DRAFT-08 | Press **Ctrl/Cmd+K**, type `redis`. Then press **?**. | A search dialog lists matching boxes. **?** lists every keyboard shortcut. | tests/browser/overlays.spec.ts ("search reveals object"; "search is a modal dialog") | |
| MT-DRAFT-09 | Click the notification bell at the top right. | A list of what waits now (model problems, drafts behind main, decisions that need a look) and past messages. | none found | |

## 2 C4 modelling, editing, shortcuts

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-10 | On the landscape, click **Internet Banking System**. | The right panel shows description, owner, links, tags and connections. | tests/browser/interactions.spec.ts | |
| MT-DRAFT-11 | Double-click **Internet Banking System**, then **Payments Service**, then **Payments Controller**. | Containers, then components, then the code level (mapped files). The breadcrumb shows each step. | tests/unit/diagrams.test.ts, tests/browser/editing.spec.ts | |
| MT-DRAFT-12 | Press Alt+Left (Back) and use the breadcrumb to go up. Open **Diagrams** and pick a C1 context diagram. | You go back one diagram at a time. The list shows diagrams by C4 level (C1 to C4). | tests/browser/interactions.spec.ts | |
| MT-DRAFT-13 | On the containers diagram, drag **Service / API** from the palette. Type a name (check the label of the name field). | A new box appears in a free spot with its name ready to type. | tests/browser/editing.spec.ts | |
| MT-DRAFT-14 | Drag from one of its dots onto **API Application**. | A new line is drawn between them. | tests/browser/editing.spec.ts | |
| MT-DRAFT-15 | Drag from a dot to empty canvas and pick **External system**. | A new external system with a line to the first box. A person or system added on a container diagram always comes with a line. | tests/browser/canvas-fixes.spec.ts | |
| MT-DRAFT-16 | Select the new box and press F2. Rename it. | The name changes. For a box that was never renamed, the ID changes too (`new-system` becomes a slug of the new name). | tests/unit/ops.test.ts | |
| MT-DRAFT-17 | Try to rename a box to a name that another box in the same place already has. | The change is refused and the old name stays. | tests/unit/ops.test.ts | |
| MT-DRAFT-18 | Press Ctrl/Cmd+Z, then Ctrl/Cmd+Shift+Z (check the redo key). | The last edit goes away, then comes back. | tests/unit/api.test.ts | |
| MT-DRAFT-19 | Shift+click three boxes. Drag them, nudge them with arrow keys, press Delete. Press Ctrl/Cmd+Z once. | They move and are deleted together. One undo restores all of them. | tests/unit/multi-edit.test.ts, tests/browser/move-multi.spec.ts | |
| MT-DRAFT-20 | With two boxes selected, change the owner or a tag group in the panel. | Both boxes change in one undo step. | tests/unit/multi-edit.test.ts | |
| MT-DRAFT-21 | Select a box, press Ctrl/Cmd+C then Ctrl/Cmd+V; also Ctrl/Cmd+D. | A copy appears and is selected. | tests/browser/interactions.spec.ts | |
| MT-DRAFT-22 | Right-click a box, a line and empty canvas. | A menu for each. Arrow keys, Enter and Escape work in it. | tests/browser/context-menu.spec.ts | |
| MT-DRAFT-23 | Move a container to another software system (check where the Move action is). | It moves. A name already used there is refused. | tests/unit/ops.test.ts | |
| MT-DRAFT-24 | Use the Download menu to export a diagram as SVG and as PNG. | Two files are saved and open correctly (what to look for: MT-DRAFT-228). | none found | |

## 3 Lines and layout

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-25 | Open the containers diagram. Press **Auto-layout** (top-right toolbar). | Boxes are laid out in layers. Lines have rounded right angles, go around boxes and do not cross labels. | tests/unit/routing.test.ts, tests/browser/layout.spec.ts | |
| MT-DRAFT-26 | Select a line, drag a piece of it. | A straight line gets a corner at the drag point. | tests/unit/line-editing.test.ts, tests/browser/line-editing.spec.ts | |
| MT-DRAFT-27 | Use **Reset line shape** from the line menu (or double-click a handle). | The line goes back to automatic routing. | tests/browser/line-editing.spec.ts | |
| MT-DRAFT-28 | In the diagram details panel set the default line shape; try each shape. Then set one line's own shape. | The diagram's lines change shape; the single line keeps its own. | tests/browser/line-shape.spec.ts | |
| MT-DRAFT-29 | Select a line and change pattern (solid, dashed, dotted), arrowhead and width (check the labels). | The line changes as chosen. | tests/unit/line-editing.test.ts | |
| MT-DRAFT-30 | Drag a line label. | It slides along its own line only. | tests/browser/line-editing.spec.ts | |
| MT-DRAFT-31 | Drag two boxes close together. Use **Make room**. Undo. Use **Spread out**. Undo. | Make room widens only gaps that are too tight. Spread out widens every gap by about 20%. Each is one undo step. With two or more boxes selected, only those move. | tests/browser/spread.spec.ts, tests/unit/spread.test.ts | |
| MT-DRAFT-32 | Drag one box a little. | Only the lines at that box are redrawn; all other lines stay where they were. | tests/unit/line-layout.test.ts | |
| MT-DRAFT-33 | Look at **Colour** at the bottom left of the canvas. Turn it off and on. | Lines are coloured by kind or technology, each pipeline has its own hue. Off removes the colours. | tests/unit/line-colours.test.ts, tests/browser/colour.spec.ts | |
| MT-DRAFT-34 | Double-click a line between higher-level boxes. | It opens where its relationship is drawn (the connector detail). | tests/browser/routing.spec.ts (check) | |

## 4 Tags, lenses, overlays

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-35 | On the containers diagram open the dock (bottom left). Pick **Tags → Tier**, click **Tier 1**, choose **Focus**. | Boxes are coloured by Tier, a count per value, and other boxes are dimmed. Every coloured box has a text badge. | tests/browser/overlays.spec.ts | |
| MT-DRAFT-36 | Choose **Hide** for a value. Then remove the filter. | Boxes with that value vanish; removing the filter shows all again. | tests/browser/overlays.spec.ts | |
| MT-DRAFT-37 | Try Hosting, Lifecycle (find the **E-mail Component** inside API Application), **Characteristics → Availability**, **Cost → Monthly cost**, **Work → Security issue**, **Technology**. | Each colours boxes by that property. | tests/browser/overlays.spec.ts | |
| MT-DRAFT-38 | On the Internet Banking System containers diagram, read the cost of the system. | The system's own monthly cost ($8,690 per the changelog), with costly outside boxes in an "Outside this system" row. | none found | |
| MT-DRAFT-39 | Click **Payments Service**. Rate a characteristic 1 to 5, mark it driving, add a note. Add a cost line. | The values stay after a reload. Systems and containers add up the cost of everything inside. | tests/unit/characteristics-cost.test.ts | |
| MT-DRAFT-40 | Open the lens switcher (top right). Try Architect, Engineer, Overview, Security review, Product owner, Operations, Finance (only the first three are built in; the other four are defined in the demo's `designperspectives.json`, so a new project shows three). | Each starts on its own levels and overlay (for example Overview shows landscape and context only). No data is hidden: other panel sections can still be opened. The lens choice is remembered after a reload. | tests/unit/features.test.ts, tests/browser/features.spec.ts | |
| MT-DRAFT-41 | Open the settings for tag groups, lenses, characteristics and cost (check where). Add a custom lens. | The new lens appears in the switcher. | tests/browser/features.spec.ts | |
| MT-DRAFT-42 | Click **Payments Service**: look at technology tags, symbol, owner, links, details tables, notes, tradeoffs, usage and sensitive labels. | Each section shows the demo data. | tests/unit/features.test.ts | |

## 5 Flows and connectors

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-43 | Open **Flows** and pick **Make a payment**. | The flow player card opens with Introduction. | tests/unit/flows.test.ts, tests/browser/flow-step.spec.ts | |
| MT-DRAFT-44 | Press **Next** through every step. | Each step highlights one line and shows who sends what to whom, with example data (HTTP request, Redis command, MQ message, Kafka record). Input and output, endpoints and files show for the step. | tests/unit/flow-step-info.test.ts | |
| MT-DRAFT-45 | Use Back and Restart. | Steps go back; Restart returns to the introduction. | none found | |
| MT-DRAFT-46 | Play **Payment confirmation**. | Steps run from the event on the topic to a push notification. | tests/unit/flows.test.ts | |
| MT-DRAFT-47 | Turn on an overlay while a flow plays. | The overlay stays on. | none found | |
| MT-DRAFT-48 | Open the Analytics Platform containers diagram. Double-click the line **Event Stream → Data Warehouse**. | Connector detail with stages: consume, mask personal data, load. Each stage links to its component. | tests/unit/diagrams.test.ts | |
| MT-DRAFT-49 | Single-click that line. | Sample data at every stage. **Mask PII** shows `email` and `user_id` removed and `user_ref` added. | tests/unit/features.test.ts | |
| MT-DRAFT-50 | Open the connector **Mainframe Banking System → Statement Store** and click **backtrack** next to stage 8. | A box lists changes of the last 14 days (stages 5 and 7). A table follows `closingBalance` back; clicking a field name follows another field. | tests/browser/backtrack.spec.ts, tests/unit/backtrack.test.ts | |
| MT-DRAFT-51 | Click step 5, then step 7 in that backtrack. | Step 5 shows `amount` added as `-42.27`, the commit from two days ago and the functions it changed. Step 7 says the stage was added six days ago. | tests/unit/backtrack.test.ts | |
| MT-DRAFT-52 | In a flow step panel press **Backtrack from this step**. | The same backtrack screen opens for that step. | tests/browser/backtrack.spec.ts | |

## 6 Drafts (planned change)

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-53 | Under **Drafts**, open *Tell customers when a payment is held*. | A draft strip appears. The draft adds the **Held Payment Notifier** container, changes the **Payments Service** description, adds a line and proposes a decision. Author is "Demo". | tests/unit/drafts.test.ts, tests/browser/drafts.spec.ts | |
| MT-DRAFT-54 | Turn on **Changes** in the dock. | Added, changed and removed objects are coloured. The change list shows each field before and after. | tests/browser/drafts-ui.spec.ts | |
| MT-DRAFT-55 | In the strip switch between **Since it started** and **Against main now**. | The first shows only what the draft changes. The second also shows what main changed since (the row shows "main +N"). | tests/browser/drafts-ui.spec.ts, tests/unit/diff-merge.test.ts | |
| MT-DRAFT-56 | Click **+ New draft**. Title it *Open banking API* and add the description from the demo tour. | A new draft opens. The main model does not change. | tests/unit/drafts.test.ts | |
| MT-DRAFT-57 | In your draft add **Open Banking API** (Service / API), connect it to **API Application**, add **Third-party Provider** as an external system, change the **Session Cache** description, delete **E-mail Component** inside API Application. | Changes show with **Changes** on. The deleted component stays as a faded read-only ghost. | tests/browser/drafts-ui.spec.ts | |
| MT-DRAFT-58 | Switch to the main model. | None of those changes are there. | tests/unit/drafts.test.ts | |
| MT-DRAFT-59 | Open **Coding plan…** in the draft strip. Set a branch name. | A list of work: build, remove, change, connect, disconnect, flow, file. Paths and imports are checked. The plan can be copied as Markdown. | tests/browser/planned-code.spec.ts, tests/unit/planned-code.test.ts | |
| MT-DRAFT-60 | Run `dp plan <draft-id> --check` (draft id is the folder name under `architecture/drafts/`). | The plan in text. Exit code 1 while steps are open. | tests/unit/planned-code.test.ts | |
| MT-DRAFT-61 | Edit the main model, then **Apply** your draft. | One undoable step. Main changes from before are kept. If both changed the same object, Apply is refused and lists conflicts. | tests/unit/diff-merge.test.ts, tests/unit/drafts.test.ts | |
| MT-DRAFT-62 | Undo the apply (Ctrl/Cmd+Z). | The main model is as before the apply. | tests/unit/drafts.test.ts | |
| MT-DRAFT-63 | Make another draft and **Discard** it. Rename a draft and edit its description from the row menu. | Discard deletes it. Rename and description changes show in the list. | tests/unit/drafts.test.ts | |
| MT-DRAFT-64 | In a draft, open a mapped code file in the editor and save. | It saves under the draft's `code/`, not in your `sample_code/` folder. | tests/browser/planned-code.spec.ts | |

## 7 Decisions

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-65 | Press **Decisions** in the navigation bar. | A page over the diagram listing the demo's decision records, with filters. | tests/browser/decisions.spec.ts | |
| MT-DRAFT-66 | Open one record. | Its kind, status, alternatives, revisit triggers and the objects it concerns. | tests/unit/decisions.test.ts | |
| MT-DRAFT-67 | Write a new decision using the form. Try each kind (choice, conditional, deferred, time-boxed, policy, reversal). | The record is saved as `architecture/decisions/NNNN-slug.md`. | tests/unit/decisions.test.ts | |
| MT-DRAFT-68 | Start to edit a decision, then leave without saving. | The app asks before leaving. | tests/browser/decisions.spec.ts | |
| MT-DRAFT-69 | Accept a reversal decision that replaces another. | The replaced decision is marked superseded. | tests/unit/decisions.test.ts | |
| MT-DRAFT-70 | In the element panel of **Payments Service**, find the decisions section. | Decisions about the object are listed and open the record. | none found | |
| MT-DRAFT-71 | Check the "needs a look" count in the top bar, the filter and the list. | All three show the same count (proposed decisions included). | tests/browser/decisions.spec.ts | |

## 8 Comments and notes

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-72 | Right-click a box, choose **Comment…**, write a comment. Repeat with an idea and a question. | Three threads. Blue for comment, green for idea, amber for question, also on canvas pins. | tests/browser/comments.spec.ts | |
| MT-DRAFT-73 | Reply to a thread and resolve it. | The reply shows and the thread is resolved. | tests/unit/comments.test.ts | |
| MT-DRAFT-74 | Right-click empty canvas, **Add note here…**. Drag the note. Click it. | A note pin on the diagram that moves and opens its thread. | tests/browser/comment-notes.spec.ts | |
| MT-DRAFT-75 | Check `architecture/comments.json`. Undo after adding a comment. | Comments are stored there, not in `workspace.json`. They have no undo step. | tests/unit/comments.test.ts | |
| MT-DRAFT-76 | Open a draft and look for the comments from the main model. | Comments have no place in drafts. | none found | |

## 9 Shared catalog and hub

Use the demo hub: `dp init --hub --demo` in a new folder, then `dp serve --hub` (check the exact command in `demo/README.md` and `dp serve --help`).

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-77 | Serve the demo hub and open `#/home`. | A card per project with a landscape picture, what needs a look, what is watched and the latest decisions. The demo system is not started in a hub. | tests/browser/hub.spec.ts | |
| MT-DRAFT-78 | Open each project from its card. Use the house link to come back. | Each project opens its own model. | tests/browser/hub.spec.ts | |
| MT-DRAFT-79 | Open the **Shared catalog** page. | Shared elements, who uses each, who reads and writes each data table. | tests/unit/hub.test.ts | |
| MT-DRAFT-80 | In a project, add an element from the catalog (check the label). | A linked copy appears. Its name, description and technology come from the catalog. | tests/unit/hub.test.ts | |
| MT-DRAFT-81 | Change a catalog element's description. Open the project that uses it. | The copy follows the catalog at once. | tests/unit/hub.test.ts | |
| MT-DRAFT-82 | Add data (a table) to a catalog element and mark a relationship as reading or writing it. | The catalog page shows readers and writers; a table written by several projects shows on the home page. | tests/browser/hub.spec.ts | |
| MT-DRAFT-83 | As architect add a new project from the home page (blank). | A folder appears inside the hub. For a folder that already holds a model, the dialog asks before using it. | tests/browser/hub.spec.ts | |
| MT-DRAFT-84 | Open the **Credentials** page and add a credential. | The value is never shown again after saving. | tests/unit/credentials.test.ts | |
| MT-DRAFT-85 | Open **History** (`#/history`) and **Work** in the hub rail (`#/work`). | History lists commits with what each changed. Work lists items of every project with filters. | tests/unit/history-work.test.ts, tests/browser/hub.spec.ts | |

## 10 Code level and code mapping

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-86 | Open the **Payments Controller** code diagram. | Mapped files as boxes with the imports between them. Parts it talks to appear as faded boxes. | tests/unit/code-level.test.ts | |
| MT-DRAFT-87 | Double-click `controller.ts`. | The file opens in the browser editor. | tests/unit/code-level.test.ts | |
| MT-DRAFT-88 | Change a line in the file and save. Check the file in `sample_code/`. | The file on disk has the change; permissions and line endings are kept. | tests/unit/code-level.test.ts | |
| MT-DRAFT-89 | Try a path outside the code folder (for example through a link) (check how). | It is refused. | tests/unit/code-level.test.ts, tests/unit/security.test.ts | |
| MT-DRAFT-90 | Open a Python component (in API Application) code diagram. | Python imports are shown. | tests/unit/code-level.test.ts | |
| MT-DRAFT-91 | On a relationship set **Leaves from file** and **Arrives at file** (**Files at the ends**). | Set files are drawn solid, guessed ones dashed, unknown ones dotted. | tests/unit/code-level.test.ts | |
| MT-DRAFT-92 | Run `dp check` in the demo folder. | Exit code 0. Once a scan has stored `architecture/import/evidence.json` (MT-93 or MT-94), `dp check` also warns about code that no component maps (`src/core/cliReports.ts:59`); before a scan it does not. | tests/unit/cli-check-diff.test.ts | |

## 11 Code import

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-93 | Press **Import code**, then **Run scan**. | Facts found per level (C1 to C4), limits hit, unparsed files, what it cannot see, and a table of decided and left. It uses no network. | tests/unit/import-scan.test.ts, tests/browser/import.spec.ts | |
| MT-DRAFT-94 | Run `dp scan --plan` in the demo folder. | The same readiness table on the command line. `architecture/import/evidence.json` and `analysis.json` exist. | tests/unit/import-scan.test.ts | |
| MT-DRAFT-95 | Fill in **About this system** with a name and purpose. Leave a field empty or wrong. | A mistake is shown at its field. | tests/unit/import-api.test.ts | |
| MT-DRAFT-96 | Under **Paste an import file** press **Try the example**, then **Check**. | A check result. Errors name their field. | tests/unit/import-file.test.ts, tests/browser/import.spec.ts | |
| MT-DRAFT-97 | Press **Create draft**, then **Open the draft**. | A draft with a report: created, updated, kept as you had it, not in the import. The box is emptied so a second click cannot repeat it. | tests/unit/importer.test.ts | |
| MT-DRAFT-98 | Open **Review import** in the diagram's side panel. | Items are verified, partly verified or unverified. | tests/unit/import-review.test.ts | |
| MT-DRAFT-99 | Press **Accept all verified**. Reject one low-confidence item, accept another, write a note for BMO. | The decisions are kept per item. An unverified item says why. | tests/unit/import-review.test.ts, tests/browser/import.spec.ts | |
| MT-DRAFT-100 | **Apply** the draft. | Accepted items reach the main model; the rest stay in the draft (`kept`, `held`). Accept them later and apply again. | tests/unit/drafts.test.ts, tests/unit/import-review.test.ts | |
| MT-DRAFT-101 | Run `dp import demo/import-example.json --check` (path from a clone), then without `--check`. Also `dp import --schema`. | Check only creates nothing. Without `--check` a draft is made. `--schema` prints the JSON Schema. | tests/unit/cli-import.test.ts | |
| MT-DRAFT-102 | Import the same file again after editing a field in the draft. | The field you changed is kept and reported (`architecture/import/ledger.json`). | tests/unit/importer.test.ts | |
| MT-DRAFT-103 | Open **Use your own coding agent**. | A prompt and files under `architecture/import/handoff/`. dp calls no model. Paste a `result.json` back, or press **Read result.json**. | tests/browser/import.spec.ts (check) | |
| MT-DRAFT-104 | Run `dp scan --prompt --level c2`. | Handoff files for level C2 are written. | tests/unit/import-api.test.ts (check) | |

## 12 BMO

BMO is off by default. **No real provider call has ever been made.** The direct steps below need your own key and send data to that provider. Use handoff, or `--show-prompt` without `--yes-send`, if you do not want that. The automated tests use a fake backend only.

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-105 | Run `dp bmo status`. | Settings and whether a run is possible. No key is printed. | tests/unit/cli-bmo.test.ts | |
| MT-DRAFT-106 | Open **Credentials**, find the **BMO** section as architect. Choose *handoff*. Use **BMO → Explain this diagram**. | A sheet shows where it goes, files, bytes, hidden values, size estimate and the full prompt. Nothing is sent. | tests/browser/bmo.spec.ts, tests/unit/bmo-settings.test.ts | |
| MT-DRAFT-107 | Run the same task and look for the handoff files. | A prompt file is written to `architecture/import/handoff/` (check the exact place for this task); no model is called. | tests/unit/bmo-core.test.ts | |
| MT-DRAFT-108 | Turn BMO off and click a BMO button. | A short note says why it cannot run. | tests/browser/bmo.spec.ts | |
| MT-DRAFT-109 | Set the roles allowed to run BMO to architect only; sign in as viewer (see section 16). | The BMO buttons open a note that the role is not allowed. | tests/unit/bmo-settings.test.ts | |
| MT-DRAFT-110 | Run `dp bmo run explain --diagram landscape --show-prompt` (check the diagram key). | The prompt is shown and nothing is sent. Exit code 1 without `--yes-send`. | tests/unit/cli-bmo.test.ts | |
| MT-DRAFT-111 | Open **Ask BMO…**. Type `[` and pick an object. | A chat beside the diagram. Each message shows what will be sent and goes only when you confirm. | tests/unit/bmo-chat-text.test.ts, tests/browser/bmo.spec.ts | |
| MT-DRAFT-112 | In a draft use **BMO → Propose decision**, and **Summary for a pull request** in the apply dialog. | Both open a preview sheet first. | tests/browser/bmo.spec.ts | |
| MT-DRAFT-113 | **Own key only.** Set *direct* with a provider, a model and a stored credential. Press **Send to BMO** in a preview. | The answer arrives. The run is logged in `.dp/bmo/runs/`. A changed prompt is refused (hash must match). | none found (fake backend only) | |
| MT-DRAFT-114 | Judge the prompts BMO builds. Does any file contain secrets? | Secret values are masked ("values hidden" count). | tests/unit/bmo-redact.test.ts | |

## 13 Linked work

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-115 | Click **Work** in the toolbar. | A page listing every linked work item with its target. Filters by text, tool, type, status, severity, kind of target. | tests/browser/work.spec.ts | |
| MT-DRAFT-116 | Right-click a box and choose **Link work…**. Add an item with a title, link, status and severity. | The Work page opens with that target chosen. The box shows open items; the **Work** overlay colours it. | tests/unit/work-api.test.ts | |
| MT-DRAFT-117 | Pin an item to a relationship, a diagram, a flow and the project. | Each shows in the Work list with its target. Diagram and flow panels have a "Linked work" section. | tests/unit/work-api.test.ts | |
| MT-DRAFT-118 | Run `dp work add --to project --title "Test"` then `dp work list`. | The item is listed. | tests/unit/cli-work.test.ts | |
| MT-DRAFT-119 | Write a small SARIF file, run `dp work import FILE --format sarif --source scan-test` (the schema is in `dp work import --schema`). | Findings become work items on the element whose code paths hold the file, or on the project. A second identical run writes nothing. | tests/unit/work-import.test.ts | |
| MT-DRAFT-120 | Re-run with `--close-missing` after removing a finding from the file. | The missing item becomes done. | tests/unit/work-import.test.ts | |
| MT-DRAFT-121 | Click **Refresh status** on a GitHub item that points to a public issue (needs network). | The status of that issue is read on request. | tests/unit/work-tools.test.ts (fake servers only) | |
| MT-DRAFT-122 | On the Work page open **How it works**. Edit the severity mapping. | The mapping saves in the sidecar (`work.severity`); drafts include it. | tests/unit/work-settings.test.ts | |
| MT-DRAFT-123 | Run `dp integrations set mytool --tool jira --url https://example.invalid` then `dp integrations list`. | The connection is listed; remove it with `dp integrations remove mytool`. | tests/unit/integrations.test.ts | |

## 14 System Testing mode

**Hidden by default in 1.0.0 (DEC-104, [planned_features.md](planned_features.md) A8): not built yet; planned as [Wave 29](waves/wave-29-system-testing-switch.md) (DEC-107).** Today the mode is always on and these rows pass as written. Once A8 is built, start the demo with `dp serve --demo --testing --with-system` for sections 14, 20 and 21, and add rows that check the mode is absent without the flags: no **Test** button, no intercept listener, the testing and trace routes answer as if they did not exist, and `dp serve --demo` alone starts no service on ports 4200 to 4204.

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-124 | Click **Test** in the toolbar. | The mode turns on. A strip with a trace list shows above the canvas. Model editing is off. | tests/browser/testing-mode.spec.ts | |
| MT-DRAFT-125 | Pick the sample trace (`traces/sample.jsonl`). | The lines it used are marked as watched. The exchange-rate lookup shows as not in the model. | tests/unit/traces.test.ts, tests/unit/testing-decor.test.ts | |
| MT-DRAFT-126 | Open the **Payments Service** diagram. Select the line **Fraud Check Client → Fraud Detection System**, press **Open intercept point**. | A port on 127.0.0.1 is shown for that line. | tests/unit/testing-api.test.ts, tests/unit/intercept-proxy.test.ts | |
| MT-DRAFT-127 | Turn on **Breakpoint** for that line. On the demo page (port 4200) press **Pay**. | The call pauses on the line. A paused-call panel opens. | tests/unit/demo-testing.test.ts, tests/browser/testing-mode.spec.ts | |
| MT-DRAFT-128 | Change `amount` to `9000`, press **Continue** (or F8). | The page shows the payment held for review (202); the normal answer is accepted (201). | tests/unit/demo-testing.test.ts | |
| MT-DRAFT-129 | Pause another call and try **Step** (F10), drop, and answer by hand (check the labels). | Each does what its name says. | tests/unit/testing-core.test.ts | |
| MT-DRAFT-130 | Open the run log. | The newest calls (up to 200) are listed. A logged call can be sent again. | tests/unit/testing-api.test.ts | |
| MT-DRAFT-131 | Look at the line from Payment Orchestrator to the Mainframe. | It shows as not live (a message queue); only HTTP calls can be paused. | tests/unit/testing-decor.test.ts | |
| MT-DRAFT-132 | Set a breakpoint on a flow step and on a pipeline stage (check the labels). | The flow or pipeline follows the paused call. | tests/unit/testing-decor.test.ts | |
| MT-DRAFT-133 | Add a watch on a field (check the label). | The value shows in the watches list; secret field names are masked. | tests/unit/testing-core.test.ts | |
| MT-DRAFT-134 | Press **Test** off. Stop the demo; start it with a busy port 4200 (for example `nc -l 4200`). | dp says the port is in use and starts without the demo system; the rest works. | tests/unit/demo-system.test.ts | |
| MT-DRAFT-135 | Open a draft and turn on **Test**. | Testing is refused against a draft. Intercept points use the main model only. | tests/unit/testing-api.test.ts | |

## 15 Checklist

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-136 | Press **L**, or **Checklist** in the top bar. | A list opens beside the diagram. | tests/browser/checklist.spec.ts | |
| MT-DRAFT-137 | Add the starter list *Starting a project*, then *Importing a codebase*. | Items appear in sections. Items dp can check itself tick themselves for the version on screen. | tests/unit/checklist.test.ts | |
| MT-DRAFT-138 | Open a failing item. | It shows what fails, one object at a time. | tests/unit/checklist.test.ts | |
| MT-DRAFT-139 | Add your own item. Tick it, skip it, answer it, edit it in place, move it, delete it, **Clear** done items. | Each works. | tests/browser/checklist.spec.ts | |
| MT-DRAFT-140 | Right-click a box and choose **Add to checklist…**. | An item about that object. | tests/browser/checklist.spec.ts | |
| MT-DRAFT-141 | Check `architecture/checklist.json`. | The list is stored there, outside the model. | tests/unit/checklist.test.ts | |

## 16 Roles and sign-in

Start a fresh copy of the demo for this section.

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-142 | Run `dp users init`, then `dp serve`. | Passwords for architect, engineer and viewer are printed once. The app asks for a name and a password. | tests/unit/auth.test.ts | |
| MT-DRAFT-143 | Sign in as **architect**. Edit the main model, apply a draft. | Everything works. | tests/browser/roles.spec.ts | |
| MT-DRAFT-144 | Sign in as **engineer**. Try to edit the main model; make a draft of your own; open the "Demo" draft. | The main model cannot be changed; your draft can; the "Demo" draft is read-only. | tests/browser/roles.spec.ts | |
| MT-DRAFT-145 | Sign in as **viewer**. Try to change something; add a comment; open the checklist. | Nothing can be changed. A comment works. The checklist is read-only. | tests/browser/roles.spec.ts | |
| MT-DRAFT-146 | Enter a wrong password five times. | The name is locked for 30 seconds. | tests/unit/auth.test.ts | |
| MT-DRAFT-147 | Run `dp users add sam --role engineer`, `dp users role sam viewer`, `dp users passwd sam`, `dp users list`, `dp users remove sam`. | Each works. The last architect cannot be removed. | tests/unit/auth.test.ts | |
| MT-DRAFT-148 | Start `dp serve --read-only` on a fresh demo. | Nothing can be changed. Escape, fit and zoom still work. | tests/unit/security.test.ts | |
| MT-DRAFT-149 | In a hub run `dp users role NAME ROLE HUB --project ID` with `none`. | The project is hidden from that person. | tests/unit/hub.test.ts | |
| MT-DRAFT-150 | In a non-demo folder run `dp serve --host 0.0.0.0` without sign-in. | dp refuses to start: exit code 1 and a message (`exposureProblem`, `src/cli.ts:88`, DEC-063). It starts with `--read-only`, after `dp users init`, or with `--insecure`. | tests/unit/security.test.ts | |

## 17 History and git compare

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-151 | Make a few edits in the app. Under **Drafts → Git** pick a branch, press **Compare**. | The Changes colours show what changed since that commit. | tests/browser/git-compare.spec.ts, tests/unit/git-compare.test.ts | |
| MT-DRAFT-152 | Press **Open** for that version. | The old version shows read-only. | tests/unit/git-compare.test.ts | |
| MT-DRAFT-153 | Use **Other…** and type a tag or commit hash. Try a bad ref. | A good ref compares. A bad one shows an error and keeps the previous view. | tests/unit/git-compare.test.ts | |
| MT-DRAFT-154 | Open `#/history` (the **History** link in the left rail of the home pages, `ui/src/pages/Shell.tsx`; it is not in the canvas toolbar). | Commits with added, changed and removed objects, and a link to compare each. Not-yet-committed changes are listed. | tests/unit/history-work.test.ts | |

## 18 Command line

Run from the demo folder. Exit codes are in `README.md`.

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-155 | `dp --version` and `dp --help`. | The version from `package.json` (0.5.0, see "Which build" above) and the command list. | tests/unit/api.test.ts ("CLI version and init") | |
| MT-DRAFT-156 | `dp init` in an empty folder, then `dp init --name X`, then `dp init --demo`, then `dp init --hub`. | The model, a named model, the demo, and an empty hub are created, without starting a server. | tests/unit/from-scratch.test.ts, tests/unit/api.test.ts (init, `--empty`, `--name`, "Not overwriting") | |
| MT-DRAFT-157 | `dp check`, then edit `workspace.json` to break it (a relationship to a missing ID), run `dp check` again, then `dp check --strict`. | Exit 0, then 1 with the problem named. Warnings fail only with `--strict`. | tests/unit/cli-check-diff.test.ts | |
| MT-DRAFT-158 | `dp check` in a folder with no model. | Exit code 2. | tests/unit/cli-check-diff.test.ts | |
| MT-DRAFT-159 | `dp diff --base HEAD`, with `--format json`, `--out FILE`, `--exit-code`. | Markdown summary of changes (for a pull request); JSON; a file; a non-zero exit code when there are changes. | tests/unit/cli-check-diff.test.ts | |
| MT-DRAFT-160 | `dp plan <draft-id> --format md --out plan.md`. | The coding plan is written as Markdown. | tests/unit/planned-code.test.ts | |
| MT-DRAFT-161 | `dp scan --json`. | The scan result as JSON. | tests/unit/import-scan.test.ts | |
| MT-DRAFT-162 | `dp credentials add test-token --provider github < token.txt`, then `list`, `rotate`, `remove`. | Names and providers show; the value never does. | tests/unit/credentials.test.ts | |
| MT-DRAFT-163 | Set `DP_SECRET_KEY` and add a credential; look at `.dp/credentials.json`. | The stored value is encrypted (plain text without the key). | tests/unit/credentials.test.ts | |
| MT-DRAFT-164 | Look at `demo/ci-examples/` (three files: `github-actions.yml`, `gitlab-ci.yml`, `work-import.yml`) and run `npm run ci` from a clone (`.gitlab-ci.yml` at the root is this repository's own CI, not a sample; `npm run ci -- --quick` skips the browser tests and the package smoke test). | The same steps as CI run locally, including `npm pack` and an install of the packed tarball (`dp --version`, `dp init`, `dp validate`). | `scripts/ci-local.ts` (not in TESTS.csv) | |

## 19 Install checks that only the owner can run

From the owner's list of checks that only the owner can run (the private ideas list, section O). None has an automated test.

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-165 | On a clean machine run `npm install -g github:AbhishekR3/designPerspectives`, then `dp --version`. | The package builds and `dp` runs. (`npm run ci` already tests the *packed tarball*; this step tests the GitHub-URL route, where the `prepare` script builds `dist/` on your machine.) | none found | |
| MT-DRAFT-166 | Run the demo on Windows (`dp serve --demo`, open a project, edit a file). | The browser opens and paths work. | none found | |
| MT-DRAFT-167 | Open the files `dp` writes in Structurizr's own tools (including `dp.*` properties and `dp.level`). Follow the ten steps and the pass/fail table in [section 30](#30-structurizr-check-the-steps-behind-mt-draft-167) (what it is for, what to look for, what to report back). | They load; counts, relationships and views match; the layout is sane (positions are stored at 2x); unknown properties are kept; a round trip on a copy changes only positions. | tests/unit/workspace-io.test.ts (format only) | |
| MT-DRAFT-168 | Run the sample CI jobs in `demo/ci-examples/` (`github-actions.yml`, `gitlab-ci.yml`, `work-import.yml`) in a real repository; note that `gh pr comment --edit-last` and its fallback are untested. | `dp check` and `dp diff` run on a pull request. | none found | |
| MT-DRAFT-169 | Try BMO with a real model on a real repository, handoff and direct; judge the prompts. | Prompts are sensible; nothing unexpected is sent. | none found | |
| MT-DRAFT-170 | Read the interview's standing questions and the starter reference entries, if those waves are built. | Not in the app yet (planned waves 15 and 3). | none found | |


## 20 Security and request protection

Added 2026-11-20. Most rows use `curl` against a running `dp serve` (default `http://127.0.0.1:8765`). The facts come from DEC-030, DEC-031, DEC-032, DEC-056, DEC-063, DEC-075, DEC-085 and `docs/CONTRIBUTING.md` (the security model). These checks are automated in `tests/unit/security.test.ts` and `tests/unit/auth.test.ts`; a manual run proves the real server, not the test harness.

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-171 | Wrong Host header: `curl -i -H 'Host: evil.example' http://127.0.0.1:8765/api/state`. | `403` with "This server only answers requests addressed to localhost." The same request with the normal host answers `200`. | tests/unit/security.test.ts | |
| MT-DRAFT-172 | Cross-origin write: `curl -i -X POST -H 'Content-Type: application/json' -H 'Origin: http://evil.example' -d '{}' http://127.0.0.1:8765/api/undo`. Then again with `-H 'Sec-Fetch-Site: cross-site'` instead of Origin. | Both `403` ("Cross-origin requests are not allowed." and "Cross-site requests are not allowed."). Nothing changes in the model. | tests/unit/security.test.ts | |
| MT-DRAFT-173 | Wrong content type: `curl -i -X POST -H 'Content-Type: text/plain' -d '{}' http://127.0.0.1:8765/api/undo`. | `415` ("The request body must be JSON"). | tests/unit/security.test.ts | |
| MT-DRAFT-174 | Large body: `head -c 6000000 /dev/zero \| curl -i -X POST -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:8765/api/undo`. | `413` ("over 5 MB"). | tests/unit/security.test.ts | |
| MT-DRAFT-175 | Start with `dp serve --allow-host dp.test --no-open`, then `curl -i -H 'Host: dp.test:8765' http://127.0.0.1:8765/api/state` and the same with `Host: other.test`. | The allowed name answers `200`; the other is `403`. Needs a proxy or tunnel in real use; this only checks the rule. | tests/unit/security.test.ts | |
| MT-DRAFT-176 | Bind to another interface: `dp serve --host 0.0.0.0` with no users file; then with `--read-only`; then after `dp users init`; then with `--insecure`. | The first exits with 1 and a message. The other three start; `--insecure` should say that anyone who can reach the server can change everything (check the wording). | tests/unit/security.test.ts | |
| MT-DRAFT-177 | Hidden path: `curl -i 'http://127.0.0.1:8765/api/code/file?path=.git/config'` and `...?path=.env`. | Refused for both (DEC-031: names starting with a dot are never read). Try `...?path=../README.md` as well: refused (outside the code folder). | tests/unit/security.test.ts, tests/unit/code-level.test.ts | |
| MT-DRAFT-178 | Symlink out of the code folder: in `sample_code/` run `ln -s /etc/hosts link.txt`, then read `...?path=link.txt`. Also a symlink to a dot folder. | Refused (symlinks are resolved and checked). Remove the link afterwards. | tests/unit/security.test.ts | |
| MT-DRAFT-179 | Map a component to `.github/workflows` in its code paths (panel, "Code" section). | Refused when entered (DEC-063). A path a model already has still loads and `dp check` warns. | tests/unit/security.test.ts | |
| MT-DRAFT-180 | Credentials at rest: add a credential (page or `dp credentials add`), then `ls -l .dp .dp/credentials.json`, `cat .gitignore`, and `curl http://127.0.0.1:8765/api/credentials`. | Folder mode `drwx------`, file mode `-rw-------`; `.dp/` is listed in `.gitignore`; the API answer holds names, providers, dates and a masked hint, never the value. | tests/unit/credentials.test.ts | |
| MT-DRAFT-181 | Wrong key: start with `DP_SECRET_KEY=one`, add a credential, stop, start with `DP_SECRET_KEY=two`. | The credential shows as "locked" and is never sent. Without any key the file holds the value in plain text (the page says so). | tests/unit/credentials.test.ts | |
| MT-DRAFT-182 | Tool connection rules: `dp integrations set t1 --tool jira --url http://example.com`, then `--url https://user:pass@example.com`, then `--url https://169.254.169.254`. | Each is refused with a reason (https only, no user or password in the address, no link-local or metadata address; CONTRIBUTING.md "Linked work status"). Check the exact wording. | tests/unit/integrations.test.ts | |
| MT-DRAFT-183 | System Testing target rules (needs MT-124 first): give an element `Address it runs at` = `http://example.com:80`, then try **Open intercept point**. Repeat after restarting with `--allow-target-host example.com`. Then try `http://169.254.169.254`. | The first is refused (not this machine). With the flag it opens. The link-local address is refused always. A draft's address is never used (see MT-135). | tests/unit/testing-core.test.ts | |
| MT-DRAFT-184 | Redaction by shape and its limit: put `API_KEY=abcdef1234567890` and the sentence `the admin password is hunter2` in a file under `sample_code/` that a component maps; open **BMO → Explain** on that component and read the preview. | The `API_KEY` value is masked and counted under "values hidden". The plain word `hunter2` is **not** masked (known limit, DEC-064); decide whether that is acceptable. | tests/unit/bmo-redact.test.ts, tests/unit/redact-gaps.test.ts | |
| MT-DRAFT-185 | Hostile handoff result: write a `result.json` with an unknown key, then one with a field of the wrong type, then one that holds a secret-looking value; press **Read result.json** each time. | Each is refused with the field named. Nothing reaches the model. | tests/unit/import-file.test.ts, tests/unit/import-security.test.ts | |

## 21 Concurrency and sessions

Added 2026-11-20. dp has no live push (DEC-039): another tab, the CLI or a git checkout shows up when the window regains focus. Last write wins (DEC-041).

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-186 | Open the demo in two tabs. Rename a box in tab A. Click into tab B. | Tab B reloads and shows the new name without a manual refresh. | tests/browser/model-sync.spec.ts (hand edit of a file only) | |
| MT-DRAFT-187 | Edit the **same** description in both tabs (A first, then B, without clicking into A in between). | Last write wins; no error. Write down what tab A shows after you focus it. | none | |
| MT-DRAFT-188 | While serving, run `dp work add --to project --title "From CLI"` in another terminal. Focus the browser, open **Work**. | The new item is listed. | none | |
| MT-DRAFT-189 | Undo is per model version, not per person: edit box X in tab A, edit box Y in tab B, press Ctrl/Cmd+Z in tab A. | Y's edit is undone (the newest edit on that model), not X's (reviews.md, Stage P4). | none | |
| MT-DRAFT-190 | With sign-in (section 16), two engineers: engineer 1 starts a draft; engineer 2 tries to change it. | Engineer 2 can read it but not change or discard it (DEC-063); architects can. | tests/browser/roles.spec.ts | |
| MT-DRAFT-191 | System Testing in two browsers: pause a call (MT-127); release it from the second browser. | One session per project; the first release wins (DEC-075). The other browser shows the call as released. | none | |
| MT-DRAFT-192 | Restart `dp serve` while signed in. | The browser asks for the name and password again (sessions live in memory). Also run two `dp users` commands at once and check the users file is still valid (DEC-041 says do not). Skip the second part if you are unsure. | tests/unit/auth.test.ts | |

## 22 Failure modes

Added 2026-11-20. What happens when something breaks. Take backups first: several rows damage files in the demo folder.

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-193 | In the sample draft, plan a code edit, tick "Also write the planned code edits" in the Apply dialog, apply. | The model and the code files change together; undo restores the model only, not the code files or the draft (planned-change.md, limits). | tests/unit/planned-code.test.ts | |
| MT-DRAFT-194 | Repeat MT-193 after `chmod 444` on the code file the draft edits. | Apply fails, the model is unchanged, the draft is still there and files are restored (DEC-032; restore is best effort: write down what you see). | tests/unit/planned-code.test.ts | |
| MT-DRAFT-195 | Break a draft: delete `architecture/drafts/<id>/base/` (or make its `workspace.json` invalid JSON). Reload. | An error names the draft; the main model still opens; the other drafts still list. | none | |
| MT-DRAFT-196 | Import a draft (MT-97), then delete its file under `architecture/import/reviews/`. Try **Apply**. | Apply is refused; "Check again" rebuilds the review with every item pending (DEC-064, fail closed). | tests/unit/import-review.test.ts | |
| MT-DRAFT-197 | Damage a decision file: delete the closing quote of a front-matter value in `architecture/decisions/*.md`. Reload. | A model error names the file; dp never rewrites it; other decisions still work (DEC-050). Restore the file. | tests/unit/decisions.test.ts | |
| MT-DRAFT-198 | In a hub, make `hub.json` invalid JSON; then give two projects the same folder; then point one inside another. | A clear error each time; the hub does not start with a half-read file. | tests/unit/hub.test.ts | |
| MT-DRAFT-199 | Start `dp serve` twice on port 8765. | The second says the port is in use and exits. | none | |
| MT-DRAFT-200 | Block one demo port (`nc -l 4202`), then `dp serve --demo` in a new folder. | dp names the busy port and runs without that service or the whole demo system (MT-134 covers 4200; check which here). | tests/unit/demo-system.test.ts | |
| MT-DRAFT-201 | Hide git: start dp with a PATH that has `node` but no `git` (for example `env PATH="$(dirname "$(command -v node)")" ...`; check that this works on your machine). | The Git compare row and History are hidden or empty; nothing crashes (reviews.md, Stage C). | tests/unit/git-compare.test.ts (9 tests skip without git) | |
| MT-DRAFT-202 | Turn the network off. Press **Refresh status** on a GitHub link. | The link is listed as unreadable with a reason; no token is shown; no status changes. *needs account* for a private repository. | tests/unit/work-tools.test.ts (fake servers) | |
| MT-DRAFT-203 | BMO direct with a wrong key, then an unreachable Ollama endpoint (`--endpoint http://127.0.0.1:9`). *needs own key* | A short error each time. The prompt shown matched the hash. Nothing is retried more than once. | tests/unit/bmo-direct.test.ts (fake) | |
| MT-DRAFT-204 | In `workspace.json` of a copy, delete a view the diagram list shows, then open its address (`#/d/<key>`). | The landscape opens with a notice, and Back does not loop (DEC-078). A server error shows an error instead. | tests/browser/canvas-fixes.spec.ts | |
| MT-DRAFT-205 | Try to trigger the error screen (`ErrorBoundary.tsx`): for example edit `workspace.json` so an element has an unknown `dp.archType` or huge `dp.example`. | If a page crashes it shows the error screen and a way back, not a blank page. If you cannot trigger it, mark Skip. | none | |

## 23 Scale and performance

Added 2026-11-20. Nothing in the repository measures how dp behaves on a large model or a large codebase. These rows produce numbers; there are no "expected" values yet. Use a copy and generate input with a throwaway script in your scratch folder (do not commit it; the repository allows TypeScript only).

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-206 | Build a model with about 150 containers, 500 components and 600 relationships (a script that writes `workspace.json`). Open the landscape, a containers diagram, press **Auto-layout**, then run `dp check`. | Write down: time to open, time of Auto-layout, time of `dp check`, whether dragging stays smooth. (DEC-063 measured only a BMO prompt on such a model.) | none | |
| MT-DRAFT-207 | In a repository with 500 or more commits touching `architecture/`, open `#/history`. | The first page loads (20 commits by default, 100 at most; DEC-058). Write down the time; each commit is a model diff. | none | |
| MT-DRAFT-208 | A hub with 10 projects: open `#/home` cold, then again. | Write down the first and second load times (`dp check` runs per project on the first load, DEC-053); drafts and errors are counted. | none | |
| MT-DRAFT-209 | `dp scan` on a real repository with more than 5,000 source files in several languages (any open source repository you have). | "Limits hit" and "unparsed" are listed; the scan finishes; write down the time and the number of C1, C2 and C3 candidates (the demo finds no C3 candidates). | none | |
| MT-DRAFT-210 | In that repository add `.env`, `secrets.yaml`, a `*.pem` file and a symlink to a folder outside it, then run **BMO → import level** preview. | None of those is read; hidden values are counted; the preview lists the files it would send. | tests/unit/import-security.test.ts | |

## 24 Accessibility and input

Added 2026-11-20. **No accessibility audit has ever been run** (reviews.md, Stage P5). `aria-label` appears in 44 UI files, but no test checks names, roles or focus order beyond the search dialog. Record what fails; do not fix during the test.

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-211 | Keyboard only (no mouse). Reach the top bar, open **Diagrams**, select a box, rename with F2, move with arrow keys, delete, undo, open the checklist with L. | Every step can be done. Write down every place focus is lost or invisible. | tests/browser/interactions.spec.ts (some keys) | |
| MT-DRAFT-212 | Open each dialog in turn (New draft, Apply, Move to…, a Settings dialog, Add credential). Press Tab repeatedly, then Escape. | Tab stays inside, Escape closes and gives focus back (DEC-033). Only the search dialog is tested for this. | tests/browser/overlays.spec.ts (search only) | |
| MT-DRAFT-213 | In **Move to…** press the arrow keys in the list. | Known: rows have `role="option"` but arrow keys do not move (`planned_features.md` B6). Confirm it still does not. | none | |
| MT-DRAFT-214 | Turn on VoiceOver (macOS). Move through the diagram, the right panel and the toolbar. | Boxes, lines and buttons are announced with useful names. Write down the ones that are not. | none | |
| MT-DRAFT-215 | Browser dev tools → "Emulate vision deficiencies" (blurred, no colour). Look at the Tier overlay and the **Colour** legend. | Overlay boxes carry a text badge, and line kinds that are easy to confuse have a pattern; check that values are still told apart. | none | |
| MT-DRAFT-216 | Resize the window to 1280, 1100, 1024, 800 and 760 px wide. | Bars wrap instead of scrolling, the draft strip keeps Apply, Discard and Back to main visible, the right panel folds under 1100 px (DEC-042). Under 760 px dp is not supported: note what happens. | tests/browser/layout.spec.ts (viewport loops) | |
| MT-DRAFT-217 | Zoom the browser to 150% and 200%. | The canvas stays usable; dialogs fit. Write down what overflows. | none | |
| MT-DRAFT-218 | On a touch device (if you have one): add a box from the palette, drag a line, open a menu. | The palette needs a tap rather than a drag (reviews.md, release 0.2.0). Skip if you have no touch device. | none | |

## 25 Browsers, platforms and packaging

Added 2026-11-20. Automated browser tests run Chromium only, on Linux or macOS, at about 1500×950.

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-219 | Firefox: run sections 1 to 3 (start-up, modelling, lines). | Everything works. Label positions may differ a little: label sizes are an estimate and fonts differ (DEC-052). Write down overlapping labels. | none (Chromium only) | |
| MT-DRAFT-220 | Safari: the same rows as MT-219. *needs a Mac* | Same as MT-219. | none | |
| MT-DRAFT-221 | Windows (more than MT-166): map a component to `src\app` (backslashes), save a decision file, edit it in an editor that writes CRLF, run `dp scan` and read paths in the result. *needs Windows* | Paths work; results use forward slashes; a CRLF decision file loads and is not rewritten until edited; the browser opens. | none | |
| MT-DRAFT-222 | Run `npm run ci` once on Node 20 and once on Node 22 (for example with `nvm use`). | Both pass (CI runs both; the pipeline has not run yet: see the gap register). | scripts/ci-local.ts | |
| MT-DRAFT-223 | `npm pack --dry-run` in a clone. | The file list holds `dist/`, `static/assets/app.js`, `app.css`, `diagram-layout.js`, `demo/`, `README.md`, `LICENSE` (`package.json` `files`), and no `docs/`, `tests/`, `local/` or `.claude/`. | scripts/ci-local.ts (install only) | |
| MT-DRAFT-224 | `npm pack`, then install the tarball into a clean prefix (`npm install -g --prefix /tmp/dpx ./designperspectives-*.tgz`), run `dp --version`, `dp init`, `dp check`, `dp import --schema`. | All work; the schema prints (it ships in the package). | scripts/ci-local.ts | |
| MT-DRAFT-225 | Run `dp --version` with Node 18. | A clear refusal naming the Node version needed (`engines`: 20.11 or later); check the wording. | none | |
| MT-DRAFT-226 | `npm link` from a clone (README), then `dp --version` in another folder. | `dp` runs from anywhere. | none | |
| MT-DRAFT-227 | Change a UI file, run `npm run build` in `ui/`, reload the page normally (no hard refresh). | The new UI loads (assets are `no-cache` with an ETag, DEC-066). Check `git status`: `static/` is the only change. | tests/unit/api.test.ts (cache headers) | |
| MT-DRAFT-228 | Download a diagram as SVG and as PNG (see MT-24). Open the SVG in a browser and a vector editor; open the PNG. | Dark background (DEC-013), all boxes, lines and labels present, placed notes **not** included (DEC-070), the PNG is sharp at 100%. Write down anything missing. | none | |

## 26 Commands, flags and features with no step so far

Added 2026-11-20. Each row is a flag or feature found in the code or the docs with no manual step and often no test.

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-229 | `dp serve --traces ./my-traces --no-open` with a copy of `demo/traces/sample.jsonl` inside `my-traces`. Open **Test** mode. | The trace list shows that file. Without the flag the list reads `<project>/traces`. | tests/unit/traces.test.ts | |
| MT-DRAFT-230 | `dp serve --code-root ../other-code` with the sample code moved there. | Code diagrams and the editor read from that folder; a path outside it is refused. | tests/unit/code-level.test.ts (default root only) | |
| MT-DRAFT-231 | `dp serve --users ./elsewhere/users.json` (a file you made with `dp users init --file ...`), then with a path that does not exist. | Sign-in uses the given file. For a missing file write down what happens (stops, or starts without sign-in). If it starts without sign-in, that is worth a decision. | tests/unit/auth.test.ts | |
| MT-DRAFT-232 | `dp bmo set --enabled --backend handoff`, then `--model X`, `--endpoint http://127.0.0.1:11434`, `--clear-endpoint`, `--roles architect`, `--budget 20000`, `--credential name`; `dp bmo status --json` after each. | Status shows each change; no key is printed; a cloud provider with `--endpoint` needs `--allow-custom-endpoint`. | tests/unit/cli-bmo.test.ts | |
| MT-DRAFT-233 | `dp bmo run` for each other task with `--show-prompt` and no `--yes-send`: `describe-to-model --text-file d.txt`, `challenge --diagram landscape`, `draft-summary --draft ID`, `decision-from-draft --draft ID`, `import-level --level c2`. | Each prints its prompt, sends nothing and exits with 1. | tests/unit/cli-bmo.test.ts | |
| MT-DRAFT-234 | `dp work add --to project --title T --type security --severity high --status blocked --key K1 --source test --url https://example.com/1 --note n`, then the same command with a new `--title`; then with `--check`; then with `--draft ID`. | The first adds, the second updates the item with key `test:K1`, `--check` writes nothing, `--draft` writes into the draft only. | tests/unit/cli-work.test.ts | |
| MT-DRAFT-235 | `dp work import FILE --format X --check` for a GitLab Code Quality JSON, a SonarQube issues JSON and a dp JSON file (`dp work import --schema` prints the last). *needs real report files* for confidence | Each is read; findings map to elements by code path; `--check` writes nothing. | tests/unit/work-import.test.ts (hand-made files) | |
| MT-DRAFT-236 | `dp check --hub` in the demo hub folder. | Every project and the shared catalog are checked; the exit code reflects errors. | tests/unit/hub.test.ts | |
| MT-DRAFT-237 | `dp scan --prompt --level c3 --container <container-id>` (an ID from the demo). | Handoff files for that container's components are written to `architecture/import/handoff/`. | tests/unit/import-api.test.ts | |
| MT-DRAFT-238 | `dp import demo/import-example.json --title "My import"`. | The draft's title is "My import". | tests/unit/cli-import.test.ts | |
| MT-DRAFT-239 | `printf 'pw-1234567890\n' \| dp users add sam --role viewer --password-stdin`, then sign in as sam; also `dp users init --file ./u.json`. | The password you gave works; the file is created where named. | tests/unit/auth.test.ts | |
| MT-DRAFT-240 | `dp credentials rotate test-token < new.txt` after adding `test-token`. | The value is replaced; the hint changes; the name stays. There is no automated test for `rotate`, so this is the only check. | none | |
| MT-DRAFT-241 | The notification bell in three states: a fresh demo; after breaking a decision file (MT-197); with a draft that is behind main. Also cause an error toast, then open the bell. | "Now" lists load errors, drafts behind main and the decisions that need a look; "Earlier in this tab" lists the errors shown, newest first, up to 50, with an unseen count; Escape closes it. | none | |
| MT-DRAFT-242 | Decision renumbering: create decision `0008` on main and another `0008` in a draft; apply the draft. | The draft's decision is renumbered to the next free number and its links follow (DEC-050). | tests/unit/decisions.test.ts | |
| MT-DRAFT-243 | In a decision's Context section type a line starting with `## `. Save and reopen. | It is saved as `###` so it is not read as a new section (DEC-050). | tests/unit/decisions.test.ts | |
| MT-DRAFT-244 | Checklist: add *Starting a project*; try to tick an item that has a rule; skip it; then import `demo/import-example.json` and look for "Questions from BMO". | A rule item cannot be ticked by hand, only skipped. Questions from an import appear under "Questions from BMO" and in the bell. The **Selection** filter shows only items about the selection. | tests/unit/checklist.test.ts | |
| MT-DRAFT-245 | Delete the lens you are using, and a lens that has a saved choice. | Check what happens (reviews and the changelog say a deleted lens that is in use is kept). Write down the behaviour. | none | |
| MT-DRAFT-246 | A relationship used by two steps of one flow: set a breakpoint on one step in Test mode. | It stops on both steps (DEC-075, known limit). | tests/unit/testing-decor.test.ts | |
| MT-DRAFT-247 | Open a flow that visits one element in two steps; open the step info of the first and of the second. | The "before" and "after" links go to the nearest earlier or later step at the same element (DEC-099, Q-C3). Note any wrong jump. | tests/unit/flow-step-info.test.ts | |
| MT-DRAFT-248 | Traces: put two trace files in the folder, cut the last line of one in half, add a span with `dp.otel.service` on an element. | The cut line is skipped, both files are read, the span is matched by the service name. | tests/unit/traces.test.ts | |
| MT-DRAFT-249 | Place a note (MT-74), then move the box under it. | The note stays where it was (DEC-070, known limit) and can now point at the wrong place. | tests/browser/comment-notes.spec.ts | |
| MT-DRAFT-250 | Shape a line by hand (MT-26), then run Auto-layout, then **Make room** twice in a row. | The hand-shaped line is not routed around boxes (known limit, DEC-071); the second **Make room** may still find a little to do (DEC-061). | tests/unit/line-editing.test.ts | |
| MT-DRAFT-251 | Right-click a person and a software system. | **Move to…** is not offered (people and systems are top level, DEC-037). | tests/unit/ops.test.ts | |
| MT-DRAFT-252 | Add a box, rename it (its ID changes), reload, rename it again. | The first rename changes the ID; after the reload the ID stays (DEC-035: the fresh mark lives only in the open page). | tests/unit/ops.test.ts | |

## 27 Not built yet: do not test

Listed so nobody adds rows for features that do not exist. Sources: `docs/planned_features.md`, `docs/waves/README.md`, `docs/product-vision.md`.

- Live connections to Codacy, SonarQube and Jira beyond the on-request status refresh (A1); BMO on by default (A2); removing a project from a hub (A3); an LLM subscription copy-and-paste flow (A4); managing users and roles from the UI (A5).
- Sticky notes, the Notes page, `dp context` and BMO without an LLM (Wave 2); grounded BMO answers, fixed prompt templates and citations (Wave 1); the reference library and ADR links (Wave 3); attachments (Wave 16); conditions on lines and variants (Wave 4).
- Code search, key code and the one generic regex reader (Wave 5); the guided import interview (Wave 15); findings and acknowledgements (Wave 6); metrics (Wave 7); rules and presets (Wave 8); the characteristics table (Wave 9); BMO reviews (Wave 11); contracts (Wave 13); local runtimes and the word index (Wave 14); `dp commit` and the Commit button (Wave 17); rebase and a merge editor (Wave 18); DevOps, Security and Business lenses as built-ins (Wave 19); the system conversation (Wave 20).
- Wave 14a and 14b (local runtimes with the typed context window; the word index); the small batch (Wave 27, now in 0.8.0); the guard rails, the accessibility audit and the stable-surface statement (Wave 28); hiding System Testing, traces and the demo system by default (Wave 29, 0.7.0). Risk storming and runtime telemetry are parked ideas, not waves.
- Deployment diagrams, groups, saved test cases and `dp test`, risk storming, runtime telemetry, drift detection.
- The static export (Wave 21, in 1.0.0 by DEC-100); hosted accounts (A6, after 1.0.0); always-encrypted credentials (A7, DEC-101: until it is built, MT-DRAFT-163 and MT-DRAFT-181 test the optional key).
- Hiding System Testing, traces and the demo system by default, with the `--testing` and `--with-system` switches (A8, DEC-104). Until it is built, the mode is on and sections 14, 20 and 21 apply as written.
- MT-DRAFT-170 already says that waves 15 and 3 are not built.

## 28 Gap register: everything not confirmed, including borderline items

Added 2026-11-20 from a read of the plan, the docs, `tests/TESTS.csv` and the code. One row per gap. **Fence** = "on the fence": I was not sure it belongs in a manual test, so the choice is yours. **Your decision**: type *Test* (add it to your run), *Skip* (accept the risk), or *Later* (before 1.0.0). A row with a "Suggested check" that names an `MT-DRAFT` number is already written; the others have no step yet. The unverified facts (U-numbers, section 29) are the same facts seen as claims to verify.

### A. Real services that were never run

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-01 | BMO providers | No call to the Claude API, the OpenAI API or Ollama has ever been made; tests use a fake backend | reviews.md 0.5.0 limits; MT-113, MT-169; section 29 U1 | | One run per provider, *needs own key*; MT-113, MT-203 | |
| G-02 | BMO model ids | The default model ids `claude-opus-5-5` and `gpt-6-astra` have no source note | `src/assistant/settings.ts:45-46`; section 29 U2 | | Compare with each provider's model list before MT-113 | |
| G-03 | BMO request shapes | `store: false` (OpenAI) and `done_reason: "length"` at `num_predict` (Ollama) are marked "Not verified" in code | `src/assistant/providerBackend.ts:436,478` | | Part of MT-113 | |
| G-04 | BMO limits | The hash refusal, a cut-off answer and the Ollama non-loopback rule were never tried against a real server; `--allow-custom-endpoint` has no step | reviews.md 0.5.0 | Fence | MT-203, MT-232 | |
| G-05 | Status refresh | GitHub, GitLab, SonarQube and Jira were tested against fake servers only; MT-121 covers one public GitHub issue | `work-tools.test.ts`; section 29 U4 | | MT-121 plus one real link per other tool, *needs account* | |
| G-06 | Status refresh auth | SonarQube 10 or later needs a bearer token (older servers use `basic`); Jira Cloud needs email and token; GitHub Enterprise; private repository with a credential | reviews.md linked work; DEC-085 | | Per tool, *needs account* | |
| G-07 | Status refresh limits | At most 200 links, 4 at a time, 10 s each, no redirects, answers over 1 MB refused | CONTRIBUTING.md "Linked work status" | Fence | A work item list of 250 links to one host | |
| G-08 | Import formats | The SARIF example is hand-made; GitLab Code Quality, SonarQube issues and dp JSON have no step with a real report | manual-test-plan (old line 334); section 29 U5 | | MT-119, MT-235 with real reports | |
| G-09 | CI samples | `github-actions.yml`, `gitlab-ci.yml` and `work-import.yml` in `demo/ci-examples/` were never run; `gh pr comment --edit-last` is [Training] | file headers; section 29 U6 | | MT-168 | |
| G-10 | This repository's CI | `.gitlab-ci.yml` says "NOT RUN YET"; free-runner terms and identity verification unchecked | `.gitlab-ci.yml:4`; DEC-089; section 29 U7 | | Push once to a GitLab project; MT-164, MT-222 | |
| G-11 | Structurizr | The `dp.*` properties, `dp.level` and positions stored ×2 were never opened in Structurizr's own tools | reviews.md (five places); MT-167; section 30 | | MT-167 (name the tool and command you use) | |
| G-12 | Trace files | The reader only saw files in its documented format, never a real Collector file; Jaeger and Zipkin formats are not read | reviews.md traces; DEC-046; section 29 U8 | | MT-125, MT-248 with a real OTLP file | |
| G-13 | System Testing limits | HTTPS, HTTP/2, gRPC, WebSocket, event streams, bodies over 1 MB, compressed bodies, a caller in a container and a hold past the caller's timeout pass through or fail; no step covers any | DEC-075 trade-offs; section 29 U9 | Fence | A service of your own; MT-127 holds only briefly | |

### B. Thresholds and numbers that are guesses

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-14 | Import thresholds | 300 files, 5 containers, 2 passes, 20 seconds per item, tokens ≈ bytes ÷ 4 | `import-design.md`; DEC-051; section 29 U10 | | MT-209 on real repositories; compare effort | |
| G-15 | Run size limit | The 32,000-token room was measured only on the demo (3,000 to 10,000 tokens) and a synthetic model | DEC-065; section 29 U11 | | MT-206 then a preview | |
| G-16 | Component scan | `MAX_FILES` = 60 per component for import edges is untested by hand | `src/core/codeMap.ts`; U12 | Fence | A repository with a big component | |
| G-17 | Demo scan result | The demo scan finds 4 C1 and 5 C2 candidates and **no C3 candidates**; MT-93 states no expected numbers | reviews.md 0.5.0; U13 | | Write the numbers you see into MT-93 | |
| G-18 | Chat size | The 24,000-token code cap is dropped (DEC-099); the preview should show the approximate size before sending. Not built yet; the estimate is tokens ≈ bytes ÷ 4 | DEC-073, DEC-099; DEC-099 (Q-C1, Q-C1b) | | MT-111 on a large component: read the estimate, then compare with the provider's reported tokens | |

### C. Platform differences

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-19 | Windows | Never run: paths, line endings (MT-88 says they are kept), browser opening, `nc -l` in MT-134 (a Unix tool) | reviews.md 0.3.0; DEC-095; U15 | | MT-166, MT-221 | |
| G-20 | Node and OS | Node 20 and Linux only through CI that has not run; macOS only locally | reviews.md Stage P6; U16 | | MT-222 | |
| G-21 | Function keys | F8, F9, F10 may be taken by the browser or macOS (they need Fn on a Mac) | MT-127, MT-128; old line 339 | Fence | MT-127 with and without Fn | |
| G-22 | Case-insensitive disks | `TESTS.csv` has a skip rule for case-insensitive disks; no step uses one | `tests/TESTS.csv` | Fence | Same names in two cases in a code folder on macOS | |

### D. Concurrency and sessions

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-23 | Two tabs or CLI plus UI | Last write wins; MT-07 checks only a hand edit then focus | reviews.md Stage P4; DEC-041 | | MT-186 to MT-188 | |
| G-24 | Undo | Undo is per model version, not per person | reviews.md Stage P4 | Fence | MT-189 | |
| G-25 | Drafts | Two engineers cannot share one draft; drafts with no author become architect-only after sign-in | DEC-063; MT-144 covers one engineer | | MT-190 | |
| G-26 | System Testing session | One session per project, first release wins | DEC-075 | Fence | MT-191 | |
| G-27 | Hub | A project added elsewhere shows on the rail after focus; the "0 projects" screenshot was never explained | reviews.md interaction fixes; U22 | | Add a project from the CLI while the hub runs | |
| G-28 | Sessions and users file | Sessions are lost on restart; passwords travel in clear text over plain HTTP; `dp users` commands must not run in parallel | DEC-041; reviews.md Stage P4 | Fence | MT-192 | |

### E. Scale

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-29 | Large model | No step or test measures a model with 100 or more containers; layout, `dp check`, checklist rules (`GET /api/checklist` runs all rules on every change and on focus) | reviews.md checklist; U24 | | MT-206 | |
| G-30 | Long history | History runs one model diff per commit (20 by default, 100 at most) | DEC-058 | Fence | MT-207 | |
| G-31 | Big hub | Every loaded project stays in memory; `dp check` runs per project on the first home load | DEC-053, DEC-054 | Fence | MT-208 | |
| G-32 | Real repositories | The scan was only run on the demo's sample code; symlinks, binary files, deny-listed names, monorepos, mixed languages; only Python and JS/TS imports are read | reviews.md Stage A | | MT-209, MT-210 | |

### F. Security

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-33 | Request protection | Host header, cross-origin and cross-site refusal, content type, 5 MB, `--allow-host` are tested in code, not on a real server | `security.test.ts`; DEC-030 | | MT-171 to MT-175 | |
| G-34 | Network bind | `--host` on another interface without sign-in, `--read-only` or `--insecure` | DEC-063 | | MT-150, MT-176 | |
| G-35 | Hidden paths and links | A name that starts with a dot is blocked, a secret under an ordinary name (for example `config/secrets.yaml`) is **not** | DEC-031; reviews.md Stage P1 | | MT-177 to MT-179 | |
| G-36 | Credentials | File mode, `.gitignore`, locked values, write-only API, plain text without `DP_SECRET_KEY` (to change: DEC-101 makes encryption always on; add rows for the key file, a plain file that gets sealed, and a missing config folder when it is built) | DEC-056, DEC-101 | | MT-180, MT-181 | |
| G-37 | Connection rules | https only, no user or password in the address, no link-local or metadata address, a token never sent to a public host | CONTRIBUTING.md; DEC-085 | | MT-182 | |
| G-38 | System Testing targets | `dp.run.url` only from the main model; this machine unless `--allow-target-host`; viewers and read-only refused; the browser must be on the same machine; session cookie never forwarded; secret fields shown as `•••` | DEC-075 | | MT-183, MT-135, MT-133 | |
| G-39 | Redaction | A secret written as a plain word is not caught; masking is by field name only | DEC-064, DEC-045; U20 | | MT-184 | |
| G-40 | Untrusted model output | A hostile `result.json`; an answer is shown as text, never HTML; review levels are computed by dp | DEC-064 | | MT-185 | |
| G-41 | Roles through the API | A route with no rule is architect-only; the plan only checks the UI | `auth.test.ts` | Fence | Use `curl` with a viewer's cookie to POST a change | |
| G-42 | Read-only in a hub | `--read-only` with `--hub`; the role chip on a read-only hub; `--users FILE`; a missing users file | CHANGELOG (Fixed); MT-148 covers a fresh demo only | Fence | MT-148 in a hub; MT-231 | |
| G-43 | Local file opener | DEC-095 (planned): the owner chose "open in the default app" (DEC-100, D5); the security review of Wave 16 can still cut it to "Copy path only" | DEC-095, DEC-100 | Fence | Not built: test it with Wave 16 (a PDF, a spreadsheet, a refused type, a symlink, a hub server) | |
| G-44 | Hand-written `hub.json` | A path outside the hub folder is trusted | DEC-054, DEC-063; U21 | Fence | MT-198 | |

### G. Failure modes

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-45 | Apply with code | Apply writes code first with a best-effort restore; undo does not restore code files or the draft | DEC-032; planned-change.md | | MT-193, MT-194 | |
| G-46 | Corrupt draft | A missing `base/` or a broken draft file | none | | MT-195 | |
| G-47 | Import review lost | An import draft whose review file is missing is not applied | DEC-064 | | MT-196 | |
| G-48 | Decision file | An unreadable file is reported and never rewritten; YAML beyond the grammar becomes a load error | DEC-050 | | MT-197 | |
| G-49 | Ports | 8765 busy; 4201 to 4204 busy | MT-134 covers 4200 | Fence | MT-199, MT-200 | |
| G-50 | No git | The Git row is hidden without git; 9 tests skip; a repository that disappears needs a restart | DEC-018; reviews.md Stage C | | MT-201 | |
| G-51 | Network failures | Timeout, 3xx, 5xx, wrong token for refresh and BMO direct | none | | MT-202, MT-203 | |
| G-52 | Error screen | `ErrorBoundary.tsx` is never triggered by a test | `ui/src/common/ErrorBoundary.tsx` | Fence | MT-205 | |
| G-53 | Demo checklist | The "containers per own system" rule fails on four systems shown empty on purpose (what should `dp check --strict` on the demo say?) | reviews.md checklist; U23 | | Run MT-137 and MT-157 and write down the result | |

### H. Accessibility and layout

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-54 | Accessibility audit | None ever run; names, roles, focus order, contrast | reviews.md Stage P5; U18 | | MT-211 to MT-215 | |
| G-55 | Keyboard | Arrow keys in **Move to…**; focus traps in dialogs other than search | `planned_features.md` B6 | | MT-212, MT-213 | |
| G-56 | Themes | Dark theme only; exports have a dark background; no light theme | DEC-013 | Fence | MT-228 | |
| G-57 | Window size | Under 760 px dp is unsupported; the right panel folds under 1100 px | DEC-042 | Fence | MT-216 | |
| G-58 | Touch | Palette drag needs a mouse (a tap works) | reviews.md 0.2.0 | Fence | MT-218 | |

### I. Browsers

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-59 | Firefox, Safari | Only Chromium is automated; label sizes are an estimate and fonts differ | `config/playwright.config.ts`; DEC-052 | | MT-219, MT-220 | |
| G-60 | Export files | SVG and PNG export has no test and no list of what to check | MT-24 | | MT-228 | |

### J. Package and install

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-61 | Package contents | The `files` list in `package.json` is not checked by a test | `package.json` | | MT-223, MT-224 | |
| G-62 | GitHub install | The `prepare` script builds `dist/` on the user's machine and needs dev dependencies; never tried; the only install route (DEC-063) | MT-165; U17 | | MT-165, MT-225 | |
| G-63 | Upgrade | A stale UI after an upgrade (the owner saw one from 0.1) | reviews.md 0.2.0 | Fence | MT-227 | |
| G-64 | Version | The plan targets 0.5.0 in `package.json` while the changelog says 0.6.0 | planned_features B7 | | Make the release change, then re-run | |

### K. Features and flags with no step so far (now added)

| ID | Area | What is unconfirmed | Where seen | Fence | Suggested check | Your decision |
|---|---|---|---|---|---|---|
| G-65 | `dp serve` flags | `--allow-host`, `--allow-target-host`, `--traces`, `--code-root`, `--users`, `--insecure` | `src/cli.ts:128-159` | | MT-175, MT-183, MT-229 to MT-231 | |
| G-66 | `dp bmo` | `set` options and tasks other than `explain` | `src/cli.ts:653-781` | | MT-232, MT-233 | |
| G-67 | `dp work` | `add` options (`--type`, `--severity`, `--status`, `--key`, `--source`, `--draft`, `--check`), `import` formats other than SARIF | `src/cli.ts:1059-1160` | | MT-234, MT-235 | |
| G-68 | `dp check --hub`, `dp scan --container`, `dp import --title`, `dp users` flags | no step | `src/cli.ts` | | MT-236 to MT-239 | |
| G-69 | `dp credentials rotate` | No automated test and no other step | `tests/unit/credentials.test.ts` | | MT-240 | |
| G-70 | Notification bell | Only "it opens" (MT-09); no test | DEC-080 | | MT-241 | |
| G-71 | Decisions | Renumbering on apply, `## ` in a section, unknown sections moving after known ones, `dec:` units in drafts | DEC-050 | | MT-242, MT-243 | |
| G-72 | Checklist details | Rule items cannot be ticked; BMO questions from an import; the Selection filter; no browser test for the BMO chip, the bell item or the notice | DEC-084; U25 | | MT-244 | |
| G-73 | Lens editing | Deleting a lens in use; lenses saved before 0.2 miss two sections | reviews.md Stage A3 | Fence | MT-245 | |
| G-74 | Flows | A relationship used by two steps; chaining to the nearest step; no browser test for the flow player following a paused call, Step into a pipeline or a stage's own intercept point | DEC-075; Q-C3; U25 | | MT-246, MT-247 | |
| G-75 | Known limits worth a negative test | Placed notes do not follow boxes; hand-shaped lines are not routed; Make room twice; people and systems cannot move; the fresh-ID rename mark is lost on reload | DEC-070, DEC-071, DEC-061, DEC-037, DEC-035 | Fence | MT-249 to MT-252 | |
| G-76 | Hub work and roles | Work across projects reads main models only and cannot refresh; a `none` role should hide the project from the home summary, the catalog usage and Work | DEC-060, DEC-088; MT-149 | | Extend MT-149 | |
| G-77 | MT-81 wording | "The copy follows the catalog at once" (DEC-057) conflicts with the older review text that says drift stays until "Update from catalog"; the later DEC wins | DEC-057; reviews.md Stage H2–H5 | | Run MT-81 and say which you see | |
| G-78 | Unmapped code warning | `dp check` prints it only once a scan has stored `evidence.json` | `src/core/cliReports.ts:59` | | MT-92 (now says so) | |


## 29 Unverified facts: what was never run or measured

Added 2026-11-20. These are claims the docs make or assumptions the code carries that nobody has run or measured. Moved here from the former open-questions file on 2026-11-20 (U-numbers), so a test run covers them. Each row names the gap-register row (G-number, section 28) and the steps that test it. For each, decide: verify now, verify before 1.0.0, or accept the risk, and write the outcome in the last column. Rows that need an account, a key or another machine may be a Skip.

### Real services

| ID | What was never run or measured | Where seen | How to verify | Gap row | Result / date |
|---|---|---|---|---|---|
| U1 | **No real LLM provider has ever been called.** Claude API, OpenAI API and Ollama are tested against fakes only. | reviews.md 0.5.0 limits; manual-test-plan MT-113, MT-169 | One run per provider with your own key (or a local Ollama). **The first of these is the real-run gate of [Wave 1](waves/wave-01-grounded-bmo.md)** (one route you use, before that wave closes); a real handoff round trip is the gate of Wave 25. | G-01 | |
| U2 | The default model ids `claude-opus-5-5` and `gpt-6-astra` have no source note. | `src/assistant/settings.ts:45-46` | Compare with each provider's current model list before the first run. | G-02 | |
| U3 | Two request details are marked "Not verified" in code: `store: false` for OpenAI and `done_reason: "length"` at `num_predict` for Ollama. | `src/assistant/providerBackend.ts:436,478` | Part of U1. | G-03 | |
| U4 | Status refresh for GitHub, GitLab, SonarQube and Jira was tested against fake servers only. Unchecked: SonarQube 10 or later needs a bearer token (older servers use `basic`), Jira Cloud's email-and-token `basic` auth, GitHub Enterprise, a private repository with a credential, GitLab self-hosted. | reviews.md linked work; `work-tools.test.ts`; DEC-085 | One real link per tool. Needs accounts or a self-hosted instance. | G-05, G-06 | |
| U5 | The minimal SARIF example, the GitLab Code Quality, SonarQube issues and dp JSON import formats were written from format descriptions and hand-made examples. | manual-test-plan lines 334, 349 | Import a real report from each scanner. | G-08 | |
| U6 | The three sample CI jobs (`github-actions.yml`, `gitlab-ci.yml`, `work-import.yml` in `demo/ci-examples/`) were never run in a real repository. `gh pr comment --edit-last` is marked [Training]. | file headers; reviews.md 0.4.0 | Run each once in a scratch repository. | G-09 | |
| U7 | **This repository's own GitLab CI has never run.** The file says "NOT RUN YET". The claim that free runners are Linux only and the identity-verification step are unchecked. | `.gitlab-ci.yml:4`; DEC-089 | Create the GitLab project and push once. | G-10 | |
| U8 | The trace reader was only given files in its documented format. Never a real OpenTelemetry Collector file. Jaeger and Zipkin formats are not read. | reviews.md traces; DEC-046 | One real file from a Collector's file exporter. | G-12 | |
| U9 | System Testing passes these through unpaused and unverified: HTTPS, HTTP/2, gRPC, WebSocket, event streams, bodies over 1 MB, compressed bodies, a caller inside a container, a call held past the caller's timeout. | DEC-075 trade-offs; reviews.md System Testing | Against a service of your own. | G-13 | |

### Import thresholds and guesses

| ID | What was never run or measured | Where seen | How to verify | Gap row | Result / date |
|---|---|---|---|---|---|
| U10 | The step-by-step rule (more than 300 source files, more than 5 container candidates, more than 2 BMO passes), the 20 seconds per review item, and tokens ≈ bytes ÷ 4 are guesses. | `import-design.md`; DEC-051 | Run `dp scan --plan` on three real repositories of different size and compare with the effort you actually spend. | G-14 | |
| U11 | The 32,000-token room that sets the run size limit was measured only on the demo (3,000–10,000 tokens) and a synthetic model with 300 more containers. | DEC-065; reviews.md 0.5.0 | A real large model through the preview. | G-15 | |
| U12 | `MAX_FILES` = 60 files per component for import edges. | `src/core/codeMap.ts`; reviews.md 0.5.0 | A repository with a large component. | G-16 | |
| U13 | The demo scan finds 4 C1 and 5 C2 candidates and **no C3 candidates**, so component scanning was never exercised on the demo. | reviews.md 0.5.0 | Scan a real repository with folders two levels under a container. | G-17 | |
| U14 | Wave 15's floor of 6 questions per level has no basis beyond a decision. | wave-15 | Try on two repositories; does a small one produce 6 useful questions? | none (Wave 15 is not built) | |

### Platform, scale, safety

| ID | What was never run or measured | Where seen | How to verify | Gap row | Result / date |
|---|---|---|---|---|---|
| U15 | Windows has never been run (paths, line endings, browser opening, `nc` in the demo tour). | reviews.md 0.3.0, 0.4.0; DEC-095 ("the Windows path is written, not run") | One Windows machine, `dp serve --demo`. | G-19 | |
| U16 | Node 20 and Linux have only been run through CI that has not run (U7). | reviews.md Stage P6 | Same as U7. | G-20 | |
| U17 | Install from the GitHub URL (the only install route, DEC-063) was never tested. The `prepare` script builds `dist/` on the user's machine, which needs the dev dependencies. | reviews.md 0.3.0 and 0.4.0; MT-165 | `npm install -g github:AbhishekR3/designPerspectives` on a clean machine. | G-62 | |
| U18 | No accessibility audit was ever run. Screen-reader names, focus traps in dialogs other than search, keyboard-only canvas editing and colour contrast are unchecked. Widths under 760 px are unsupported. Dark theme only. | reviews.md Stage P5; DEC-013, DEC-042 | A keyboard-only walkthrough and one automated audit (built as [Wave 28b](waves/wave-28-quality-for-1-0.md), run last). | G-54 | |
| U19 | Label size is an estimate and fonts differ across machines. The 12 px, 8 px and 2° snap constants, the cost bands (0/100/1,000/5,000) and the 12 default characteristics are marked interpretation and were never confirmed. | reviews.md routing, A3; DEC-052, DEC-071, DEC-013 | Open the demo on two machines; confirm the numbers you care about. | none (look at the diagrams on two machines) | |
| U20 | Masking hides values by field name only. A secret under an ordinary name, or inside a plain-text body, is shown. | DEC-045, DEC-075 | Test with your own payloads. | G-39 | |
| U21 | A hand-written `hub.json` can point outside the hub and is trusted. | DEC-054, DEC-063 | Accept, or check the entries on load (the browser path already does). | G-44 | |
| U22 | The "0 projects" screen the owner saw was never reproduced or explained. | reviews.md interaction fixes | Probably the 2026-11-16 fixes; watch for it. | G-27 | |
| U23 | The demo's checklist rule "containers per own system" fails for four systems that are shown empty on purpose. | reviews.md checklist section | Decide: add containers to those systems, tag them external, or change the rule (see N8). | G-53 | |
| U24 | `GET /api/checklist` runs every rule on every model change and on window focus. Not measured on a large model. | reviews.md checklist section | A 100+ container model (see the manual test plan, scale rows); the generated model and time budgets are [Wave 28a](waves/wave-28-quality-for-1-0.md). | G-29 | |
| U25 | No browser test covers: the BMO chip and section order in the checklist, the bell item for BMO questions, the flow player following a paused call, Step into a pipeline, a stage's own intercept point, the trace picker, watched fields. They were only looked at. | reviews.md checklist and System Testing sections | Manual rows in the test plan; add browser tests if they break. | G-72, G-74 | |
| U26 | **The folder-skip list of DEC-103 (N1) was not checked with BMO.** BMO was off on 2026-11-20 (handoff backend, no provider, no credential), so the list was checked against the code only. | DEC-103 N1; `src/import/scan.ts` (`EXTRA_SKIP_DIRS`) | Run `dp bmo status`. If BMO is on, run the C3 candidate task on a real repository and ask whether the fixed list skips a folder that holds real components or misses a technical folder; record the answer. If BMO is off, say so and do not turn it on without the architect. | | |
| U27 | Whether an Ollama server reports a model's own context window in a field dp can read (DEC-103, N15) is from training, not from a run. | DEC-103 N15 | Query a running Ollama server for one model and note the field name and value; only then let dp read it. | | |

## 30 Structurizr check: the steps behind MT-DRAFT-167

Moved here from the former open-questions file on 2026-11-20 (it was question Q-A1: the owner asked for steps, what to look for, what it is for and context). It is an owner-only check, not an open question.

**Status of this section.** The steps are written from general knowledge of the Structurizr tools [Training], not run here: the A0 check in 2026-11 only read Structurizr's source (version 6.2.4) because Docker and Maven were not available (reviews.md, Stage A section 5). Check each command against the tool's own documentation before relying on it. Expect 30 to 60 minutes, most of it the first Docker download.

### What this is for

dp stores its model as a Structurizr workspace (`architecture/workspace.json`, DEC-007). The reasons given were: the format is open and plain JSON, so dp does not add a new C4 format, and a model made by dp or by Structurizr can in principle go either way. That claim has never been checked against Structurizr's own software. This check settles four things:

1. **Does Structurizr load what dp writes?** If not, "a Structurizr workspace" in the README and DEC-007 is only half true.
2. **Do the choices dp made hold up?** dp replaces Structurizr's numeric IDs with readable slugs (DEC-007); stores box positions at twice the UI size so a layout "looks the same" in Structurizr (reviews.md Stage A, deviation 3); keeps extra data as `dp.*` properties and a `dp.level` view property; stores flows as dynamic views (deviation 6); and does not store the dashed derived lines (deviation 2).
3. **Is data kept on a round trip?** DEC-007 says unknown fields are kept when dp reads and writes a file; this tests it from the other side.
4. **Is it safe to claim compatibility, or import a workspace made elsewhere?** Importing keeps views already in a workspace unchanged (deviation 9).

Why it matters for decisions: if it fails, either dp's storage choices change (for example, numeric IDs) or the docs stop saying the files open in Structurizr. Nothing in the product depends on the result today, which is why it is an owner check and not a blocker.

### Before you start

- Work on a **copy**: `dp init --demo /tmp/dp-structurizr` then use `/tmp/dp-structurizr/architecture/`. Some tools write back into the folder they open (layout, cache files).
- Files that matter: `workspace.json` (the one Structurizr reads). `designperspectives.json` is dp's own file and Structurizr ignores it, so line shapes, lenses and tag groups will not show there.
- Do not upload the model to a hosted service to try it. Use the local tools below. (Anything you send to an outside service may be kept.)

### Steps

1. **Pick a tool.**
   - *Structurizr Lite* in Docker (a local web page): `docker run -it --rm -p 8080:8080 -v /tmp/dp-structurizr/architecture:/usr/local/structurizr structurizr/lite`, then open `http://localhost:8080`. It looks for a workspace file in that folder; if it wants a different file name or a flag for JSON, the Lite documentation says so [Training].
   - *Structurizr CLI* (no browser): download it and run `structurizr.sh validate -workspace /tmp/dp-structurizr/architecture/workspace.json`, then `structurizr.sh export -workspace … -format json` (or `plantuml`) to see what it understood [Training].
   - If you have neither Docker nor Java, stop and write that down: that is itself the result "not checked".
2. **Does it load at all?** Read any error message in full. Likely culprits are IDs, a view that refers to a missing element, or an unknown property. Copy the message into the notes.
3. **Count things.** In the demo: the people, software systems, containers and components should match what dp shows (for example Internet Banking System with its containers). Write down any that are missing.
4. **Relationships.** A few lines should carry their description and technology (for example "HTTPS" or "SQL").
5. **Views.** The view list should show the landscape, context, container and component views (keys such as `landscape`, `containers-<id>`). Note anything missing or renamed.
6. **Layout (deviation 3).** Open one container view. Boxes should sit where dp had them, not on top of each other, not tiny or huge (dp stores positions at 2× so a 225×150 box in dp is a 450×300 box in Structurizr). If the layout is wrong, this is the first suspect.
7. **Derived lines (deviation 2).** Dashed "derived" lines on dp's higher-level diagrams are **not** in the file, so a Structurizr container view shows fewer lines. That is expected: write down the difference, do not count it as a failure.
8. **Flows (deviation 6).** Open the "Make a payment" dynamic view. A flow whose steps cross containers may refuse to open; note which ones do and which do not.
9. **Properties.** Open an element's details and look for its properties (`dp.owner`, tag properties such as `dp.tag.Tier`, `dp.level` on a view). They should be kept even though Structurizr does not use them. Note where (or whether) the tool shows them.
10. **Round trip (optional, on the copy only).** Move one box in Lite and save the layout if the tool offers it (it may write `workspace.json`). Then run `dp check /tmp/dp-structurizr` and open it in dp (`dp serve /tmp/dp-structurizr --no-open` or the app). The file should still load, `dp.*` properties and decisions should be intact (decisions and the sidecar are separate files), and `git diff` in the copy should show only positions.

### What a pass and a fail look like

| Result | Meaning | What changes |
|---|---|---|
| Loads; counts, relationships and views match; layout sane; properties kept | The claim holds | Say "opens in Structurizr's tools" in the README with the version you tested; close Q-A1 and MT-167 |
| Loads, layout wrong | The ×2 factor or box size is off | Change the factor or the default size (a small change in dp's position code); re-test |
| Loads, some views or flows missing | Rules like deviation 6 | Document which flows work; consider a warning in dp's flow panel (it exists for dynamic-view rules) |
| Does not load | Probably IDs or properties | A decision: switch to numeric IDs on write (keeping slugs as properties), or drop the compatibility claim |
| Not checked | No tools available | Leave the README and DEC-007 wording as "not verified" |

### What to report back

For each of steps 2 to 10: pass, fail or not checked, plus the tool and its version, any error text, and a screenshot of one container view. Put them in the Result column of MT-167 and the Notes column of the run log, and tell me; the DEC-007 note and the README wording follow from the table above.

## Things I could not confirm from the files

After the 2026-11-20 pass, these are still unconfirmed (items settled by reading the code were removed: the hub command is `dp serve DIR --hub`, `dp serve --host 0.0.0.0` without sign-in refuses to start, `dp diff --exit-code` exits 1 when the model changed, the handoff files go to `architecture/import/handoff/`, and `dp work add` takes `--to`).

- Exact UI labels for the add-from-catalog action, the settings dialogs for tags, lenses, characteristics and cost, and the testing actions (drop, answer by hand, watch). Confirmed from the code: Back and Restart in the flow player, **Move to…**, **Reset line shape**, **Link work…**, the redo keys (Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y).
- That a SARIF file is accepted from a hand-made minimal example (G-08).
- What the notification bell shows in a fresh demo (MT-09, MT-241).
- The $8,690 cost figure is from the changelog and may differ in the demo (MT-38).
- Which automated test covers the Download menu, the bell and comments in drafts: the file names in the tables are my best match by area, except where this pass checked them.
- Whether the demo's decisions include every decision kind (MT-67 asks you to write one of each).
- That F8, F9 and F10 work in your browser and OS (G-21).

## What the automated tests cover and do not

The areas with only one kind of test are in the table at the top. Areas with no browser test at all: the code level (API only), the CLI (CLI tests only), install checks (owner only, apart from `scripts/ci-local.ts`). Areas with no test of any kind that this pass could find: the notification bell, PNG and SVG export, accessibility, performance, a real LLM provider, a real status refresh, non-Chromium browsers, Windows, `dp credentials rotate`.

Areas in TESTS.csv I could not place cleanly:

- "Stage A2 features" (one file, `features.test.ts`, mixed content): I put it under C4 modelling and also used it for lenses, sample data and flows. Check its rows.
- "Owner checklist" is the old Stage A walk-through; I used it for start-up.
- "Security" (API, CLI): used for read-only and path confinement; section 20 now maps its request-protection tests.
- "Validate" and "Model files": used for start-up; they test file reading and checks, not a screen.
- "Model sync" (browser): used for the focus reload, may include more.
