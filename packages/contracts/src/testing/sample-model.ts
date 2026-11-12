import type { Model } from "../model.js";

/**
 * Small model used by contract suites. Element names follow the fictional Internet Banking System
 * of The C4 Model (Brown), ch. 3–5; descriptions are written for this project.
 */
export function contractSampleModel(): Model {
  return {
    elements: [
      { id: "customer", kind: "person", title: "Personal Banking Customer", description: "A customer of the bank with personal bank accounts." },
      { id: "ibs", kind: "softwareSystem", title: "Internet Banking System", description: "Lets customers view account information and make payments." },
      { id: "ibs.spa", kind: "container", title: "Single-Page Application", technology: "JavaScript and Angular", description: "Banking functionality in the web browser." },
      { id: "ibs.api", kind: "container", title: "API Application", technology: "Java and Spring Boot", description: "Banking functionality via a JSON/HTTPS API." },
      { id: "ibs.db", kind: "dataStore", title: "Database", technology: "MySQL database schema", description: "Stores user credentials." },
      { id: "ibs.api.security", kind: "component", title: "Security Component", technology: "Spring Bean", description: "Validates credentials and issues tokens." },
      { id: "corebanking", kind: "softwareSystem", title: "Core Banking System", description: "Stores customer and account information.", tags: ["external"] },
    ],
    relationships: [
      { source: "customer", target: "ibs", kind: "calls", label: "Views account balances and makes payments using" },
      { source: "customer", target: "ibs.spa", kind: "calls", label: "Views account balances and makes payments using" },
      { source: "ibs.spa", target: "ibs.api", kind: "calls", label: "Makes API calls to", technology: "JSON/HTTPS" },
      { source: "ibs.spa", target: "ibs.api.security", kind: "calls", label: "Makes sign-in API calls to", technology: "JSON/HTTPS" },
      { source: "ibs.api", target: "ibs.db", kind: "readsFrom", label: "Reads from and writes to", technology: "SQL/TCP" },
      { source: "ibs.api.security", target: "ibs.db", kind: "readsFrom", label: "Reads credentials from", technology: "SQL/TCP" },
      { source: "ibs.api", target: "corebanking", kind: "calls", label: "Makes API calls to", technology: "XML/HTTPS" },
      { source: "ibs", target: "corebanking", kind: "calls", label: "Gets account information from, and makes payments using" },
    ],
    deploymentNodes: [
      { id: "live", kind: "environment", title: "Live" },
      { id: "live.dc", kind: "deploymentNode", title: "Bank data centre", technology: "Data centre" },
      { id: "live.dc.app", kind: "deploymentNode", title: "app-server", technology: "Ubuntu 24.04 LTS" },
    ],
    deploymentInstances: [{ id: "live.dc.app.api", of: "ibs.api" }],
    views: [
      { id: "context", type: "context", title: "System Context View: Internet Banking System", scope: "ibs", include: ["*"] },
      { id: "containers", type: "container", title: "Container View: Internet Banking System", scope: "ibs", include: ["*"] },
      { id: "api-components", type: "component", title: "Component View: API Application", scope: "ibs.api", include: ["*"] },
    ],
  };
}
