# UI/UX research: making diagrams easier to edit and quicker to understand

Input for a follow-up session that improves the UI. It collects what was seen in a commercial C4 tool (a product video and its public interactive diagram viewer, called "the reference tool" here, per DEC-029) and compares it with designPerspectives as it is today. It then proposes changes in our own terms.

Labels used below:
- **[Observed]**: seen directly in the video frames, the reference tool's viewer, or our running app (demo model, `dp serve`, 1600×900 viewport, 2026-11-14).
- **[Proposal]**: interpretation or recommendation. Not decided; check `docs/decisions.md` and ask the owner where a decision is needed.

Owner goals for this work (from the request):
1. It must be **easy to change** a diagram.
2. It must be **quick to understand** what a diagram shows.
3. Add **subtle animations** and **more colour** so it is more visually appealing.
4. The **C4 code level** must let the user add things and relationships, not only show scanned files.
5. Note what makes the UI **not simple**, both in ours and in the reference.

**Owner answers (2026-11-14).** These settle the open questions of the first draft. The follow-up session should record them in `docs/decisions.md` as new DEC entries.
- **Code level**: show the **internal code**, **which functions are called from which files**, **when the output of file A is the input of file B**, and each file's **inputs, outputs and other relevant info**. Adding items and relationships by hand stays in scope. See §5.
- **Colour**: on the diagram, colour comes from **overlays**. The **chrome around the diagram** (menus, options, navigation, the add/create flow, panels) is "bland and monochromatic" and must get colour too. See §3.2.
- **Technology logos**: use the **real logos**, downloaded from open icon sets. See §3.3.
- **Right panel**: it can be **minimised** by the user. See F1/F6.
- **Box cards**: the owner delegated the design to the assistant ("do what you think is best"). See §3.4.

Constraints to respect: dark theme only (DEC-013); diagram content is computed from the model (DEC-010); all edits go through `src/core/ops.ts`; per-object data goes in `dp.*` properties; the built UI in `static/` must be rebuilt and committed; competitors are not named in repository files, commits or PRs (DEC-029).

---

## 1. What the reference tool does (observed)

### 1.1 Product video (8 s): context diagram → drill into a system → select a service

[Observed] frame by frame:
1. **Context diagram.** About 15 boxes on a near-black canvas. People are compact dark pills with a round avatar icon above. Systems are cards with a **brand logo** at top-left, a bold name, a one-line grey description, and a tiny monospaced footer such as `External system · GA`. External systems use a **lighter grey fill** than internal ones, so "ours vs theirs" reads at a glance.
2. **Drill-in.** Each box that has a child diagram shows a small **magnifier icon in its top-left corner**, with a count of child objects. Clicking it changes the diagram: the canvas goes **blank for a moment, then the new diagram fades in** and the camera fits it. The breadcrumb changes to the new diagram's name with a level icon.
3. **Child (app) diagram.** The system the user drilled into becomes a **large boundary box** with its logo and name in the top-left. A second boundary groups the cloud provider's services. Edges are **smooth curves**. Each label is a small rounded pill with a darker fill; a second, smaller line gives the technology or protocol.
4. **Select a service.** The camera **pans and zooms** to the selected box (motion blur during the move). A details panel **slides in from the right**. Everything not connected to the selection is **dimmed to roughly 15–20% opacity**. Connected edges turn **cyan/teal**, and a short bright **"comet" glow travels along each highlighted edge** toward the target, showing direction. The selected box gets a cyan outline with small handles.
5. **Hover on a boundary.** A popover lists the parent levels ("Level 1 - Context diagram", "Context · Back"), so you can go up without the breadcrumb.

Chrome in the video (all floating over a full-bleed canvas):
- Top-left bar: home, back/forward, "Diagrams", current diagram (level icon + name), "Drafts" dropdown.
- Top-right bar: search (⌘K), comment count, help, presence avatars, Share, export.
- Under the top bar: "Flows (2)" dropdown and a camera button ("Reset camera" = fit view).
- Slim left rail: "+" (add) and comments.
- Bottom-left: overlay tabs (Tags · Technology · Status · Teams), and under them the tag groups as chips with counts (Hostnames 21 · Region 3 · Accessibility 2 · New group).

### 1.2 Interactive diagram viewer (web page with four diagram tabs)

[Observed] **How it is built.** The page's "interactive diagrams" are not standalone page code. Each tab sets the `src` of one `<iframe>` to a **public read-only share link of the product itself**. The tabs are Microservice, Event-based, Deployment and Network, plus Full screen. The marketing page's own scripts only switch tabs and play Lottie animations for the hero and feature cards. So there is no separate source code to copy. The behaviour lives in the vendor's proprietary, minified app, and copying it would not be appropriate anyway. [Proposal] Rebuild the behaviours below with our own stack (React 19 + @xyflow/react + ELK), which already supports everything listed. A "share a read-only interactive view" feature is close to our planned static HTML export (DEC-024).

[Observed] viewer features (the viewer uses a light theme; the editor in the video is dark):
- **Coloured diagram-type tabs.** Each type has its own hue and icon: microservice teal, event-based amber, deployment green, network indigo. Inactive tabs are a dim tint; the active tab is a brighter fill with a border.
- **First-run hint card.** A "Drill in/out for details" card with a short looping preview, plus a **pulsing cyan circle** on the magnifier icon of one real box on the diagram. Closed with ×.
- **Hover on a box:** a thin cyan border. No layout shift.
- **Select a box:** the same dimming and cyan path as in the video. The right panel has **Details / Connections** tabs (History too in the editor). Fields: Type, Scope (Internal), Belongs to (with parent icon), Status pill ("● Live"), Contains (n objects), In groups (+ add), **Diagrams: "In 4 diagrams" with a jump arrow**, **Flows: "In 22 flows"**, Tags (coloured chips with icons, "+1" overflow), Technology (one row per technology with its logo, expandable), Links, Detailed description.
- **Select a connection:** Sender, Receiver (with icons), Status, Direction (Outgoing), Shape (Curved), **Label position** (a slider along a mini arrow), Diagrams, Flows, Tags, Technology, Links, Detailed description.
- **Technology overlay:** a bar of chips, one per technology, each with its **brand colour, logo and usage count** (Cloud Run 5, TypeScript 5, Node 4, …). Each box gets a **thin multi-coloured strip along its bottom edge**, one segment per technology. Hovering a chip opens a small menu: **Focus** (dim everything else) and **Hide**. A pin icon keeps the bar open.
- **Status overlay:** chips **Live (dark), Future (purple, dashed-circle icon), Deprecated (orange), Removed (red)**, each with a count. Each box gets a bottom strip in its status colour.
- **Tag-group overlay:** the same pattern. Deployment groups draw a **coloured top border** on group boxes, for example green for the VPC and orange for each Kubernetes service group.
- **Flows:** the dropdown lists each flow with its step count ("Authentication · 9 steps"). Playing a flow:
  - a panel with View · "Step 3 of 7" (a dropdown to jump), Restart / Back / Next;
  - a card with the step text, its type ("→ Message"), and "Auth provider **To** API service" with icons;
  - the **camera zooms to the step's sender and receiver**, which get a **cyan fill**; the active edge is drawn **bold** and everything else is dimmed;
  - edge labels are **numbered by step** ("2. Verify email…", "3. Respond with JSON web token"). When several steps use the same edge, their numbered lines **stack in one label**.
- **Event-based diagrams** show the intermediary on the label: "Sends vital sign data to · via ⟨icon⟩ Vital topic". This matches our connectors.
- **Deployment diagrams** nest groups (VPC → namespace → cluster → service), each with a coloured top border and provider logo.
- The "camera" button only resets the view (fit).

### 1.3 What makes the reference tool *not* simple (observed, with our interpretation)

- [Observed] Context diagrams get **dense quickly**. In the video, about 30 curved edges cross one another, and label pills sit on top of other edges.
- [Observed] Box footers (`App: Cloud Run, Node, REST`) and edge technology lines are about **6–7 px at the default fit**, unreadable without zooming.
- [Observed] Dimmed items fall to such low contrast that you **lose context** of where the selection sits.
- [Observed] Two stacked bottom bars (overlay tabs, then tag-group chips), plus top-left, top-right, flows and left-rail bars. That is **six floating bars** competing at the canvas edges.
- [Observed] Long technology lists wrap into two chip rows. The tag list uses "+1" overflow, so information is hidden behind a click.
- [Observed] The magnifier drill-in icon is tiny (about 10 px) and needs a hint card to be discovered.
- [Observed] Selecting one connection gives the same full panel as a box, with many empty "No tags / No technologies / No links" rows.
- [Proposal] Lessons for us: keep labels readable at fit (minimum zoom or level-of-detail rendering); dim to about 30–35%, not about 15%; put overlays and legends in **one** bottom bar; hide empty fields in panels; make drill-in a large, obvious target.

---

## 2. designPerspectives today: friction points (observed)

Screens checked: landscape, context, containers (Internet Banking System), components (API Application), code (Sign In Controller), selection and context menu. Relevant files: `ui/src/App.tsx`, `Canvas.tsx`, `canvasParts.tsx`, `shapes.tsx`, `ObjectPanel.tsx`, `Palette.tsx`, `Sidebar.tsx`, `Dock.tsx`, `styles.css`.

| # | Friction [Observed] | Why it hurts | Direction [Proposal] |
|---|---|---|---|
| F1 | **Canvas is squeezed by three permanent columns**: left sidebar (~250 px: diagram tree, drafts, lenses, tag groups, ratings), right panel (~320 px, always open even with nothing selected), plus floating bars. On 1600 px the canvas gets about 1000 px. | The diagram is the product, but it gets the least space. | Make the left sidebar collapsible and collapsed by default after first use (it has a toggle already). **Owner: the right panel can be minimised.** Add a minimise control (and a shortcut, for example `]`) that folds it into a ~40 px rail of icon tabs (Details, Connections, Changes). Clicking a tab or selecting an object while minimised opens it as an overlay drawer, so the canvas keeps its width. Remember the state per browser (`localStorage`, like the active lens, DEC-011). Animate with width/transform (180 ms). Move "diagram summary" (objects, connections, cost) into a small header chip or the empty-selection state. |
| F2 | **Text unreadable at fit** on tall diagrams. The containers diagram fits at roughly 40% zoom; box names are ~6 px and descriptions ~4 px. | You cannot tell what the diagram shows without zooming. Fails goal 2. | ELK layout that prefers a landscape aspect ratio for a landscape viewport; a minimum fit zoom (for example 0.6) with scrolling past it; **level-of-detail** rendering: below about 0.5 zoom show only icon + name in large text and hide badges and descriptions. |
| F3 | **The Add palette is open by default** and covers ~170×500 px of the canvas's left side on every diagram. | It hides diagram content and adds noise when you only want to read. | Collapse it to a slim left rail with "+" (opens the palette as a popover), as in the reference. Keep drag-from-palette. Also show **"+" handles on the hovered box** to add a connected box (we have drag-from-dot already; make it visible). |
| F4 | **Selection does not show relationships.** Selecting a box gives orange corner handles and a floating toolbar; nothing else changes. Dimming exists only for flows and overlay focus (`Canvas.tsx:216`, `:286`). | "What talks to this?" is the most common question, and the canvas does not answer it. | **Selection focus**: dim non-neighbours to ~30%, colour connected edges with the accent (incoming vs outgoing in two tints), and run a moving glow along them. See §4. |
| F5 | **Box cards are overloaded**: cost badge (`$1,210/mo`), characteristic stars, "1 security · 1 other", "Sensitive: confidential", "Used hourly", "Notes", "Tradeoffs 1", "Code", "1 open". | Every box looks equally busy, so nothing stands out; it is hard to scan. | Default card = symbol/logo + name + one-line description + small "kind · technology" footer. Move cost, ratings, sensitivity, notes and trade-offs **into overlays** (they already exist in the Dock) or into one compact "●3" indicator that expands on hover. |
| F6 | **Selected-object panel is a long edit form**: name, description, symbol, technology, owner, tags, then many characteristics, each with stars, a "Driving" toggle, × and a rationale input. | Reading is hard and editing is spread out. It feels like a settings page rather than a diagram. | Tabs **Details · Connections · History (changes)**, as observed. Details is read-first with **click-to-edit** fields. Hide empty fields behind "+ Add …". Add cross-reference rows: "In N diagrams →", "In N flows →", "Contains N". Characteristics collapsed to a summary row ("6 rated · 3 driving"). |
| F7 | **Breadcrumb truncates** every ancestor ("Land…", "Inter…", "API …") and repeats "C1/C2/C3/C4" badges. | You cannot read where you are. | Show the **current diagram in full**. Ancestors collapse to a "…" menu or appear on hover. Keep one level badge. Add the observed boundary-hover popover ("Up to Context diagram"). |
| F8 | Landscape shows a yellow banner: **"This level is not in the Engineer lens."** | It reads as an error and doesn't say what to do. | Replace it with a neutral chip, "Outside this lens · Show anyway / Switch lens". |
| F9 | **Edges are straight and cross boxes and labels.** Label pills are tiny and sometimes overlap (for example "Makes API calls to" ×3 stacked on the components diagram). | The diagram is hard to follow. | Curved (bezier) or rounded-orthogonal routing from ELK. Labels: larger pill, description on line 1, technology on line 2 in a muted mono font. Collision nudging. When parallel edges share a pair, merge them into one label with stacked lines. |
| F10 | **Drill-in is hidden**: double-click, the toolbar's "Open", the context menu or the sidebar tree. The only visual hint is a tiny "⌕ 6" on some boxes. | Users don't discover that boxes open into more detail, which is the core C4 idea. | A clear **drill badge** (magnifier + child count) in the top-left corner of every box that has a child diagram, hover-highlighted, with a one-time hint card and a pulsing hotspot (see §4). |
| F11 | **Changing diagrams is an instant swap.** | You lose your sense of where you are. | Animated **zoom-into-box → cross-fade → fit** (see §4). Going up is the reverse. |
| F12 | **Little colour**: every box is the same dark grey; only one custom style (ATM, purple fill) stands out. The accent cyan is used only for flows and links. | It's flat and hard to scan, and there's no visual "ours vs external" cue. | See §3: real technology logos, coloured chrome (§3.2), external systems in a lighter neutral, coloured group headers, overlay strips. |
| F13 | **The code level (C4) is read-mostly**: boxes are files mapped by path, edges are only scanned "imports", the right panel is a path list, and there's no Add palette. | It fails goal 4. You cannot sketch classes or interfaces, or draw a "calls" or "implements" relationship by hand. | See §5. |
| F14 | **Floating selection toolbar** (symbol select, Open, copy, ×) sits right above the selected box and covers neighbours and edge labels. | It gets in the way while reading the selection's connections. | Show it on hover with a short delay, or dock it at the top of the right panel. Keep the right-click menu (it is good and complete). |
| F15 | Two colour systems compete: orange selection handles vs cyan accent. | It looks inconsistent. | Use the accent for selection everywhere; keep orange/amber for warnings and "changed". |

---

## 3. Colour: more colour without noise [Proposal]

### 3.1 On the diagram

Principle (owner: "colour comes from overlay"): on the canvas, colour **carries meaning** (overlay value, status, change, selection), never decoration. Box fills stay neutral, so when an overlay is on, its colours are the loudest thing on the canvas. The exceptions are the **real technology logos** (§3.3), which add natural colour, and the accent for selection and flows.

**Base tokens** (extend `:root` in `ui/src/styles.css`; current accent `#5ee1f5` stays):

| Token | Value | Use |
|---|---|---|
| `--accent` | `#5ee1f5` (cyan) | selection, focus path, drill badge, current flow step |
| `--accent-2` | `#a78bfa` (violet) | incoming edges during selection focus; people |
| `--ok` | `#34d399` (green) | Live status, success toasts, "added" in changes |
| `--plan` | `#c084fc` (purple, dashed) | Planned/Future status |
| `--warn` | `#f59e0b` (amber; already `--amber`) | Deprecated, "changed" in changes |
| `--bad` | `#f87171` (red; already `--danger`) | Removed, errors |
| `--node-internal` | `#1d2025` fill, `#3d424a` border | our systems/containers/components |
| `--node-external` | `#2a2e35` fill, `#4a505a` border | external systems (lighter, as observed) |
| `--node-person` | `#181a1e` fill + violet avatar ring | people |

**Kinds on the diagram**: shown by the symbol (shape and icon), not by colour, because colour belongs to overlays. Internal vs external is shown by fill lightness (`--node-external`), as observed.

**Technology colour**: each technology's brand colour comes with its logo (§3.3), with a hashed fallback hue for unknown ones. Use it for technology chips, the technology-overlay strip along the bottom of each box, and the legend.

**Groups and boundaries**: a coloured **top border (3 px) and header icon**. The colour comes from the group's tag or kind. The fill stays a very subtle translucent tint (about 4%).

**Overlays** (`ui/src/overlays.ts`, `Dock.tsx`): keep the current scales. Render the overlay value as a **bottom strip on each box**, segmented when there are several values (technology), plus the legend chips with counts and a Focus/Hide menu. This replaces recolouring the whole box, so the box stays readable.

Accessibility: never use colour alone; pair it with an icon or label (as the status chips observed do). Check contrast of text on tinted fills (≥ 4.5:1). Keep the existing red→green scale's lightness steps.

### 3.2 Around the diagram: menus, options, navigation, creating objects

[Observed] in our app: the sidebar, palette, context menu, Dock, flow menu, breadcrumb and panels are all grey text on grey (`--panel #181a1e`, `--float #1d2025`, `--raise #24282e`). Links are the only blue, and icons are monochrome line icons at text colour. Section headers (DIAGRAMS, DRAFTS, LENSES, TAG GROUPS, RATINGS AND COST) are identical small grey caps. The palette's 16 "Add" items are identical grey rows. Nothing tells you at a glance which area you are in or what an item creates.

[Proposal] One **category hue system**, used only in the chrome. It is distinct from overlay colours, because overlays recolour the canvas and the chrome must not be confused with them.

| Area / concept | Hue | Where it shows |
|---|---|---|
| Diagrams / navigation | cyan `#5ee1f5` (accent) | breadcrumb current item, active tree row, back/forward hover, C-level badges as solid tinted chips: C1 cyan, C2 sky `#60a5fa`, C3 indigo `#818cf8`, C4 violet `#c084fc` (a stepped ramp that also teaches "deeper = more detail") |
| People | violet `#a78bfa` | palette "Person" tile, person icon |
| Systems / containers / components | teal `#2dd4bf`, sky `#60a5fa`, indigo `#818cf8` | palette tiles and icons; the panel header strip for the selected object's kind |
| Data stores, queues, files | amber `#fbbf24`, pink `#f472b6`, slate `#94a3b8` | palette tiles and icons |
| Code items (C4) | violet `#c084fc` with sub-tints per kind (function, class, interface) | code palette, code panel |
| Drafts / changes | green `#34d399` added, amber `#f59e0b` changed, red `#f87171` removed | draft strip, changes list, apply dialog |
| Lenses | **no per-lens colour** (owner, 2026-11-14); lenses use the neutral chrome with the eye icon tinted in the accent | lens picker, sidebar list |
| Flows | orange `#fb923c` | Flows button, flow player, step numbers |
| Tag groups | their own value colours (already defined) | sidebar dots, Dock chips |
| Danger | red | delete items, destructive confirm buttons |

Concrete treatments:
- **Icons are coloured**: tinted with their category hue at full saturation, on a 24 px rounded tile with the same hue at 14% alpha. The labels stay neutral text, so the colour is in the icon tile, not the words.
- **Add palette becomes a tile grid** (2–3 columns), grouped under small headers ("People & systems", "Runtime", "Data", "Code"). Each tile has a coloured icon and its name. Hovering lifts the tile and shows a one-line description ("Database: stores data; shown as a cylinder"). Dragging shows a ghost preview of the real box. After a drop, the new box appears with the add animation and name editing.
- **Quick-create** (`N` key, or double-click empty canvas): a small command popover with a search field and the same coloured tiles, plus "connect to selected" when something is selected.
- **Section headers** in the sidebar get a coloured 2 px left bar and an icon in the section's hue. Counts become small tinted pills.
- **Context menu**: coloured icons per group (navigate cyan, edit neutral, style violet, danger red) and a coloured hover row (hue at 10% alpha) instead of grey.
- **Buttons**: primary actions (Apply draft, Add, Save) are filled with the accent and dark text; secondary stay outlined. Today every button looks the same.
- **Search (⌘K)**: results grouped by kind, each with its coloured icon tile and level badge.
- **Panels**: the selected object's panel header has a 3 px top strip in the kind hue, the kind icon tile, and the level badge. Tabs show the active tab with an accent underline that slides between tabs (150 ms).
- **Empty states and hints**: a small coloured illustration icon plus one action button, instead of grey sentences.
- **Focus rings**: 2 px accent at 60% alpha everywhere (keyboard users).

Keep it subtle: hues appear in icon tiles, strips, dots and badges (small areas). Large surfaces stay dark neutral. Add the hues as tokens next to the base tokens; never hard-code them in components.

### 3.3 Technology logos (owner: use the real logos)

[Observed, checked 2026-11-14] two open sets, used together, cover every technology in the demo model:
- **Simple Icons** (`simple-icons` on npm, **CC0-1.0**): single-path SVGs plus each brand's official hex colour. Pin **16.36.0** (16.37.0 is under two weeks old). It has: openjdk, kotlin, typescript, javascript, python, postgresql, apachekafka, angular, spring, snowflake, apacheairflow, go, rust, dotnet, ruby, php, react, vuedotjs, fastapi, django, flask, nodedotjs, express, mysql, mongodb, redis, docker, kubernetes, googlecloud, graphql, nginx, rabbitmq. **Missing** (removed at the brand owners' request): Java, C#, Oracle, SQL Server, Xamarin, AWS, Azure.
- **Devicon** (`devicon` on npm, **MIT**): multi-colour SVGs. Pin **2.17.0** (2.18.0 is under three weeks old; that is acceptable, but older is safer). It has the missing ones: `java-original`, `csharp-original`, `oracle-original`, `microsoftsqlserver-original`, `xamarin-original`, `amazonwebservices-original-wordmark`, `azure-original`.

[Proposal] How to use them:
- **Do not fetch at runtime** (the app is local and offline). Add a script, `scripts/fetch-logos.ts`, that copies the chosen SVGs from the pinned packages (devDependencies) into `ui/src/logos/` and writes a generated `logos.ts` map: `{ id, aliases: ["Node.js", "NodeJS", "node"], svg, color, source, licence }`. Commit the generated files, like `static/`. Only bundle icons we map, not whole packages.
- **Matching**: technology names are free-text tags (`ops.ts`: technology is a tag list). Match case-insensitively on normalised names plus an alias list ("Spring MVC", "Spring Bean", "Spring Boot" → spring; "Oracle Database Schema" → oracle; "JSON/HTTPS" → no logo). No match falls back to a coloured letter tile (first letter, hashed hue).
- **Which logo a box shows**: the first technology that has a logo, in tag order. The user can pin a different one, or a custom icon, through the existing style (`styles` in the sidecar). Show the logo in the card's top-left, replacing the generic symbol icon. Keep the C4 symbol shape (cylinder, queue, person, …).
- **Dark theme**: render single-colour Simple Icons in their brand hex. When the hex is too dark on `#1d2025` (contrast below 3:1; measured: Apache Kafka `#231F20` 1.0:1, Django `#092E20` 1.1:1, Express `#0A0A0A` 1.2:1, Rust `#000000` 1.3:1; fine: Go 6.2:1, Flask 6.1:1, Snowflake 6.9:1, Kotlin 3.5:1), render white at 90% instead. Devicon multi-colour SVGs render as they are.
- **Where logos appear**: box cards, technology chips (panel and Dock legend), technology picker suggestions, search results and edge labels (protocol logos when known, e.g. Kafka).
- **Licences and trademarks**: CC0 and MIT cover the files. The marks stay their owners' trademarks; using a logo to identify the technology is the normal, intended use of these sets. Add both sets to `NOTICE` with their licences, and follow each set's disclaimer (no modification of the marks beyond colour for contrast).

### 3.4 Box cards (owner: assistant decides)

[Proposal, decided under owner delegation; record as a DEC] Three levels of detail, chosen by zoom, so a card is never both tiny and busy:

| Zoom | Card shows |
|---|---|
| ≥ 0.9 (reading) | logo/icon tile · **name** (14 px semibold) · description, one or two lines (11 px muted) · footer: kind + technologies as mini logo chips · drill badge (magnifier + child count) top-left · **one indicator row** (see below) |
| 0.5–0.9 (overview) | logo · name (larger relative to box) · kind/tech footer · drill badge; description hidden |
| < 0.5 (map) | logo + name only, enlarged to stay ≥ 10 px on screen; boxes become solid tiles |

**Indicator row** (one line, at most 4 small icons, only when there is something to show): cost as `$` with a coloured dot for the band; ratings as a "★ 3 driving" mini pill; sensitivity as a shield icon in its level colour; notes/trade-offs/open work as a single "●2" badge. Hovering an icon shows the detail in a tooltip; clicking opens that section in the panel. The full values move to **overlays** (cost, characteristics, work, sensitivity), where they recolour the bottom strip.

Other rules: fixed card widths per level (avoid ragged layouts); names wrap to two lines, then ellipsis with a full-name tooltip; external systems use the lighter fill; people use a compact card with an avatar circle; groups and boundaries get a header row with icon, name and child count. A selected card gets an accent outline (not orange handles); resize handles show only on hover of a selected card.

---

## 4. Subtle animation spec [Proposal]

Rules: 120–250 ms for UI and 300–450 ms for camera moves; `cubic-bezier(0.2, 0, 0, 1)` (ease-out) on enter and ease-in on exit; animate only `opacity`/`transform`/`stroke-dashoffset`; everything off under `@media (prefers-reduced-motion: reduce)` (camera moves become instant). Today `styles.css` has only two transitions (`background 0.1s`, `opacity 0.1s`), and `Canvas.tsx` uses `fitView`/`zoomIn` durations of 150–300 ms.

| Moment | Animation | How (React Flow / CSS) |
|---|---|---|
| Hover a box | Border to accent at 50% alpha, shadow lifts 0→6 px, 120 ms. Drill badge and "+" handles fade in. | CSS on `.c4-node:hover`; no transform on the node (avoid layout jitter). |
| Select a box | Non-neighbours fade to 0.3 opacity (150 ms). Connected edges recolour (outgoing cyan, incoming violet). A **moving glow** (owner: yes) runs along each connected edge in its direction: a ~40 px soft bright segment, 900 ms per pass, then a 1.2 s pause, repeating while the selection lasts. It stops on deselect, and under reduced motion it becomes a static brighter stroke. The right panel slides in (`translateX(16px)→0` + opacity, 180 ms). | Compute the neighbour set in `Canvas.tsx` next to the existing `dimmed` logic. Glow: in the custom edge (`canvasParts.tsx`), an SVG `<circle>` with `<animateMotion path=…>` or a short gradient dash animated via `stroke-dashoffset`. |
| Select an edge | The edge thickens (1.5→2.5 px), its two end boxes stay full opacity, everything else dims; the label pill gets the accent border. | Same mechanism. |
| Drill into a box | Camera zooms toward the box (`setCenter(x, y, {zoom: current×2.5, duration: 280})`), the canvas fades to 0 (120 ms), the child diagram loads, fades in (160 ms), then `fitView({duration: 300})`. Going up is the reverse: start zoomed on the parent boundary, then fit. | Wrap the navigation in `App.tsx` with a small transition state; keep URL/hash and back/forward unchanged. |
| Add a box | Scale 0.96→1 + opacity 0→1, 140 ms; the new box is selected with its name in edit mode. | CSS class on new node ids for one frame. |
| Delete | Fade + scale to 0.96, 120 ms, then remove; an **Undo toast** slides up from the bottom (undo exists already). | |
| Connect (drag from a dot) | The connection line uses the accent with an animated dash while dragging; the target box border pulses once when hovered as a valid target. | `connectionLineStyle`, CSS on the valid-target class. |
| Flow playback | The camera fits the current step's two boxes (400 ms). The active edge has a moving dash (direction), sender and receiver get an accent tint fill, past steps are a muted solid line, and step numbers show on labels. | Extend the existing `highlight: "current" | "past"` in `canvasParts.tsx`. |
| Overlay on/off | The bottom strips grow `scaleX(0→1)` from the left, 200 ms; legend chips fade in staggered by 20 ms. | |
| Draft/compare changes | Added items pulse a green ring once; removed "ghosts" fade to their dotted style. | Existing `change`/`ghost` flags. |
| First-run hint | A pulsing ring (scale 1→1.6, opacity 0.6→0, 1.6 s loop, 3 loops max) on one box's drill badge, plus a dismissible hint card. Remembered in `localStorage`. | |

---

## 5. Code level (C4): see the code, calls, data flow and I/O; add things by hand

### 5.1 Today [Observed]

`code-<id>` diagrams (`src/core/diagrams.ts`, `src/core/code.ts`) show one box per **file mapped** to a component or connector (`dp.code.paths`) and one **"imports"** line per import found by a scan. Python uses a small tokenizer in TypeScript; JS/TS uses a regex. Boxes show the file name, folder and line count. Double-clicking a file opens it in a plain `<textarea>` editor (`ui/src/CodeParts.tsx`). The right panel lists mapped paths with Add/Browse. There is no Add palette on this level, no hand-drawn edges, no functions or classes, and no inputs or outputs. Structurizr has **no code-level element type** (its model stops at components). Server deps: hono, commander. UI deps: @xyflow/react, elkjs, html-to-image, react.

### 5.2 What the owner wants

1. See the **internal code** of a file from the diagram.
2. See **which functions are called from which files**.
3. See when **the output of file A is the input of file B**.
4. See each file's **inputs, outputs and other relevant info**.
5. Still be able to **add things and relationships** by hand (the first request).

### 5.3 Design [Proposal]

**Two layers on one diagram.**
- **Scanned layer** (derived, read-only, recomputed on every load, never stored, like today's imports, DEC-010): files, the symbols in them, calls, data flow and I/O.
- **Hand layer** (stored): items and links the user adds, kept in `dp.*` properties on the component or connector. This is option A from the first draft: `dp.code.items` `[{id, name, kind: function | class | interface | module | table | file | artefact, file?, symbol?, description?}]` and `dp.code.links` `[{from, to, kind: calls | dataflow | implements | extends | uses | reads | writes, description?}]`. `from`/`to` can point to a scanned symbol (`path#symbol`), a scanned file (`path`) or a hand item id. So the user can annotate the real code, or sketch code that doesn't exist yet. `units.ts` must flatten each item and link into its own unit, so diff, drafts, merge and the changes overlay work per item.

**What the scan extracts** (deterministic, no LLM; everything in TypeScript):

| Fact | Python | JS/TS | Shown as |
|---|---|---|---|
| Symbols: functions, classes, methods, with parameters, type hints/annotations, defaults, return type, first docstring/JSDoc line, line range, exported or private | `def`, `async def`, `class`, `__all__`, leading `_` | `function`, arrow consts, `class`, `export` | rows inside the file box |
| **Calls across files** | `from a import f` + `f(...)`, `import a` + `a.f(...)`, `a.Cls().m(...)` (simple cases) | named/default/namespace imports + call sites | **"calls" edge** from caller row to callee row, labelled `f()`, with ×N call-site count |
| **Output of A → input of B** | inside one function: `x = a.load(...)` then `b.save(x)`, or nested `b.save(a.load())`. Simple variable tracking within a function, no aliasing across functions | the same | **data-flow edge** A.load → B.save, labelled with the variable/type ("orders: list[Order]"), with the file where the hand-off happens as "via c.py" |
| **Shared artefacts** (A writes what B reads) | string literals in `open(p, "w")`/`open(p)`, `to_csv`/`read_csv`, `INSERT INTO t`/`FROM t`, `producer.send("topic")`/`subscribe("topic")`, `os.environ["X"]` | `fs.writeFile`/`readFile`, `fetch("/api/x")` vs route definitions `app.get("/api/x")`, `process.env.X` | a small **artefact pill node** (file, table, topic, route, env var) between writer and reader, like our connectors |
| **File I/O summary** | from the facts above | the same | the file's **Inputs / Outputs** section (below) |

Every scanned fact carries **confidence**: `exact` (a resolved import plus a call), `likely` (name match only) or `literal` (string-literal artefact match). Only `exact` facts draw by default; a "Show likely links" toggle adds the rest, drawn dashed. Unresolvable dynamic calls are ignored. That is a stated limit, not a bug.

**Parser choice (trade-off; needs a DEC):**
- **(i) Extend our own tokenizer/regex.** No new dependency. Python is feasible for `def`/`class`/calls. Data flow and JS/TS become fragile regex.
- **(ii) `web-tree-sitter` (MIT, WASM) with the Python and TypeScript grammars.** One engine and query files per language, and Java/Go/Kotlin are easy to add later. Cost: about 0.3 MB of runtime plus about 1–2 MB of grammar `.wasm` per language in the npm package. WASM is not "other-language code" we write, so the TypeScript-only rule holds.
- **(iii) The TypeScript compiler API for JS/TS** (the best accuracy for TS) plus (i) for Python. Cost: `typescript` becomes a runtime dependency (~9 MB).
- **Decided: (ii) `web-tree-sitter`** (assistant's judgement under owner delegation, 2026-11-14; record as a DEC). One mechanism, multi-language, and fast enough to run on load with the `MAX_FILES` limit and a cache keyed by file sha1 (`codefs.ts` already has `sha1`). Start with the Python and TypeScript/JavaScript grammars, and keep the current import scan as the fallback when a grammar fails to load. Pin `web-tree-sitter` and the grammar packages to exact versions at least two weeks old. Load the `.wasm` files from the package directory on the server (the scan runs server-side), never from a CDN. Trade-off accepted: a larger npm package (a few MB) for accuracy and a path to more languages.

**UI on the code level:**
- **File box (collapsed)**: language logo (§3.3) · file name · folder · counts chip "6 ƒ · 2 in · 3 out" · lines. Collapsed is the default when there are more than 8 files.
- **File box (expanded, click the chevron)**: a list of exported symbols, one row each: kind icon (ƒ function, ◆ class, ◇ interface), `name(params) → return`, and the first docstring line on hover. Each row has its own connection handles, so call and data-flow edges attach **to the function**, not just the file. Private symbols are behind "+ 4 private".
- **Edge kinds** are distinguished by line style plus a small glyph (colour stays for overlays and selection): imports thin grey; **calls** solid with an arrow and ƒ glyph; **data flow** thicker, with a **continuous slow moving glow** in its direction (owner: yes; dimmer and slower than the selection glow, about 2.5 s per pass, static under reduced motion) and a ⇢ glyph; artefact links pass through the artefact pill; hand links have a pencil glyph. A "Code links" legend in the Dock toggles each kind; a **"Code" overlay** colours by kind when wanted.
- **Selecting a function row** applies the selection focus (§4) at symbol level: callers and callees light up, everything else dims, and the panel shows "Called by (3) / Calls (5) / Data in / Data out".
- **Selecting an edge** shows its **call sites** in the panel: `b.py:42` with a two-line code snippet. Clicking one opens the code at that line.
- **Internal code view**: a **Code** tab in the right panel (or a split view on a wide screen). It is read-only by default, with syntax highlighting, line numbers, the selected symbol's range highlighted, and **clickable call sites** that jump on the diagram to the callee row. "Edit" switches to the existing editor (planned edits in drafts keep working). Highlighter trade-off: CodeMirror 6 gives editing and highlighting in one (~150 KB gz, MIT) and replaces the textarea; `highlight.js` with a few languages is a read-only view (~40 KB) with the textarea kept. **Decided: CodeMirror 6** (assistant's judgement under owner delegation, 2026-11-14; record as a DEC). It replaces the `<textarea>` in `CodeParts.tsx` with one component for both the read-only view and editing. Use the Python and JavaScript/TypeScript language packages and a dark theme built from our tokens, with the selected symbol's range and call sites as decorations. Trade-off accepted: about 150 KB gzipped in the UI bundle.
- **File "info" section** (panel, Details tab): Inputs (parameters of exported functions with types, env vars, files/tables/topics/routes read, CLI args); Outputs (return types, files/tables/topics written, routes served, events emitted); Exports; Imported by (N files); Imports (N files); Lines; last git change (author/date via `git.ts`, optional); test file (a `test_x.py` / `x.test.ts` naming match).
- **Adding by hand**: the code-level palette has the coloured tiles from §3.2 (Function, Class, Interface, Module, Table, Artefact, File). Drag from any row or box handle to another to create a link, then pick its kind (calls, data flow, implements, extends, uses, reads, writes) in a small popover. Hand items that later match a scanned symbol (same file + name) show a "found in code ✓" badge. Hand links the scan contradicts (no call found) show a muted "not found in code" badge. That is the hook for future drift reports (Stage B stays in the Future stage, DEC-026).

**Backend shape:** a new `src/core/codescan.ts` (symbols, calls, data flow, artefacts; pure functions over `CodeSource`, so drafts and git refs work, DEC-017/018); `code.ts` builds the richer diagram; `src/shared/types.ts` gets `CodeSymbol`, `CodeLink`, `CodeIO` on the code diagram response; hand-layer edits are new ops in `ops.ts` (add/rename/remove item, add/remove link; ids unique per component; link ends must exist or be scanned refs) with thin routes in `server/app.ts`. Tests: fixture code folders under `tests/` for each fact type, Python and TS.

**What makes this not simple (risks):** static analysis is incomplete (dynamic dispatch, dependency injection, decorators, `getattr`), so be explicit in the UI about "exact vs likely". Large files produce many rows, so collapse by default and lazy-expand. Edges between rows multiply quickly, so bundle edges between the same two files into one with ×N until expanded.

---

## 6. Prioritised backlog for the UI session [Proposal]

Ordered by impact on goals 1–2 vs effort. Each item should be checked in the running app (`npm run dp -- serve`, `ui: npm run dev`) and covered by e2e where it changes behaviour. Record the owner answers and the decisions marked "needs a DEC" in `docs/decisions.md` first.

1. **Selection focus** (F4): dim non-neighbours and colour in/out edges, plus the moving glow. Highest value for "quickly understand".
2. **Canvas space** (F1, F3, F14): **minimisable right panel** (rail + drawer, remembered); the Add palette collapses to a "+" rail; the sidebar is collapsible.
3. **Box cards and level of detail** (F2, F5, §3.4).
4. **Chrome colour** (§3.2): tokens, coloured icon tiles, the palette as a tile grid, quick-create, sidebar headers, context menu, primary buttons, panel header strip.
5. **Technology logos** (§3.3): fetch script, generated map, matching, contrast handling, NOTICE.
6. **Drill-in affordance and transition** (F10, F11): corner badge, zoom/fade transition, first-run hint.
7. **Edges** (F9): curved routing, two-line label pills, merged parallel labels.
8. **Panel redesign** (F6): Details/Connections/History tabs, click-to-edit, hidden empty fields, "In N diagrams / flows" links.
9. **Code level** (F13, §5), in steps: (a) code view tab plus file info from existing data; (b) the symbol scan and expanded file rows; (c) calls; (d) data flow and artefacts; (e) the hand layer with the code palette.
10. **Breadcrumb and lens banner** (F7, F8).
11. **Flow player polish**: camera follows each step, step numbers stacked on labels, sender/receiver tint.

Out of scope or not applicable (observed in the reference): live presence avatars, comments and Share. The app is local and single-user (DEC-001/DEC-006); read-only serve and static export cover sharing (DEC-024).

---

## 7. Open questions for the owner

All answered (2026-11-14). Record each as a DEC entry in `docs/decisions.md` before building:

| Question | Answer | Decided by |
|---|---|---|
| Code level scope | See code, calls, data flow (A's output → B's input), per-file I/O; hand-added items and links | Owner |
| Where diagram colour comes from | Overlays (plus real logos and the selection accent); the chrome gets a category hue system (§3.2) | Owner |
| Technology logos | Real logos from Simple Icons (CC0) + Devicon (MIT), bundled offline (§3.3) | Owner (sets chosen by assistant) |
| Right panel | Minimisable to an icon rail / drawer, remembered per browser | Owner |
| Box cards | Three zoom-based levels of detail + one indicator row; details move to overlays (§3.4) | Assistant (delegated) |
| Code parser | `web-tree-sitter`, Python + TS/JS first, current import scan as fallback (§5.3) | Assistant (delegated) |
| Code view/editor | CodeMirror 6, replacing the textarea (§5.3) | Assistant (delegated) |
| Moving glow | Yes: repeating glow on the selection's edges; continuous slow glow on code-level data-flow edges; static under reduced motion (§4, §5.3) | Owner |
| Per-lens colour | No | Owner |

No questions are open. Raise new ones only if building reveals a conflict with an existing DEC.
