# Notes — *The C4 Model: Visualizing Software Architecture* (Simon Brown, O'Reilly, 1st ed. 2026)

> Purpose: chapter-by-chapter notes for designing **designPerspectives**. Notes are paraphrased; short quotes are marked with quotation marks. Page numbers are the book's printed page numbers.
> Each chapter ends with **→ designPerspectives:** implications. Those lines are my interpretation, not the author's.

---

## Preface (p. ix–xii)
- C4 is for describing and communicating architecture both in **up-front design sessions** and when **documenting an existing codebase** retrospectively. Analogy: "maps of your code" you can zoom like an online map.
- Primary audience: architects, tech leads, engineers. Secondary: solution/enterprise architects, infrastructure engineers, testers, technical writers.
- Short-path reading order if in a hurry: Ch.1, 2, 3, 4, 8, 10.

**→ designPerspectives:** both directions (design and documentation of existing code) are legitimate C4 uses; supports the "Design" + "Understand" modes.

## Ch.1 A Failure to Communicate (p.1–13)
- Architecture definition used (Booch): significant decisions, where significance is measured by **cost of change** (p.2).
- What's expensive to change falls into three themes (p.2–3):
  - **Technology** (languages, frameworks, deployment targets)
  - **Elements** (decomposition: monolith vs microservices, package-by-layer vs package-by-feature; data schemas/formats)
  - **Relationships** (sync vs async, protocols, data formats)
- Diagrams should communicate the **outcome of decisions** across these themes, reflecting both team choices and organisational constraints (skills, vendors, existing systems, ops practices).
- Common diagram problems (p.3–4): unexplained/inconsistent notation; ambiguous element purpose; missing or unlabelled relationships; generic terms ("business logic"); unexplained acronyms; missing technology; **mixed abstraction levels**. Across a set: inconsistent notation and naming between diagrams, unclear reading order, no clear transition between diagrams.
- Questions workshop groups keep asking (p.7): which diagrams, which notation, what level of detail, who is the audience.
- UML decline (p.7–9): too big (~800-page spec), historically centred on class diagrams (1:1 with code), fragile round-trip tools; Agile misread as "no documentation". UML notation alone doesn't fix the content problems (p.9).
- **Technology on diagrams** (p.10–11): the author firmly recommends including technology choices. The logical vs physical split comes from old separate architecture/dev teams. Technology choices ground an idealistic design; they also ensure the people drawing the diagrams understand technology.
- **Ambiguity → assumptions** (p.11–12): diagrams should largely stand alone; "we'll talk through it" leaves information in heads. Example: three people designing for an hour, then discovering one thought "components in a monolith" and two thought "microservices".
- Good communication gives: big picture, shared context, a map for navigating code, a focus for conversations on features/tech debt/risk reviews/threat modelling/impact of change, faster onboarding, and explanation to non-engineers (p.12–13).
- Shared context matters for **AI-assisted workflows** too, so agents change code in ways compatible with the architecture (p.2).

**→ designPerspectives:**
- Built-in **lint rules** for every problem listed on p.3–4 (unlabelled edges, missing tech, mixed levels, unexplained acronyms, no legend, no title).
- The design workflow must force **technology choices** at C2/C3 (with "TBD: MySQL or PostgreSQL" allowed during design, p.36).
- A "stand-alone test" mode: show a diagram to a reviewer without narrative and collect their interpretation as notes.
- The model is the shared context handed to external coding agents (your Q5 answer).

## Ch.2 The Basics (p.15–26)
- **Common abstractions over common notation** (p.15–16): the word "component" means different things to different people; agree vocabulary first, notation second.
- **A legend is key** (p.17): like maps — same abstractions, varying notation, explained by a key.
- Hierarchy (p.17): software system → containers → components → code elements; people use software systems.
- **Software system** (p.18): delivers value to users; roughly what one team builds, owns, and can see inside; often one repo / one deploy unit. *Not* usually a software system: product domains, DDD bounded contexts, business capabilities, feature teams, squads.
- **Container** (p.19–20): an application or data store that must run for the system to work; a runtime boundary; separately deployable/runnable; communication between containers is usually out-of-process. Examples: server-side web app, SPA, desktop app, mobile app, console app, serverless function, shell script; DB schema, blob store/bucket, file system. Not a Docker container (say "C4 container" if needed).
- **Component** (p.20–21): grouping of related functionality behind a well-defined interface inside a container; not separately deployable; packaging (JAR/DLL) is orthogonal.
- **Code** (p.21): classes, interfaces, enums, functions, objects.
- Static structure diagrams (p.21–24): System Context, Container, Component, Code.
- Supporting diagrams (p.24–25): Dynamic, Deployment, System Landscape.
- Notation independent; must have a key (p.25).
- Usage notes (p.25–26):
  - Different levels tell different stories to different audiences; levels **age at different rates** (component/code most volatile).
  - You don't need all four levels; **context + container suffice for most teams**. Weigh cost of creating/maintaining component & code diagrams.
  - C4 doesn't replace other diagram types — supplement with UML activity or BPMN (processes), state charts, UML class (domain models), ERDs, ArchiMate (enterprise), DDD context maps.
  - "Not a description of a software design process" (p.26). The author's own habit: start at context, work down, iterate between levels.
  - Less suited to embedded/firmware, heavy-customisation platforms (SAP, Salesforce), libraries/frameworks/SDKs.

**→ designPerspectives:**
- Model schema = exactly these element types + relationship; validation enforces correct nesting (component must be inside a container, etc.).
- Each view type gets a "Recommended?" hint and a **maintenance-cost indicator** (component/code views flagged as volatile).
- "Linked diagrams" (BPMN, state, ERD, context map) are first-class but outside the C4 hierarchy.
- The guided stage-gating is *our* process, layered on top (see FoSA notes for the process itself). Allow iterating back up between levels.

## Ch.3 System Context Diagram (p.27–34)
- Intent questions (p.27): what are we building; who uses it; what do they do with it; how does it fit the existing landscape.
- Scope: one software system. Content: people + software systems + relationships. Focus on people and systems, **not** technologies/protocols.
- People: model by role; include admins/ops only if a part of the system is built for them; can make separate context views for functional users vs admins (p.28).
- Relationships: unidirectional arrows with a summary label; can omit protocols here (p.29).
- Why useful (p.29): makes scope explicit; shows what's added to the landscape; usable by non-technical people; identifies who to talk to about interfaces; starting point for the rest. Also an **analysis tool** in requirements workshops (inside vs outside the boundary).
- Audience: everyone. Recommended: yes, for all teams.
- Example builds the diagram **step by step** (system → user → Core Banking System → Amazon SES) with a key and a title "System Context View: Internet Banking System" (p.30–34). Elements carry a "[Person]" / "[Software system]" type label.

**→ designPerspectives:** C1 stage = step-by-step build (scope box → actors → external systems), each step a small proposal the user accepts. Business-user persona can fully participate here. Boundary in/out decisions recorded as notes.

## Ch.4 Container Diagram (p.35–49)
- Intent questions (p.35): decomposition into apps & data stores; their responsibilities; primary technology; how they communicate; *where do I write code to add a feature*.
- **Container diagrams should say little or nothing about deployment** (cloud, servers, K8s, Docker, load balancers, firewalls, API gateways, failover) because it varies per environment → use deployment diagrams (p.35–36).
- Content: people, software systems (repeated from context for continuity), containers (name, technology, description), the system boundary (p.36–37).
- During up-front design, partial tech is fine ("MySQL or PostgreSQL", "relational database schema") (p.36).
- Relationships: description + technology (protocol); optionally sync/async by line style (p.37).
- Why useful (p.37–38): shows what must be built/deployed/operated; makes tech explicit; shows communication; **a way to review a new architecture or a change**. Adding tech exposes unworkable designs (browser SPA "reading from" MySQL → how? auth?).
- Audience: architects/engineers, but also ops/support (bridges Dev–Ops gap), QA/testers (perf testing), compliance/architecture review boards (risk reviews, **threat modelling**), product owners (which containers will a feature change?) (p.38).
- Example (p.39–48): SPA, static content directory (named abstractly so deployment can vary), backend API (Java/Spring Boot) as the only path to Core Banking (security), MySQL for credentials (avoid customising off-the-shelf CBS), S3 bucket for cached PDF statements (performance isolation).
- **Modelling rule** (p.48): an external service you just consume (SES) = software system; an S3 bucket you control the contents/format of = container, even though AWS hosts it.

**→ designPerspectives:**
- C2 stage lints: deployment terms on a container view → warning ("move to deployment view"); container without technology → warning; edge without protocol → warning; "UI → database" direct edge → prompt about auth/connectivity.
- A "which containers does this feature touch?" query for product owners (PR/planned-commit overlay).
- Hosted-service rule as a guided question when adding a cloud service: "Do you control its contents/format?" → container, else software system.

## Ch.5 Component Diagram (p.51–60)
- Intent (p.51): decomposition of a container into components; responsibilities; collaboration; frameworks/libraries; where to add a feature.
- Scope: **one container** — draw one diagram per container rather than many containers at once (p.52).
- Components should reflect the container's architectural style (layers, ports & adapters/hexagonal) (p.52).
- Show container boundary (and optionally system boundary) (p.53).
- In-process calls don't need technology labels; sync/async may still be shown (p.53).
- Audience: technical team, 3rd-level support, maintainers (p.54).
- **Recommended? Generally not** (p.54): skip for data stores (use ERDs) and trivially small apps (single-endpoint microservices). Useful as optional detail for larger apps. Volatile; ages fast. Automatic generation is non-trivial; **AI tools may produce a different diagram each run (nondeterministic)**. Clutter appears quickly beyond a handful of components.
- Example builds by **flows** (sign-in → accounts summary → statements), adding components per flow (p.55–59).

**→ designPerspectives:**
- C3 stage builds components **per user flow/use case** (matches FoSA Workflow approach).
- Brownfield: never regenerate components from scratch each scan; LLM output is pinned once accepted (CodeMapping rules) to avoid the nondeterminism problem.
- Disable "component view" for data-store containers; offer ERD instead.
- Clutter threshold: warn above ~N components; suggest splitting by slice.

## Ch.6 Code Diagram (p.61–65)
- Intent (p.61): how a component decomposes; what's public vs internal; how big/complicated.
- Scope: **one component**; whole-app class diagrams don't work (p.61–62).
- Content: language building blocks; UML class diagram for OOP; include only what tells the story (p.62).
- Why: rarely needed; answerable by reading code; useful to summarise large/complex components or to illustrate a pattern (p.62).
- Recommended only for the most important/complex components; IDEs generate on demand (p.62).
- Purpose of having the level at all: **traceability** down to code (p.63; Ch.11).
- Example: Core Banking System adapter with public interface + package-private impl + request/response class pairs → explains the pattern for other engineers to follow (p.63–64). Reverse-engineered IntelliJ diagram shows too much by default; trade-off = configuring what to hide (p.64–65).

**→ designPerspectives:** C4 level is **on demand and scoped to one component**: public surface vs internals view, "pattern explainer" view, focused neighbourhood graph; filter properties/methods by default. In design mode, C4 is optional and only for components the user flags as complex/important.

## Ch.7 Dynamic Diagram (p.67–72)
- Shows a **subset** of elements collaborating at runtime for one feature/use case/story (p.67).
- Scope varies (systems ↔ code), but keep it constrained; avoid crossing into internals of other teams' systems (p.67–68).
- Two styles: sequence (timeline) or collaboration/communication (numbered arrows on a boxes layout); same information (p.68–69).
- Audience mirrors the level shown (p.69–70).
- **Recommended, sparingly**: for interesting/recurring patterns or complicated features; not one per feature (p.70).

**→ designPerspectives:** dynamic views generated from (a) the design flows used to identify components, (b) OpenTelemetry traces (runtime). Toggle sequence ↔ collaboration rendering of the same data. Flag "too many dynamic views" maintenance cost.

## Ch.8 Deployment Diagram (p.73–87)
- Shows instances of systems/containers deployed onto infrastructure **in one environment** (dev/test/staging/live) (p.73).
- Scope: generally one software system per diagram; can relax for shared infra (p.73).
- Elements (p.74): container instances, software system instances, **deployment nodes** (physical, virtual, containerised, server environments; nestable), **infrastructure nodes** (DNS, routers, LBs, firewalls).
- Why: keeps deployment detail off container views; different environments differ (JVM on laptop vs Docker on Fargate) (p.74–75).
- Audience: architects, engineers, ops/support. Recommended for all teams, especially live (incident response) (p.75).
- Dev example (p.75–84): laptop node (Windows/macOS), local JVM, nginx & MySQL in Docker, **MinIO instead of real S3** (cost, connectivity, data-leak trade-off), mock SES container, shared corebanking-dev server. External system treated as opaque.
- Live example (p.84–86): Cloudflare CNAME proxy/caching to S3 static site; API via ALB (not proxied); Fargate; RDS; real S3/SES; Direct Connect to data centre; HTTPS instead of HTTP; region shown, AZs omitted for brevity. Org boundaries (Cloudflare, AWS, bank) as dotted boxes (p.87).

**→ designPerspectives:** one deployment view **per environment**, generated from IaC/compose/K8s where possible; side-by-side environment diff; dev-vs-live substitution recorded (e.g., MinIO ↔ S3) with the trade-off note. Network persona works here (subnets/zones as nested nodes). Isometric rendering is an alternative renderer for these views.

## Ch.9 System Landscape Diagram (p.89–96)
- Map of software systems within a chosen scope (org, department, product domain, business capability, bounded context) (p.89–90).
- Answers: how systems fit together; **impact if a system changes or is removed**; impact of re-organisation (p.89).
- It's a context diagram without a single focus (p.90). Audience: everyone (p.91).
- Recommended especially for larger orgs; **make it interactive** (double-click a system → its C4 diagrams) (p.91).
- Org boundaries can be dotted groupings (p.94–95).

**→ designPerspectives:** Landscape is the home screen for the business persona; click-through navigation; "remove/replace system X" impact query; org-boundary groupings.

## Ch.10 Notation (p.97–113)
- Good notation: readable by widest audience; every differentiator in a key; consistent across a diagram set; diagrams "speak for themselves" (p.97–98).
- **Titles** state type + scope, e.g. "Container View: Internet Banking System" (p.98).
- Acronyms/code names: avoid or explain (glossary or key); "Plutus (payment service)" pattern (p.98–99).
- Layout: no correct orientation, but **keep element placement consistent between levels** (p.99–100).
- Elements: start with plain rectangles of one colour to focus on content; then add styling (p.100). Put **name, [type], technology, short description** inside each box (template, p.100–102). Version numbers: precision vs maintenance trade-off; major versions as a compromise (p.101–102). Description ~one sentence or 7±2 bullets (p.102). A sparse presentation variant is OK for talks.
- Colour (p.104): use for existing vs new, COTS vs custom, technology, size/complexity, **tech-debt score**, ownership, internal vs external, **changing in next release** — always in the key; consider colour-blindness and B&W printing.
- Shapes (p.104–106): people, cylinders for data, folders for file systems, pipes for queues; include in key.
- Size: keep elements roughly equal unless size is meaningful (p.106).
- Icons: include in key; 20 cloud icons may not be understood (p.106).
- Relationships (p.106–110): prefer **unidirectional** arrows; collapse request/response into one arrow from initiator; labels end with a preposition ("Makes API calls to"); avoid "uses"; read as a sentence to check direction; show two arrows when intent/technology/synchronicity differ (sync API + async pub/sub). Line style for sync/async; colour e.g. HTTPS vs HTTP; avoid many arrowhead types (max 2–3).
- Diagram key (p.110–111): always include; beware relative words ("internal") without a reference point; capture clarifying remarks made in meetings into the key.
- Standard notation? Org-wide notation is costly to define and maintain; C4 can be rendered as UML/ArchiMate but rarely is. The shared vocabulary is the **abstractions and diagram types**, not visuals (p.111–113).

**→ designPerspectives:**
- Auto-generated **legend** from the styles actually used (a modelling tool can do this; a drawing tool can't — Ch.12).
- Auto title "<View type>: <scope>".
- Element card template enforced; glossary panel for acronyms.
- Relationship label linter: flags "uses", missing preposition, bidirectional arrows.
- Layout stability across zoom levels (pin positions of shared elements).
- Colour-blind-safe palettes + B&W print check.
- Perspective colouring options exactly match the p.104 list.

## Ch.11 Beyond the Basics (p.115–139)
- **Rates of change** (p.115–116): context slow; container slow (unless many microservices/functions); component frequent; code per commit. Start teams on the top two levels.
- **Model-code gap** (p.116–119, Fairbanks): we think in components/layers, languages don't have them; conventions (naming, packaging, modules) implement them, inconsistently. Top-down diagrams differ from bottom-up reverse-engineered ones. Use abstraction to see a simplified view for the conversation at hand. Code level anchors the others to reality (traceability).
- **Hardware systems** (p.119): add a "hardware system" abstraction for software–hardware integration if needed.
- **Abstraction vs organisation** (p.119–126): debating container vs component forces precision (database server vs schema; "microservices shouldn't share a schema, may share a server"). Need for more levels usually means misuse (e.g., microservice modelled as one container "Java and MySQL" — fails "same OS process?" heuristic, p.121) or wanting **organisational groupings**. Treat subsystems, bounded contexts, layers, modules/libraries as **groupings** drawn around existing abstractions (p.122–126). Custom abstraction levels are an "advanced maneuver" requiring precise definitions.
- **Microservices** (p.126–134): model as a **group of containers** inside one system when one team owns them; promote to **software systems** when separate teams own them. Don't draw cross-system container diagrams showing other teams' internals (coupling; goes stale) (p.133–134).
- **Message-driven** (p.135–138): don't model "the message bus" as a container; model **each queue/topic as a container (data store)**. Shows real producer→consumer coupling. Variants: omit queues and put names on arrows (simpler, less explicit — a trade-off, neither better); reverse arrows for pub/sub. Consider who **owns** each queue/topic when services are separate systems.
- **Feature-based teams** (p.138–139): don't model business capabilities as software systems; keep one diagram set per service; feature teams edit those sets.

**→ designPerspectives:**
- Model-code gap → explicit, editable **CodeMapping** rules; "top-down vs bottom-up" comparison view.
- **Groupings** as a first-class concept (layer, bounded context, subsystem, module, org unit, microservice) with no extra C4 level.
- Lint: container whose technology combines runtimes that can't share a process ("Java and MySQL") → warning.
- Guided question when modelling microservices: one team or many? → group-of-containers vs software systems.
- Message-driven: queue/topic element type with owner field; layout options (explicit queue vs label-on-arrow) as a per-view toggle.
- Ownership drives which internals a persona may see (feeds the permissions model).

## Ch.12 C4 Model in Practice (p.141–157)
- **Not a silver bullet** (p.141–142): suits typical enterprise software; doesn't cover state charts, ERDs, enterprise architecture business layer → supplement. Diagrams show outcomes, **not why** → need supplementary docs (arc42) and **ADRs**. "Does not describe a process for designing software"; role-split by level is possible but "not the intended or even recommended usage pattern."
- **Diagrams provide feedback** (p.142–143): if a design diagram looks too complicated (e.g., tangled Lambdas ↔ DynamoDB loops), consider simplifying the **design**, not just the diagram.
- **Tooling questions** (p.143): author technicality; audience & access; drag-drop vs diagrams-as-code; storage in VCS vs tool; diffability; open vs closed format; interactive vs static; free vs paid; open vs closed source; cloud vs self-hosted; **diagramming vs modelling** (most important). Whiteboards are better for live design sessions.
- **Diagramming tools** (p.144): shapes only; can't validate ("no components on a context diagram"), can't query ("dependencies of X"), copy-paste between levels, renames don't propagate, can't auto-generate a key.
- **Modelling** (p.145): single definition of elements/relationships ("a dictionary"), views on top; model is a **directed graph**; views are subsets.
- **Scaling** (p.145–153):
  - *Not shown for brevity*: omit cross-cutting elements (logging) with a note, or mark users with an icon explained in the key.
  - *Perspectives* (Woods & Rozanski): layers over existing views — ownership, security — toggled on/off with tooltips; don't show everything; use supplementary docs for longer narrative.
  - *Split the diagram*: landscape per department/bounded context/domain; context per business capability; container/component per slice (feature, use case, functional area). Trade-off: lose the big picture.
  - *Alternative visualisations*: force-directed graph with drag; click a node → nearest neighbours; tree of deployment hierarchy; tooltips; good for "impact if we change X?"; or load the model into a graph DB and query.
- **AI** (p.153–154): AI summarising diagram images/Visio files hallucinates (too little data, inconsistent renames); giving AI a **structured textual model** works much better. Opportunities: **drift/erosion detection** (modelled vs coded), **generating models from code or infrastructure**, **code generation within container/component boundaries**.
- **Diagramming capability maturity** (p.155–156): 1 Initial (no diagrams), 2 Ad hoc, 3 Defined (C4 + notation guidance), 4 Modeled (hand-crafted models in UI or DSL), 5 Optimizing (generated parts from code/deployments, decentralised team models merged into an org landscape, models as queryable datasets).
- Adoption benefits cited by organisations (p.157): better docs, faster onboarding, Dev–Ops gap reduced, non-engineers understand, clarity for features/refactoring, architecture reviews, **security reviews and threat modelling**, tender responses.

**→ designPerspectives:**
- Target maturity **level 5** by design: model-based, partly generated, multi-repo landscape merge, queryable.
- "Simplify the design?" nudge when a view crosses complexity thresholds (edge crossings, fan-in/out, cycles).
- Implement all four scaling techniques; perspectives are the backbone of the persona feature.
- Tool-choice questions on p.143 are answered explicitly in the spec's ADRs (diffable text, open format, interactive, free/OSS, local, modelling).
- AI features follow the three p.154 opportunities and always operate on the textual model.

## Appendix — Diagram Review Checklist (p.159–160)
- General: title? type clear? scope clear? key present?
- Elements: name; type/level; what it does; technology; acronyms; meaning of colours, shapes, icons, border styles, sizes.
- Relationships: every arrow labelled with intent; label matches direction; technology/protocol; acronyms; colours; arrowheads; line styles.

**→ designPerspectives:** this checklist is implemented as automated checks (where computable) plus a manual review step in every stage gate.

---

## Cross-cutting takeaways for the spec
1. Model, not drawings; views are subsets of a directed graph.
2. Context + container are the high-value, low-volatility levels; component/code are optional and costly — the tool should make them cheap (generation) **and** honest about staleness.
3. Every rendering needs title + key; every element needs name/type/tech/description; every edge needs a directional label (+ protocol at C2).
4. Deployment detail lives only in per-environment deployment views.
5. Groupings, not new levels, for layers/bounded contexts/microservices/org units.
6. Perspectives (toggleable layers) handle security, ownership, tech debt, etc.
7. ADRs explain *why*; C4 shows *what*.
8. C4 is not a design process — designPerspectives must bring its own (from FoSA).
9. AI must work on the textual model; generated structure should be pinned to avoid nondeterministic churn.
