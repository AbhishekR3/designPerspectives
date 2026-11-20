# Manual test plan (draft)

> **Status: Draft.** Written from the README, the demo tour and `tests/TESTS.csv`. The steps have NOT been run. Fix any step that does not match the app.

## How to use

1. Start the demo in a new empty folder (the command is from `README.md` and `demo/README.md`):

   ```bash
   mkdir bank-demo && cd bank-demo
   dp serve --demo
   ```

   From a clone of the repository, use `npm run dp -- serve --demo` instead. The app opens at `http://127.0.0.1:8765`. The demo system (a banking page and four services) runs on ports 4200 to 4204; its page is `http://127.0.0.1:4200/`.
2. Run the rows of one section in order. Each row is one action.
3. Write the result in the last column: **Pass**, **Fail**, **Skip** (not run, say why) or **N/A** (does not apply).
4. Record the date and the version at the top of each test run. The version is the one in `package.json` (0.5.0 when this draft was written; run `dp --version`).
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
| 18 CLI | Command line: Check diff, Command line: Bmo/Import/Work, Owner checklist (CLI rows) | 5+ | 0 | **CLI only** |
| 19 Install checks | none | 0 | 0 | **owner only** |

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
| MT-DRAFT-08 | Press **Ctrl/Cmd+K**, type `redis`. Then press **?**. | A search dialog lists matching boxes. **?** lists every keyboard shortcut. | tests/browser/interactions.spec.ts (check the file for search) | |
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
| MT-DRAFT-24 | Use the Download menu to export a diagram as SVG and as PNG. | Two files are saved and open correctly. | none found | |

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
| MT-DRAFT-40 | Open the lens switcher (top right). Try Architect, Engineer, Overview, Security review, Product owner, Operations, Finance. | Each starts on its own levels and overlay (for example Overview shows landscape and context only). No data is hidden: other panel sections can still be opened. The lens choice is remembered after a reload. | tests/unit/features.test.ts, tests/browser/features.spec.ts | |
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
| MT-DRAFT-92 | Run `dp check` in the demo folder. | Exit code 0. After a scan, a warning appears for code that no component maps. | tests/unit/cli-check-diff.test.ts | |

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
| MT-DRAFT-150 | In a non-demo folder run `dp serve --host 0.0.0.0` without sign-in. | dp refuses or warns (check which; `--insecure` is the override). | tests/unit/security.test.ts | |

## 17 History and git compare

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-151 | Make a few edits in the app. Under **Drafts → Git** pick a branch, press **Compare**. | The Changes colours show what changed since that commit. | tests/browser/git-compare.spec.ts, tests/unit/git-compare.test.ts | |
| MT-DRAFT-152 | Press **Open** for that version. | The old version shows read-only. | tests/unit/git-compare.test.ts | |
| MT-DRAFT-153 | Use **Other…** and type a tag or commit hash. Try a bad ref. | A good ref compares. A bad one shows an error and keeps the previous view. | tests/unit/git-compare.test.ts | |
| MT-DRAFT-154 | Open **History** in a project (check where) or `#/history` in a hub. | Commits with added, changed and removed objects, and a link to compare each. Not-yet-committed changes are listed. | tests/unit/history-work.test.ts | |

## 18 Command line

Run from the demo folder. Exit codes are in `README.md`.

| # | Do this (in the demo) | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-155 | `dp --version` and `dp --help`. | The version from `package.json` and the command list. | none found | |
| MT-DRAFT-156 | `dp init` in an empty folder, then `dp init --name X`, then `dp init --demo`, then `dp init --hub`. | The model, a named model, the demo, and an empty hub are created, without starting a server. | tests/unit/from-scratch.test.ts (init only) | |
| MT-DRAFT-157 | `dp check`, then edit `workspace.json` to break it (a relationship to a missing ID), run `dp check` again, then `dp check --strict`. | Exit 0, then 1 with the problem named. Warnings fail only with `--strict`. | tests/unit/cli-check-diff.test.ts | |
| MT-DRAFT-158 | `dp check` in a folder with no model. | Exit code 2. | tests/unit/cli-check-diff.test.ts | |
| MT-DRAFT-159 | `dp diff --base HEAD`, with `--format json`, `--out FILE`, `--exit-code`. | Markdown summary of changes (for a pull request); JSON; a file; a non-zero exit code when there are changes. | tests/unit/cli-check-diff.test.ts | |
| MT-DRAFT-160 | `dp plan <draft-id> --format md --out plan.md`. | The coding plan is written as Markdown. | tests/unit/planned-code.test.ts | |
| MT-DRAFT-161 | `dp scan --json`. | The scan result as JSON. | tests/unit/import-scan.test.ts | |
| MT-DRAFT-162 | `dp credentials add test-token --provider github < token.txt`, then `list`, `rotate`, `remove`. | Names and providers show; the value never does. | tests/unit/credentials.test.ts | |
| MT-DRAFT-163 | Set `DP_SECRET_KEY` and add a credential; look at `.dp/credentials.json`. | The stored value is encrypted (plain text without the key). | tests/unit/credentials.test.ts | |
| MT-DRAFT-164 | Look at `demo/ci-examples/` and run `npm run ci` from a clone (`.gitlab-ci.yml`). | The same steps as CI run locally. | none found | |

## 19 Install checks that only the owner can run

From the owner's list of checks that only the owner can run (the private ideas list, section O). None has an automated test.

| # | Do this | You should see | Automated check | Result / date |
|---|---|---|---|---|
| MT-DRAFT-165 | On a clean machine run `npm install -g github:AbhishekR3/designPerspectives`, then `dp --version`. | The package builds and `dp` runs. | none found | |
| MT-DRAFT-166 | Run the demo on Windows (`dp serve --demo`, open a project, edit a file). | The browser opens and paths work. | none found | |
| MT-DRAFT-167 | Open the files `dp` writes in Structurizr's own tools (including `dp.*` properties and `dp.level`). | They load; unknown properties are kept. | tests/unit/workspace-io.test.ts (format only) | |
| MT-DRAFT-168 | Run the sample CI jobs in `demo/ci-examples/` in a real repository. | `dp check` and `dp diff` run on a pull request. | none found | |
| MT-DRAFT-169 | Try BMO with a real model on a real repository, handoff and direct; judge the prompts. | Prompts are sensible; nothing unexpected is sent. | none found | |
| MT-DRAFT-170 | Read the interview's standing questions and the starter reference entries, if those waves are built. | Not in the app yet (planned waves 15 and 3). | none found | |

## Things I could not confirm from the files

- The exact command to start the demo hub (`dp init --hub --demo` is in the demo README; the serve command for a hub is `--hub`; I did not check it in the CLI source).
- Exact UI labels for: the redo key, the Move action, the add-from-catalog action, the settings dialogs for tags, lenses, characteristics and cost, the History page link in a single project, flow step buttons (Back, Restart), testing actions (drop, answer by hand, watch), the breakpoint on a flow step or pipeline stage.
- Where `dp scan --prompt` and a BMO handoff write their files (README says `architecture/import/handoff/`; the BMO handoff path was not checked).
- Whether `dp serve --host 0.0.0.0` without sign-in refuses or warns (MT-DRAFT-150).
- Whether `dp diff --exit-code` gives a non-zero code on any change (assumed from the name).
- That a SARIF file is accepted from a hand-made minimal example; the format needs checking.
- What the notification bell shows in a fresh demo (MT-DRAFT-09).
- The $8,690 cost figure is from the changelog and may differ in the demo.
- Which automated test covers search, the Download menu, the notification bell, comments in drafts, the flow Back/Restart buttons and `dp --version`: the file names in the table are my best match by Area, not checked test by test.
- Whether the demo's decisions include every decision kind (MT-DRAFT-67 asks you to write one of each).
- That the keyboard shortcut F8, F9 and F10 work in your browser and OS (README says so).

## Gaps

Features in the sources with no automated test I could find:

- Download as SVG or PNG; the notification bell; search by Ctrl/Cmd+K (only in a general interaction file, if at all).
- Install from the GitHub URL, Windows, Structurizr tools, sample CI jobs (owner only).
- A real BMO provider call (Claude, OpenAI, Ollama), and a real status refresh from GitHub, GitLab, SonarQube and Jira (only fake servers).
- `dp init` options, `dp users` commands beyond init, `dp credentials` (partly in `tests/unit/credentials.test.ts`), `dp --version`.
- The code level has API tests only, no browser test.
- Lens switching for Security review, Product owner, Operations and Finance: the README lists only Architect, Overview and Engineer as built-in, while the demo tour lists seven. Check which lenses exist.
- The CI file `.gitlab-ci.yml` and `npm run ci`.

Areas in TESTS.csv I could not place cleanly:

- "Stage A2 features" (one file, `features.test.ts`, mixed content): I put it under C4 modelling and also used it for lenses, sample data and flows. Check its rows.
- "Owner checklist" is the old Stage A walk-through; I used it for start-up.
- "Security" (API, CLI): used for read-only and path confinement; some rows may cover other limits.
- "Validate" and "Model files": used for start-up; they test file reading and checks, not a screen.
- "Model sync" (browser): used for the focus reload, may include more.
