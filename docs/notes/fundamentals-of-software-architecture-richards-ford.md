# Notes — *Fundamentals of Software Architecture, 2nd ed.* (Mark Richards & Neal Ford, O'Reilly)

> Purpose: chapter-by-chapter notes for designing **designPerspectives**. Paraphrased; short quotes are marked. Page numbers are the book's printed page numbers.
> Each chapter ends with **→ designPerspectives:** implications. Those lines are my interpretation, not the authors'.

---

# Part I — Foundations

## Ch.1 Introduction (p.1–13)
- Architecture is understood only in context; all architectures are products of their context (microservices were unaffordable in 2002) (p.1–2).
- **Four dimensions of software architecture** (p.2–6), in the order architects analyse them:
  1. **Architecture characteristics** ("-ilities"; what the system must be capable of / success criteria)
  2. **Logical components** (behaviour: domains, entities, workflows)
  3. **Architecture style** (chosen once 1+2 are understood; "easiest implementation path")
  4. **Architecture decisions** (rules/constraints for construction, e.g., only Business and Services layers may access the DB)
  …all held together by the system's **structure**.
- **Laws of Software Architecture** (p.6–7):
  - First Law: "Everything in software architecture is a trade-off."
    - Corollary 1: if you think something isn't a trade-off, you haven't found the trade-off yet.
    - Corollary 2: trade-off analysis can't be done once and reused as a default (e.g., "always choreography" fails sometimes).
  - Second Law: why is more important than how.
  - Third Law: most decisions aren't binary; they lie on a spectrum.
- **Eight expectations of an architect** (p.8–12): make decisions (guide rather than specify technology — e.g., "a reactive framework" not "React", unless a characteristic requires a specific choice); continually analyse the architecture (**architecture vitality**, structural decay; test/release environments matter for agility); keep current; **ensure compliance** (fitness functions); technical breadth; know the domain; interpersonal/leadership; navigate politics (almost every architecture decision will be challenged).

**→ designPerspectives:**
- The design process follows the four dimensions in order: characteristics → logical components → style → decisions (all four appear in the guided flow; see spec).
- Every decision object in the tool carries **trade-offs (pros/cons), alternatives, and context** — the First and Second Laws are encoded as required fields, not optional.
- Decisions can be expressed on a **spectrum** (sliders/positions), not just yes/no (Third Law).
- "Re-evaluate" reminders on decisions when context changes (Corollary 2).
- Distinguish "architecture decision" (guides) from "technology decision" (specifies) in the decision model.

## Ch.2 Architectural Thinking (p.17–36)
- **Architecture vs design is a spectrum** (p.17–20). Criteria: strategic vs tactical (planning time, number of people involved, long-term vs short-term), **level of effort to change** ("stuff that's hard to change", Fowler), **significance of trade-offs**.
- Technical breadth over depth for architects; knowledge pyramid; Frozen Caveman antipattern (irrational fixation from past incidents; distinguish genuine vs perceived risk) (p.20–24).
- 20-minute rule; personal technology radar (Hold/Assess/Trial/Adopt; Tools/Languages & frameworks/Techniques/Platforms) (p.24–29).
- **Analysing trade-offs** (p.30–33): "There are no right or wrong answers in architecture—only trade-offs" (Ford). Worked example: auction bids via **topic (pub/sub) vs queues (point-to-point)**. Topic: extensibility, decoupling. Queue: security (can't wiretap unnoticed), heterogeneous per-consumer contracts, per-queue monitoring & autoscaling (AMQP-specific nuance). Answer: "It depends" — on which matters more (extensibility vs security). Summary table format: advantages vs disadvantages.
- Business drivers → characteristics (p.33).
- Bottleneck Trap (architect owning critical-path code); stay hands-on via POCs (production quality), tech debt, bugs, automation (incl. fitness functions), code reviews (p.33–35).

**→ designPerspectives:**
- Each proposal shows an **architecture↔design spectrum score** (strategic/tactical, effort to change, trade-off significance) to decide whether it needs an ADR.
- Standard **trade-off table** component (advantages | disadvantages | depends-on question) used everywhere a choice is made (style, sync/async, queue/topic, DB split, tech choice).
- A built-in **tech radar** view of technologies used in the model (Hold/Assess/Trial/Adopt) — useful for architect persona.
- POC tasks can be emitted for undecided choices (hand-off to coding agents).

## Ch.3 Modularity (p.37–54)
- Modularity = logical grouping of related code; an implicit characteristic requiring constant energy against entropy (p.37–38).
- **Modularity vs granularity**: "Embrace modularity, but beware of granularity" (Richards). Granularity mistakes create Spaghetti Architecture, Distributed Monoliths, "Big Ball of Distributed Mud" (p.38).
- **Cohesion** scale (best→worst): functional, sequential, communicational, procedural, temporal, logical, coincidental. Splitting a cohesive module increases coupling (Constantine). Cohesion is subjective; example Customer vs Order maintenance → "it depends" questions (p.41–43). LCOM metric finds structural (not logical) lack of cohesion (p.43–44).
- **Coupling**: afferent (incoming) and efferent (outgoing) (p.44–45). Martin's metrics: **Abstractness** (A), **Instability** I = Ce/(Ce+Ca), **Distance from the Main Sequence** D = |A + I − 1|; Zone of Uselessness (too abstract) vs Zone of Pain (too concrete & stable) (p.45–48). Metrics are blunt; can't separate essential from accidental complexity (p.48).
- **Connascence** (Page-Jones) (p.49–53): static (Name, Type, Meaning/Convention, Position, Algorithm) and dynamic (Execution, Timing, Values, Identity). Properties: **strength** (prefer static; refactor toward weaker forms), **locality** (stronger forms OK when close; weaker forms as distance grows — same idea as DDD bounded contexts), **degree** (how many things are affected). Weirich's rules: Rule of Degree, Rule of Locality.

**→ designPerspectives (brownfield analysis & C3/C4 views):**
- Compute and display per-component: Ca, Ce, Instability, Abstractness, D (main-sequence scatter plot with zones), LCOM where available, cycle detection.
- **Connascence annotations** on relationships where detectable (e.g., shared magic values = Meaning; positional params across components = Position; shared DB tables across services = Values/Identity) and a "locality" warning when strong connascence crosses a component/container boundary.
- Granularity warnings at C2 for distributed designs (many tiny services, chatty sync calls).

## Ch.4 Architectural Characteristics Defined (p.55–65)
- Structural design = two activities: **architectural characteristics analysis** + **logical component design**; any order or in parallel; they meet at a join point (p.55).
- Authors dislike "non-functional requirements" and "quality attributes"; prefer "architectural characteristics" (capabilities vs domain behaviour) (p.56).
- **Three criteria** to count as an architectural characteristic (p.56–58): (1) specifies a **non-domain** design consideration; (2) **influences some structural aspect** of the design (security may be handled by design in a monolith but structurally in microservices; scalability beyond a point requires structure); (3) is **critical or important** to success. Support as few as possible.
- **Implicit** (rarely written: availability, reliability, security, domain-specific like low latency in HFT) vs **explicit** (in requirements) (p.58).
- Partial lists (p.59–61):
  - Operational: availability, continuity, performance, recoverability, reliability/safety, robustness, scalability.
  - Structural: configurability, extensibility, installability, leverageability/reuse, localization, maintainability, portability, upgradeability.
  - Cloud: on-demand scalability, on-demand elasticity, zone-based availability, region-based privacy & security.
  - Cross-cutting: accessibility, archivability, authentication, authorization, legal, privacy, security, supportability, usability/achievability.
- ISO-style categories reworded (p.62–63): performance efficiency, compatibility, usability, reliability, security, maintainability, portability; authors exclude functional suitability (p.64).
- Ambiguity: use a **ubiquitous language** for characteristic definitions per organisation (p.64).
- **Trade-offs and least worst architecture** (p.64–65): supporting a characteristic is never free; characteristics are synergistic (security vs performance; helicopter controls analogy); "Never strive for the best architecture; aim for the least worst architecture." Generic architectures fail. Make the architecture as **iterative** as possible.

**→ designPerspectives:**
- Built-in **characteristics catalog** with these categories and definitions, editable per workspace (ubiquitous language).
- A characteristic can only be added to the "driving" list if the user answers the three criteria (non-domain? structural impact? critical?).
- Implicit vs explicit flag on each characteristic.
- A **conflict matrix** that warns about common tensions (security↔performance, deployability↔auditability, scalability↔consistency…) whenever two are selected together. (Exact pairs are my proposal; the book gives examples, not a full matrix.)

## Ch.5 Identifying Architectural Characteristics (p.67–79)
- Sources: domain concerns, requirements, implicit domain knowledge (p.67).
- **Translating domain concerns → characteristics** (Table 5-1, p.68): M&A → interoperability, scalability, adaptability, extensibility; time to market → agility, testability, deployability; user satisfaction → performance, availability, fault tolerance, testability, deployability, agility, security; competitive advantage → agility, testability, deployability, scalability, availability, fault tolerance; time & budget → simplicity, feasibility.
- **Composite characteristics** (p.68–69): e.g., agility = deployability + modularity + testability. Antipattern: focusing on one part of a composite (end-of-day fund pricing ≠ just performance; also availability, scalability, reliability, recoverability, auditability).
- Domain knowledge reveals hidden load patterns (students register in the last 10 minutes) (p.69).
- **Architecture katas** (Neward): Description, Users, Requirements, Additional context; timeboxed team design; vote; review trade-offs (p.70–71).
- **Silicon Sandwiches** kata walk-through (p.71–76): users "thousands, maybe millions" → scalability; mealtime bursts → **elasticity** (scalability = growth over time; elasticity = bursts; hotel booking vs concert tickets); external mapping integration → reliability concern but avoid **overspecifying** (degrade gracefully without traffic info); mobile → mobile-optimised web app & performance budgets (collaborate with UX); national/local promotions → **customizability** (microkernel vs Template Method — architecture vs design trade-off); payments → security via design (third-party payments); franchises → cost constraints, maybe sacrificial architecture; overseas → i18n (design, not structure); cheap labour → usability (design). Implicit: availability, stability, security.
- Overspecifying is as damaging as underspecifying (p.76). "There are no wrong answers in architecture, only expensive ones" (p.76).
- **Design vs architecture trade-off** questions (p.76): reasons not to choose the structural option? does one option make other characteristics harder? cost of supporting in architecture vs design? Collaborate; avoid **Ivory Tower** antipattern.
- **Least-important test** (p.77): ask which characteristic you'd drop first.
- **Limiting & prioritising** (p.77–79): Vasa ship (overspecification sank it). **Worksheet**: ~7 slots for driving characteristics, a column of implicit ones you can "pull in", an "Others considered" overflow, then stakeholders pick the **top 3 (any order)** — easier consensus than full ranking.

**→ designPerspectives — Stage 0 "Characteristics" (core of the guided flow):**
- Intake form in **kata format** (Description, Users, Requirements, Additional context).
- LLM proposes candidate characteristics **with the requirement line that triggered each** (traceability), split explicit/implicit, using Table 5-1 translations.
- Composite expansion: selecting "agility" asks which measurable parts matter.
- Over-specification guard: a cap of ~7 driving characteristics, "Others considered" list, mandatory "least important?" prompt, then **top-3 selection**.
- Every characteristic needs a "structural or design?" decision (e.g., customizability via microkernel vs Template Method) — this becomes the first ADRs.
- Optional **kata practice mode** (public katas as templates) for learning.

## Ch.6 Measuring and Governing Architecture Characteristics (p.81–93)
- Characteristics are hard to define: not physics, varying definitions, too composite → decompose into objective measures; agree a ubiquitous language (p.81–82).
- **Operational measures** (p.82–83): average + max response times (outliers), statistical models with alerts, performance budgets (first contentful paint, K-weight budgets).
- **Structural measures** (p.83–85): Cyclomatic Complexity (CC = E − N + 2P); industry <10, authors prefer <5; Crap4J (CC + coverage); can't tell essential vs accidental complexity; **generative AI tends to brute-force, creating accidental complexity**, so CC is useful for AI-written code too (p.85).
- **Process measures** (p.86): testability (coverage, but beware assertion-free tests), deployability (success %, duration, deployment-caused bugs).
- **Governance & fitness functions** (p.86–93): fitness function = any mechanism giving an objective integrity assessment of a characteristic (or combination). Mechanisms: metrics, monitors, unit-test libraries, chaos engineering. Examples: JDepend cycle test; Distance-from-main-sequence test; **ArchUnit layer rules**; NetArchTest (.NET); assert-every-test-has-an-assertion; Netflix Simian Army (Chaos/Latency Monkey, Chaos Kong, Conformity, Security, Janitor). Explain the purpose of a fitness function to developers before imposing it; think of them like checklists (Gawande), not heavyweight governance.

**→ designPerspectives:**
- Each driving characteristic must get at least one **measure** (operational / structural / process) before C2 approval.
- **Fitness-function generator**: from model rules (layer access, no cycles, component boundaries, max CC, coverage with assertions) emit tests for the target stack (ArchUnit, NetArchTest, dependency-cruiser, import-linter, etc.) and include them in agent hand-off tasks.
- Brownfield: show CC/coverage per component as a perspective; flag AI-introduced complexity spikes in PR overlays.
- Fitness results shown as a pass/fail perspective on diagrams.

## Ch.7 The Scope of Architectural Characteristics (p.95–106)
- Old frameworks assumed one set of characteristics per system; modern distributed systems differ per service (p.95).
- **Architecture quantum** (p.96–99): the scope of a set of characteristics. Features: **independently deployable** (includes its DB — a shared DB makes one quantum), **high functional cohesion**, **low external implementation static coupling**, and (in definition) synchronous communication with other quanta (sync calls bind operational characteristics).
- DDD **bounded context** (p.97): each context owns its own entity model (no org-wide Customer class).
- Coupling types (p.98–99): **semantic** (inherent in the problem), **implementation** (how the team chose to implement), **static** (wiring; sharing a coupling point/DB puts services in one quantum), **dynamic** (runtime communication). Principle (paraphrased): tighter coupling is acceptable within a narrow scope; the wider the scope, the looser coupling should be.
- **Synchronous communication** (p.99–100): sync call from a scalable Auction service to a slow Payment service fails under load; async via queue buffers bursts (but can overflow).
- **Scoping → style decision tree** (p.100–103): (1) Can one set of characteristics suffice? → monolith; else distributed. (2) Distributed: determine quantum boundaries. (3) Persistence: monolith → single DB; distributed → single DB (common in EDA) or partitioned per service. (4) Sync vs async between quanta (sync can merge quanta).
- **Kata: Going Green** (p.103–105): three characteristic clusters (public: scalability, availability, agility; back office: security, data integrity, auditability; assessment: maintainability, deployability, testability) → three quanta.
- **Scoping and the cloud** (p.105–106): cloud as container host (consider orchestrator constraints) vs cloud-provider building blocks (rely on provider-advertised capabilities); trade-offs change form, but remain.

**→ designPerspectives — Stage 2 "Containers":**
- Characteristics can be **scoped** to groups of elements (quanta), not only the whole system.
- **Cluster view**: group requirements/characteristics into clusters; each cluster proposed as a candidate quantum (Going Green pattern).
- Implement the **Fig 7-1 decision tree** as an interactive wizard: one set vs many → monolith vs distributed → quantum boundaries → persistence → sync/async.
- Quantum detection in brownfield: services sharing a DB schema or a shared library are flagged as one quantum.
- Sync edges between quanta with different scalability characteristics → warning (Auction→Payment example).
- Coupling-type labels on relationships (semantic / implementation / static / dynamic) where known.

## Ch.8 Component-Based Thinking (p.107–128)
- **Logical components** = the major functions of a system (rooms of a house); manifest as namespaces/directories — **leaf nodes = components**, higher nodes = domains/subdomains (e.g., `order_entry/ordering/payment` → Payment Processing) (p.107–109).
- **Logical vs physical architecture** (p.110–111): logical shows components, their interactions, actors, maybe repositories (not databases); no UIs/DBs/services. Physical shows services, UIs, DBs and should reflect a style. Authors advise **not to skip the logical architecture** — physical views hide where functionality lives and give no code-organisation guidance. Logical is independent of physical (may not yet know monolith vs distributed).
- **Component identification cycle** (Fig 8-6, p.112): identify initial core components → assign user stories/requirements → analyse roles & responsibilities → analyse architectural characteristics → restructure → repeat (never stops; also for new features on existing systems).
- Initial components are a **best guess**, "empty buckets" until stories are assigned (p.113).
- Approaches (p.113–116):
  - **Workflow approach**: one component per step of major happy-path workflows; steps can share a component (Customer Notification used twice).
  - **Actor/Action approach**: list actors (always include **the system** as an actor) and their actions → components; usually yields more components; good generic default (p.125).
  - **Entity Trap** (antipattern): Customer/Item/Order Manager components. Problems: ambiguous names, dumping grounds, too coarse. Suffixes Manager, Supervisor, Controller, Handler, Engine, Processor are warning signs. Truly CRUD systems need a CRUD framework/low-code tool rather than an architecture.
- **Assign user stories** (p.117–118): stories that would be duplicated across components → create a new component (Customer Notification).
- **Analyse roles & responsibilities** (p.118–120): write a responsibility statement; conjunctions ("and", "also", "in addition", "as well as") and many commas signal too much responsibility → split (Order Placement → Payment Processing, Inventory Management, Customer Notification).
- **Analyse characteristics** (p.120): differing scalability/elasticity/reliability needs can split a functionally single component; so characteristics should be known before building the logical architecture.
- **Restructure** frequently, with developers (p.120–121).
- **Coupling** (p.121–125): static (afferent CA / efferent CE); **temporal coupling** (ordering/transactions; hard for tools to detect — found via design docs or errors); **Law of Demeter** (least knowledge) — moving "low stock → reorder & reprice" knowledge from Order Placement into Inventory Management lowers one component's coupling but **redistributes** coupling rather than eliminating it.
- **Case study: Going, Going, Gone** (p.125–128): actors Bidder, Auctioneer, System → Video Streamer, Bid Streamer, Bid Capture, Bid Tracker, Auction Session, Payment; then split Bid Capture into Bid Capture + Auctioneer Capture because auctioneer needs reliability/availability while bidders need scalability/elasticity. Don't obsess over "one true design"; choose the least-worst trade-offs.

**→ designPerspectives — Stage 3 "Components" (and the *logical* layer of the model):**
- The model keeps a **logical architecture** (components independent of containers) **before** containers are fixed; components are later allocated to containers. This lets the C2 stage be informed by C3-level functional analysis — both orders supported (book: characteristics and components can be analysed in either order or in parallel, p.55).
- Two assistants: **Workflow** (enter happy-path steps → candidate components) and **Actor/Action** (actors incl. System → actions → components).
- **Story-to-component board**: drag stories into component "buckets"; duplicate-story detection proposes a new shared component.
- **Responsibility statement linter**: counts conjunctions/commas; suggests splits.
- **Entity Trap linter** on names with Manager/Supervisor/Controller/Handler/Engine/Processor suffixes; CRUD-only detection suggests "you may not need architecture here".
- Characteristic-driven split suggestions (GGG Auctioneer Capture pattern).
- Coupling panel: Ca/Ce per component; **temporal coupling** recorded manually (from dynamic views); Law-of-Demeter "knowledge" refactor preview that shows coupling **moves**, not disappears.
- Brownfield: leaf directories/namespaces as candidate components (deterministic baseline before LLM clustering).

## Ch.9 Foundations (of styles) (p.131–152)
- **Style** describes: component topology, physical architecture (monolithic/distributed), deployment, communication style, data topology; a **pattern** is a contextualised solution (p.131–132). Styles emerge from ecosystem changes; "microservices" is a label, not a size instruction (p.132).
- **Big Ball of Mud** (Foote & Yoder): no discernible structure; usually from lack of governance; visualised as a hairball coupling diagram (p.133–134).
- Unitary, client/server (desktop+DB, browser+web server, SPA), three-tier; Java serialization as a long-lived artefact of a passing style → favour simple designs as future-proofing (p.134–136).
- **Top-level partitioning** (p.137–142): **technical** (layers: presentation, business, persistence; MVC; easy to find code by type; domains "smeared" across layers) vs **domain** (DDD-inspired; workflows/domains at top; modular monolith, microservices). Industry trend toward domain partitioning, but neither is "correct". Silicon Sandwiches comparison:
  - Domain partitioning: + models the business, cross-functional teams, aligns with modular monolith/microservices, message flow matches domain, easy migration to distributed; − customisation code in many places.
  - Technical partitioning: + separates customisation code, aligns with layered; − higher global coupling, duplicated domain concepts, higher data-level coupling (hard to later distribute).
- **Conway's Law** and **Inverse Conway Maneuver** → team topologies (p.139).
- **Monolithic vs distributed**: monolithic (layered, modular monolith, pipeline, microkernel) vs distributed (service-based, event-driven, space-based, SOA/orchestration-driven, microservices) (p.143).
- **Fallacies of distributed computing** (p.143–149): network reliable; latency zero (know avg **and** p95–p99; 10 chained 100 ms calls = 1 s); bandwidth infinite (**stamp coupling** — 500 KB returned when 200 B needed; fixes: private endpoints, field selectors, GraphQL, consumer-driven contracts, internal messaging); network secure (every endpoint; attack surface grows); topology never changes; one administrator; transport cost zero; network homogeneous.
- Authors' extra fallacies (p.149–150): **versioning is easy**; **compensating updates always work**; **observability is optional**.
- **Team Topologies** (Skelton & Pais) (p.151): stream-aligned, enabling, complicated-subsystem, platform teams.

**→ designPerspectives:**
- Style catalog entries carry the five style dimensions (component topology, physical, deployment, communication, data topology).
- Partitioning choice (technical vs domain) is an explicit early C3 decision with the trade-off table above.
- **Distributed-design checklist** auto-attached when the user picks any distributed style: each fallacy becomes a question/risk note (latency budget p95/p99 per call chain, payload sizes for stamp coupling, endpoint auth on every edge, versioning policy, compensation-failure path, observability plan).
- Call-chain latency estimator on dynamic views (sum of per-edge latency assumptions).
- Team ownership + team type (stream-aligned/platform/…) on the model; Conway overlay comparing team boundaries to component/container boundaries.

# Part II — Architecture Styles

> Note on star ratings: each style chapter has a star-rating figure (1–5) per characteristic. The figures are images and are **not in the extracted text**; ratings below are only those stated in the prose. Ratings not stated in prose are marked "(figure only)". To fill the full table, read the figures in the PDF.
> Each style chapter follows the same template: Topology · Style specifics · Data topologies · Cloud considerations · Common risks · Governance · Team topology considerations · Style characteristics · When to use · When not to use · Examples.

**→ designPerspectives (all style chapters):** the style catalog should use exactly this template per style, so the C2 "style picker" can show topology diagram, risks, governance fitness functions, team-topology fit, ratings, when/when-not, and an example.

## Ch.10 Layered Architecture (p.153–164)
- Most common; often appears by accident ("Architecture by Implication", "Accidental Architecture") when teams "just start coding" (p.153).
- Topology: Presentation, Business, Persistence, Database layers (3 to 5+); physical variants: all-in-one + external DB; presentation separate; everything incl. embedded DB (p.153–154).
- **Technically partitioned**: a domain (customer) is spread over every layer; DDD fits poorly (p.155).
- **Closed vs open layers; layers of isolation** (p.155–158): closed layers isolate change (contracts unchanged → other layers unaffected; replace UI framework inside Presentation). Fast-lane reader (skip layers) trades isolation for speed. Adding an **open Services layer** for shared objects restricts Presentation from shared business objects. Must **document which layers are open/closed and why**.
- **Architecture Sinkhole** antipattern: pass-through requests with no logic; 80/20 rule — ~20% sinkhole OK, ~80% means wrong style; alternative = open all layers (harder change management) (p.158–159).
- Data: single monolithic DB. Cloud: deploy layers separately possible, but on-prem↔cloud latency hurts because flows cross layers (p.159).
- Risks: no fault tolerance (one OOM crashes all); high MTTR (2–15+ min startup) (p.159).
- Governance: ArchUnit `layeredArchitecture()` rules (p.159–160).
- Team topology: works with any (stream-aligned, enabling, complicated-subsystem, platform) (p.160–161).
- Ratings in prose: strengths **overall cost & simplicity** (degrade with size); deployability low; **testability 2★**; **elasticity & scalability 1★** (quantum always 1); responsiveness ~**3★** (p.161–162).
- When to use: small/simple apps, tight budget/time, while still deciding on a more complex style (keep reuse low, inheritance shallow to ease migration). Also for **feasibility**. When not: large/growing systems (p.162–164).

## Ch.11 Modular Monolith (p.165–180)
- Single deployment unit, **domain-partitioned** (`com.app.customer.profile` vs layered `com.app.presentation.customer.profile`); domains = **modules** (p.165–166).
- Two structures (p.166–168): **monolithic structure** (one repo; simple; needs strict governance; risk of over-reuse and chatty modules → Big Ball of Mud) vs **modular structure** (each module a JAR/DLL artifact; cleaner boundaries, separate repos possible; worse when modules must talk a lot).
- **Module communication** (p.168–170): ideally none; **peer-to-peer** (easy to slide into mud; with modular structure leads to shared-interface artifacts and **DLL/JAR Hell**) vs **mediator** (orchestrator decouples modules from each other but couples them to the mediator).
- Data: single DB usually; modules may have own DBs even in a monolith (p.170).
- Cloud: not well suited for on-demand provisioning; small systems can still use cloud services (p.171).
- Risks (p.171): gets too big — warning signs: changes take too long, unexpected breakage elsewhere, team members collide, slow startup; **over-reuse** blurs boundaries → "unstructured monolith"; too much inter-module communication = domains ill-defined.
- Governance (p.172–174): fitness functions that all namespaces start with a listed module; per-module checks for modular structure; **cap on inter-module dependencies** (example limit 5); forbid specific module→module access (ArchUnit). Tools: ArchUnit, ArchUnitNet, NetArchTest, **PyTestArch (Python), TSArch (TS/JS)**.
- Team topology: best with **domain-aligned cross-functional teams**; poor with technically organised teams (p.174–175).
- Ratings in prose: strengths **cost, simplicity, modularity**; **deployability & testability 2★** (slightly better than layered); **elasticity & scalability 1★**; no fault tolerance; high MTTR; quantum 1 (p.175–176).
- When to use: tight budget/time; **starting a new system when direction is unclear** (move later to service-based/microservices); domain-focused teams; mostly domain-based changes; DDD. When not: high scalability/elasticity/availability/fault tolerance/responsiveness/performance needs; mostly technical changes (swap UI/DB tech) → layered is better (p.176–177).
- Example: EasyMeals restaurant (PlaceOrder, Payment, PrepareOrder, Delivery, Recipes, Inventory with AI forecasting) (p.177–180).

## Ch.12 Pipeline (Pipes and Filters) (p.181–192)
- Topology: **filters** (single-task, usually stateless components) connected by **pipes** (one-way, usually point-to-point); usually monolithic; can be distributed (filters as services) (p.181–182).
- Filter types: **producer** (source), **transformer** (map), **tester** (reduce/conditional routing), **consumer** (sink) (p.182–183). Compositional reuse (McIlroy's shell one-liner vs Knuth's Pascal program).
- Pipes: sync or async; prefer small payloads (p.183).
- Data: single DB to one DB per filter (p.184). Cloud: well suited; e.g., AWS Step Functions with each filter a Lambda (Standard vs Express) (p.184–185).
- Risks: overloaded filters; **bidirectional** communication (sign of wrong style); **error handling/exit mid-pipeline**; **contract changes** between filters (p.185–186).
- Governance: hard to fitness-test filter roles; use **tags/annotations** (`@Filter(TRANSFORMER)`, `@FilterEntrypoint`) to declare roles (p.186–188).
- Team topology: works with any (p.188–189).
- Ratings in prose: technically partitioned; quantum 1; strengths **cost, simplicity, modularity**; deployability/testability average (slightly above layered); **elasticity & scalability 1★**; no fault tolerance; making it distributed+async raises operational ratings at the cost of simplicity/cost (p.189–190).
- When to use: distinct, ordered, deterministic one-way steps; tight budgets. Not: high scalability/elasticity/fault tolerance (unless distributed), back-and-forth or nondeterministic workflows (use EDA). Examples: EDI, ETL, Apache Camel, Kafka telemetry pipeline (p.190–192).

**→ designPerspectives (Ch.10–12):**
- Layered: model "layer" groupings with **open/closed** flags; generate ArchUnit/PyTestArch/TSArch layer rules; **sinkhole detector** on dynamic views / traces (percentage of pass-through calls).
- Modular monolith: "module" groupings; fitness rules for namespace membership, max inter-module deps, forbidden module pairs; mediator vs peer-to-peer choice with trade-off card.
- Pipeline: filter-type tags on components (producer/transformer/tester/consumer); lint bidirectional pipes; pipe contract objects; error-exit path required.
- **Pipeline is relevant to designPerspectives' own ingestion engine** (parse → extract → cluster → map → render is a deterministic one-way pipeline).

## Ch.13 Microkernel (Plug-in) Architecture (p.193–208)
- Natural fit for **product-based applications** (downloaded/installed as one monolithic deployment) and for domains needing customisation (per-state insurance rules, per-country shipping) (p.193).
- Topology: **core system** + **plug-ins** (p.193–194). Core = minimal functionality to run (Eclipse = text editor) **or** the happy path; plug-ins absorb the cyclomatic complexity of custom logic (device-specific assessment via registry lookup instead of if/else chains) (p.194–195).
- Core can itself be layered or a modular monolith, or split into domain services each with plug-ins; UI can be embedded, separate, or itself microkernel (p.195–197).
- **Plug-ins** (p.198–200): standalone; ideally **no dependencies between plug-ins**; point-to-point calls to an entry-point class; **compile-based** (simple, needs full redeploy) vs **runtime** (add/remove at runtime; OSGi, Penrose, Jigsaw, Prism). Implementation as shared libraries or as namespaces `app.plugin.<domain>.<context>`. **Remote plug-ins** (REST/messaging, each a service) improve decoupling/scalability/async but make it distributed (hard for on-prem products), add cost/complexity, and a dead plug-in fails requests; still one quantum because of the monolithic core.
- **Spectrum of "microkern-ality"** (p.200–201): pure microkernels (Eclipse, **linters** — the core parses to an AST and plug-ins write rules) vs systems that merely support plug-ins (browsers). Decide by **volatility of the core**.
- **Registry** (p.201): name, data contract, access protocol; simple map to ZooKeeper/Consul.
- **Contracts** (p.201–202): standard per plug-in domain (behaviour + input + output); **adapters** for third-party plug-ins with custom contracts; core shouldn't need to understand plug-in-specific output (e.g., a formatted report string).
- Data (p.202–203): single DB owned by the core; plug-ins get data passed in; plug-ins may own private stores (external or embedded).
- Cloud (p.203): whole app in cloud; data only in cloud; core on-prem + plug-ins in cloud (latency from frequent, data-heavy plug-in calls).
- Risks (p.203–204): **volatile core** (misjudged); **plug-in dependencies** (transitive version conflicts; avoid).
- Governance (p.204): core volatility/churn fitness functions (version-control churn), rate of change of the core, **contract tests** (especially with multiple plug-in versions), topology checks.
- Team topology: core → stream-aligned; plug-ins great for enabling teams (A/B experiments) and complicated-subsystem teams (analytics) (p.204–205).
- Ratings in prose: strengths **simplicity & overall cost**; weaknesses **scalability, fault tolerance, elasticity**; quantum always 1; the **only style that can be both domain- and technically partitioned**; **testability, deployability, reliability 3★**; **modularity & evolvability 3★**; **responsiveness 3★** (small apps; can unplug unused features, e.g., WildFly) (p.205–207).
- Examples (p.207–208): Eclipse, PMD, Jira, Jenkins, browsers; tax software (1040 core + form plug-ins); insurance claims rules per jurisdiction instead of a mud-like rules engine.

**→ designPerspectives:**
- Style catalog entry + core/plug-in groupings, registry and contract objects, plug-in-dependency lint, core-churn fitness function.
- **Directly relevant to designPerspectives' own architecture**: a downloadable **desktop product** that must be extended per language parser, per cloud provider, per IaC format, per LLM provider, per exporter/renderer, per diagram type. The book's own example of a pure microkernel is a linter (core parses to AST, plug-ins add rules) — very close to our ingestion engine. Trade-offs to record in our ADR: compile-time vs runtime plug-ins; in-process vs out-of-process (remote) plug-ins (isolation & language freedom vs latency/complexity); core volatility must be low → keep the model schema and plug-in contracts stable and versioned; avoid plug-in→plug-in dependencies.

## Ch.14 Service-Based Architecture (p.209–226)
- **Hybrid of microservices**, pragmatic; distributed but less complex/costly (p.209).
- Topology: separately deployed UI; separately deployed **coarse-grained domain services**; optional **single monolithic DB**. With a single DB, keep services to **≤ ~12** (p.209). Usually one instance per service; multiple instances need load balancing. UI reaches services via REST (or messaging, RPC, gateway), often with an embedded **service locator** (p.210).
- Domain service internals: layered (API facade, business, persistence) or subdomain-partitioned; **API facade orchestrates internally** (class-level orchestration vs microservices' external orchestration) (p.211–212).
- **ACID vs BASE** (p.212–213): coarse services keep ACID transactions (expired-card rollback inside one service); microservices need compensating updates.
- **Granularity trade-off** (p.213): coarse services → better integrity/consistency, but a change to order placement re-tests and redeploys payment processing too (more risk).
- UI variants: single, per-domain, per-service UIs → more scalability/fault tolerance/agility (p.213–214). Optional **API gateway/reverse proxy** for external exposure, cross-cutting concerns (metrics, security, auditing, discovery), load balancing (p.215).
- **Data topologies** (p.215–218): monolithic DB, partitioned DBs, per-service DB; prefer sharing data over inter-service calls. Antipattern: one shared **entity library** for all tables → any schema change redeploys every service. Mitigation: **logically partition the DB** into domains with matching shared libraries (common, customer, invoicing, order, tracking); lock the "common" library to the DB team. Make logical partitions as fine-grained as possible while keeping well-defined data domains.
- Cloud: works well; services usually containers, not functions (p.219).
- Risks: too much inter-service communication (wrong boundaries or wrong style); too many services (>12) (p.219).
- Governance: **changes shouldn't span multiple domain services**; limit inter-service communication; orchestrate at UI/gateway (p.219).
- Team topology: domain-aligned cross-functional teams; stream-aligned works if streams match domains; enabling teams less effective (coarse services) unless components inside are well identified (p.220).
- Ratings in prose: domain partitioned; quanta ≥ 1 (federated UI/DB → multiple quanta, Going Green example with internal vs customer-facing quanta); **no 5★**, but **4★ agility, testability, deployability, fault tolerance, availability**; **scalability 3★**, **elasticity 2★**; strong on **simplicity & cost** among distributed styles; natural fit for DDD; best ACID support among distributed styles (p.221–224).
- Example (p.224–226): Going Green — Quoting, Item Status (scaled), Receiving, Assessment (volatile), Accounting, Recycling, Reporting; separate customer-facing and internal DBs in separate network zones with one-way firewall access. **"Not every portion of an application needs to be microservices"** (Richards): service-based as a **stepping stone**; split only volatile services (Assessment per device).

**→ designPerspectives:**
- Lint: >12 domain services sharing one DB; shared all-entities library; cross-service change hot-spots (from git history: commits touching multiple services).
- Logical DB partition view (data domains ↔ services ↔ shared libraries).
- "Stepping-stone" migration plan template (monolith → service-based → selective microservices) as a design option in brownfield improvement mode.

## Ch.15 Event-Driven Architecture (EDA) (p.227–281)
- Distributed, asynchronous; usable standalone or embedded in other styles; authors treat it as a style, not just a pattern (p.227).
- **Request-based vs event-based model** (p.227–228): requests are deterministic, data-driven (order history); events are things that happened that the system reacts to (a bid).
- **Topology** (choreographed/broker) (p.228–231): initiating event → event broker (usually **federated** per domain, using topics/streams, pub/sub) → event processor (service) → **derived events** → … until idle. Order-entry example: Order Placement → Notification, Payment, Inventory in parallel; extensible "email sent" event nobody listens to yet; **poison event** = derived events looping forever (avoid). Relay-race analogy; each processor scales independently.
- **Events vs messages** (p.232–233): event = something happened, broadcast, no reply, topic/stream; message = command/query, directed to one, usually expects reply, queue. Broadcasting a command over pub/sub doesn't make it an event.
- **Derived events** can be many per processor (fraud detected / not detected; limit ok/warning/exceeded) (p.233–234).
- **Extensible events**: advertise every action even if nobody listens → future processors plug in without changes (p.235).
- **Asynchronous capabilities** (p.235–238): **responsiveness ≠ performance** (async acknowledge in 25 ms vs 3,100 ms sync; but no guarantee of success; error notification needed). Async avoids **Dynamic Quantum Entanglement** (sync call between quanta fuses them into one quantum: Portfolio Management ↔ Trade Order).
- **Broadcast** → semantic decoupling; basis for eventual consistency and CEP (p.239).
- **Event payload** (p.240–245): **data-based** (all data; fast, no DB queries, works with strict bounded contexts; but multiple systems of record → stale/out-of-order data; contract management & versioning; **stamp coupling** & bandwidth — 500 KB × 500/s vs 30 B) vs **key-based** (only ID; consistency, simple loose contracts, low bandwidth; but every consumer queries DB, DB overload, data may be in another bounded context). Table 15-1: performance/scalability (data good, key bad), contract mgmt (data bad, key good), stamp coupling (data bad), bandwidth (data bad), restricted DB access (data good, key bad), overall fragility (data bad, key good). Choose **per event type**; spectrum.
- **Anemic events**: too little info (profile_updated with only an ID; include changed fields **and prior values**) (p.245–246).
- **Swarm of Gnats** antipattern: too many fine-grained derived events; but one too-coarse event (fraud_checked) forces every consumer to inspect payload → split by **outcome** (fraud_detected / no_fraud_detected); bundle field-level changes into one profile_updated with before/after (p.246–249).
- **Error handling — Workflow Event pattern** (p.249–252): consumer delegates errors to a workflow processor and moves on (keeps responsiveness); processor auto-repairs (rules/ML) or routes to a human dashboard; resubmitted messages arrive **out of order** → hold later messages for the same context (account) in FIFO until fixed.
- **Preventing data loss** (p.253–255): AMQP exchanges/queues, JMS durable subscribers, Kafka (different techniques). Three loss points; fixes: persistent queues + **synchronous send**; **client acknowledge mode**; ACID commit + **last participant support**.
- **Request-reply** (pseudo-synchronous) (p.256–258): request & reply queues; **correlation ID** (recommended) vs **temporary queue** (simpler, but broker overhead at volume).
- **Mediated EDA** (p.258–268): event mediator orchestrates via **messages (commands)** on point-to-point queues; multiple mediators per domain (avoid single point of failure). Implementation choice by complexity: simple (Camel, Mule, Spring Integration), hard (BPEL engines), complex long-running with humans (BPM e.g., jBPM); **mediator delegation model** classifies events simple/hard/complex. Mediator holds state, handles errors, restarts from a step (expired card → stop before fulfil). Disadvantages: hard to model dynamic flows declaratively (hybrids common), mediator must scale (bottleneck), less decoupled, lower performance. **Trade-off: workflow control & error handling vs performance & scalability.**
- **Data topologies** (p.268–274): **monolithic DB** (no inter-processor calls for data; but DB is a single point of failure, scaling limit, change control across processors, single quantum); **domain DB** (better fault tolerance/scalability/change control; cross-domain data needs sync calls → reconsider boundaries); **dedicated DB per processor** (best fault tolerance/scalability/change control; expensive; most sync coupling for shared data; good when processors are self-contained).
- Cloud: very good fit (p.275).
- **Risks** (p.275): nondeterministic side effects; static coupling via payload contracts (unknown consumers); too much sync communication (sign EDA is wrong); **state management** — hard to know when an initiating event is fully processed.
- **Governance** (p.276): largely nonstructural, via observability/logs; govern **contract change rate**, **stamp coupling** (track unused fields consumers never read), **sync calls between processors** (fitness functions over logs/annotations).
- Team topology: technically partitioned; stream-aligned teams struggle as EDA grows; enabling teams poor fit; complicated-subsystem good; platform teams own brokers/event hubs (p.276–277).
- Ratings in prose (p.277–280): technically partitioned; quanta 1..many (shared DB or request-reply merges quanta); **performance, scalability, fault tolerance 4–5★** (4★ because of the DB); **simplicity & testability low** (nondeterministic event trees); **evolutionary 5★**. Hard: workflow control, knowing completion, error handling, **recoverability** (can't simply resubmit).
- **Request vs event model choice** (p.280, Table 15-2): event model gives dynamic content response, scalability/elasticity, agility, extensibility, responsiveness/performance, real-time decisions, situational awareness — at the cost of eventual consistency only, less flow control, less outcome certainty, hard testing/debugging. Choose request-based for well-structured data-driven requests needing certainty/control.
- Example: Going, Going, Gone bidding (Bid Capture → bid placed → Auctioneer, Bid Streamer, Bidder Tracker) (p.280–281). If most processing is request-based, consider microservices instead.

**→ designPerspectives:**
- Model elements for **event**, **message**, **topic/stream**, **queue** (each queue/topic a C4 container per the C4 book); relationship kinds: publishes, subscribes, sends command, request-reply.
- **Event-flow view** (dynamic view variant): initiating event → processors → derived events; detect **poison loops** (cycles in event graph), **unconsumed (extensible) events** (informational), **swarm** (too many derived events from one processor), and **anemic** events (payload schema lacks changed/prior fields — heuristic).
- Payload decision card per event: data-based vs key-based with Table 15-1 trade-offs; stamp-coupling estimate (payload size × rate) from user inputs.
- Choreography vs mediator decision card (control & error handling vs performance & scalability); mediator complexity classification (simple/hard/complex).
- Data-loss checklist per async edge (persistent queue, sync send, client ack, last participant support).
- Data topology choice per EDA domain with fault-tolerance/scalability/change-control/sync-coupling consequences.
- Runtime traces (OpenTelemetry) are especially valuable here: they reveal the actual nondeterministic event trees.

## Ch.16 Space-Based Architecture (p.283–314)
- Problem: scaling web → app → DB just moves the bottleneck; the DB is the final limit (triangle topology) (p.283–284).
- Idea (tuple space): replace the central DB as a **synchronous constraint** with **replicated in-memory data grids**; DB updated asynchronously via **data pumps** (p.284–285).
- Artifacts (p.285–301): **processing units** (app logic + in-memory grid; Hazelcast, Apache Ignite, Oracle Coherence); **virtualized middleware** = **messaging grid** (request routing & session; HAProxy/Nginx), **data grid** (replication, usually inside PUs, <100 ms), optional **processing grid** (orchestration; often fine-grained orchestrator PUs per workflow), **deployment manager** (start/stop PUs by load; cloud/Kubernetes); **data pumps** (async messaging, contracts with add/update/delete actions; per domain or per cache); **data writers** (domain-based vs dedicated per pump); **data readers** (only on cold start/total crash/redeploy or archive reads; reverse data pump; cache lock owner).
- **Replicated vs distributed cache** (Table 16-1, p.291–294): replicated → performance, small (<100 MB), relatively static data, low update rate, high fault tolerance; distributed → consistency, large (>500 MB), highly dynamic, high update rate, lower fault tolerance (single point unless mirrored). Use **per PU** (inventory → distributed; profile → replicated). **Near-cache not recommended** (front caches differ per PU) (p.295).
- Data writers/readers form a **data abstraction layer** (contracts decouple cache schema from DB schema; transformation logic buffers DB changes) (p.301–302).
- Data topologies flexible; choose by reporting/analytics, throughput, domain consistency, downstream consumers (p.302).
- Cloud: unique **hybrid** — PUs in cloud, DB on-prem, synced via async pumps (p.302–303).
- Risks (p.303–307): frequent DB reads (archive-heavy or frequent cold starts → wrong style); sync bottleneck in pumps (stale downstream data); data loss in pumps (persistent queues + client-ack, at a responsiveness cost); high data volumes (memory); **data collisions** in active/active replication — **CollisionRate = N × UR² / S × RL** (worked tables: 20 updates/s, 5 instances, 50k rows, 100 ms RL → 14.4/hour, 0.02%; 1 ms RL → 0.1/hour; 2 instances → ~5.8/hour; 10k rows → 72/hour). Compute min/normal/peak.
- Governance (p.307–310): fitness functions for **memory per PU × instances**, **cache→DB sync time** (request ID timestamps), **data-pump queue depth**, DB read frequency, plus scalability/elasticity/responsiveness measures.
- Team topology: best with technically aligned teams; stream-aligned teams struggle at scale; enabling & complicated-subsystem teams fit (data grid, pumps, collisions); platform teams own middleware (p.310–311).
- Ratings in prose (p.311–312): **elasticity, scalability, performance 5★**; **testability 1★**; simplicity low; **cost high** (complexity, licences, resources); technically partitioned; quanta defined by UI↔PU associations and sync PU communication (DB not part of quantum).
- Use cases: >10,000 concurrent users / spiky load — concert ticketing (pre-warm PUs before sale), online auctions (PU per auction) (p.313–314). The only style maximising responsiveness + scalability + elasticity together; specialised.

**→ designPerspectives:**
- Style catalog entry with PU / data-pump / data-writer / data-reader element kinds.
- **Calculators** as design aids: collision-rate calculator (formula above), cache-type chooser (Table 16-1), sync-time and memory budget fields. Generic pattern: the tool should host small **trade-off calculators** that turn book formulas into interactive widgets.

## Ch.17 Orchestration-Driven Service-Oriented Architecture (SOA) (p.315–328)
- Mostly historical; shows how a logical organisational idea (maximal reuse) ignores the First Law (p.315).
- **Taxonomy** (p.317–319): **business services** (coarse, signatures only, "Are we in the business of…?" test), **enterprise services** (fine-grained shared building blocks, e.g., CreateCustomer), **application services** (one-off), **infrastructure services** (monitoring, logging, auth), **orchestration engine + message bus** (ESB; transaction boundaries, transformation; integration architects become a political bottleneck — Conway).
- All calls flow through the engine (p.319–320).
- **Reuse → coupling** (p.320–322): canonical Customer service couples six divisions; a change ripples everywhere; disability insurance carries auto-insurance fields (driver's licence). DDD's avoidance of holistic reuse comes from this. Domain concepts "ground to dust" across tiers; a simple change may touch dozens of services.
- Data: one or few relational DBs; **declarative transactions** largely failed (leaky abstraction) (p.322–323).
- Modern use: **integration architecture** (ESB as hub) for cloud + on-prem/legacy (p.323). Risk: **Accidental SOA** — ESB gradually swallowing the architecture (p.323–324).
- Governance: historically manual; modern use: log-based fitness functions preventing data/bounded contexts leaking across integration points (e.g., only Accounting may be updated from ERP/Sales flows) (p.324–325).
- Team topology: strict taxonomy was a communication antipattern that motivated team topologies (p.325).
- Ratings in prose: most technically partitioned style ever; **single quantum** despite being distributed (shared DB + orchestration engine); deployability & testability "disastrous"; elasticity & scalability supported with effort; performance never a highlight; simplicity & cost inverted (p.325–327).

**→ designPerspectives:** style entry flagged as "integration / legacy"; lint for **Accidental SOA** (one container with very high fan-in/fan-out that holds orchestration logic); **canonical-entity warning** when one shared entity/schema is referenced by many bounded contexts.

## Ch.18 Microservices (p.329–357)
- Named early (Fowler & Lewis, 2014); inspired by DDD **bounded context**; "share nothing"; **prefer duplication over reuse** (reuse = coupling) (p.329–330).
- Topology: small single-purpose services, each with its own process and data; performance cost from network calls and per-endpoint security; **avoid transactions across services**; granularity is the key decision (p.330–331).
- **Granularity guidelines** (p.332–333): "a label, not a description" (Fowler). Boundaries by **purpose** (functional cohesion), **transactions** (entities that must cooperate transactionally belong together), **choreography** (chatty services → bundle back). Iterate.
- **Data isolation** (p.333): no shared schemas as integration points; avoid Entity Trap; choose source-of-truth service or replicate/cache; polyglot persistence per team.
- **API layer** (p.334): routing + cross-cutting concerns only; **no business logic / orchestration in the gateway**.
- **Operational reuse** (p.334–337): **Sidecar** for monitoring/logging/circuit breakers; sidecars form a **service mesh** via a service plane (e.g., Istio); **service discovery** for elasticity (often in mesh or API layer).
- **Frontends** (p.338–339): monolithic UI vs **micro-frontends**.
- **Communication** (p.339–340): **protocol-aware heterogeneous interoperability**; "enforced heterogeneity" anecdote (different stacks per team to prevent accidental sharing).
- **Choreography vs orchestration** (p.341–344): choreography keeps decoupling but makes error handling/coordination harder; **Front Controller** pattern (a choreographed service turning into a mediator); orchestration service concentrates coupling in one place for complex workflows.
- **Transactions & sagas** (p.345–348): "don't!" — fix granularity instead (cross-service transactions = Connascence of Values); if unavoidable, **Saga** with a mediator and **compensating transactions** (pending states, heavy coordination traffic); eight saga patterns in *Software Architecture: The Hard Parts* (ch.12). If cross-service transactions dominate, microservices is the wrong style.
- **Data topologies** (p.348–351): monolithic and domain DBs not viable (60 services sharing a DB; broken bounded context; DB scaling & connection limits; single point of failure). Standard: **Database-per-Service**. Sharing allowed for a small group (**≤5–6 services per DB/schema**) forming a broader bounded context (payment types, shipping methods); trade-off: coordinated schema changes.
- Cloud (p.351): "cloud-native"; **serverless is a deployment model of microservices**, not a style; containers equally valid.
- **Risks** (p.351–352): **Grains of Sand** (too fine-grained); too much inter-service communication (merge services); too much data sharing; **code reuse via shared libraries** breaks bounded contexts.
- **Governance** (p.352–353): monitor **static coupling** (shared libraries, contracts; SBOMs, deployment scripts, dependency tools) and **dynamic coupling** (consistent call logging via a shared logging library; or services registering their inter-service calls in a config server like ZooKeeper → call map).
- Team topology: domain-aligned teams; stream-aligned if streams match bounded contexts; enabling teams for shared/cross-cutting services and sidecars; platform teams own sidecars/mesh (p.353–354).
- Ratings in prose (p.354–356): high **deployability & testability** (automation), high **fault tolerance**, high **scalability, elasticity, evolvability**; **performance** often an issue (network, security checks, data latency; mitigated by caching/replication and choreography); domain partitioned; **most distinct quanta** of any style.
- Example: patient vital-signs monitoring (one service per vital sign, own data; shared Alert Staff and Display Vital Signs services) (p.356–357).

**→ designPerspectives:**
- Granularity assistant for distributed designs: shows purpose/transaction/choreography signals per candidate service; warns about **Grains of Sand** (very small services with high call fan-out) and cross-service transactions.
- Data-ownership view: which service owns which tables; shared-DB groups (warn > 5–6 services per schema).
- Gateway lint: business logic attached to an API gateway element.
- Static/dynamic coupling dashboards: shared-library usage across services (from manifests/SBOM), call map (from code, traces, or config).
- Saga modelling: dynamic view with compensating steps; checklist for compensation-failure path (ties to fallacy #10).

## Ch.19 Choosing the Appropriate Architecture Style (p.359–370)
- "It depends." Style choice is the culmination of characteristics + domain + strategy analysis (p.359).
- **Shifting fashion** drivers: observations of past pain, ecosystem change, new capabilities (containers), acceleration (generative AI), domain changes, technology changes, external factors (licensing) (p.359–360).
- **Decision criteria** — only choose when you understand (p.361–362): the **domain**; **characteristics that impact structure** (star charts compare characteristics, not domains); **data architecture**; **cloud deployments** (data volume and movement costs); **organisational factors** (vendor cost, M&A → open/integration architectures); **process, team and operational maturity** (immature Agile practices make microservices hard); **domain/architecture isomorphism** (shape match: customisation → microkernel; many discrete operations like genome analysis → space-based; highly semantically coupled multi-page insurance forms → not microservices, rather service-based).
- **Three determinations** (p.363–364): (1) **monolith vs distributed** (one set of characteristics vs several; use quanta); (2) **where data lives** (and how it flows); (3) **sync vs async** — "Use synchronous communication by default, asynchronous when necessary."
- **Outputs of the design process** (p.364): architecture topology (style + hybrids), **ADRs** for the hardest parts, **fitness functions** protecting principles and operational characteristics.
- **Case: Silicon Sandwiches** (single quantum → monolith) (p.364–367): (a) **modular monolith** with an Override component for customisation (verify every domain component references Override with a fitness function); (b) **microkernel** with common and local plug-ins each with own data, plus **Backends for Frontends (BFF)** adapters per device. Sync communication is fine.
- **Case: Going, Going, Gone** (distributed) (p.367–370): microservices chosen over pure EDA because it better supports varying operational characteristics; services: Bid Capture (no persistence, async to Bid Tracker), Bid Streamer, Bid Tracker (two async inbound flows buffered by queues), Auctioneer Capture, Auction Session, Payment (third party; async because it handles one payment / 500 ms), Video Capture, Video Streamer; **five quanta** (Payment, Auctioneer, Bidder, Bidder Streams, Bid Tracker). "Not the correct design… the least worst set of trade-offs."

**→ designPerspectives — Stage 2 gate:** the style picker requires the user to have completed domain intake, driving characteristics, and data/cloud/org/team-maturity questions. It presents candidate styles with a **fit score** = (style ratings × user's top characteristics) plus isomorphism hints, then the three determinations as explicit decisions (each an ADR). Output of the stage = topology + ADRs + fitness functions (exactly the book's list). Default edge style = sync; async must be justified.

## Ch.20 Architectural Patterns (p.371–384)
- Patterns = contextualised solutions; avoid "best practice" thinking; identify the **pattern first**, then pick an implementation (p.371).
- **Reuse — separating domain and operational coupling** (p.372–375): microservices "duplication is preferable to coupling" for domain; operational concerns (monitoring, logging, auth, circuit breakers) benefit from coupling. **Hexagonal / Ports & Adapters** (Cockburn) — caveat: treats the DB as just an adapter, conflicting with DDD's view that schemas are business logic; today **Sidecar + Service Mesh** implement the separation. **Orthogonal coupling** concept. Sidecar/mesh trade-offs (Table 20-1): + consistent isolated coupling, consistent infra coordination, flexible ownership; − one sidecar per platform, sidecar can grow complex, implementation drift between teams.
- **Communication — orchestration vs choreography** (p.375–378): orchestration + centralised workflow, error handling, recoverability, state management; − responsiveness bottleneck, single point of failure, lower scalability, tighter service coupling. Choreography + responsiveness, scalability, fault tolerance, decoupling; − distributed workflow, state management, error handling, recoverability all harder.
- **CQRS** (p.378–379): separate write store from (usually async-synced) read store; isolate different characteristics, security, models for reads vs writes.
- **Infrastructure — Broker-Domain pattern** (p.379–384): sender usually owns the topic/queue. **Single broker**: + centralised discovery, least infrastructure; − fault tolerance, throughput limits. **Domain-Broker** (broker per group of related services): + isolation, matches domain boundaries, more scalable; − harder discovery, more infrastructure cost, more moving parts.

**→ designPerspectives:** a **pattern catalog** separate from the style catalog (hexagonal, sidecar/mesh, orchestration, choreography, CQRS, single-broker, domain-broker, saga, BFF, workflow-event, request-reply…), each with its trade-off table copied into decision cards; patterns can be **applied** to selected elements (e.g., "apply CQRS to Orders container" proposes read/write stores + sync edge).

# Part III — Techniques and Soft Skills

## Ch.21 Architectural Decisions (p.387–403)
- Good decisions guide teams; making them = gather info, justify, document, communicate (p.387).
- **Antipatterns** (progressive) (p.387–390):
  - **Covering Your Assets** — deferring out of fear. Fix: decide at the **last responsible moment** (when cost of deferral exceeds risk reduction; avoid Analysis Paralysis); collaborate with dev teams (replicated cache example discovered memory limits).
  - **Groundhog Day** — endless re-discussion because justification is missing; give **technical and business** justifications. Common business justifications: **cost, time to market, user satisfaction, strategic positioning**. No business value → reconsider the decision.
  - **Email-Driven Architecture** — decisions lost in email; keep **one system of record** and link to it; notify only people directly impacted.
- **Architecturally significant** (Nygard) (p.390–391): decisions affecting **structure, non-functional characteristics, dependencies, interfaces, construction techniques**. A technology choice made to support a characteristic is architectural.
- **ADRs** (p.391–402): short text files (Markdown/AsciiDoc); ADR Tools (Nat Pryce). **Sections**: Title (numbered), **Status** (Proposed, Accepted, Superseded; plus **RFC with deadline**), Context (forces + alternatives briefly), Decision (affirmative voice "We will…", with justification — the *why*), Consequences (impact + trade-off analysis), **Compliance** (how governed: manual or fitness function), **Notes** (author, approval date, approver, superseded date, last modified, modified by, last modification); optional **Alternatives** section.
- Superseded chains (ADR 42 superseded by 68) prevent re-litigating (p.393).
- **Approval criteria** to agree up front: **cost** (hours × FTE rate; e.g., > $5,000 → ARB), **cross-team impact**, **security** (p.394).
- Example ADR 76 (separate queues for Bid Streamer and Bidder Tracker): context, decision with reasons (FIFO ordering, first-bid-only vs all bids, backpressure for slower DB writer), consequences (clustered HA queues, duplicate sends, internal events bypass gateway security — accepted by ARB), compliance (manual code review), notes (p.398–399).
- **Storing ADRs** (p.400–401): one file/page per ADR; for larger orgs prefer a **dedicated ADR repo/wiki** over the app repo; structure: `application/common`, `application/<app>`, `integration`, `enterprise`.
- **ADRs as documentation**; **ADRs for standards** (justify or drop the standard); **ADRs for existing systems** (reverse-document significant past decisions, re-question them) (p.401–402).
- **Generative AI and LLMs in decisions** (p.402–403): LLMs answer by probability/"best practice", which has no place in architectural decisions; decisions require translating business concerns into characteristics and analysing trade-offs in context (single payment service vs per-type: performance vs maintainability; time-to-market → maintainability wins). Authors' experiments: best use is having the AI **outline possible trade-offs and spot missed ones**; AI has knowledge but lacks the wisdom to pick.

**→ designPerspectives (critical for the LLM role):**
- **The LLM never makes the final architectural decision.** It (1) generates options, (2) fills trade-off tables, (3) flags missed trade-offs and fallacies, (4) drafts ADR text. The human picks; the tool records the pick with business + technical justification. This directly follows the book's recommendation.
- ADR template = book's 7 sections (+ Alternatives), statuses incl. RFC-with-deadline; supersede links; "architecturally significant?" check using Nygard's five criteria.
- **Last-responsible-moment** helper: decisions can be parked as "Deferred until <trigger>" with a cost-vs-risk note (avoid Covering Your Assets).
- **Groundhog Day guard**: decision can't be Accepted without both a business justification (cost / time to market / user satisfaction / strategic positioning) and a technical one.
- **Email-Driven guard**: every decision has a stable link; "notify impacted" uses ownership data to list only affected owners.
- Approval rules configurable (cost threshold, cross-team, security) → permissions model: certain roles can only Propose.
- ADR storage layout `application/common|<app>`, `integration`, `enterprise` supported; brownfield mode prompts "reverse ADRs" for detected significant decisions (e.g., shared DB detected → "Why?").

## Ch.22 Analyzing Architecture Risk (p.405–422)
- **Risk matrix** (p.405–406): impact (1–3) × likelihood (1–3); 1–2 low (green), 3–4 medium (yellow), 6–9 high (red); use shading too for grayscale/colour-blind readers. Rate **impact first**, then likelihood; if likelihood unknown, use 3. Example: central DB availability — high impact × low likelihood (clustered) = 3.
- **Risk assessment** (p.406–409): rows = **critical architecture characteristics** as criteria; columns = **contexts** (domains/subdomains — service level is too fine-grained); totals per row and column reveal riskiest criterion and context. **Filter** to high risks for stakeholder presentations (signal vs noise). Add **direction** (▲ worse, ▼ better, ● unchanged) from continuous fitness-function measurements; always include a key.
- **Risk storming** (p.410–416): collaborative; include senior devs and tech leads. Three phases using an architecture diagram: (1) **Identification** — individually (to avoid influence), sticky notes with matrix scores, preferably **one criterion or context per session**; (2) **Consensus** — place notes on the diagram, discuss disagreements (ELB 3 vs 6; one person's experience flags Push Expansion Servers 9); **unknown/unproven technology = 9** ("What's a Redis cache?" → training or change technology); (3) **Mitigation** — architecture changes; involve business stakeholders because mitigation costs money (e.g., $50k clustering rejected; $16k domain DB split accepted).
- **User-story risk analysis** with the same matrix (impact of not finishing × likelihood of not finishing) (p.416).
- **Use case: nurse diagnostics hotline** (p.416–422): requirements (third-party diagnostics engine 500 req/s; 250 nurses; hundreds of thousands of self-service patients; HIPAA; outbreak spikes; skill-based routing). Sessions:
  - Availability: central DB 6 → split into clustered nurse-profile DB + single case-notes DB; third-party engines → check **SLAs** (99.99% ≈ 52.6 min/yr; 99.90% ≈ 8.77 h/yr) and record them on the diagram.
  - Elasticity: diagnostics engine interface 9 → async queues (backpressure), **Ambulance pattern** (priority channel for nurses), and a **Diagnostics Outbreak Cache Server**.
  - Security: shared API gateway 6 → **separate gateways per user type**.
- Risk storming is continuous (after major features or each iteration) (p.422).

**→ designPerspectives (risk is a first-class feature):**
- **Risk perspective** on any view: per-element risk scores per criterion, colour + pattern/shading, direction arrows (from fitness-function history), key auto-generated.
- **Risk assessment grid** (criteria × contexts) auto-built from the driving characteristics and domain groupings; filter to high risks; export.
- **Risk-storming session mode** (local-first, single machine): facilitator creates a session for one criterion; participants score **privately** (separate passes/profiles so scores are hidden until reveal); reveal → disagreements highlighted; mitigation proposals become model change proposals + ADRs with cost field for business sign-off. (Multi-user later; v1 can collect scores via exported/imported files.)
- Rule: technologies tagged "unfamiliar" by any participant or not on the team's radar default to 9.
- SLA/SLO fields on external systems; availability math helper (nines → downtime/year).
- User-story risk using the same matrix in the hand-off task list.

## Ch.23 Diagramming Architecture (p.423–431)
- **Representational consistency**: always show where a part sits in the whole before zooming (p.423–424).
- **Irrational Artifact Attachment**: attachment grows with time invested; prefer low-fidelity, ephemeral artifacts early (index cards, sticky notes, tablet + projector; copy-paste "what-if" scenarios) (p.424–425).
- Tool features baseline (p.425–426): **layers** (show/hide, incremental build), **stencils/templates** (consistent org components), **magnets** (line snapping). **Use layers semantically**: base layer = topology (containers, databases, dependencies, brokers; say "synchronous communication" not a protocol), next layer = implementation details (DB type, protocols), further layers = DDD boundaries, transactional scope, other meta-info.
- Standards (p.426–428): UML (class & sequence still used), **C4** (Context, Container, Component, Class; good standardisation choice; the book's own C4 component diagram for Silicon Sandwiches), ArchiMate (enterprise; "as small as possible").
- Guidelines (p.428–430): titles on all elements; visible lines with arrows; **solid = synchronous, dotted = asynchronous** (one of few general standards); own consistent shapes (authors: 3D boxes = deployable artifacts, rectangles = containers, cylinders = databases); label everything; use colour but add iconography for colour-blind readers; include a key ("an easily misinterpreted diagram is worse than no diagram").
- Standards with reasonable exceptions; lightweight tools early; avoid CASE-style over-modelling (p.431).

**→ designPerspectives:**
- **Sketch mode** for early stages: low-fidelity rendering (hand-drawn style, plain boxes) so users don't over-invest; "promote to model" when settled. Directly addresses Irrational Artifact Attachment.
- **What-if branches**: duplicate the model state for alternatives, compare side-by-side.
- Semantic **layer system**: topology (abstract: sync/async), implementation (protocols, products), domain boundaries, transaction scope, risk, ownership, security… (aligns with C4 book's perspectives).
- Line conventions default: solid = sync, dotted = async (both books agree on line-style differentiation; C4 book uses it as an example, FoSA calls it a general standard).
- Accessible styling: colour + icon/pattern; auto key.
- Zoom transitions and breadcrumb for representational consistency.

## Ch.24 Making Teams Effective (p.433–452)
- **Collaboration**: traditional one-way handoff from architect (characteristics, styles, logical components) to developers (class diagrams, UI, code) fails; make it bidirectional, same virtual team; architect mentors (p.433–435).
- **Constraints and boundaries** = the "room" the team works in; too tight → frustration/attrition; too loose → developers make architecture decisions, too many POCs (p.435–436).
- **Personalities** (p.436–439): **control-freak** (too fine-grained: library bans, naming, method lengths, pseudocode; architect's job is the logical component and its core operations, e.g., Reference Manager's GetData/SetData/ReloadCache/NotifyOnUpdate, not its internal design), **armchair** (disconnected, too high-level two-box diagrams; signs: weak domain/tech knowledge, little hands-on, ignores implementation implications), **effective** (appropriate boundaries, removes roadblocks).
- **How much involvement — Elastic Leadership** (Osherove) (p.439–442): five factors: **team familiarity, team size** (>12 large, ≤5 small), **overall experience**, **project complexity**, **project duration** (longer → more involvement). Score each ±20 (+ = more involvement/control-freak side, − = armchair side); scenario totals −60 (hands-off) and +20 (mentor). Re-evaluate continually; weight factors as needed.
- **Team warning signs** (p.443–445): **process loss** (Brooks's Law; merge conflicts → look for parallel work streams before adding people), **pluralistic ignorance** (silent skeptics; facilitator invites them to speak), **diffusion of responsibility** (things dropped → team too large).
- **Checklists** (p.445–449): use for unordered steps that people skip, not procedural dependent steps or routine tasks; keep small; automate items where possible; obvious items get missed; **Hawthorne effect** (spot-checks). Three useful lists: **developer code-completion** (definition of done: uncovered standards, absorbed exceptions, project-specific rules), **unit & functional testing** (special characters, min/max, extremes, missing fields; add every QA-found case), **software release** (config changes, new third-party libraries, DB migrations; add an item after every failed deploy).
- **Providing guidance via design principles** (p.450–452): library requests answer (1) overlap with existing functionality? (2) technical **and business** justification (Scala anecdote). Graphical decision rights for the layered stack: **special-purpose** libs (devs decide), **general-purpose** (devs analyse and recommend, architect approves), **framework** (architect's responsibility).

**→ designPerspectives:**
- **Decision-rights matrix** (permissions): which roles may decide/recommend/approve per decision category (special-purpose lib, general-purpose lib, framework, style, data topology…). This becomes the core of the persona permissions model (your Q6 answer).
- Hand-off tasks to coding agents include **constraints at the right granularity**: component responsibilities, interfaces/operations, allowed dependencies, fitness functions — but not internal class design (avoid "control-freak" specs) unless the component was explicitly designed at C4 level.
- Generated **checklists** in hand-off packages: code-completion, testing, release (from the book's three), editable per workspace; items that can be automated are flagged for fitness functions instead.
- Library-request flow: "add dependency" proposals in the model require overlap check (tool can detect overlaps from manifests) + business/technical justification.
- Elastic-leadership calculator (optional, for tech-lead persona) — low priority.

## Ch.25 Negotiation and Leadership Skills (p.453–468)
- Almost every architect decision will be challenged; negotiation is core (p.453).
- **With business stakeholders** (p.453–456): read buzzwords for real concerns ("needed it yesterday" → time to market; "lightning fast" → performance; "zero downtime" → availability); gather information first; express nines as downtime (Table 25-1: 90% ≈ 36.5 days/yr; 99% ≈ 87 h 46 min; **99.9% ≈ 8 h 46 min/yr (86 s/day)**; 99.99% ≈ 52 min 33 s; 99.999% ≈ 5 min 35 s; 99.9999% ≈ 31.5 s); cost and time as **last resort** arguments; **divide and conquer** (which parts truly need five nines?).
- **With other architects** (p.456–457): "demonstration defeats discussion" (compare options in a production-like environment, not by search or a generative-AI prompt); stay calm; pause heated discussions.
- **With developers** (p.457–459): avoid Ivory Tower; give the **justification before the demand** (book example: state that change control is the priority, hence closed layers, and only then state the rule; use "this means" rather than "you must"); let developers arrive at the solution (prove Framework Y meets security → either buy-in or a better solution).
- **Leadership** (p.459–465): ~50% people skills; **4 Cs of architecture leadership: communication, collaboration, clear, concise**; avoid **accidental complexity** (vs essential); **pragmatic yet visionary** (budget, time, team skills, trade-offs, technical limits; find bottlenecks before a data mesh); lead by example; collaborative language ("Have you considered…?"); turn requests into favours; use names; be the go-to person; brown-bag sessions.
- **Integrating with the team** (p.465–468): control meetings (ask for agendas; attend in place of developers; schedule at day edges; protect **flow state**); sit with/be visible to the team; remote: *Communication Patterns* (Jacqui Read).

**→ designPerspectives:**
- **Availability calculator** (nines ↔ downtime) on characteristic definitions and external-system SLAs; "divide and conquer" prompt: scope a demanding characteristic to specific quanta rather than the whole system (ties to Ch.7 scoping).
- **Spike/POC tasks** as a decision-making option ("demonstration defeats discussion"): a decision card can spawn a POC hand-off for a coding agent comparing options, with results attached to the ADR.
- LLM output style for explanations to developers: reason-before-rule phrasing and suggestions as questions; business persona explanations use downtime/time/cost terms rather than jargon.
- Accidental-complexity nudge: when the model grows elements/edges without corresponding requirements/characteristics, flag possible accidental complexity.

## Ch.26 Architectural Intersections (p.469–485)
- Architecture must align with nine intersections (p.469–470): **implementation, infrastructure, data topologies, engineering practices, team topologies, systems integration, the enterprise, the business environment, generative AI**.
- **Implementation** (p.470–475) — three alignments:
  - *Operational concerns*: e.g., microservices chosen for scalability/elasticity, but developers add in-memory replicated caches for responsiveness → OOM at ~80,000 users; both made "good" decisions for different goals.
  - *Structural integrity*: code directory/namespace structure must match the logical architecture; govern with ArchUnit, ArchUnitNet, NetArchTest, PyTestArch, TSArch.
  - *Constraints* (e.g., all DB logic in Persistence; Presentation must go through all layers) must be communicated and governed.
- **Infrastructure** (p.475–477): Pets.com and elastic scale; misalignment often blamed on architects; DevOps arose from it; cloud examples: cross-region/AZ deployment can cancel replicated-cache benefits; co-locating pods on one VM improves performance but hurts scalability/fault tolerance/availability/elasticity.
- **Data topologies** (p.477–479): topology (monolithic, domain, per-service) must match style; **database type superpowers** should match style superpowers (key-value and columnar amplify scalability/elasticity — ratings in *Software Architecture: The Hard Parts*); **data structure** (relational vs document vs key-value → polyglot); **read/write priority** (write-heavy → columnar; read-heavy → key-value, document, graph; balanced → relational/NewSQL).
- **Engineering practices** (p.480–481): process vs engineering practices (XP, CI, CD, TDD); estimation is software's Achilles' heel; iterative processes suit architecture and style migrations (**Strangler pattern**, feature toggles); microservices assume automation; fitness functions detect misalignment (agility = maintainability + testability + deployability measured continuously).
- **Team topologies** (p.481–482): team partitioning (domain vs technical) should match architecture partitioning.
- **Systems integration** (p.482): availability/scale compatibility of called systems; protocols, contracts, characteristic compatibility, preserving each system's quantum.
- **Enterprise** (p.482–483): security, platform, documentation, diagramming standards; ignoring them gets solutions scrapped as "one-offs".
- **Business environment** (p.483–484): cost-cutting vs expansion (M&A) → style fit; **unknown unknowns** (Richards' point, paraphrased: unknown unknowns force every architecture to become iterative; Agile just accepts that earlier); evolutionary architecture; **residuality theory** (Barry O'Reilly: business change as stressors, architectural changes as residues).
- **Generative AI** (p.484–485): (a) *in* architectures — abstraction/modularity so LLMs are swappable, with guardrails and **evals**, observability (e.g., Langfuse); (b) *as assistant* — prompts for risk assessment, mitigation, antipatterns, decisions rarely yield the right answer (knowledge without wisdom; teaching context is slower than solving); promising: interpreting diagrams into descriptions (Thoughtworks Haiven), **translating PlantUML or pseudolanguage architecture descriptions into executable ArchUnit governance code**.

**→ designPerspectives:**
- An **Intersections checklist** per design (nine items) as a final gate before hand-off; each item links to model data (deployment views for infrastructure, data topology view, team ownership, integration edges, enterprise standards library, business-environment notes).
- **Enterprise standards library** in the workspace (allowed technologies, required patterns, diagram conventions) checked by lints; violations produce warnings/ADRs.
- Brownfield drift = implementation alignment (operational, structural, constraints) — exactly the three checks above.
- Data-store chooser hints (structure + read/write priority + style superpowers).
- Migration planning supports Strangler-pattern sequencing.
- **LLM integration design follows the book**: provider abstraction (swappable), guardrails, **evals** on the tool's own LLM tasks (e.g., component-clustering quality vs human-accepted mappings), LLM-call observability; and the model → **fitness-function code generation** use case is explicitly endorsed as promising.

## Ch.27 The Laws of Software Architecture, Revisited (p.487–496)
- **First Law** (p.487–494): the architect's real job is trade-off analysis; be an **objective arbiter**, not an evangelist (yesterday's best practice becomes tomorrow's antipattern).
  - **Shared library vs shared service** (Table 27-1): heterogeneous code (service +), high code volatility (service +), versioning (library +), change risk (library +), performance (library +), fault tolerance (library +), scalability (library +).
  - **Queue vs topic** (Tables 27-2, 27-3): queues — heterogeneous messages, per-queue monitoring, more secure; but more coupling, multiple connections, more infrastructure, less extensible. Topics — low coupling, one message, extensible; but homogeneous message (stamp coupling), can't monitor/scale consumers individually, less secure, fewer scalability options. Choose by organisational priority (security vs growth/extensibility).
  - **Corollary 1 — missing trade-offs**: code reuse needs good **abstraction** *and* **low volatility**; domain code is the most volatile → poor reuse target ("plumbing" is the good target). You **cannot have both decoupling and high reuse**.
  - **Corollary 2 — you can't do it just once**: many variables; avoid sweeping permanent decisions.
- **Second Law** (p.494–495): why > how — record trade-off analysis in ADRs and diagrams. **Out of Context antipattern**: understanding trade-offs but not **weighting** them for the current context (multi-platform team → weight heterogeneity/volatility higher → shared service wins despite fewer "+").
- **Third Law** (p.495): decisions lie on a spectrum; an architecture decision is one where every option carries significant trade-offs (paraphrased)
- Parting advice (p.496): practise with **katas**; there's no answer key because the *why* (trade-offs/ADRs) is the valuable half.

**→ designPerspectives (core of the decision engine):**
- **Weighted trade-off matrix** component: rows = factors (pre-filled from catalogs/LLM), columns = options, cells = +/−/~ with notes; **weights come from the user's driving characteristics** (prevents the Out of Context antipattern); totals shown, but the human decides.
- A decision is only "architectural" (needs an ADR) if **every option** has significant trade-offs (Third Law test) — otherwise it's a design choice and can be left to the team/agent.
- "No trade-off found?" warning (Corollary 1) prompts the LLM and the user to search for the hidden one (e.g., reuse → volatility).
- Re-evaluation reminders when context changes (Corollary 2): decisions record the context snapshot (characteristics, team, budget) they were made under; when those change, related ADRs are flagged for review.
- **Kata mode** with no answer key: the tool scores completeness of trade-off analysis and ADRs, not the topology.

## Appendix — Discussion Questions (p.497–506)
- One set of review questions per chapter (e.g., four dimensions of architecture; three criteria for a characteristic; scalability vs elasticity; quantum count for 4 services with separate DBs and one UI; Entity Trap; eight fallacies; open vs closed layers; filter types; microkernel isomorphism; service-based risks…).

**→ designPerspectives:** these questions can seed an optional **learning/onboarding mode** (quiz cards per concept) for interns and new architects.

---

## Cross-cutting takeaways for the spec (from this book)
1. **Process**: characteristics → logical components → style → decisions (the four dimensions), iterated; with risk storming and fitness functions as continuous activities.
2. **Trade-offs are the product**: every decision object carries options, weighted trade-offs, context, business + technical justification, consequences, compliance (fitness function), and status history.
3. **The LLM's role is bounded**: generate options, fill and challenge trade-off tables, find missed trade-offs/fallacies, draft ADRs, translate models into fitness-function code — never pick the answer.
4. **Scope characteristics to quanta**; monolith vs distributed is decided by how many characteristic sets are needed.
5. **Logical architecture first** (components independent of deployment), then allocate to containers.
6. **Sync by default, async when necessary**; every async edge gets data-loss and error-handling checks; every distributed design gets the fallacies checklist.
7. **Governance**: generate fitness functions (ArchUnit/NetArchTest/PyTestArch/TSArch, dependency/cycle checks, log-based coupling checks).
8. **Risk**: matrix, assessments with direction, risk-storming sessions; unknown tech = 9.
9. **Teams**: decision rights, appropriate constraints (avoid control-freak/armchair specs), checklists, Conway/team-topology alignment.
10. **Intersections**: implementation, infrastructure, data, engineering practices, teams, integration, enterprise, business, generative AI — checked before hand-off.
11. **Diagramming**: representational consistency, low-fidelity early (Irrational Artifact Attachment), semantic layers, solid = sync / dotted = async, accessible keys.
