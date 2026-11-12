/** Test-only helpers: a richer model, a DSL identifier checker and a port of the upstream DSL tokenizer. */
import type { Model } from "@designperspectives/contracts";

/** Exercises groups, odd kinds, async relationships, duplicates, deployment and every view type. */
export function richModel(): Model {
  return {
    elements: [
      { id: "bank", kind: "group", groupType: "orgUnit", title: "Big Bank plc" },
      { id: "bank.digital", kind: "group", groupType: "team", title: "Digital" },
      { id: "bank.digital.ibs", kind: "softwareSystem", title: "Internet Banking System" },
      { id: "bank.digital.ibs.api", kind: "container", title: "API", technology: "Java" },
      { id: "bank.digital.ibs.api.signin", kind: "component", title: "Sign-in Controller" },
      { id: "bank.digital.ibs.api.signin.handler", kind: "codeElement", title: "SignInHandler" },
      { id: "bank.digital.ibs.events", kind: "queue", title: "Events", technology: "RabbitMQ" },
      { id: "bank.digital.ibs.model", kind: "container", title: "API" },
      { id: "bank.digital.ibs.modeL", kind: "topic", title: "Model topic" },
      { id: "hsm", kind: "hardwareSystem", title: "HSM", tags: ["secure,fips"] },
      { id: "user", kind: "person", title: "Customer" },
      { id: "empty", kind: "group", title: "Empty group" },
    ],
    relationships: [
      { source: "user", target: "bank.digital.ibs.api", kind: "calls", label: "Signs in using", technology: "HTTPS" },
      { source: "bank.digital.ibs.api", target: "bank.digital.ibs.events", kind: "sendsTo", label: "Publishes events to", technology: "AMQP" },
      { source: "bank.digital.ibs.api", target: "bank.digital.ibs.events", kind: "publishesTo", label: "Publishes events to" },
      { source: "bank.digital.ibs.api", target: "hsm", kind: "calls", label: "Signs tokens with", key: "sign" },
      { source: "bank.digital.ibs", target: "bank.digital.ibs.api", kind: "calls", label: "Contains" },
      { source: "bank.digital.ibs.api.signin.handler", target: "hsm", kind: "calls", label: "Calls" },
    ],
    deploymentNodes: [
      { id: "live", kind: "environment", title: "Live" },
      { id: "live.k8s", kind: "deploymentNode", title: "Kubernetes", technology: "EKS" },
      { id: "live.k8s.lb", kind: "infrastructureNode", title: "Load balancer" },
      { id: "live.k8s.pod", kind: "deploymentNode", title: "Pod" },
      { id: "live.lb2", kind: "infrastructureNode", title: "Stray load balancer" },
      { id: "live.hsm-rack", kind: "deploymentNode", title: "HSM rack" },
    ],
    deploymentInstances: [
      { id: "live.k8s.pod.api", of: "bank.digital.ibs.api" },
      { id: "live.k8s.pod.events", of: "bank.digital.ibs.events" },
      { id: "live.hsm-rack.hsm", of: "hsm" },
    ],
    views: [
      { id: "landscape", type: "landscape", title: "System Landscape View", include: ["*"] },
      { id: "ctx", type: "context", title: "System Context View: IBS", scope: "bank.digital.ibs", include: ["*"] },
      {
        id: "signin-flow",
        type: "dynamic",
        title: "Dynamic View: sign-in",
        description: 'Sign-in "happy" path',
        scope: "bank.digital.ibs",
        include: [],
        steps: [
          { source: "user", target: "bank.digital.ibs.api", label: "Signs in" },
          { source: "bank.digital.ibs.api", target: "bank.digital.ibs.events", label: "Emits SignedIn", technology: "AMQP" },
          { source: "user", target: "hsm", label: "Touches the HSM" },
        ],
      },
      { id: "live-deploy", type: "deployment", title: "Deployment View: Live", environment: "live", include: ["*"] },
      { id: "bad", type: "container", title: "Container View: wrong scope", scope: "user", include: ["*"] },
      {
        id: "c2",
        type: "container",
        title: "Container View: explicit",
        scope: "bank.digital.ibs",
        include: ["bank.digital.ibs.*", "user", "nothing"],
        exclude: ["bank.digital.ibs.model"],
      },
    ],
  };
}

const DEFINING = /^(\w+) = (person|softwareSystem|container|component|deploymentEnvironment|deploymentNode|infrastructureNode|containerInstance|softwareSystemInstance)\b\s*(\S*)/;
const VIEW_HEADER = /^(systemContext|container|component|dynamic|deployment) (\S+)(?: (\S+))?/;

class IdentifierChecker {
  readonly errors: string[] = [];
  private readonly defined = new Set<string>();
  private readonly stack: Array<string | null> = [];
  private inViews = false;
  private lineNo = 0;

  private use(token: string | undefined): void {
    if (token && token !== "*" && !token.startsWith('"') && !this.defined.has(token)) this.errors.push(`line ${this.lineNo}: ${token}`);
  }

  private define(line: string): string | null {
    const def = this.inViews ? null : DEFINING.exec(line);
    if (!def) return null;
    const parent = [...this.stack].reverse().find((s) => s !== null);
    const full = parent ? `${parent}.${def[1]}` : def[1]!;
    if (def[2]!.endsWith("Instance")) this.use(def[3]);
    this.defined.add(full);
    return full;
  }

  private references(line: string): void {
    const rel = /^(\S+) -> (\S+)/.exec(line);
    if (rel) [rel[1], rel[2]].forEach((t) => this.use(t));
    const view = this.inViews ? VIEW_HEADER.exec(line) : null;
    if (view) [view[2], view[1] === "deployment" ? view[3] : undefined].forEach((t) => this.use(t));
    if (/^(include|exclude) /.test(line)) line.split(/\s+/).slice(1).forEach((t) => this.use(t));
  }

  read(raw: string, n: number): void {
    const line = raw.trim();
    this.lineNo = n + 1;
    if (line === "}") {
      this.stack.pop();
      return;
    }
    if (line === "views {") this.inViews = true;
    const frame = this.define(line);
    this.references(line);
    if (line.endsWith("{")) this.stack.push(frame);
  }
}

/**
 * Checks that every identifier used in a relationship, instance or view is defined earlier in the file,
 * computing hierarchical identifiers from block nesting (groups and other blocks do not add a level).
 */
export function undefinedIdentifiers(dsl: string): string[] {
  const checker = new IdentifierChecker();
  dsl.split("\n").forEach((line, n) => checker.read(line, n));
  return checker.errors;
}

interface TokState {
  tokens: string[];
  started: boolean;
  quoted: boolean;
  token: string;
}

function startToken(st: TokState, c: string): void {
  if (c === '"') Object.assign(st, { quoted: true, started: true, token: "" });
  else if (!/\s/.test(c)) Object.assign(st, { quoted: false, started: true, token: c });
}

function continueToken(st: TokState, c: string, prev: string | undefined): void {
  const ends = (st.quoted && c === '"' && prev !== "\\") || (!st.quoted && /\s/.test(c));
  if (ends) {
    st.tokens.push(st.token);
    Object.assign(st, { started: false, quoted: false });
  } else st.token += c;
}

/** Port of structurizr-dsl Tokenizer.tokenize + Tokens.get (structurizr/structurizr@ad34036). */
export function upstreamTokens(line: string): string[] {
  const s = line.trim();
  const st: TokState = { tokens: [], started: false, quoted: false, token: "" };
  for (let i = 0; i < s.length; i++) {
    if (st.started) continueToken(st, s[i]!, s[i - 1]);
    else startToken(st, s[i]!);
  }
  if (st.started) st.tokens.push(st.token);
  return st.tokens.map((t) => t.replaceAll('\\"', '"').replaceAll("\\n", "\n"));
}
