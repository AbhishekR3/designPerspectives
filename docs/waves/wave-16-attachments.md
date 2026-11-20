# Wave 16: Images and files on notes, comments, decisions and diagrams

| | |
|---|---|
| **Status** | Owner answers applied (questions C4 and C5, 2026-11-19: anyone can attach, up to 10 MB per file, stored locally and opened directly). Ready to run after Wave 3 |
| **Branch** | `feat/w16-attachments`, from `main` after Wave 3 is merged |
| **Size** | M–L |
| **Release** | 0.5.1 (with Waves 1, 2, 3, 4) |
| **Depends on** | Wave 2 (the Markdown renderer, sticky notes), Wave 3 (the Decisions page and its links section, including the `local:` link kind) |
| **Owner items** | Feature E of [../product-vision.md](../product-vision.md): "different accounts who can add notes/images/files to the diagrams". Replaces Wave 3's optional upload step (Q3.5 option 2) |

Read [README.md](README.md) first: its rules, agents and checks apply to this wave.

## Goal

Accounts can attach images and files to a diagram, a box or line, a decision, a note or a comment, and everyone who can see the project can see them. A whiteboard photo, a PDF of a contract, a spreadsheet, a screenshot of a console. BMO can reach what a person can see (DEC-094): every attachment is listed to it, and the text of text files goes in after redaction; images, PDFs and Office files are listed but their contents are never sent. Nothing attached is ever run or shown in a way that could execute.

## Owner request covered

> E. Collaboration / Notes - Supporting different accounts who can add notes/images/files to the diagrams

## What exists today [Fact]

- **No attachment of any kind.** Comments, notes and decisions are text. Sticky notes on a diagram (DEC-070) are comments with a position (`src/core/comments.ts`). Wave 2 turns them into model data (`dp.stickies`, DEC-092); placed comments stay.
- **Comments are open to every role,** including viewers (`comment` in the action table, `src/server/auth.ts:11-27`; DEC-049). `comments.json` is capped at 10 MB (`comments.ts` `MAX_FILE_BYTES`).
- **A request body must be JSON under 5 MB** (`src/server/requestProtection.ts:12`, `:94-102`). This rule is also the cross-site defence.
- **Drafts copy the whole decisions folder** into the draft and into its base (`src/core/drafts.ts:208-212`), so a file kept inside `decisions/` would be stored three times per draft.
- **Secrets.** A decision holding a secret is refused (DEC-064). Binary files cannot be scanned for secrets.
- **The planned static export includes attachments** (DEC-024).
- **Precedents for files beside the model** with a store, routes and UI: `comments.json` (DEC-049), `checklist.json` (DEC-084).
- **`dp.links`** holds `{label, url}` lists on elements (`src/core/modelEdits.ts:956-961`).

## Design [Proposal]

1. **Store** (`src/core/attachments.ts`, new). Content-addressed files in `architecture/attachments/<sha256>.<ext>`. The same bytes are stored once. The store sits outside `decisions/` and outside every draft, so drafts never copy it. Like `comments.json` and `checklist.json`, it is beside the model, not in it; a DEC adds it to CLAUDE.md's list of files outside the workspace.
2. **References are model data.** An object that has attachments carries a `dp.attachments` property: a list of `{hash, name, type, size, by, at}`. A decision lists them in an `## Attachments` section. A comment holds the same list in `comments.json`. So references go through drafts, undo, `dp diff` and merge; the file store itself does not.
3. **Upload, up to 10 MB per file.** Base64 inside the 5 MB JSON limit cannot carry 10 MB, so the upload is a raw body on its own route, `POST /api/attachments`, with its own limit. The cross-site defence has to survive that change, because today it rests on "the body must be JSON" (`requestProtection.ts:94-102`):
   - the request must be `Content-Type: application/octet-stream` **and** carry a custom header (`X-DP-Upload: 1`, with the file name in `X-DP-Name`, URL-encoded). A web page on another origin cannot send a custom header without a preflight, and this server refuses preflights, so a cross-site page still cannot upload. (A multipart form would not be safe: a page can post one without asking.)
   - the global 5 MB limit and the JSON-only check skip this one route and nothing else; the route has a 10 MB limit and the Host and Origin checks still apply;
   - the server reads the bytes, works out the type itself from the first bytes, and ignores any type the client claims;
   - the file is written to a temporary name in the same folder and renamed once checked, so a half-written upload never appears.
4. **Types, and how each opens.** The owner wants a file to open directly from the project. Everything is stored in the project folder and opened through dp's own server, so there is nothing to find on disk.
   - **Images:** PNG, JPEG, GIF and WebP show in the page (thumbnail, then a larger view on click).
   - **PDF:** opens in a browser tab, from dp's address, served as `application/pdf` with `nosniff`. [Proposal; the security review decides: if a PDF cannot be served this way safely, it downloads instead.]
   - **Text, Markdown, CSV and JSON:** shown in a dialog as plain text (the page sets the text with `textContent`, never as HTML).
   - **Office files** (docx, xlsx, pptx): download.
   - **Refused:** SVG, HTML, scripts, archives, executables and anything else. SVG is refused, not downloaded, because a saved SVG can run script when opened.
5. **Serving.** `GET /api/attachments/<hash>` always sends `X-Content-Type-Options: nosniff`. Images are served with `Content-Security-Policy: sandbox; default-src 'none'` and shown only through an `<img>` tag. A PDF is served inline as above. Text types are fetched by the page and shown as text. Office files get `Content-Disposition: attachment`. The type sent is the one the server worked out, never the client's.
6. **Who may attach** (owner, C4: anyone).
   - **Every role, viewers included, can attach to a comment**, because every role can comment (DEC-049).
   - To a decision, a note or an object: whoever may edit that thing, as before. Engineers do it in a draft. A viewer cannot edit those, so a viewer's files go on comments.
   - The route gets a `ROUTE_RULES` entry for the `attach` action, open to every role. Because a viewer's upload writes to the disk, the limits in item 7 matter more.
7. **Limits.** 10 MB per file; a total cap per project (proposal: 500 MB, a warning at 80%); an allowlist of types; a limit on uploads per minute for one session. A breach is a `ModelError` with the reason. Files live in a git repository, so large totals make it heavy: `dp check` says so, and an architect can remove files.
8. **Orphans.** `dp check` warns about files that nothing references. An architect action removes them. A file that is referenced is never removed.
9. **Markdown.** Wave 2's renderer gains `![alt](attachment:<hash>)`, which resolves only to a stored attachment. It never loads a remote image: no tracking, no request leaving the machine.
10. **BMO** (screen parity, DEC-094).
    - **Always in the pack:** every attachment on the scope, listed with name, type, size, who and when.
    - **Text files** (txt, md, csv, json): their content goes in as a data block, through redaction and the pack's budget, like a code file. The manifest says "included" or "left out: budget".
    - **Images, PDFs and Office files:** listed only. dp cannot look inside them for secrets, so DEC-064's rule keeps their contents out. The manifest says "N attachments, contents not sent".
    - **A local reference** is listed by file name and never read.
    - `dp context` does the same.
11. **Static export.** Includes only attachments referenced by what is exported, and only after the review step DEC-024 asks for.
12. **Reference a file on this computer** (owner, Q3.5), so a large file need not be copied, and **open it in the system's default app** (owner, 2026-11-19: "if I click a PDF it opens in Adobe Acrobat, a .xls in Excel").
    - **Storing.** Beside "Upload" in every attach widget there is "Reference a file on this computer". It stores the path (the `local:` kind Wave 3 builds for decision links): an absolute path or one starting with `~/`. It appears in `dp.attachments` as `{local, name, by, at}` beside uploaded entries `{hash, …}`.
    - **Never read.** dp does not read, copy, hash or upload the file, and never sends its contents to BMO. A path in git only helps on that machine, and shows a user name unless written with `~/`.
    - **Opening.** A web page cannot open `file:` links [Training], so dp's server asks the operating system to open the file, the way the CLI already opens the browser (`src/cli.ts:57-60`: `open`, `cmd`, `xdg-open`). A click on the file name opens a dialog that shows the **full path**, with Open and Cancel, because a link's label can say anything. The route is a POST with its own `ROUTE_RULES` entry (`open-local`).
    - **Limits** [Proposal; the security review decides]. A repository from someone else must not be able to start a program on the reader's machine, so:
      - only when the server runs on this machine and the request comes from it (`isLoopback`, `src/core/hosts.ts`). On a hub or a remote server the button is Copy path only, because "open" would open the file on the server's computer;
      - only these document types: pdf, doc, docx, xls, xlsx, ppt, pptx, csv, txt, md, rtf, png, jpg, gif, webp. Never programs, scripts, shortcuts, `.app` bundles, `.html`, `.svg`, or macro-enabled Office files (xlsm, docm, pptm);
      - the path is resolved first (symlinks followed) and the **real** file's type is checked, and it must be a regular file that exists;
      - the opener is started with an argument list and never a shell;
      - the cross-site rule of item 3 applies: a custom header, no preflight;
      - the Windows path is written and not run, like the rest of the CLI's Windows code (ideas list O), and needs extra care with quoting.
    - **Roles.** Anyone who can see the project may open (the server is on their own machine); whoever may edit the thing may add or remove a reference. Same as uploads for who may attach.
13. **UI.** An attach button in the comment composer, the note editor, the sticky note editor, the decision editor and the diagram and object panels; paste an image from the clipboard; a thumbnail strip; click opens an image in a dialog; other files download; a referenced local file has Open (with the path dialog) and Copy path. Reachable by keyboard; every image has a name used as alt text.

## Determinism

| Output | Class |
|---|---|
| The store, type checks, caps, orphan check | computed |
| What goes to BMO from attachments (the list, redacted text files) | computed; BMO's answers about them are proposed |

## Owner answers

- **C4:** anyone can attach (every role, viewers on comments).
- **Q3.5 (2026-11-19):** also allow a reference to a file on the user's own machine, so nothing is duplicated (item 12). **Follow-up the same day:** a click opens it in the system's default app, with the limits in item 12 (DEC-095).
- **Screen parity (2026-11-19):** BMO can reach everything a person can see. For attachments that means they are listed, text files' content goes in redacted, and images, PDFs and Office files are listed only (item 10, DEC-094). The assistant kept that last exception because dp cannot scan those files for secrets; the owner may overrule it.
- **C5:** up to 10 MB per file. Files are stored locally in the project and open directly from it. This needed a raw upload route with its own cross-site rule (item 3); that design and the PDF-inline choice are the assistant's proposals for the security review.

## Stop and ask if

- The raw upload route cannot keep the cross-site rule (custom header, no preflight) in the real server, or the security review finds a way around it. Then fall back to base64 in JSON with a lower file cap, and ask the owner.
- A PDF cannot be opened inline safely: it downloads instead (say so in reviews.md).
- A cap above 10 MB per file is wanted.
- SVG or HTML must be shown inline.
- The security review finds the "open in the default app" route unsafe (a file type that can start a program, a symlink or path trick, a Windows quoting problem). Then ship Copy path only and tell the owner.
- A file type outside the open allowlist is wanted.
- The contents of an image, PDF or Office file must go to BMO. That needs a vision-capable model and a decision about content dp cannot scan for secrets.

## Steps and agents

| # | Step | Agent · model | Files | Done when |
|---|---|---|---|---|
| 1 | Re-anchor | Explore · Haiku | The files in "What exists today" | Anchors confirmed or corrected |
| 2 | Store, raw upload route, type checks, serving headers | general-purpose · Opus | `src/core/attachments.ts` (new), `src/server/routes/attachments.ts` (new), `src/server/auth.ts`, `src/server/requestProtection.ts` (a per-route limit and exemption) | A forged type, SVG, an oversized file, a path trick and a cross-site upload are all refused; headers are right |
| 3 | References in the model: `dp.attachments`, decision section, comments, diff and merge | general-purpose · Opus | `src/core/modelEdits.ts`, `decisions.ts`, `comments.ts`, `modelUnits.ts`, `diff.ts`, `merge.ts` | References round trip, diff and merge; drafts do not copy the store |
| 4 | UI | general-purpose · Sonnet | `ui/src/common/` (attach widget, thumbnails, dialog), `panels/`, `pages/DecisionEditor.tsx`, `common/comments.tsx` | The five places attach and show; keyboard reachable |
| 5 | Tests (not the authors of 2 to 4) | general-purpose · Sonnet | `tests/unit/attachments*.test.ts`, `tests/browser/attachments.spec.ts` | As listed below |
| 6 | Docs | general-purpose · Haiku | CHANGELOG, decisions.md, reviews.md, CONTRIBUTING (security model), CLAUDE.md, README | All docs updated |
| 7 | Review | main session | — | `/code-review` (high) and `/security-review`, both mandatory; findings fixed |

## Required in this wave

- **Routes.** Each new non-GET route has a `ROUTE_RULES` entry; a viewer is refused where the rule says so.
- **Hub.** Per-project roles apply. The store is per project.
- **Read-only mode.** Nothing uploads; existing attachments still show.
- **Security model.** In CONTRIBUTING: the raw upload route and why it is still safe across sites, the type allowlist, why SVG is refused, the serving headers, what BMO gets from attachments (a list, plus redacted text files; never the contents of images, PDFs or Office files) and why, that dp cannot scan binary files for secrets, and the "open in the default app" route with its limits.
- **Static export.** As item 11.
- **Windows.** The file names are hashes, so no path from a person's file name ever reaches the disk.

## Tests

- **Store.** Same bytes stored once; a hash path never escapes the folder; the cap and the total cap hold.
- **Upload.** A 10 MB file is accepted; one byte more is refused; a request without `X-DP-Upload`, or with `Content-Type: multipart/form-data` or `text/plain`, is refused; a cross-origin request is refused; a half-sent upload leaves no file.
- **Types.** A PNG named `.pdf` is refused; an SVG is refused; HTML is refused; a JPEG is accepted and served inline; a PDF opens inline (or downloads, if the review says so); an Office file downloads; text shows as text.
- **Headers** on every download.
- **Roles.** A viewer can attach to a comment and cannot attach to a decision or note; an engineer attaches inside a draft; an architect attaches on main.
- **References.** They show in the change list and `dp diff`, merge three-way, and survive undo.
- **Drafts** do not copy the store; discarding a draft leaves the files, which `dp check` reports as unused.
- **Markdown.** `attachment:` resolves; an `http` image never loads.
- **BMO.** Every attachment is listed. A text file's content is in the pack, redacted, and a secret in it is masked. An image, PDF or Office file's bytes are in no pack. A local reference is listed by name and never read (a test over the context pack and `dp context`).
- **Opening a local file.** A path that resolves (through a symlink) to a script, `.app`, `.html`, `.svg` or `.xlsm` is refused; a missing file or a directory is refused; a non-loopback request is refused; a request without the custom header is refused; the opener is called with an argument list (a test with the opener stubbed); on a hub the Open button is not offered.
- **Local references.** A path is stored and shown as text; a relative path or one with control characters is refused; no request touches the disk for it; the pack and `dp context` never contain it.
- **Browser.** Attach a PNG to a comment and a decision; see the thumbnail; open a PDF in a tab; read a text file in the dialog; download a docx.

## Docs

- **New DEC:** the attachment store, the raw upload route and its cross-site rule, the type rules, and who may attach (anyone). DEC-094 (screen parity) and DEC-095 (opening local files) are already written; update them if the build differs.
- **CHANGELOG:** Unreleased. **reviews.md:** a section at the top.
- **CLAUDE.md:** `attachments.ts` and its route module.
- **README:** the collaboration paragraph.
- **docs/determinism.md:** a row.
- **planned_features.md:** note what is left (files over 10 MB, video, per-file permissions).

## Out of scope

- Files over 10 MB, video, and audio. Git LFS.
- Sending the contents of images, PDFs and Office files to BMO. Reading text out of an image.
- Per-file permissions.
- Editing an image in dp.
- Opening a referenced file on a hub or remote server (it would open on the server's computer).

## Start prompt

```
Run Wave 16 of the designPerspectives plan. Read docs/waves/README.md, then
docs/waves/wave-16-attachments.md, and follow them: branch from main as the header says,
run the steps with the agents and models in the table, brief each subagent with files and
line ranges and the words "never run git stash, never push", run the checks, update the
docs, and commit by path. Stop and ask me if a "Stop and ask if" condition is met or an
answer this wave needs is missing.
```
