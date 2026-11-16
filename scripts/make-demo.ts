/**
 * Regenerate the bundled demo model (demo/workspace.json and demo/designperspectives.json).
 *
 * The content starts from the Internet Banking System example from the C4 model (Simon Brown),
 * following the "Big Bank plc" example in structurizr/structurizr (Apache-2.0): see NOTICE.
 * It is then extended with the parts a production system has around it (payments, fraud checks,
 * notifications, sessions, statements, monitoring) so a new user can learn the tool on a model
 * that feels real. docs/demo-tour.md walks through it.
 *
 * Run from the repository root:  npm run make-demo
 * Positions are not set here; the UI lays out each diagram the first time it is opened.
 */

import fs from "node:fs";
import path from "node:path";
import { syncViews } from "../src/core/diagrams.js";
import * as flows from "../src/core/flows.js";
import { stableJson } from "../src/core/util.js";
import * as ops from "../src/core/ops.js";
import { emptySidecar, makeLens, sidecarData, type Sidecar } from "../src/core/sidecar.js";
import { errors } from "../src/core/validate.js";
import { ARCH_DIR, DEMO_DIR, WORKSPACE_FILE } from "../src/core/project.js";
import type { DemoHistory } from "../src/demo/demoHistory.js";
import * as decisions from "../src/core/decisions.js";
import { writeDemoHub } from "./demo-hub.js";
import type { Decision } from "../src/shared/types.js";
import { dumpWorkspace, emptyWorkspace, parseWorkspace, type Workspace } from "../src/core/workspace.js";

export function build(): [Workspace, Sidecar] {
  const ws = emptyWorkspace("Big Bank plc");
  ws.description =
    "Demo: the Internet Banking System example from the C4 model, grown into a bank as it runs in production: payments with fraud checks, notifications, sessions, statements, monitoring and on-call. It uses every designPerspectives feature (tag groups, lenses, characteristic ratings, cost, linked work, owners and links, notes, tradeoffs, usage, sensitive labels, details tables, symbols, pipeline connectors, flows with example data, and code mapped to components). A guided tour is in docs/demo-tour.md. Names, numbers, ratings, costs, links and work items are made-up examples.";
  const sc = emptySidecar();

  const E = (kind: string, name: string, parentId: string | null = null, description: string | null = null, technology: string | null = null, extra: Partial<ops.NewElement> = {}) =>
    ops.createElement(ws, {
      kind,
      name,
      parentId,
      description,
      technology:
        technology === null
          ? null
          : technology
              .replace(/ and /g, ",")
              .split(",")
              .map((t) => t.trim()),
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
  const spaAccounts = R(spa, accounts, "Makes API calls to", "JSON/HTTPS");
  const spaReset = R(spa, reset, "Makes API calls to", "JSON/HTTPS");
  R(mobile, signin, "Makes API calls to", "JSON/HTTPS");
  R(mobile, accounts, "Makes API calls to", "JSON/HTTPS");
  R(mobile, reset, "Makes API calls to", "JSON/HTTPS");
  const signinSec = R(signin, security, "Uses");
  const accFacade = R(accounts, facade, "Uses");
  R(reset, security, "Uses");
  R(reset, emailC, "Uses");
  const secDb = R(security, db, "Reads from and writes to", "SQL/TCP");
  const facadeMain = R(facade, mainframe, "Makes API calls to", "XML/HTTPS");
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
    format: "Kafka message, JSON",
    example: JSON.stringify({
      event_id: "evt_01HZX3K9",
      type: "transfer.submitted",
      ts: "2026-11-14T21:07:12Z",
      user_id: "cust-48213",
      email: "alice@example.com",
      account: "GB29NWBK60161331926819",
      amount_minor: 12500,
      currency: "GBP",
    }),
    stages: [
      {
        name: "Consume events",
        technologies: ["Kafka", "Python"],
        elementId: consumeC,
        archType: "queue",
        description: "Reads up to 500 events per batch.",
        format: "Python dict, one per event",
        example: JSON.stringify({
          event_id: "evt_01HZX3K9",
          type: "transfer.submitted",
          ts: "2026-11-14T21:07:12Z",
          user_id: "cust-48213",
          email: "alice@example.com",
          account: "GB29NWBK60161331926819",
          amount_minor: 12500,
          currency: "GBP",
          partition: 3,
          offset: 918274,
        }),
      },
      {
        name: "Mask PII",
        technologies: ["Python"],
        elementId: maskC,
        archType: "pipeline",
        description: "Removes user and e-mail fields.",
        format: "Python dict",
        example: JSON.stringify({
          event_id: "evt_01HZX3K9",
          type: "transfer.submitted",
          ts: "2026-11-14T21:07:12Z",
          user_ref: "u_7f3a9c",
          account: "GB29 **** **** 6819",
          amount_minor: 12500,
          currency: "GBP",
          partition: 3,
          offset: 918274,
        }),
      },
      {
        name: "Load to warehouse",
        technologies: ["Snowflake", "Airflow"],
        elementId: loadC,
        archType: "database",
        format: "Row in ANALYTICS.USAGE_EVENTS",
        example: JSON.stringify({
          EVENT_ID: "evt_01HZX3K9",
          EVENT_TYPE: "transfer.submitted",
          EVENT_TS: "2026-11-14 21:07:12",
          USER_REF: "u_7f3a9c",
          ACCOUNT_MASKED: "GB29 **** **** 6819",
          AMOUNT: 125.0,
          CURRENCY: "GBP",
          LOADED_AT: "2026-11-15 02:04:51",
        }),
      },
    ],
  });

  // Symbols (architecture types)
  for (const [el, arch] of [
    [spa, "web"],
    [mobile, "mobile"],
    [web, "web"],
    [api, "service"],
    [db, "database"],
    [email, "cloud"],
    [stream, "queue"],
    [worker, "pipeline"],
    [warehouse, "database"],
    [mainframe, "service"],
  ] as const)
    U(el, { archType: arch });

  // Tag groups and tags
  sc.tagGroups = [
    {
      name: "Risk",
      values: [
        { name: "Low", color: "#2ca02c" },
        { name: "Medium", color: "#ff7f0e" },
        { name: "High", color: "#d62728" },
      ],
    },
    {
      name: "Lifecycle",
      values: [
        { name: "Planned", color: "#9467bd" },
        { name: "Live", color: "#1f77b4" },
        { name: "Deprecated", color: "#7f7f7f" },
      ],
    },
  ];
  const tags: [string, Record<string, string>][] = [
    [ibs, { Risk: "Medium", Lifecycle: "Live" }],
    [mainframe, { Risk: "High", Lifecycle: "Live" }],
    [email, { Risk: "Low", Lifecycle: "Live" }],
    [atm, { Risk: "Medium", Lifecycle: "Deprecated" }],
    [analytics, { Risk: "Medium", Lifecycle: "Planned" }],
    [api, { Risk: "High", Lifecycle: "Live" }],
    [db, { Risk: "High", Lifecycle: "Live" }],
    [spa, { Risk: "Low", Lifecycle: "Live" }],
    [mobile, { Risk: "Low", Lifecycle: "Planned" }],
    [warehouse, { Risk: "Medium", Lifecycle: "Planned" }],
    [security, { Risk: "High", Lifecycle: "Live" }],
    [facade, { Risk: "Medium", Lifecycle: "Live" }],
  ];
  // Applied at the end, once the production-internals elements exist and have added their own tags.
  const tagMap = new Map<string, Record<string, string>>(tags.map(([el, t]) => [el, { ...t }]));
  const addTags = (el: string, t: Record<string, string>) => tagMap.set(el, { ...(tagMap.get(el) ?? {}), ...t });

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
    sensitive: [
      { item: "Hashed authentication credentials", level: "restricted" },
      { item: "Access logs", level: "internal" },
    ],
    tradeoffs: [{ kind: "cost", text: "Oracle licensing cost grows with core count." }],
  });
  U(db, {
    details: [
      {
        title: "Connection",
        columns: ["Setting", "Value"],
        rows: [
          ["Host", "ibdb.internal.bigbank.example"],
          ["Port", "1521"],
          ["Service name", "IBPROD"],
          ["Credentials", "Vault path secret/ib/db (never store passwords here)"],
        ],
      },
      {
        title: "Table USERS",
        columns: ["Column", "Type", "Nullable", "Notes"],
        rows: [
          ["USER_ID", "NUMBER", "no", "Primary key"],
          ["USERNAME", "VARCHAR2(64)", "no", "Unique"],
          ["PASSWORD_HASH", "VARCHAR2(128)", "no", "Salted hash"],
          ["LAST_LOGIN", "TIMESTAMP", "yes", ""],
        ],
      },
    ],
  });
  U(warehouse, {
    details: [
      {
        title: "Connection",
        columns: ["Setting", "Value"],
        rows: [
          ["Account", "bigbank-analytics"],
          ["Warehouse", "ANALYTICS_WH"],
          ["Schema", "USAGE_EVENTS"],
        ],
      },
    ],
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
    [
      mobile,
      chars(["Deployability", 2, false, "App-store review delays releases"], ["Testability", 2, false, ""], ["Performance", 4, false, ""]),
      cost(["App store accounts", 10, ""], ["Device test lab", 150, ""]),
    ],
    [web, chars(["Scalability", 3, false, ""], ["Deployability", 3, false, ""], ["Availability", 4, true, ""]), cost(["Cloud Run, 2 instances", 180, ""])],
    [
      api,
      chars(
        ["Scalability", 3, true, "Stateless; scales horizontally behind the load balancer"],
        ["Performance", 3, true, "Mainframe calls dominate latency"],
        ["Availability", 4, true, ""],
        ["Deployability", 3, false, "Single deployment unit"],
        ["Testability", 4, false, ""],
        ["Security", 4, true, ""],
      ),
      cost(["Kubernetes nodes, 3 x n2-standard-4", 1150, ""], ["Load balancer", 60, ""]),
    ],
    [
      db,
      chars(["Scalability", 2, false, "Vertical scaling only"], ["Availability", 4, true, "Data Guard standby"], ["Fault tolerance", 3, false, ""]),
      cost(["Oracle licences", 4200, "Prorated per month"], ["Storage and backups", 380, ""]),
    ],
    [
      mainframe,
      chars(["Scalability", 1, false, ""], ["Deployability", 1, false, "Quarterly release window"], ["Availability", 5, true, ""], ["Evolvability", 1, false, ""]),
      cost(["Mainframe MIPS share", 9500, "Internal chargeback"]),
    ],
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
    [
      api,
      [
        { type: "pr", title: "Add rate limiting to the accounts API", status: "open", url: "https://example.com/pulls/42" },
        { type: "security", title: "Upgrade the JSON library (known deserialisation issue)", status: "open", severity: "high" },
      ],
    ],
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

  // ---------------------------------------------------------------- production internals
  // What a running bank has around the textbook example: payments, fraud checks, notifications,
  // sessions, statements, monitoring and on-call. Names, numbers and links are made-up examples.
  const fraudAnalyst = E("person", "Fraud Analyst", null, "Reviews payments held as suspicious and releases or blocks them.");
  const sre = E("person", "Site Reliability Engineer", null, "Keeps the digital banking services running and answers alerts out of hours.");

  const fraud = E("softwareSystem", "Fraud Detection System", null, "Scores every outgoing payment for fraud risk in real time and queues suspicious ones for review.");
  const network = E("softwareSystem", "Payment Network", null, "The national faster-payments scheme that clears and settles payments between banks.", null, { external: true });
  const sms = E("softwareSystem", "SMS Gateway", null, "Third-party service that delivers text messages to customers' phones.", null, { external: true });
  const pushSvc = E("softwareSystem", "Push Notification Service", null, "Platform service that delivers notifications to the mobile app.", null, { external: true });
  const monitoring = E("softwareSystem", "Monitoring Platform", null, "Collects metrics, logs and traces from every service, evaluates alert rules and pages the on-call engineer.", null, {
    external: true,
  });

  const payments = E("container", "Payments Service", ibs, "Validates, fraud-checks and submits customer payments, then publishes the outcome.", "TypeScript and Node.js");
  const paymentEvents = E("container", "Payment Events", ibs, "Topic carrying payment outcomes (completed, rejected, held for review) to other services.", "Kafka");
  const notifications = E(
    "container",
    "Notification Service",
    ibs,
    "Turns banking events into e-mails, text messages and push notifications, following each customer's preferences.",
    "TypeScript and Node.js",
  );
  const sessionCache = E("container", "Session Cache", ibs, "Holds active sessions and one-time passcodes with a short time-to-live.", "Redis");
  const statements = E("container", "Statement Store", ibs, "Monthly PDF statements, kept for seven years.", "Amazon S3");

  const payCtl = E("component", "Payments Controller", payments, "Accepts payment requests, checks the session and returns the payment's status.", "Express");
  const orchestrator = E("component", "Payment Orchestrator", payments, "Runs each payment through validation, fraud check and submission, and records the outcome.", "TypeScript");
  const validator = E("component", "Payment Validator", payments, "Checks limits, payee details and the available balance.", "TypeScript");
  const fraudClient = E("component", "Fraud Check Client", payments, "Asks the Fraud Detection System for a risk score, with a 300 ms timeout.", "TypeScript");
  const publisher = E("component", "Event Publisher", payments, "Publishes payment outcomes to the Payment Events topic.", "KafkaJS");
  const listener = E("component", "Event Listener", notifications, "Consumes payment outcomes from the Payment Events topic.", "KafkaJS");
  const router = E("component", "Channel Router", notifications, "Picks e-mail, SMS or push for each message from the customer's preferences, and sends it.", "TypeScript");
  const templates = E("component", "Template Renderer", notifications, "Fills message templates in the customer's language.", "TypeScript");

  // System level
  R(fraudAnalyst, fraud, "Reviews held payments using");
  R(sre, monitoring, "Investigates incidents using");
  R(monitoring, sre, "Pages", "Phone, SMS");
  R(network, mainframe, "Sends incoming payments to", "ISO 20022");
  const mainNet = R(mainframe, network, "Clears and settles payments through", "ISO 20022");
  R(sms, customer, "Sends text messages to", "SMS");
  // Container level
  const spaPay = R(spa, payCtl, "Makes API calls to", "JSON/HTTPS");
  // HTTP calls each relationship carries, so the live UI inspector can match calls seen in the app.
  // The demo web app (`dp serve --demo` runs it here) can be opened in the live UI inspector.
  U(spa, { uiUrl: "http://127.0.0.1:4200/" });
  ops.updateRelationship(ws, spaSignin, { endpoints: ["POST /api/session", "DELETE /api/session"] });
  ops.updateRelationship(ws, spaAccounts, { endpoints: ["GET /api/accounts", "GET /api/accounts/:id", "GET /api/accounts/:id/statements"] });
  ops.updateRelationship(ws, spaReset, { endpoints: ["POST /api/password-resets"] });
  ops.updateRelationship(ws, spaPay, {
    endpoints: ["POST /api/payments", "GET /api/payments/:id"],
    format: "JSON request body",
    example: JSON.stringify({ fromAccount: "acc-1029", toIban: "DE89370400440532013000", amount: "125.00", currency: "EUR", reference: "Invoice 2026-118" }),
  });
  R(mobile, payCtl, "Makes API calls to", "JSON/HTTPS");
  const pushMobile = R(pushSvc, mobile, "Delivers notifications to", "HTTPS");
  const paySession = R(payCtl, sessionCache, "Looks up session tokens in", "Redis protocol");
  R(security, sessionCache, "Stores sessions and one-time passcodes in", "Redis protocol");
  const payOrch = R(payCtl, orchestrator, "Hands each payment to");
  const orchVal = R(orchestrator, validator, "Validates the payment using");
  const valMain = R(validator, mainframe, "Checks the available balance with", "MQ");
  const orchFraud = R(orchestrator, fraudClient, "Checks fraud risk using");
  const fraudScore = R(fraudClient, fraud, "Requests a risk score from", "JSON/HTTPS");
  const orchMain = R(orchestrator, mainframe, "Submits approved payments to", "MQ");
  const orchPub = R(orchestrator, publisher, "Records the outcome with");
  const pubEvents = R(publisher, paymentEvents, "Publishes payment outcomes to", "Kafka, JSON", "async-message");
  const listenEvents = R(listener, paymentEvents, "Consumes payment outcomes from", "Kafka, JSON", "async-message");
  const listenRoute = R(listener, router, "Passes each event to");
  const routeTpl = R(router, templates, "Renders messages with");
  R(router, email, "Sends e-mail using", "SMTP");
  R(router, sms, "Sends text messages using", "JSON/HTTPS");
  const routePush = R(router, pushSvc, "Sends push notifications using", "JSON/HTTPS");
  R(accounts, statements, "Reads statements from", "HTTPS");
  // The month-end statement job: a ten-stage pipeline, each stage implemented by a component of the
  // Statement Job with its own code. The demo's backtracking story: the printed closing balance
  // (stage 8) is a cent off for foreign-currency accounts, and the cause is a change to currency
  // conversion (stage 5) two days ago (see the git history written by `dp serve --demo`).
  const stmtJob = R(mainframe, statements, "Delivers month-end statements to", "SFTP, Node.js", "data-pipeline");
  const stmtC = E("container", "Statement Job", ibs, "Runs the month-end statement pipeline: one run per month, one statement per account.", "Node.js, TypeScript");
  const S = (name: string, description: string, file: string) => {
    const id = E("component", name, stmtC, description, "TypeScript");
    U(id, { archType: "pipeline", codePaths: [`sample_code/statements/${file}`, "sample_code/statements/types.ts"] });
    return id;
  };
  const stmtParts = {
    fetch: S("Batch Fetcher", "Fetches the month-end transaction file from the mainframe's SFTP drop.", "fetch_batch.ts"),
    parse: S("Record Parser", "Turns fixed-width lines into transactions.", "parse_records.ts"),
    validate: S("Record Validator", "Rejects records that cannot go on a statement.", "validate.ts"),
    enrich: S("Account Enricher", "Adds the customer name, statement currency and address.", "enrich.ts"),
    convert: S("Currency Converter", "Converts each transaction into the statement currency.", "convert_currency.ts"),
    balances: S("Balance Calculator", "Totals debits and credits and works out the closing balance.", "balances.ts"),
    fees: S("Fee Calculator", "Adds the monthly fee and interest to the totals.", "apply_fees.ts"),
    render: S("PDF Renderer", "Lays out each statement and renders it to PDF.", "render_pdf.ts"),
    encrypt: S("Statement Encryptor", "Encrypts each statement with the statements key.", "encrypt.ts"),
    upload: S("Store Uploader", "Stores each encrypted statement in the statement store.", "upload.ts"),
  };
  const j = (o: object) => JSON.stringify(o);
  const tx = { account: "0001029", date: "2026-10-31", type: "DEBIT", amountMinor: 4599, currency: "USD", description: "COFFEE ROASTERS NYC" };
  const enriched = { ...tx, customerName: "Alice Martin", statementCurrency: "EUR", addressRef: "addr-77310" };
  const totals = { account: "0001029", period: "2026-10", openingBalance: 1250.12, transactions: 48, totalDebits: -1104.92, totalCredits: 1059.36, closingBalance: 1204.56 };
  const stmtStages = [
    {
      name: "Fetch batch file",
      elementId: stmtParts.fetch,
      technologies: ["SFTP"],
      archType: "document",
      description: "Fixed-width file from the mainframe batch run.",
      format: "Fixed-width text, one line per transaction",
      example: "0001029 20261031 D 000004599 USD COFFEE ROASTERS NYC",
    },
    { name: "Parse records", elementId: stmtParts.parse, technologies: ["TypeScript"], archType: "pipeline", format: "Transaction (JSON)", example: j(tx) },
    {
      name: "Validate records",
      elementId: stmtParts.validate,
      technologies: ["TypeScript"],
      archType: "pipeline",
      description: "Unknown accounts, bad amounts and dates outside the period are rejected.",
      format: "Transaction (JSON)",
      example: j({ ...tx, valid: true }),
    },
    {
      name: "Enrich with account details",
      elementId: stmtParts.enrich,
      technologies: ["TypeScript", "PostgreSQL"],
      archType: "pipeline",
      format: "Transaction (JSON)",
      example: j({ ...enriched, valid: true }),
    },
    {
      name: "Convert currency",
      elementId: stmtParts.convert,
      technologies: ["TypeScript"],
      archType: "pipeline",
      description: "Rates from the treasury feed for the transaction date.",
      format: "Transaction (JSON)",
      example: j({ ...enriched, valid: true, amount: -42.27, fxRate: 0.9191 }),
    },
    { name: "Calculate balances", elementId: stmtParts.balances, technologies: ["TypeScript"], archType: "pipeline", format: "Statement totals (JSON)", example: j(totals) },
    {
      name: "Apply fees and interest",
      elementId: stmtParts.fees,
      technologies: ["TypeScript"],
      archType: "pipeline",
      format: "Statement totals (JSON)",
      example: j({ ...totals, fees: -2.5, interest: 0.41, closingBalance: 1202.47 }),
    },
    {
      name: "Render PDF statements",
      elementId: stmtParts.render,
      technologies: ["TypeScript", "Chromium"],
      archType: "document",
      format: "Rendered statement",
      example: j({ file: "stmt-0001029-2026-10.pdf", account: "0001029", period: "2026-10", pages: 3, closingBalance: 1202.47, printedClosingBalance: "€1,202.47" }),
    },
    {
      name: "Encrypt",
      elementId: stmtParts.encrypt,
      technologies: ["AWS KMS"],
      archType: "pipeline",
      format: "Encrypted object",
      example: j({ object: "stmt-0001029-2026-10.pdf.enc", account: "0001029", period: "2026-10", keyId: "kms:statements-2026", bytes: 48211 }),
    },
    {
      name: "Upload to the store",
      elementId: stmtParts.upload,
      technologies: ["Amazon S3"],
      archType: "storage",
      description: "One object per account per month.",
      format: "S3 object",
      example: j({ bucket: "bigbank-statements", key: "0001029/2026-10.pdf.enc", account: "0001029", period: "2026-10", versionId: "3HL4kqtJlcpXroDTDmJ" }),
    },
  ];
  for (const c of [api, payments, notifications]) R(c, monitoring, "Sends metrics, logs and traces to", "OpenTelemetry");

  ops.updateRelationship(ws, stmtJob, {
    notes: "Runs on the first working day of each month at 01:00 UTC. Takes about three hours for all customers.",
    sensitive: [{ item: "Account numbers and transactions in the statements", level: "confidential" }],
    stages: stmtStages,
    format: "Fixed-width batch file",
    example: "HDR TXN 20261031 018240\n0001029 20261031 D 000004599 USD COFFEE ROASTERS NYC\nTRL 018240",
    work: [
      { type: "issue", title: "Statement run overruns the batch window at year end", status: "open", severity: "medium" },
      { type: "issue", title: "Printed closing balance a cent off for foreign-currency accounts (reported 2026-11-13)", status: "open", severity: "high" },
    ],
  });
  ops.updateRelationship(ws, mainNet, { notes: "Payments are cleared in seconds, settled between banks several times a day." });
  ops.updateRelationship(ws, fraudScore, {
    notes: "If no score arrives within 300 ms the payment is scored 0.5 and continues; this is logged and alerted on when it exceeds 1% of payments.",
    work: [{ type: "backlog", title: "Move the fraud score call to mutual TLS", status: "open", severity: "medium" }],
  });

  for (const [el, arch] of [
    [fraud, "service"],
    [sms, "cloud"],
    [pushSvc, "cloud"],
    [monitoring, "cloud"],
    [network, "service"],
    [payments, "service"],
    [paymentEvents, "queue"],
    [notifications, "service"],
    [sessionCache, "cache"],
    [statements, "storage"],
  ] as const)
    U(el, { archType: arch });

  // Owners and links (runbooks, dashboards, repositories) on what a team runs in production.
  const owned: [string, string, [string, string][]][] = [
    [ibs, "Digital Channels team", [["Service catalogue", "https://example.com/catalogue/internet-banking"]]],
    [
      api,
      "Digital Channels team",
      [
        ["Runbook", "https://example.com/runbooks/api-application"],
        ["Dashboard", "https://example.com/dashboards/api-application"],
        ["Repository", "https://example.com/git/ib-api"],
      ],
    ],
    [spa, "Digital Channels team", [["Repository", "https://example.com/git/ib-web"]]],
    [mobile, "Mobile team", [["Repository", "https://example.com/git/ib-mobile"]]],
    [web, "Digital Channels team", []],
    [db, "Database Operations team", [["Runbook", "https://example.com/runbooks/ib-database"]]],
    [mainframe, "Core Banking team", []],
    [email, "IT Operations", []],
    [atm, "Branch and ATM team", []],
    [analytics, "Data team", [["Dashboard", "https://example.com/dashboards/analytics-pipeline"]]],
    [
      payments,
      "Payments team",
      [
        ["Runbook", "https://example.com/runbooks/payments-service"],
        ["Dashboard", "https://example.com/dashboards/payments-service"],
        ["Repository", "https://example.com/git/payments-service"],
      ],
    ],
    [paymentEvents, "Platform team", [["Topic browser", "https://example.com/kafka/topics/payments.outcomes.v1"]]],
    [
      notifications,
      "Customer Communications team",
      [
        ["Runbook", "https://example.com/runbooks/notification-service"],
        ["Repository", "https://example.com/git/notification-service"],
      ],
    ],
    [sessionCache, "Platform team", [["Runbook", "https://example.com/runbooks/session-cache"]]],
    [statements, "Payments team", []],
    [fraud, "Financial Crime team", [["Review queue", "https://example.com/fraud/queue"]]],
    [monitoring, "Platform team", [["On-call rota", "https://example.com/oncall/digital-banking"]]],
  ];
  for (const [el, owner, links] of owned) U(el, { owner, links: links.map(([label, url]) => ({ label, url })) });

  // Notes, tradeoffs, usage, sensitive information and details tables
  U(payments, {
    notes:
      "Split out of the API Application in 2025 so payments can be released on their own schedule.\nEvery request carries an idempotency key; a retried request returns the first outcome instead of paying twice.",
    tradeoffs: [
      { kind: "benefit", text: "Payments release independently of the rest of the API." },
      { kind: "cost", text: "A second service to run, monitor and keep compatible with the clients." },
      { kind: "risk", text: "If the fraud check times out, payments continue on a fallback score." },
    ],
    usage: [{ users: "Personal banking customers", frequency: "continuous", volume: "about 120,000 payments a day, 40 a second at peak" }],
    sensitive: [
      { item: "Payee account numbers", level: "confidential" },
      { item: "Payment amounts and references", level: "confidential" },
    ],
    details: [
      {
        title: "Endpoints",
        columns: ["Method", "Path", "Purpose", "Auth"],
        rows: [
          ["POST", "/api/payments", "Make a payment", "Session token"],
          ["GET", "/api/payments/{id}", "Payment status", "Session token"],
          ["GET", "/api/payees", "Saved payees", "Session token"],
          ["GET", "/healthz", "Liveness check", "None"],
        ],
      },
      {
        title: "Service level objectives",
        columns: ["Objective", "Target", "Window"],
        rows: [
          ["Availability (non-5xx responses)", "99.95%", "30 days"],
          ["POST /api/payments latency, 99th percentile", "under 800 ms", "30 days"],
          ["Payments with a fraud score", "99%", "7 days"],
        ],
      },
      {
        title: "Deployment",
        columns: ["Setting", "Value"],
        rows: [
          ["Platform", "Kubernetes, namespace payments"],
          ["Replicas", "4 (scales to 12)"],
          ["Release", "Blue/green, any working day before 15:00"],
          ["Secrets", "Vault path secret/payments (never store values here)"],
        ],
      },
    ],
  });
  U(api, {
    details: [
      {
        title: "Service level objectives",
        columns: ["Objective", "Target", "Window"],
        rows: [
          ["Availability (non-5xx responses)", "99.9%", "30 days"],
          ["GET /api/accounts latency, 99th percentile", "under 1.5 s", "30 days"],
        ],
      },
    ],
  });
  U(paymentEvents, {
    notes: "Events are keyed by payment ID so all events for one payment arrive in order.",
    details: [
      {
        title: "Topic",
        columns: ["Setting", "Value"],
        rows: [
          ["Name", "payments.outcomes.v1"],
          ["Partitions", "12"],
          ["Replication", "3"],
          ["Retention", "7 days"],
          ["Schema", "PaymentOutcome v1 (schema registry)"],
        ],
      },
      {
        title: "Event types",
        columns: ["Type", "Sent when", "Consumers"],
        rows: [
          ["payment.completed", "The mainframe accepted the payment", "Notification Service"],
          ["payment.rejected", "Validation failed", "Notification Service"],
          ["payment.held-for-review", "Fraud score at or above 0.8", "Notification Service, Fraud Detection System"],
        ],
      },
    ],
    sensitive: [{ item: "Payment references", level: "confidential" }],
  });
  U(notifications, {
    usage: [{ users: "Personal banking customers", frequency: "continuous", volume: "about 300,000 messages a day" }],
    tradeoffs: [
      { kind: "benefit", text: "One place for message templates, languages and customer preferences." },
      { kind: "risk", text: "A backlog on the topic delays payment confirmations." },
    ],
    details: [
      {
        title: "Channels",
        columns: ["Channel", "Provider", "Used for"],
        rows: [
          ["E-mail", "E-mail System (SMTP relay)", "Statements ready, password changes"],
          ["SMS", "SMS Gateway", "One-time passcodes, held payments"],
          ["Push", "Push Notification Service", "Payment confirmations"],
        ],
      },
    ],
  });
  U(sessionCache, {
    notes: "Losing the cache signs every customer out; it does not lose data.",
    sensitive: [{ item: "Session tokens and one-time passcodes", level: "restricted" }],
    details: [
      {
        title: "Settings",
        columns: ["Setting", "Value"],
        rows: [
          ["Cluster", "ib-sessions (3 shards, 1 replica each)"],
          ["Session time-to-live", "15 minutes, extended on use"],
          ["Passcode time-to-live", "5 minutes"],
          ["Eviction", "volatile-ttl"],
        ],
      },
    ],
  });
  U(statements, {
    sensitive: [{ item: "Customer statements", level: "confidential" }],
    details: [
      {
        title: "Bucket",
        columns: ["Setting", "Value"],
        rows: [
          ["Name", "bigbank-ib-statements"],
          ["Encryption", "Server-side, customer-managed key"],
          ["Retention", "7 years (object lock)"],
        ],
      },
    ],
  });
  U(fraud, {
    notes: "Scores above 0.8 hold the payment for a Fraud Analyst; the customer is told by SMS.",
    usage: [{ users: "Fraud analysts", frequency: "continuous", volume: "about 300 held payments a day" }],
  });
  U(monitoring, {
    notes: "Alerts page the Site Reliability Engineer on call. Every alert links to a runbook.",
    details: [
      {
        title: "Alerts",
        columns: ["Alert", "Condition", "Severity"],
        rows: [
          ["Payments error rate", "Over 1% of requests fail for 5 minutes", "Page"],
          ["Fraud score fallback", "Over 1% of payments use the fallback score", "Page"],
          ["Notification backlog", "Over 10,000 unsent events", "Ticket"],
          ["Mainframe latency", "99th percentile over 2 s for 10 minutes", "Ticket"],
        ],
      },
    ],
  });
  U(emailC, {
    notes: "Being replaced by the Notification Service; new e-mails should not be added here.",
    work: [{ type: "backlog", title: "Move password-reset e-mails to the Notification Service", status: "open", severity: "low" }],
  });

  // Code mapped to the new components (TypeScript; imports between the files are scanned)
  const tsCode: [string, string[]][] = [
    [payCtl, ["sample_code/payments/controller.ts", "sample_code/payments/session.ts", "sample_code/payments/types.ts"]],
    [orchestrator, ["sample_code/payments/orchestrator.ts", "sample_code/payments/mainframe.ts", "sample_code/payments/types.ts"]],
    [validator, ["sample_code/payments/validator.ts", "sample_code/payments/mainframe.ts", "sample_code/payments/types.ts"]],
    [fraudClient, ["sample_code/payments/fraud-client.ts", "sample_code/payments/types.ts"]],
    [publisher, ["sample_code/payments/publisher.ts", "sample_code/payments/types.ts"]],
    [listener, ["sample_code/notifications/listener.ts", "sample_code/notifications/router.ts"]],
    [router, ["sample_code/notifications/router.ts", "sample_code/notifications/channels.ts", "sample_code/notifications/templates.ts"]],
    [templates, ["sample_code/notifications/templates.ts"]],
  ];
  for (const [el, paths] of tsCode) U(el, { codePaths: paths });

  // Characteristics and cost (example values, not measurements)
  const ratings2: [string, ReturnType<typeof chars>, ReturnType<typeof cost>][] = [
    [
      payments,
      chars(
        ["Availability", 4, true, "Four replicas across two zones"],
        ["Scalability", 4, true, "Stateless; scales on request rate"],
        ["Security", 4, true, ""],
        ["Deployability", 5, false, "Blue/green, several releases a week"],
        ["Testability", 4, false, "Contract tests against a mainframe stub"],
        ["Fault tolerance", 3, false, "Falls back when the fraud check times out"],
      ),
      cost(["Kubernetes nodes, 4 x n2-standard-2", 760, ""], ["Managed Kafka share", 120, ""]),
    ],
    [paymentEvents, chars(["Fault tolerance", 4, true, "Replication factor 3"], ["Scalability", 5, false, ""]), cost(["Managed Kafka share", 220, ""])],
    [
      notifications,
      chars(["Availability", 3, false, "Messages wait on the topic during an outage"], ["Scalability", 4, false, ""], ["Deployability", 4, false, ""]),
      cost(["Kubernetes nodes, 2 x n2-standard-2", 380, ""]),
    ],
    [
      sessionCache,
      chars(["Performance", 5, true, "Sub-millisecond reads"], ["Availability", 4, true, ""], ["Fault tolerance", 3, false, "Failover signs customers out"]),
      cost(["Managed Redis, 3 shards", 540, ""]),
    ],
    [statements, chars(["Availability", 5, false, ""], ["Security", 4, true, ""]), cost(["Object storage, 18 TB", 410, ""], ["Requests and transfer", 90, ""])],
    [fraud, chars(["Performance", 4, true, "Scores in under 100 ms"], ["Availability", 4, true, ""], ["Evolvability", 3, false, "Model retrained monthly"]), cost(["Scoring licence", 6800, ""])],
    [sms, chars(["Availability", 4, false, ""]), cost(["Text messages, about 900,000 a month", 2700, "Usage-based"])],
    [pushSvc, chars(["Availability", 4, false, ""]), cost(["Push delivery", 0, "Free tier"])],
    [monitoring, chars(["Availability", 5, true, ""], ["Scalability", 4, false, ""]), cost(["Metrics, logs and traces ingestion", 1900, "Usage-based"])],
    [payCtl, chars(["Testability", 4, false, ""], ["Security", 4, true, ""]), []],
    [orchestrator, chars(["Testability", 4, false, ""], ["Maintainability", 4, false, ""]), []],
    [fraudClient, chars(["Fault tolerance", 3, false, "Timeout and fallback score, no retry"]), []],
  ];
  for (const [el, c, k] of ratings2) U(el, { characteristics: c, cost: k });

  // Linked work on the new parts
  const work2: [string, Record<string, string>[]][] = [
    [
      payments,
      [
        { type: "pr", title: "Confirmation of payee check before the first payment to a new payee", status: "open", url: "https://example.com/pulls/118" },
        { type: "security", title: "Rotate the mainframe MQ client certificate before it expires", status: "in-progress", severity: "high" },
      ],
    ],
    [notifications, [{ type: "issue", title: "Duplicate push notifications after a consumer restart", status: "in-progress", severity: "medium", url: "https://example.com/issues/233" }]],
    [sessionCache, [{ type: "update", title: "Upgrade Redis to a supported version", status: "open", severity: "high" }]],
    [fraudClient, [{ type: "backlog", title: "Retry once before using the fallback score", status: "open", severity: "medium" }]],
    [monitoring, [{ type: "backlog", title: "Add an alert for the statement run overrunning", status: "done" }]],
  ];
  for (const [el, w] of work2) U(el, { work: w });

  // Tags for the new tag groups: service tier and where each part runs.
  const tierHosting: [string, string, string][] = [
    [ibs, "Tier 1", "Cloud"],
    [mainframe, "Tier 1", "On-premises"],
    [email, "Tier 3", "On-premises"],
    [atm, "Tier 2", "On-premises"],
    [analytics, "Tier 3", "Cloud"],
    [fraud, "Tier 1", "On-premises"],
    [network, "Tier 1", "Third party"],
    [sms, "Tier 2", "Third party"],
    [pushSvc, "Tier 3", "Third party"],
    [monitoring, "Tier 2", "Third party"],
    [spa, "Tier 1", "Cloud"],
    [mobile, "Tier 1", "Third party"],
    [web, "Tier 1", "Cloud"],
    [api, "Tier 1", "Cloud"],
    [db, "Tier 1", "On-premises"],
    [payments, "Tier 1", "Cloud"],
    [paymentEvents, "Tier 1", "Cloud"],
    [notifications, "Tier 2", "Cloud"],
    [sessionCache, "Tier 1", "Cloud"],
    [statements, "Tier 2", "Cloud"],
    [stream, "Tier 3", "Cloud"],
    [worker, "Tier 3", "Cloud"],
    [warehouse, "Tier 3", "Cloud"],
  ];
  for (const [el, tier, hosting] of tierHosting) addTags(el, { Tier: tier, Hosting: hosting });
  for (const [el, t] of [
    [fraud, { Risk: "High", Lifecycle: "Live" }],
    [network, { Risk: "Medium", Lifecycle: "Live" }],
    [sms, { Risk: "Low", Lifecycle: "Live" }],
    [pushSvc, { Risk: "Low", Lifecycle: "Live" }],
    [monitoring, { Risk: "Low", Lifecycle: "Live" }],
    [payments, { Risk: "High", Lifecycle: "Live" }],
    [paymentEvents, { Risk: "Medium", Lifecycle: "Live" }],
    [notifications, { Risk: "Medium", Lifecycle: "Live" }],
    [sessionCache, { Risk: "Medium", Lifecycle: "Live" }],
    [statements, { Risk: "Medium", Lifecycle: "Live" }],
    [emailC, { Lifecycle: "Deprecated" }],
  ] as const)
    addTags(el, t);
  sc.tagGroups.push(
    {
      name: "Tier",
      values: [
        { name: "Tier 1", color: "#d62728" },
        { name: "Tier 2", color: "#ff7f0e" },
        { name: "Tier 3", color: "#2ca02c" },
      ],
    },
    {
      name: "Hosting",
      values: [
        { name: "Cloud", color: "#1f77b4" },
        { name: "On-premises", color: "#8c564b" },
        { name: "Third party", color: "#e377c2" },
      ],
    },
  );
  for (const [el, t] of tagMap) U(el, { tags: t });

  // Lenses
  sc.lenses = [
    makeLens({
      id: "security-review",
      name: "Security review",
      visibleLevels: ["context", "container", "component"],
      defaultOverlay: "Risk",
      visibleSections: ["technology", "characteristics", "work", "details", "notes", "sensitive", "tradeoffs"],
    }),
    makeLens({
      id: "product-owner",
      name: "Product owner",
      visibleLevels: ["landscape", "context", "container"],
      defaultOverlay: "Lifecycle",
      hiddenTagGroups: ["Risk"],
      visibleSections: ["cost", "work", "notes", "usage"],
      showTechnology: false,
    }),
    makeLens({
      id: "operations",
      name: "Operations",
      visibleLevels: ["landscape", "context", "container", "component"],
      defaultOverlay: "Tier",
      visibleSections: ["technology", "characteristics", "work", "details", "notes", "usage"],
    }),
    makeLens({
      id: "finance",
      name: "Finance",
      visibleLevels: ["landscape", "context", "container"],
      defaultOverlay: "@cost",
      hiddenTagGroups: ["Risk", "Tier"],
      visibleSections: ["cost", "usage", "notes"],
      showTechnology: false,
    }),
  ];

  const key2 = flows.createFlow(ws, "Publish usage event", "How a usage event reaches the warehouse.");
  flows.updateFlow(ws, key2, {
    steps: [
      { relationshipId: publish, description: "Publishes event to" },
      { relationshipId: pipe, description: "Nightly job loads masked events into" },
    ],
  });

  const key3 = flows.createFlow(ws, "Make a payment", "A customer pays a saved payee from the web app: checks, fraud score, submission to the mainframe and the published outcome.");
  flows.updateFlow(ws, key3, {
    steps: [
      {
        relationshipId: spaPay,
        description: "Submits the payment to",
        format: "JSON over HTTPS",
        example:
          'POST /api/payments\nAuthorization: Bearer 9f2c41d07a3b5e68\n{"accountId": "11-22-33-44556677", "payeeSortCode": "608371", "payeeAccount": "12345678", "amountPence": 4500, "reference": "Rent March", "idempotencyKey": "pay_7c1e"}',
      },
      { relationshipId: paySession, description: "Checks the session token in", format: "Redis command", example: "GET session:9f2c41d07a3b5e68" },
      { relationshipId: paySession, description: "Returns the signed-in customer to", response: true, example: '"alice"' },
      { relationshipId: payOrch, description: "Starts the payment with" },
      { relationshipId: orchVal, description: "Checks limits and payee details with" },
      { relationshipId: valMain, description: "Asks for the available balance from", format: "MQ message", example: "BALANCE.REQ account=11-22-33-44556677" },
      { relationshipId: valMain, description: "Returns the available balance to", response: true, example: "availablePence=182040" },
      { relationshipId: orchFraud, description: "Asks for a fraud check from" },
      {
        relationshipId: fraudScore,
        description: "Requests a risk score from",
        format: "JSON over HTTPS",
        example: 'POST /v1/score\n{"account": "11-22-33-44556677", "amountPence": 4500, "payee": "608371-12345678"}',
      },
      { relationshipId: fraudScore, description: "Returns a low score to", response: true, format: "JSON", example: '{"score": 0.12}' },
      { relationshipId: orchMain, description: "Submits the approved payment to", format: "MQ message", example: "PAYMENT.REQ id=pay_7c1e amount=4500" },
      { relationshipId: mainNet, description: "Sends the payment for clearing through", format: "ISO 20022 pacs.008" },
      { relationshipId: orchMain, description: "Accepts the payment and returns a reference to", response: true, example: "reference=FP24031900417" },
      { relationshipId: orchPub, description: "Records the outcome with" },
      {
        relationshipId: pubEvents,
        description: "Publishes payment.completed to",
        format: "Kafka record (JSON)",
        example: 'key: pay_7c1e\n{"type": "payment.completed", "paymentId": "pay_7c1e", "status": "completed", "mainframeReference": "FP24031900417"}',
      },
      {
        relationshipId: spaPay,
        description: "Returns 202 Accepted with the payment's status to",
        response: true,
        format: "JSON",
        example: '202 Accepted\n{"paymentId": "pay_7c1e", "status": "completed"}',
      },
    ],
  });

  const key4 = flows.createFlow(ws, "Payment confirmation", "How the customer hears that a payment has been sent: from the event on the topic to a push notification on their phone.");
  flows.updateFlow(ws, key4, {
    steps: [
      { relationshipId: listenEvents, description: "Reads payment.completed from", format: "Kafka record (JSON)", example: '{"type": "payment.completed", "paymentId": "pay_7c1e"}' },
      { relationshipId: listenRoute, description: "Passes the event to" },
      { relationshipId: routeTpl, description: "Renders the confirmation with" },
      { relationshipId: routeTpl, description: "Returns the message text to", response: true, example: "Your payment pay_7c1e has been sent." },
      { relationshipId: routePush, description: "Sends a push notification using", format: "JSON over HTTPS" },
      { relationshipId: pushMobile, description: "Shows the notification on the customer's phone through" },
    ],
  });

  const key5 = flows.createFlow(ws, "View account balances", "What happens when a customer opens the accounts page.");
  flows.updateFlow(ws, key5, {
    steps: [
      { relationshipId: spaAccounts, description: "Asks for the account summary from", format: "JSON over HTTPS", example: "GET /api/accounts\nAuthorization: Bearer 9f2c41d07a3b5e68" },
      { relationshipId: accFacade, description: "Gets balances through" },
      { relationshipId: facadeMain, description: "Requests balances from", format: "XML over HTTPS", example: '<BalanceEnquiry customer="1001"/>' },
      { relationshipId: facadeMain, description: "Returns balances to", response: true, format: "XML", example: '<Balances><Account id="11-22-33-44556677" available="182040"/></Balances>' },
      {
        relationshipId: spaAccounts,
        description: "Returns the account summary to",
        response: true,
        format: "JSON",
        example: '200 OK\n{"accounts": [{"id": "11-22-33-44556677", "name": "Current account", "availablePence": 182040}]}',
      },
    ],
  });

  syncViews(ws);
  flows.syncFlows(ws);
  const problems = errors(ws, sc);
  if (problems.length) throw new Error(problems.join("\n"));
  return [ws, sc];
}

/**
 * The git history `dp serve --demo` writes into a new demo folder (src/demo/demoHistory.ts), so
 * backtracking has recent changes to show. Older versions are derived from the shipped files:
 * - 40 days ago: the statement job without the fees stage, currency conversion without rounding,
 *   validation without the period check;
 * - 21 days ago: validation rejects records outside the period;
 * - 6 days ago: the fees and interest stage (code and model);
 * - 2 days ago: currency conversion rounds each amount to cents (the cause of the demo issue).
 */
function history(ws: Workspace): DemoHistory {
  const code = (f: string) => fs.readFileSync(path.join(DEMO_DIR, "sample_code", "statements", f), "utf-8");
  const must = (text: string, from: string, to: string) => {
    if (!text.includes(from)) throw new Error(`history: "${from.slice(0, 40)}" not found`);
    return text.replace(from, to);
  };
  let convertV1 = must(
    code("convert_currency.ts"),
    "  // Round each converted amount to cents so the lines on the statement add up to what is printed.\n  const amount = roundCents((signed / 100) * fxRate);",
    "  const amount = (signed / 100) * fxRate;",
  );
  convertV1 = must(convertV1, "\nexport function roundCents(x: number): number {\n  return Math.round(x * 100) / 100;\n}\n", "");
  const validateV1 = must(code("validate.ts"), `  if (!tx.date.startsWith(period)) return "dated outside the statement period";\n`, "");

  // The model before the fees stage: the stage and its component removed.
  const v1 = parseWorkspace(dumpWorkspace(ws));
  const idx = ops.buildIndex(v1);
  const job = [...idx.relationships.values()].find((r) => r.description === "Delivers month-end statements to")!;
  const stages = ops.getJson<{ name: string }>(job, ops.STAGES_KEY).filter((st) => st.name !== "Apply fees and interest");
  ops.updateRelationship(v1, job.id, { stages });
  ops.deleteElement(v1, [...idx.elements.values()].find((e) => e.name === "Fee Calculator")!.id);
  syncViews(v1);
  flows.syncFlows(v1);

  const wsFile = `${ARCH_DIR}/${WORKSPACE_FILE}`;
  const st = (f: string) => `sample_code/statements/${f}`;
  return {
    note: "Made-up history for the demo, written as git commits by dp serve --demo (src/core/demoHistory.ts). true = the file as shipped, null = the file does not exist yet.",
    commits: [
      {
        daysAgo: 40,
        author: "Priya Shah",
        email: "priya.shah@example.com",
        message: "Statement job: first version of the month-end pipeline",
        files: { [wsFile]: dumpWorkspace(v1), [st("convert_currency.ts")]: convertV1, [st("validate.ts")]: validateV1, [st("apply_fees.ts")]: null },
      },
      { daysAgo: 21, author: "Tom Becker", email: "tom.becker@example.com", message: "Validate: reject records dated outside the statement period", files: { [st("validate.ts")]: true } },
      { daysAgo: 6, author: "Ana Lima", email: "ana.lima@example.com", message: "Add the fees and interest stage to the statement job", files: { [st("apply_fees.ts")]: true, [wsFile]: true } },
      { daysAgo: 2, author: "Tom Becker", email: "tom.becker@example.com", message: "Convert currency: round each converted amount to cents", files: { [st("convert_currency.ts")]: true } },
    ],
  };
}

/** Decision records for the demo (DEC-050): one of each kind, written through the same operations the API uses. */
export function demoDecisions(): Decision[] {
  const decs: Decision[] = [];
  const add = (input: Record<string, unknown>) => {
    const id = decisions.createDecision(decs, input);
    return id;
  };
  const sticky = add({
    title: "Keep sessions on the web servers (sticky sessions)",
    kind: "choice",
    status: "accepted",
    date: "2025-03-10",
    deciders: ["Ana Lima"],
    affects: ["web-application", "api-application"],
    context: "Signed-in customers need their session on every request. There was one web server per region and no shared cache.",
    decision: "The load balancer sends each customer to the same server; the session lives in that server's memory.",
    alternatives: [{ name: "Shared session cache", whyNot: "One more system to run, for two servers." }],
    consequences: "A server restart signs its customers out.",
  });
  add({
    title: "Publish payment events on Kafka instead of calling services directly",
    kind: "choice",
    status: "accepted",
    date: "2026-02-04",
    deciders: ["Payments team", "Ana Lima"],
    affects: ["payment-events", "payments-service", "notification-service"],
    tags: ["integration"],
    context: "A payment must reach notifications, fraud checks and analytics. Calling each one directly made a slow consumer hold up the payment.",
    decision: "The Payments Service publishes one event per payment state change to Payment Events (Kafka). Consumers read at their own pace.",
    alternatives: [
      { name: "Direct HTTP calls", whyNot: "A slow or failing consumer holds up or fails the payment." },
      { name: "RabbitMQ", whyNot: "The analytics platform already runs Kafka (Event Stream); a second broker means a second set of skills on call." },
    ],
    consequences: "Consumers must handle repeated events. Event order is kept per payment only.",
  });
  add({
    title: "Build statements in a nightly batch, not a streaming pipeline",
    kind: "conditional",
    status: "accepted",
    date: "2026-06-18",
    deciders: ["Tom Becker", "Ana Lima"],
    affects: ["statement-job", "statement-store"],
    tags: ["data"],
    reviewBy: "2027-05-01",
    context: "Customers get a monthly statement and can download the current month's so far. Nobody has asked for statements that update during the day.",
    decision: "A nightly job (Statement Job) reads the day's transactions, builds the statements and stores them as files (Statement Store).",
    alternatives: [
      {
        name: "Streaming pipeline (Kafka Streams)",
        whyNot: "We would need people on call for a stateful streaming system, and nobody asks for intraday statements.",
        wouldChooseIf: ["we had a platform team on call for streaming", "product asked for statements that update during the day", "the batch no longer finished overnight"],
      },
    ],
    consequences: "Statements are up to a day old. A failed night is re-run the next morning.",
    triggers: [
      { text: "A platform team is on call for streaming", alternative: "Streaming pipeline (Kafka Streams)" },
      { text: "Product asks for intraday statements", alternative: "Streaming pipeline (Kafka Streams)" },
      { text: "The batch runs past 06:00 twice in a month", alternative: "Streaming pipeline (Kafka Streams)" },
    ],
  });
  add({
    title: "Choose a fraud scoring provider",
    kind: "deferred",
    status: "proposed",
    date: "2026-10-02",
    deciders: ["Fraud team"],
    affects: ["fraud-detection-system", "payments-service"],
    decideBy: "2027-01-31",
    context: "The Payments Service asks the Fraud Detection System to score each payment. The current provider's contract ends in June 2027.",
    decision: "Not decided yet. Waiting for both providers' results on last quarter's payments.",
    alternatives: [
      { name: "Keep the current provider", whyNot: "Price goes up 40% at renewal." },
      { name: "Second provider", whyNot: "Not tested on our payments yet." },
    ],
  });
  add({
    title: "Let the Payments Service use the main database until it has its own",
    kind: "time-boxed",
    status: "accepted",
    date: "2026-04-22",
    deciders: ["Ana Lima"],
    affects: ["database", "payments-service", "api-application"],
    tags: ["data", "debt"],
    expires: "2027-03-31",
    context: "The Payments Service was split out of the API Application. Its tables are still in the main Oracle schema, next to the accounts tables it reads.",
    decision: "The Payments Service reads and writes its own tables in the main schema, and reads the accounts tables. No other service may write its tables.",
    alternatives: [{ name: "Separate payments database now", whyNot: "Needs a data migration during the busiest quarter." }],
    consequences: "A schema change to the accounts tables must be checked with the payments team until the split is done.",
  });
  add({
    title: "Mask personal data before it leaves the bank's own systems",
    kind: "policy",
    status: "accepted",
    date: "2026-01-15",
    deciders: ["Security review"],
    affects: ["pipeline-worker", "data-warehouse"],
    tags: ["security"],
    appliesTo: "Every pipeline, export and event stream that sends data to analytics or to a third party",
    context: "Analytics and third parties do not need names, account numbers or addresses.",
    decision: "Personal data is masked or removed in the pipeline before it is loaded or sent. Unmasked data stays in the core banking systems.",
  });
  add({
    title: "Keep sessions in the shared Redis cache",
    kind: "reversal",
    status: "accepted",
    date: "2026-05-12",
    deciders: ["Ana Lima", "Site reliability"],
    affects: ["session-cache", "web-application", "api-application"],
    supersedes: [sticky],
    context: "There are now six web servers and they restart on every deploy, signing customers out.",
    decision: "Sessions are kept in the Session Cache (Redis). Any server can serve any customer.",
    consequences: "The Session Cache is now needed for sign-in; it runs with a replica.",
  });
  return decs;
}

function main(): void {
  const [ws, sc] = build();
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEMO_DIR, "workspace.json"), dumpWorkspace(ws), "utf-8");
  fs.writeFileSync(path.join(DEMO_DIR, "designperspectives.json"), stableJson(sidecarData(sc)), "utf-8");
  fs.writeFileSync(path.join(DEMO_DIR, "history.json"), JSON.stringify(history(ws), null, 1) + "\n", "utf-8");
  const decDir = path.join(DEMO_DIR, decisions.DECISIONS_DIR);
  fs.rmSync(decDir, { recursive: true, force: true });
  fs.mkdirSync(decDir, { recursive: true });
  for (const d of demoDecisions()) fs.writeFileSync(path.join(decDir, d.file), decisions.serializeDecision(d), "utf-8");
  writeDemoHub(path.join(DEMO_DIR, "hub"));
  console.log(`Wrote ${DEMO_DIR}`);
}

main();
