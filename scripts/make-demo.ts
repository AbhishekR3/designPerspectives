/**
 * Regenerate the bundled demo model (demo/workspace.json and demo/designperspectives.json).
 *
 * The content is the Internet Banking System example from the C4 model (Simon Brown), following
 * the "Big Bank plc" example in structurizr/structurizr (Apache-2.0): see NOTICE.
 *
 * Run from the repository root:  npm run make-demo
 * Positions are not set here; the UI lays out each diagram the first time it is opened.
 */

import fs from "node:fs";
import path from "node:path";
import { syncViews } from "../src/core/diagrams.js";
import * as flows from "../src/core/flows.js";
import { stableJson } from "../src/core/json.js";
import * as ops from "../src/core/ops.js";
import { emptySidecar, makeLens, sidecarData, type Sidecar } from "../src/core/sidecar.js";
import { DEMO_DIR } from "../src/core/store.js";
import { errors } from "../src/core/validate.js";
import { dumpWorkspace, emptyWorkspace, type Workspace } from "../src/core/workspace.js";

export function build(): [Workspace, Sidecar] {
  const ws = emptyWorkspace("Big Bank plc");
  ws.description =
    "Demo: the Internet Banking System example from the C4 model, extended to show every designPerspectives feature (tag groups, lenses, characteristic ratings, cost, linked work, notes, tradeoffs, usage, sensitive labels, symbols, a pipeline connector, and code mapped to components). Ratings, costs and work items are made-up examples.";
  const sc = emptySidecar();

  const E = (kind: string, name: string, parentId: string | null = null, description: string | null = null, technology: string | null = null, extra: Partial<ops.NewElement> = {}) =>
    ops.createElement(ws, {
      kind,
      name,
      parentId,
      description,
      technology: technology === null ? null : technology.replace(/ and /g, ",").split(",").map((t) => t.trim()),
      ...extra,
    });
  const R = (sourceId: string, destinationId: string, description: string | null = null, technology: string | null = null, kind: string | null = null) =>
    ops.createRelationship(ws, { sourceId, destinationId, description, technology, kind });
  const U = (id: string, patch: Record<string, unknown>) => ops.updateElement(ws, sc, id, patch);

  const customer = E("person", "Personal Banking Customer", null, "A customer of the bank, with personal bank accounts.", null, { external: true });
  const support = E("person", "Customer Service Staff", null, "Customer service staff within the bank.");
  const backOffice = E("person", "Back Office Staff", null, "Administration and support staff within the bank.");

  const ibs = E("softwareSystem", "Internet Banking System", null, "Allows customers to view information about their bank accounts, and make payments.");
  const mainframe = E("softwareSystem", "Mainframe Banking System", null, "Stores all of the core banking information about customers, accounts, transactions, etc.");
  const email = E("softwareSystem", "E-mail System", null, "The internal Microsoft Exchange e-mail system.");
  const atm = E("softwareSystem", "ATM", null, "Allows customers to withdraw cash.");

  const spa = E("container", "Single-Page Application", ibs, "Provides all of the Internet banking functionality to customers via their web browser.", "JavaScript and Angular");
  const mobile = E("container", "Mobile App", ibs, "Provides a limited subset of the Internet banking functionality to customers via their mobile device.", "Xamarin");
  const web = E("container", "Web Application", ibs, "Delivers the static content and the Internet banking single page application.", "Java and Spring MVC");
  const api = E("container", "API Application", ibs, "Provides Internet banking functionality via a JSON/HTTPS API.", "Java and Spring MVC");
  const db = E("container", "Database", ibs, "Stores user registration information, hashed authentication credentials, access logs, etc.", "Oracle Database Schema");

  const signin = E("component", "Sign In Controller", api, "Allows users to sign in to the Internet Banking System.", "Spring MVC Rest Controller");
  const accounts = E("component", "Accounts Summary Controller", api, "Provides customers with a summary of their bank accounts.", "Spring MVC Rest Controller");
  const reset = E("component", "Reset Password Controller", api, "Allows users to reset their passwords with a single use URL.", "Spring MVC Rest Controller");
  const security = E("component", "Security Component", api, "Provides functionality related to signing in, changing passwords, etc.", "Spring Bean");
  const facade = E("component", "Mainframe Banking System Facade", api, "A facade onto the mainframe banking system.", "Spring Bean");
  const emailC = E("component", "E-mail Component", api, "Sends e-mails to users.", "Spring Bean");

  // System level
  R(customer, ibs, "Views account balances, and makes payments using");
  R(customer, support, "Asks questions to", "Telephone");
  R(customer, atm, "Withdraws cash using");
  R(support, mainframe, "Uses");
  R(backOffice, mainframe, "Uses");
  R(email, customer, "Sends e-mails to");
  R(atm, mainframe, "Uses");
  R(ibs, mainframe, "Gets account information from, and makes payments using");
  R(ibs, email, "Sends e-mail using");
  // Container level
  R(customer, web, "Visits bigbank.com/ib using", "HTTPS");
  R(customer, spa, "Views account balances, and makes payments using");
  R(customer, mobile, "Views account balances, and makes payments using");
  R(web, spa, "Delivers to the customer's web browser");
  // Component level
  const spaSignin = R(spa, signin, "Makes API calls to", "JSON/HTTPS");
  R(spa, accounts, "Makes API calls to", "JSON/HTTPS");
  R(spa, reset, "Makes API calls to", "JSON/HTTPS");
  R(mobile, signin, "Makes API calls to", "JSON/HTTPS");
  R(mobile, accounts, "Makes API calls to", "JSON/HTTPS");
  R(mobile, reset, "Makes API calls to", "JSON/HTTPS");
  const signinSec = R(signin, security, "Uses");
  R(accounts, facade, "Uses");
  R(reset, security, "Uses");
  R(reset, emailC, "Uses");
  const secDb = R(security, db, "Reads from and writes to", "SQL/TCP");
  R(facade, mainframe, "Makes API calls to", "XML/HTTPS");
  R(emailC, email, "Sends e-mail using");

  const key = flows.createFlow(ws, "Sign in", "How signing in works in the single-page application.");
  flows.updateFlow(ws, key, {
    steps: [
      { relationshipId: spaSignin, description: "Submits credentials to", format: "JSON over HTTPS", example: 'POST /api/sign-in\n{"username": "alice", "password": "<entered by user>"}' },
      { relationshipId: signinSec, description: "Validates credentials using" },
      { relationshipId: secDb, description: "select * from users where username = ?", format: "SQL", example: "select user_id, password_hash from users where username = 'alice'" },
      { relationshipId: secDb, description: "Returns user data to", response: true, format: "Row", example: "USER_ID=1001, PASSWORD_HASH=5e884898da…" },
      { relationshipId: signinSec, description: "Returns true if the hashed password matches", response: true },
      { relationshipId: spaSignin, description: "Sends back an authentication token to", response: true, format: "JSON", example: '200 OK\n{"ok": true, "token": "9f2c41d07a3b5e68"}' },
    ],
  });

  // ---------------------------------------------------------------- showcase additions
  const analytics = E("softwareSystem", "Analytics Platform", null, "Collects usage events and loads them, with personal data removed, into the data warehouse.");
  const stream = E("container", "Event Stream", analytics, "Carries usage events published by the banking applications.", "Kafka");
  const worker = E("container", "Pipeline Worker", analytics, "Runs the nightly job that moves events from the stream into the warehouse.", "Python, Airflow");
  const warehouse = E("container", "Data Warehouse", analytics, "Curated, masked usage events for reporting.", "Snowflake");
  const consumeC = E("component", "Event Consumer", worker, "Reads batches of events from the Kafka topic.", "Python");
  const maskC = E("component", "PII Masker", worker, "Replaces personal fields with placeholders.", "Python");
  const loadC = E("component", "Warehouse Loader", worker, "Writes masked events to Snowflake.", "Python");
  const publish = R(api, stream, "Publishes usage events to", "Kafka, JSON", "async-message");
  const pipe = R(stream, warehouse, "Loads masked events into", "Airflow", "data-pipeline");
  ops.updateRelationship(ws, pipe, {
    notes: "Runs nightly at 02:00 UTC. A failed run is retried twice, then pages the data team.",
    sensitive: [{ item: "User e-mail addresses (before masking)", level: "restricted" }],
    codePaths: ["sample_code/pipeline"],
    stages: [
      { name: "Consume events", technologies: ["Kafka", "Python"], elementId: consumeC, archType: "queue", description: "Reads up to 500 events per batch." },
      { name: "Mask PII", technologies: ["Python"], elementId: maskC, archType: "pipeline", description: "Removes user and e-mail fields." },
      { name: "Load to warehouse", technologies: ["Snowflake", "Airflow"], elementId: loadC, archType: "database" },
    ],
  });

  // Symbols (architecture types)
  for (const [el, arch] of [
    [spa, "web"], [mobile, "mobile"], [web, "web"], [api, "service"], [db, "database"], [email, "cloud"],
    [stream, "queue"], [worker, "pipeline"], [warehouse, "database"], [mainframe, "service"],
  ] as const) U(el, { archType: arch });

  // Tag groups and tags
  sc.tagGroups = [
    { name: "Risk", values: [{ name: "Low", color: "#2ca02c" }, { name: "Medium", color: "#ff7f0e" }, { name: "High", color: "#d62728" }] },
    { name: "Lifecycle", values: [{ name: "Planned", color: "#9467bd" }, { name: "Live", color: "#1f77b4" }, { name: "Deprecated", color: "#7f7f7f" }] },
  ];
  const tags: [string, Record<string, string>][] = [
    [ibs, { Risk: "Medium", Lifecycle: "Live" }], [mainframe, { Risk: "High", Lifecycle: "Live" }],
    [email, { Risk: "Low", Lifecycle: "Live" }], [atm, { Risk: "Medium", Lifecycle: "Deprecated" }],
    [analytics, { Risk: "Medium", Lifecycle: "Planned" }], [api, { Risk: "High", Lifecycle: "Live" }],
    [db, { Risk: "High", Lifecycle: "Live" }], [spa, { Risk: "Low", Lifecycle: "Live" }],
    [mobile, { Risk: "Low", Lifecycle: "Planned" }], [warehouse, { Risk: "Medium", Lifecycle: "Planned" }],
    [security, { Risk: "High", Lifecycle: "Live" }], [facade, { Risk: "Medium", Lifecycle: "Live" }],
  ];
  for (const [el, t] of tags) U(el, { tags: t });

  // Notes, tradeoffs, usage, sensitive information, owner
  U(api, {
    owner: "Digital Channels team",
    notes: "All customer traffic goes through this container.\nRate limiting is configured at the gateway, not here.",
    tradeoffs: [
      { kind: "benefit", text: "One JSON API serves both the web and mobile clients." },
      { kind: "cost", text: "Every client release depends on API compatibility." },
      { kind: "risk", text: "Single point of failure for all digital channels." },
    ],
    usage: [
      { users: "Personal banking customers", frequency: "daily", volume: "about 40,000 active users" },
      { users: "Customer service staff", frequency: "hourly" },
    ],
    sensitive: [{ item: "Account numbers and balances in responses", level: "confidential" }],
  });
  U(db, {
    notes: "Holds hashed credentials. Backups are encrypted.",
    sensitive: [{ item: "Hashed authentication credentials", level: "restricted" }, { item: "Access logs", level: "internal" }],
    tradeoffs: [{ kind: "cost", text: "Oracle licensing cost grows with core count." }],
  });
  U(db, {
    details: [
      { title: "Connection", columns: ["Setting", "Value"], rows: [
        ["Host", "ibdb.internal.bigbank.example"], ["Port", "1521"], ["Service name", "IBPROD"],
        ["Credentials", "Vault path secret/ib/db (never store passwords here)"]] },
      { title: "Table USERS", columns: ["Column", "Type", "Nullable", "Notes"], rows: [
        ["USER_ID", "NUMBER", "no", "Primary key"], ["USERNAME", "VARCHAR2(64)", "no", "Unique"],
        ["PASSWORD_HASH", "VARCHAR2(128)", "no", "Salted hash"], ["LAST_LOGIN", "TIMESTAMP", "yes", ""]] },
    ],
  });
  U(warehouse, {
    details: [{ title: "Connection", columns: ["Setting", "Value"], rows: [["Account", "bigbank-analytics"], ["Warehouse", "ANALYTICS_WH"], ["Schema", "USAGE_EVENTS"]] }],
  });
  U(mainframe, {
    usage: [{ users: "Back office staff", frequency: "continuous" }],
    tradeoffs: [{ kind: "risk", text: "Batch windows limit how fresh balances can be." }],
  });
  ops.updateRelationship(ws, spaSignin, {
    notes: "Credentials are sent in the request body, never in the URL.",
    sensitive: [{ item: "User credentials in transit", level: "restricted" }],
  });

  // Code mapped to components (C4 level)
  const codeMap: [string, string[]][] = [
    [signin, ["sample_code/api/sign_in.py", "sample_code/api/security.py", "sample_code/api/store.py"]],
    [accounts, ["sample_code/api/accounts.py", "sample_code/api/mainframe_facade.py", "sample_code/api/store.py"]],
    [reset, ["sample_code/api/reset_password.py", "sample_code/api/security.py", "sample_code/api/email_sender.py", "sample_code/api/store.py"]],
    [security, ["sample_code/api/security.py", "sample_code/api/store.py"]],
    [facade, ["sample_code/api/mainframe_facade.py"]],
    [emailC, ["sample_code/api/email_sender.py"]],
    [consumeC, ["sample_code/pipeline/consume.py"]],
    [maskC, ["sample_code/pipeline/mask_pii.py"]],
    [loadC, ["sample_code/pipeline/load_warehouse.py"]],
  ];
  for (const [el, paths] of codeMap) U(el, { codePaths: paths });

  // Architecture characteristics (1-5) and monthly cost. Example values for the demo, not measurements.
  type C = [string, number, boolean, string];
  const chars = (...rows: C[]) => rows.map(([name, rating, driving, note]) => ({ name, rating, ...(driving ? { driving: true } : {}), ...(note ? { note } : {}) }));
  const cost = (...rows: [string, number, string][]) => rows.map(([item, monthly, note]) => ({ item, monthly, ...(note ? { note } : {}) }));
  const ratings: [string, ReturnType<typeof chars>, ReturnType<typeof cost>][] = [
    [spa, chars(["Scalability", 5, true, "Static files served from a CDN"], ["Deployability", 4, false, ""], ["Testability", 3, false, ""]), cost(["CDN and static hosting", 40, ""])],
    [mobile, chars(["Deployability", 2, false, "App-store review delays releases"], ["Testability", 2, false, ""], ["Performance", 4, false, ""]), cost(["App store accounts", 10, ""], ["Device test lab", 150, ""])],
    [web, chars(["Scalability", 3, false, ""], ["Deployability", 3, false, ""], ["Availability", 4, true, ""]), cost(["Cloud Run, 2 instances", 180, ""])],
    [api, chars(["Scalability", 3, true, "Stateless; scales horizontally behind the load balancer"], ["Performance", 3, true, "Mainframe calls dominate latency"],
      ["Availability", 4, true, ""], ["Deployability", 3, false, "Single deployment unit"], ["Testability", 4, false, ""], ["Security", 4, true, ""]),
      cost(["Kubernetes nodes, 3 x n2-standard-4", 1150, ""], ["Load balancer", 60, ""])],
    [db, chars(["Scalability", 2, false, "Vertical scaling only"], ["Availability", 4, true, "Data Guard standby"], ["Fault tolerance", 3, false, ""]),
      cost(["Oracle licences", 4200, "Prorated per month"], ["Storage and backups", 380, ""])],
    [mainframe, chars(["Scalability", 1, false, ""], ["Deployability", 1, false, "Quarterly release window"], ["Availability", 5, true, ""], ["Evolvability", 1, false, ""]),
      cost(["Mainframe MIPS share", 9500, "Internal chargeback"])],
    [email, chars(["Availability", 4, false, ""]), cost(["E-mail licences", 120, ""])],
    [stream, chars(["Scalability", 5, true, ""], ["Elasticity", 4, false, ""], ["Fault tolerance", 4, true, "Replication factor 3"]), cost(["Managed Kafka", 640, ""])],
    [worker, chars(["Scalability", 2, false, "Single scheduler"], ["Testability", 3, false, ""], ["Deployability", 4, false, ""]), cost(["Airflow workers", 320, ""])],
    [warehouse, chars(["Scalability", 5, false, ""], ["Performance", 4, false, ""], ["Security", 4, true, "PII masked before load"]), cost(["Warehouse credits", 2100, ""])],
    [security, chars(["Security", 4, true, ""], ["Testability", 3, false, ""]), []],
    [signin, chars(["Testability", 4, false, ""]), []],
    [facade, chars(["Testability", 2, false, "Needs a mainframe test region"], ["Fault tolerance", 2, false, "No circuit breaker yet"]), []],
    [maskC, chars(["Security", 5, true, ""], ["Testability", 4, false, ""]), []],
  ];
  for (const [el, c, k] of ratings) U(el, { characteristics: c, cost: k });

  // Linked work: security issues, pull requests, issues, backlog items, required updates (examples).
  const work: [string, Record<string, string>[]][] = [
    [security, [{ type: "security", title: "Password hashing uses SHA-1; move to bcrypt", status: "in-progress", severity: "critical", url: "https://example.com/security/101" }]],
    [api, [
      { type: "pr", title: "Add rate limiting to the accounts API", status: "open", url: "https://example.com/pulls/42" },
      { type: "security", title: "Upgrade the JSON library (known deserialisation issue)", status: "open", severity: "high" },
    ]],
    [mobile, [{ type: "update", title: "Migrate off the current mobile framework", status: "open", severity: "medium" }]],
    [facade, [{ type: "backlog", title: "Add a circuit breaker around mainframe calls", status: "open", severity: "medium" }]],
    [worker, [{ type: "issue", title: "Nightly job retries forever on bad events", status: "blocked", severity: "low" }]],
    [db, [{ type: "backlog", title: "Partition the audit table", status: "open", severity: "low" }]],
  ];
  for (const [el, w] of work) U(el, { work: w });
  ops.updateRelationship(ws, spaSignin, { work: [{ type: "update", title: "Move to TLS 1.3 only", status: "open", severity: "medium" }] });

  // Styling examples
  ops.setStyle(ws, sc, atm, { fill: "#33293f", strokeStyle: "dashed" });
  ops.setStyle(ws, sc, pipe, { stroke: "#9467bd", strokeWidth: 3 });

  // Lenses
  sc.lenses = [
    makeLens({
      id: "security-review", name: "Security review", visibleLevels: ["context", "container", "component"], defaultOverlay: "Risk",
      visibleSections: ["technology", "characteristics", "work", "details", "notes", "sensitive", "tradeoffs"],
    }),
    makeLens({
      id: "product-owner", name: "Product owner", visibleLevels: ["landscape", "context", "container"], defaultOverlay: "Lifecycle",
      hiddenTagGroups: ["Risk"], visibleSections: ["cost", "work", "notes", "usage"], showTechnology: false,
    }),
  ];

  const key2 = flows.createFlow(ws, "Publish usage event", "How a usage event reaches the warehouse.");
  flows.updateFlow(ws, key2, {
    steps: [
      { relationshipId: publish, description: "Publishes event to" },
      { relationshipId: pipe, description: "Nightly job loads masked events into" },
    ],
  });

  syncViews(ws);
  flows.syncFlows(ws);
  const problems = errors(ws, sc);
  if (problems.length) throw new Error(problems.join("\n"));
  return [ws, sc];
}

function main(): void {
  const [ws, sc] = build();
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEMO_DIR, "workspace.json"), dumpWorkspace(ws), "utf-8");
  fs.writeFileSync(path.join(DEMO_DIR, "designperspectives.json"), stableJson(sidecarData(sc)), "utf-8");
  console.log(`Wrote ${DEMO_DIR}`);
}

main();
