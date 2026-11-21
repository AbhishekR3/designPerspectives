/**
 * Tool connections for linked work (WRK-02): where links get a live status, and which stored credential
 * (SEC-06) each one sends. Built in: github.com, gitlab.com and sonarcloud.io. Others (a GitLab or SonarQube
 * of the team's own, GitHub Enterprise, a Jira site) are added by architects:
 *
 *   <hub or project>/.dp/integrations.json    {"version": 1, "connections": [WorkConnection...]}
 *                                             mode 0600 in a 0700 `.dp/`, which is added to .gitignore;
 *                                             the same folder the `CredentialStore` is given (the hub in a hub)
 *
 * Not in the model or the sidecar, on purpose: an engineer can edit a draft's model and sidecar, and an
 * address there would send a token to a host of their choosing. The rules for an address are those of
 * `checkServiceUrl` (https unless loopback, no user name or password, no query or fragment, never link-local
 * or cloud metadata). A connection names a credential only by name; its value never leaves the server and
 * is sent only to that connection's own API root (src/core/workTools/). A file entry with the same base as a
 * built-in connection replaces it (to name a credential or a sign-in kind for it).
 */

import fs from "node:fs";
import path from "node:path";
import { baseOf, checkServiceUrl } from "./hosts.js";
import { ModelError } from "./modelEdits.js";
import { ensureGitignored } from "./users.js";
import { atomicWrite, isObj } from "./util.js";
import type { Conn } from "./workTools/types.js";
import { WORK_TOOLS, type IntegrationsSettings, type WorkConnection, type WorkConnectionInfo, type WorkToolId } from "../shared/types.js";

/** Shipped connections: public hosts that need no file entry. Jira has none (every site has its own host). */
export const BUILTIN_CONNECTIONS: WorkConnectionInfo[] = [
  { id: "github", tool: "github", base: "https://github.com", builtIn: true },
  { id: "gitlab", tool: "gitlab", base: "https://gitlab.com", builtIn: true },
  { id: "sonarcloud", tool: "sonar", base: "https://sonarcloud.io", builtIn: true },
];

export const INTEGRATIONS_FILE = path.join(".dp", "integrations.json");
export const MAX_CONNECTIONS = 50;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CREDENTIAL_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const KEYS = new Set(["id", "tool", "baseUrl", "credential", "auth"]);

/** One connection from a request or the file, checked; `at` names it in messages. */
export function cleanConnection(v: unknown, at = "A connection"): WorkConnection {
  if (!isObj(v)) throw new ModelError(`${at} must be a JSON object.`);
  for (const k of Object.keys(v)) if (!KEYS.has(k)) throw new ModelError(`${at}: unknown field "${k}".`);
  const id = typeof v.id === "string" ? v.id.trim() : "";
  if (!ID_RE.test(id)) throw new ModelError(`${at}: the ID is 1 to 40 lowercase letters, digits and dashes, e.g. gitlab-internal.`);
  if (BUILTIN_CONNECTIONS.some((b) => b.id === id)) throw new ModelError(`${at}: "${id}" is the ID of a built-in connection; choose another.`);
  if (typeof v.tool !== "string" || !(WORK_TOOLS as readonly string[]).includes(v.tool)) throw new ModelError(`${at}: the tool is one of ${WORK_TOOLS.join(", ")}.`);
  if (typeof v.baseUrl !== "string" || !v.baseUrl.trim() || v.baseUrl.length > 500) throw new ModelError(`${at}: the address is a web address (up to 500 characters).`);
  let base: string;
  try {
    base = baseOf(checkServiceUrl(v.baseUrl.trim(), "address"));
  } catch (e) {
    throw new ModelError(`${at}: ${(e as Error).message}`);
  }
  const out: WorkConnection = { id, tool: v.tool as WorkToolId, baseUrl: base };
  if (v.credential !== undefined && v.credential !== null && v.credential !== "") {
    if (typeof v.credential !== "string" || !CREDENTIAL_RE.test(v.credential)) throw new ModelError(`${at}: the credential is the name of a stored credential.`);
    out.credential = v.credential;
  }
  if (v.auth !== undefined && v.auth !== null) {
    if (v.auth !== "bearer" && v.auth !== "basic") throw new ModelError(`${at}: the sign-in kind is "bearer" or "basic".`);
    if (v.auth === "basic") out.auth = "basic";
  }
  return out;
}

/** A list of connections, checked: unique IDs, unique addresses, at most MAX_CONNECTIONS. */
export function cleanConnections(v: unknown): WorkConnection[] {
  if (!Array.isArray(v)) throw new ModelError("The connections must be a list.");
  if (v.length > MAX_CONNECTIONS) throw new ModelError(`At most ${MAX_CONNECTIONS} connections.`);
  const list = v.map((x, i) => cleanConnection(x, `Connection ${i + 1}`));
  const ids = new Set<string>();
  const bases = new Set<string>();
  for (const c of list) {
    if (ids.has(c.id)) throw new ModelError(`There are two connections with the ID "${c.id}".`);
    if (bases.has(c.baseUrl)) throw new ModelError(`There are two connections for ${c.baseUrl}.`);
    ids.add(c.id);
    bases.add(c.baseUrl);
  }
  return list;
}

export class IntegrationsStore {
  readonly file: string;
  private stamp = "";
  private cached: WorkConnection[] = [];
  private warned = "";

  /** `root`: the hub or project folder. */
  constructor(readonly root: string) {
    this.file = path.join(path.resolve(root), INTEGRATIONS_FILE);
  }

  /** The file's connections, read again when the file changed. Throws a ModelError for a broken file. */
  list(): WorkConnection[] {
    let st: fs.Stats;
    try {
      st = fs.statSync(this.file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      this.stamp = "";
      this.cached = [];
      return [];
    }
    const stamp = `${st.mtimeMs}:${st.size}:${st.ino}`;
    if (stamp === this.stamp) return this.cached.map((c) => ({ ...c }));
    let doc: unknown;
    try {
      doc = JSON.parse(fs.readFileSync(this.file, "utf-8"));
    } catch {
      throw new ModelError(`${INTEGRATIONS_FILE} is not valid JSON.`);
    }
    if (!isObj(doc) || doc.version !== 1) throw new ModelError(`${INTEGRATIONS_FILE} is not an integrations file (version 1).`);
    try {
      this.cached = cleanConnections(doc.connections ?? []);
    } catch (e) {
      throw new ModelError(`${INTEGRATIONS_FILE}: ${(e as Error).message}`);
    }
    this.stamp = stamp;
    return this.cached.map((c) => ({ ...c }));
  }

  private write(list: WorkConnection[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    atomicWrite(this.file, JSON.stringify({ version: 1, connections: list }, null, 2) + "\n", 0o600);
    ensureGitignored(this.root);
  }

  /** Replace every connection (checked first; nothing is written when one is wrong). */
  replace(input: unknown): WorkConnection[] {
    const list = cleanConnections(input);
    this.write(list);
    return list;
  }

  /** Add a connection, or change the one with its ID. */
  set(input: unknown): WorkConnection {
    const conn = cleanConnection(input);
    const list = this.list();
    const at = list.findIndex((c) => c.id === conn.id);
    if (at >= 0) list[at] = conn;
    else list.push(conn);
    this.write(cleanConnections(list));
    return conn;
  }

  remove(id: string): void {
    const list = this.list();
    if (!list.some((c) => c.id === id)) throw new ModelError(`No connection "${id}".`);
    this.write(list.filter((c) => c.id !== id));
  }

  /** Every connection with its credential's name: the file's, then the built-ins whose base no file entry has. */
  connections(): Conn[] {
    const file = this.list().map((c): Conn => ({ id: c.id, tool: c.tool, base: c.baseUrl, builtIn: false, credential: c.credential, auth: c.auth ?? "bearer" }));
    const builtIn = BUILTIN_CONNECTIONS.filter((b) => !file.some((f) => f.base === b.base)).map((b): Conn => ({ ...b, auth: "bearer" }));
    return [...builtIn, ...file];
  }

  /** The connections as everyone may see them (no credential names). A broken file leaves the built-ins only
   *  (and is logged): the model is still served; the settings page shows the problem. */
  infos(): WorkConnectionInfo[] {
    try {
      return this.connections().map(({ id, tool, base, builtIn }) => ({ id, tool, base, builtIn }));
    } catch (e) {
      const msg = `Ignoring ${INTEGRATIONS_FILE}: ${(e as Error).message}`;
      if (msg !== this.warned) console.error(msg);
      this.warned = msg;
      return BUILTIN_CONNECTIONS.map((b) => ({ ...b }));
    }
  }

  settings(): IntegrationsSettings {
    return { connections: this.list(), builtIn: BUILTIN_CONNECTIONS.map((b) => ({ ...b })), file: INTEGRATIONS_FILE.split(path.sep).join("/") };
  }
}
