/**
 * Demo workspace 1: the fictional Internet Banking System of The C4 Model (Simon Brown), ch. 3–5, 7, 8.
 * Element names, kinds, technologies and relationships follow the book; every description and label
 * is written for this project. See README.md for the parts that are our interpretation.
 */
import type {
  DeploymentInstance,
  DeploymentNode,
  Element,
  Model,
  Relationship,
  ViewDef,
} from "@designperspectives/contracts";

const EXTERNAL = ["external"];
const METHOD_CALL = "Java method call";

const elements: Element[] = [
  // ---- System context (ch. 3) ----
  { id: "customer", kind: "person", title: "Personal Banking Customer", description: "A bank customer who holds one or more personal accounts." },
  { id: "ibs", kind: "softwareSystem", title: "Internet Banking System", description: "Gives customers online access to their accounts, statements and payments." },
  { id: "corebanking", kind: "softwareSystem", title: "Core Banking System", tags: EXTERNAL, description: "Packaged system of record for customer accounts and transactions, exposed through an API." },
  { id: "ses", kind: "softwareSystem", title: "Amazon Simple Email Service", tags: EXTERNAL, description: "Cloud e-mail delivery service the bank already relies on." },

  // ---- Containers (ch. 4) ----
  { id: "ibs.spa", kind: "container", title: "Single-Page Application", technology: "JavaScript and Angular", description: "Browser-based user interface for all online banking features." },
  { id: "ibs.staticContent", kind: "dataStore", title: "Static Content", technology: "Directory of static HTML, CSS and JavaScript files", description: "Holds the built files that make up the single-page application." },
  { id: "ibs.api", kind: "container", title: "API Application", technology: "Java and Spring Boot", description: "Server-side banking logic offered to the front end as a JSON API." },
  { id: "ibs.db", kind: "dataStore", title: "Database", technology: "MySQL database schema", description: "Keeps customer login credentials and related security data." },
  { id: "ibs.statementStore", kind: "dataStore", title: "Statement Store", technology: "Amazon S3 bucket", description: "Cache of previously generated PDF account statements." },

  // ---- Components of the API Application (ch. 5) ----
  { id: "ibs.api.signInApi", kind: "component", title: "Sign In API", technology: "Spring Web MVC", description: "Endpoint where customers authenticate and obtain an access token." },
  { id: "ibs.api.accountsSummaryApi", kind: "component", title: "Accounts Summary API", technology: "Spring Web MVC", description: "Endpoint returning an overview of a customer's accounts." },
  { id: "ibs.api.statementApi", kind: "component", title: "Statement API", technology: "Spring Web MVC", description: "Endpoint returning account statements as PDF documents." },
  { id: "ibs.api.security", kind: "component", title: "Security Component", technology: "Spring Bean", description: "Checks credentials, issues tokens and validates them on later requests." },
  { id: "ibs.api.email", kind: "component", title: "Email Component", technology: "Spring Bean", description: "Composes and dispatches notification e-mails to customers." },
  { id: "ibs.api.coreBankingAdapter", kind: "component", title: "Core Banking System Adapter", technology: "Spring Bean", description: "Translates internal requests into calls on the core banking API." },
  { id: "ibs.api.statements", kind: "component", title: "Statement Component", technology: "Spring Bean", description: "Produces statements, reusing cached copies where they already exist." },
];

const rel = (
  source: string,
  target: string,
  kind: Relationship["kind"],
  label: string,
  technology?: string,
): Relationship => (technology ? { source, target, kind, label, technology } : { source, target, kind, label });

const relationships: Relationship[] = [
  // ---- System context ----
  rel("customer", "ibs", "calls", "Checks balances and pays bills with"),
  rel("ibs", "corebanking", "calls", "Retrieves account data and submits payments via"),
  rel("ibs", "ses", "calls", "Sends notification e-mails via"),
  rel("ses", "customer", "sendsTo", "Delivers e-mails to"),

  // ---- Containers ----
  rel("customer", "ibs.spa", "calls", "Checks balances and pays bills with"),
  rel("ibs.spa", "ibs.staticContent", "readsFrom", "Loads its application files from", "HTTPS"),
  rel("ibs.spa", "ibs.api", "calls", "Makes API calls to", "JSON/HTTPS"),
  rel("ibs.api", "ibs.db", "readsFrom", "Reads from and writes to", "SQL/TCP"),
  rel("ibs.api", "ibs.statementStore", "readsFrom", "Reads from and writes to", "S3 API/HTTPS"),
  rel("ibs.api", "corebanking", "calls", "Retrieves account data and submits payments via", "XML/HTTPS"),
  rel("ibs.api", "ses", "calls", "Sends notification e-mails via", "HTTPS"),

  // ---- Components ----
  rel("ibs.spa", "ibs.api.signInApi", "calls", "Submits sign-in requests to", "JSON/HTTPS"),
  rel("ibs.spa", "ibs.api.accountsSummaryApi", "calls", "Requests account overviews from", "JSON/HTTPS"),
  rel("ibs.spa", "ibs.api.statementApi", "calls", "Requests statements from", "JSON/HTTPS"),
  rel("ibs.api.signInApi", "ibs.api.security", "calls", "Authenticates customers with", METHOD_CALL),
  rel("ibs.api.security", "ibs.db", "readsFrom", "Reads from and writes to", "SQL/TCP"),
  rel("ibs.api.security", "ibs.api.email", "calls", "Triggers security notifications via", METHOD_CALL),
  rel("ibs.api.email", "ses", "calls", "Sends e-mails using", "HTTPS"),
  rel("ibs.api.accountsSummaryApi", "ibs.api.security", "calls", "Validates access tokens with", METHOD_CALL),
  rel("ibs.api.accountsSummaryApi", "ibs.api.coreBankingAdapter", "calls", "Fetches account summaries via", METHOD_CALL),
  rel("ibs.api.coreBankingAdapter", "corebanking", "calls", "Makes API calls to", "XML/HTTPS"),
  rel("ibs.api.statementApi", "ibs.api.security", "calls", "Validates access tokens with", METHOD_CALL),
  rel("ibs.api.statementApi", "ibs.api.statements", "calls", "Delegates statement retrieval to", METHOD_CALL),
  rel("ibs.api.statements", "ibs.statementStore", "readsFrom", "Reads from and writes to", "S3 API/HTTPS"),
  rel("ibs.api.statements", "ibs.api.coreBankingAdapter", "calls", "Fetches transaction history via", METHOD_CALL),
];

const deploymentNodes: DeploymentNode[] = [
  // ---- Development (ch. 8) ----
  { id: "development", kind: "environment", title: "Development", description: "A developer's machine plus shared test systems in the bank." },
  { id: "development.laptop", kind: "deploymentNode", title: "Developer Laptop", technology: "Windows or macOS", description: "Workstation used to build and run the system locally." },
  { id: "development.laptop.browser", kind: "deploymentNode", title: "Web Browser", technology: "Chrome, Firefox, Safari or Edge", description: "Runs the front end during local development." },
  { id: "development.laptop.docker", kind: "deploymentNode", title: "Docker", technology: "Docker Engine", description: "Local container runtime hosting the back end and its dependencies." },
  { id: "development.laptop.docker.backend", kind: "deploymentNode", title: "Backend Container", technology: "Docker container", description: "Runs the API application and serves the front-end files." },
  { id: "development.laptop.docker.mysql", kind: "deploymentNode", title: "Database Container", technology: "Docker container, MySQL", description: "Disposable local copy of the database schema." },
  { id: "development.laptop.docker.objectStore", kind: "deploymentNode", title: "Local object store (MinIO)", technology: "Docker container, MinIO", description: "S3-compatible stand-in for the cloud statement bucket." },
  { id: "development.laptop.docker.mockEmail", kind: "deploymentNode", title: "Mock Email Service", technology: "Docker container", description: "Fake e-mail service from another team; logs messages instead of sending." },
  { id: "development.dataCentre", kind: "deploymentNode", title: "Bank Data Centre", technology: "On-premises data centre", description: "The bank's own hosting facility." },
  { id: "development.dataCentre.corebankingDev", kind: "deploymentNode", title: "corebanking-dev", technology: "Server", description: "Shared development instance of the core banking system." },

  // ---- Live (ch. 8; managed service names are our interpretation) ----
  { id: "live", kind: "environment", title: "Live", description: "Production hosting used by real customers." },
  { id: "live.customerDevice", kind: "deploymentNode", title: "Customer's Computer", technology: "Desktop or laptop", description: "Device a customer uses to reach online banking." },
  { id: "live.customerDevice.browser", kind: "deploymentNode", title: "Web Browser", technology: "Chrome, Firefox, Safari or Edge", description: "Runs the front end for the customer." },
  { id: "live.aws", kind: "deploymentNode", title: "Amazon Web Services", technology: "AWS region", description: "Cloud region hosting the internet banking workloads." },
  { id: "live.aws.cdn", kind: "deploymentNode", title: "Content Delivery Network", technology: "CDN backed by object storage", description: "Serves the front-end files to browsers from edge locations." },
  { id: "live.aws.containerService", kind: "deploymentNode", title: "Container Service", technology: "Managed container service", description: "Runs and scales the back-end containers." },
  { id: "live.aws.managedMysql", kind: "deploymentNode", title: "Managed MySQL", technology: "Managed relational database service, MySQL", description: "Provider-operated MySQL with backups and failover." },
  { id: "live.aws.objectStorage", kind: "deploymentNode", title: "Object Storage", technology: "Amazon S3", description: "Holds the bucket of cached statements." },
  { id: "live.aws.email", kind: "deploymentNode", title: "Email Service", technology: "Amazon SES", description: "The provider's e-mail delivery service." },
  { id: "live.dataCentre", kind: "deploymentNode", title: "Bank Data Centre", technology: "On-premises data centre", description: "The bank's own hosting facility." },
  { id: "live.dataCentre.corebankingServers", kind: "deploymentNode", title: "Core Banking Servers", technology: "Server cluster", description: "Production servers running the core banking system." },
];

const deploymentInstances: DeploymentInstance[] = [
  { id: "development.laptop.browser.spa", of: "ibs.spa" },
  { id: "development.laptop.docker.backend.api", of: "ibs.api" },
  { id: "development.laptop.docker.backend.staticContent", of: "ibs.staticContent" },
  { id: "development.laptop.docker.mysql.db", of: "ibs.db" },
  { id: "development.laptop.docker.objectStore.statementStore", of: "ibs.statementStore" },
  { id: "development.laptop.docker.mockEmail.ses", of: "ses" },
  { id: "development.dataCentre.corebankingDev.corebanking", of: "corebanking" },
  { id: "live.customerDevice.browser.spa", of: "ibs.spa" },
  { id: "live.aws.cdn.staticContent", of: "ibs.staticContent" },
  { id: "live.aws.containerService.api", of: "ibs.api" },
  { id: "live.aws.managedMysql.db", of: "ibs.db" },
  { id: "live.aws.objectStorage.statementStore", of: "ibs.statementStore" },
  { id: "live.aws.email.ses", of: "ses" },
  { id: "live.dataCentre.corebankingServers.corebanking", of: "corebanking" },
];

const views: ViewDef[] = [
  { id: "landscape", type: "landscape", title: "System Landscape View", include: ["*"] },
  { id: "context", type: "context", title: "System Context View: Internet Banking System", scope: "ibs", include: ["*"] },
  { id: "containers", type: "container", title: "Container View: Internet Banking System", scope: "ibs", include: ["*"] },
  { id: "apiComponents", type: "component", title: "Component View: API Application", scope: "ibs.api", include: ["*"] },
  {
    id: "signIn",
    type: "dynamic",
    title: "Dynamic View: API Application, customer sign-in",
    description: "How a customer's sign-in request flows through the back end.",
    scope: "ibs.api",
    include: [],
    steps: [
      { source: "ibs.spa", target: "ibs.api.signInApi", label: "Submits the customer's credentials to" },
      { source: "ibs.api.signInApi", target: "ibs.api.security", label: "Asks for the credentials to be checked by" },
      { source: "ibs.api.security", target: "ibs.db", label: "Looks up the stored credentials in" },
    ],
  },
  { id: "deploymentDevelopment", type: "deployment", title: "Deployment View: Internet Banking System, Development", environment: "development", include: ["*"] },
  { id: "deploymentLive", type: "deployment", title: "Deployment View: Internet Banking System, Live", environment: "live", include: ["*"] },
];

/** Builds a fresh copy of the demo model on every call. */
export function internetBankingModel(): Model {
  return structuredClone({ elements, relationships, deploymentNodes, deploymentInstances, views });
}
