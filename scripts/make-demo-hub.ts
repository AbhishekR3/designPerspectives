/**
 * The demo hub (`demo/hub/`, DEC-054, DEC-055): a shared catalog and two projects that use the same
 * customer database. Each project reads or writes shared tables and has a private table of its own;
 * both projects write the audit log (flagged on the home page), and one project's copy of the identity
 * provider has drifted from the catalog (the hub brings it up to date when it first serves the demo, and
 * the home page lists that under "Catalog changes copied", DEC-057). Written by `npm run make-demo`;
 * `dp init --hub --demo` copies it.
 */

import * as decisions from "../src/core/decisions.js";
import { setWork } from "../src/core/work.js";
import { prune, syncViews } from "../src/core/diagrams.js";
import { syncFlows } from "../src/core/flows.js";
import { stableJson } from "../src/core/util.js";
import * as ops from "../src/core/modelEdits.js";
import { emptySidecar, sidecarData, type Sidecar } from "../src/core/designPerspectivesFile.js";
import { errors } from "../src/core/validate.js";
import { writeTree } from "./write-folder.js";
import { dumpWorkspace, emptyWorkspace, type Workspace } from "../src/core/workspace.js";
import type { Decision, WorkItem } from "../src/shared/types.js";

interface Built {
  ws: Workspace;
  sc: Sidecar;
  decs: Decision[];
}

const tech = (t: string | null) => (t === null ? null : t.split(",").map((x) => x.trim()));

function model(name: string, description: string) {
  const ws = emptyWorkspace(name);
  ws.description = description;
  const sc = emptySidecar();
  const decs: Decision[] = [];
  return {
    ws,
    sc,
    decs,
    E: (kind: string, n: string, parentId: string | null = null, d: string | null = null, t: string | null = null, extra: Partial<ops.NewElement> = {}) =>
      ops.createElement(ws, { kind, name: n, parentId, description: d, technology: tech(t), ...extra }),
    R: (from: string, to: string, d: string, t: string | null = null, dataAccess: [string, "read" | "write"][] = []) => {
      const id = ops.createRelationship(ws, { sourceId: from, destinationId: to, description: d, technology: tech(t) });
      if (dataAccess.length) ops.updateRelationship(ws, id, { dataAccess: dataAccess.map(([asset, mode]) => ({ asset, mode })) });
      return id;
    },
    U: (id: string, patch: Record<string, unknown>) => ops.updateElement(ws, sc, id, patch),
    D: (input: Record<string, unknown>) => decisions.createDecision(decs, input),
    /** Linked work (DEC-085) on an element or the project; links on example.com, so a status refresh calls no real tool. */
    W: (id: string | null, items: WorkItem[]) => setWork(ws, id ? { type: "element", id } : { type: "project" }, items),
  };
}

function done(m: ReturnType<typeof model>): Built {
  syncViews(m.ws);
  syncFlows(m.ws);
  prune(m.ws, m.sc);
  const e = errors(m.ws, m.sc, m.decs);
  if (e.length) throw new Error(`Demo hub model "${m.ws.name}" has errors: ${e.join(" ")}`);
  return { ws: m.ws, sc: m.sc, decs: m.decs };
}

export function buildCatalog(): Built {
  const m = model("Shared catalog", "Systems, databases and people that several projects use. Projects keep linked copies; change the shared parts here.");
  m.E("person", "Customer", null, "A retail customer of the bank.", null, { external: true });
  const cdp = m.E("softwareSystem", "Customer Data Platform", null, "Customer and account data shared by every product team.");
  const db = m.E("container", "Customer DB", cdp, "The bank's customer and account records.", "PostgreSQL", { archType: "database" });
  m.U(db, {
    data: [
      { name: "customers", kind: "table", owner: "onboarding", sensitive: true, description: "One row per customer: name, address, date of birth." },
      { name: "accounts", kind: "table", owner: "payments", sensitive: true, description: "Accounts and balances." },
      { name: "audit_log", kind: "table", owner: "platform", description: "Every change to customer data, append-only." },
    ],
  });
  const events = m.E("container", "Customer Events", cdp, "Changes to customers, for anyone who needs to follow them.", "Kafka", { archType: "queue" });
  m.U(events, { data: [{ name: "customer-changed", kind: "topic", owner: "onboarding" }] });
  m.E("softwareSystem", "Identity Provider", null, "Sign-in and access tokens for every customer-facing app.");
  m.E("softwareSystem", "E-mail Service", null, "Sends transactional e-mail.", null, { external: true });
  m.D({
    title: "Record every write to customer data in the audit log",
    kind: "policy",
    status: "accepted",
    date: "2026-03-02",
    deciders: ["Platform team", "Security review"],
    affects: [db],
    appliesTo: "Every service that writes to the Customer DB",
    tags: ["security", "data"],
    context: "Regulators ask who changed a customer's data and when.",
    decision: "A service that writes to customers or accounts also writes one row to audit_log in the same transaction.",
    consequences: "Several projects write the audit log; its shape is owned by the platform team and changes need their review.",
  });
  return done(m);
}

export function buildOnboarding(catalog: Workspace): Built {
  const m = model("Customer onboarding", "How a new customer signs up and is checked before an account is opened.");
  const customer = ops.addFromCatalog(m.ws, catalog, "customer");
  const db = ops.addFromCatalog(m.ws, catalog, "customer-db");
  const events = ops.addFromCatalog(m.ws, catalog, "customer-events");
  const idp = ops.addFromCatalog(m.ws, catalog, "identity-provider");
  const sys = m.E("softwareSystem", "Onboarding", null, "Sign-up and identity checks for new customers.");
  const web = m.E("container", "Sign-up Web App", sys, "The sign-up journey.", "TypeScript, React", { archType: "web" });
  const kyc = m.E("container", "KYC Service", sys, "Checks a new customer's identity and creates the customer.", "Kotlin", { archType: "service" });
  // A private table of this project, kept on the shared database.
  m.U(db, { data: [{ name: "kyc_checks", kind: "table", owner: "onboarding", sensitive: true, description: "Results of identity checks." }] });
  m.R(customer, web, "Signs up using", "HTTPS");
  m.R(web, kyc, "Submits applications to", "JSON/HTTPS");
  m.R(web, idp, "Creates the customer's login in", "OIDC");
  m.R(kyc, db, "Creates customers in", "JDBC", [
    ["customers", "write"],
    ["kyc_checks", "write"],
    ["audit_log", "write"],
  ]);
  m.R(kyc, events, "Publishes new customers to", "Kafka", [["customer-changed", "write"]]);
  m.D({
    title: "Keep identity check results in our own table on the shared Customer DB",
    kind: "conditional",
    status: "accepted",
    date: "2026-05-20",
    deciders: ["Onboarding team"],
    affects: [db, kyc],
    tags: ["data"],
    context: "Identity check results belong to onboarding, but they are read with the customer record.",
    decision: "A private table, kyc_checks, on the shared Customer DB, written only by the KYC Service.",
    alternatives: [
      {
        name: "Separate KYC database",
        whyNot: "One more database to run and back up, for one table.",
        wouldChooseIf: ["KYC data had to be stored in another region", "the shared database's retention did not meet the KYC rules"],
      },
    ],
    triggers: [
      { text: "KYC data had to be stored in another region", alternative: "Separate KYC database" },
      { text: "The shared database's retention did not meet the KYC rules", alternative: "Separate KYC database" },
    ],
  });
  m.W(kyc, [
    { type: "security", title: "Identity check provider SDK has a known flaw", url: "https://example.com/security/advisories/42", status: "in-progress", severity: "high" },
    { type: "issue", title: "Retry identity checks when the provider times out", url: "https://example.com/onboarding/issues/118", status: "open", severity: "medium" },
  ]);
  m.W(null, [{ type: "backlog", title: "Move sign-up to the shared design system", url: "https://example.com/onboarding/issues/97", status: "open" }]);
  return done(m);
}

export function buildPayments(catalog: Workspace): Built {
  const m = model("Payments", "Card and account-to-account payments, and the ledger behind them.");
  const customer = ops.addFromCatalog(m.ws, catalog, "customer");
  const db = ops.addFromCatalog(m.ws, catalog, "customer-db");
  const events = ops.addFromCatalog(m.ws, catalog, "customer-events");
  const idp = ops.addFromCatalog(m.ws, catalog, "identity-provider");
  const sys = m.E("softwareSystem", "Payments", null, "Takes payments and keeps the ledger.");
  const api = m.E("container", "Payments API", sys, "Takes payment requests.", "Java, Spring Boot", { archType: "service" });
  const ledger = m.E("container", "Ledger Worker", sys, "Posts ledger entries and updates balances.", "Go", { archType: "pipeline" });
  m.U(db, { data: [{ name: "payment_intents", kind: "table", owner: "payments", description: "Payments in progress." }] });
  m.R(customer, api, "Makes payments using", "HTTPS");
  m.R(api, idp, "Checks access tokens with", "OIDC");
  m.R(api, db, "Reads customers and records payments in", "JDBC", [
    ["customers", "read"],
    ["payment_intents", "write"],
  ]);
  m.R(ledger, db, "Posts ledger entries to", "JDBC", [
    ["accounts", "write"],
    ["audit_log", "write"],
  ]);
  m.R(ledger, events, "Follows customer changes on", "Kafka", [["customer-changed", "read"]]);
  // This copy has drifted from the catalog (edited by hand): the hub copies the catalog's description back in.
  ops.buildIndex(m.ws).el(idp).description = "Okta: sign-in for the payments app.";
  m.D({
    title: "Write balances to the shared accounts table until the ledger has its own store",
    kind: "time-boxed",
    status: "accepted",
    date: "2026-07-01",
    deciders: ["Payments team"],
    affects: [db, ledger],
    tags: ["data", "debt"],
    expires: "2027-06-30",
    context: "Balances live in the shared accounts table, which the online banking apps read.",
    decision: "The Ledger Worker updates accounts directly. No other project writes it.",
    consequences: "Schema changes to accounts need the payments team's review until the ledger has its own store.",
  });
  m.W(ledger, [{ type: "quality", title: "Ledger Worker quality gate", url: "https://example.com/quality/ledger-worker", status: "open", severity: "critical", note: "Two bugs in balance rounding" }]);
  m.W(api, [
    { type: "pr", title: "Idempotency keys for payment requests", url: "https://example.com/payments/pull/311", status: "in-progress" },
    { type: "issue", title: "Card payments: return 409 on a repeated request", url: "https://example.com/payments/issues/305", status: "done", severity: "low" },
  ]);
  return done(m);
}

/** The files of a project folder: the model, the sidecar and the decisions (paths relative to the hub). */
function files(dir: string, b: Built): Map<string, string> {
  const out = new Map<string, string>();
  out.set(`${dir}/architecture/workspace.json`, dumpWorkspace(b.ws));
  out.set(`${dir}/architecture/designperspectives.json`, stableJson(sidecarData(b.sc)));
  for (const d of b.decs) out.set(`${dir}/architecture/${decisions.DECISIONS_DIR}/${d.file}`, decisions.serializeDecision(d));
  return out;
}

/** Write the demo hub to `dir` (replacing it, file by file, so a concurrent copy never reads a half-written file). */
export function writeDemoHub(dir: string): void {
  const catalog = buildCatalog();
  const all = new Map([...files("catalog", catalog), ...files("onboarding", buildOnboarding(catalog.ws)), ...files("payments", buildPayments(catalog.ws))]);
  all.set(
    "hub.json",
    stableJson({
      version: 1,
      name: "Acme Retail Bank",
      catalog: "catalog",
      projects: [
        { id: "onboarding", path: "onboarding", name: "Customer onboarding" },
        { id: "payments", path: "payments", name: "Payments" },
      ],
    }),
  );
  writeTree(dir, all);
}
