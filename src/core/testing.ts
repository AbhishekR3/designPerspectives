/**
 * System testing mode: the rules that need no server (DEC-075).
 *
 * An intercept point is a local port of dp that a calling service is pointed at instead of the real target.
 * This file says which relationships a point covers, which relationship a call belongs to, where a point may
 * forward to, how a message is shown (secret-looking values hidden) and how an edit of the shown message is
 * turned back into the real one, and when a breakpoint stops a call.
 *
 * The target of a relationship is the address its destination runs at (`dp.run.url`), or that of the nearest
 * parent that has one: endpoints sit on relationships into components, and the address belongs to the
 * container that hosts them. A calling service has one base URL per target, so a point is keyed by
 * (calling service, target element) and covers every relationship between the two.
 */

import { endpointMatches, suggestEndpoint } from "./endpoints.js";
import { listFlows } from "./flows.js";
import { isLinkLocal, isLoopback } from "./hosts.js";
import { buildIndex, ENDPOINTS_KEY, getJson, ModelError, runUrlOf, STAGES_KEY, type Index } from "./modelEdits.js";
import type { Workspace } from "./workspace.js";
import { MASK, SECRET_FIELD } from "../shared/secretFields.js";
import type { Breakpoint, BreakpointCondition, CallMessage, Endpoint, Stage } from "../shared/types.js";

// ------------------------------------------------------------------ where a relationship's calls go

/** The element whose address `elementId` runs at: itself, or the nearest parent with an address. */
export function targetOf(idx: Index, elementId: string): { elementId: string; url: string } | null {
  for (let id: string | null = elementId; id; id = idx.parentOf(id)) {
    const url = runUrlOf(idx.elements.get(id));
    if (url) return { elementId: id, url };
  }
  return null;
}

/** The running thing a call leaves from: a component's container, otherwise the element itself. */
function callerOf(idx: Index, elementId: string): string {
  return idx.kindOf(elementId) === "component" ? (idx.parentOf(elementId) ?? elementId) : elementId;
}

export interface InterceptGroup {
  id: string;
  relationshipId: string;
  stageId?: string;
  callerId: string;
  targetElementId: string;
  target: string;
  /** Every relationship from the caller to the same target address, in model order. */
  members: string[];
}

/** The intercept point a relationship (or one stage of its pipeline) belongs to. Throws a ModelError when it cannot have one. */
export function interceptGroup(ws: Workspace, relationshipId: string, stageId?: string): InterceptGroup {
  const idx = buildIndex(ws);
  const rel = idx.rel(relationshipId);
  const callerId = callerOf(idx, rel.sourceId);
  if (stageId) {
    const stage = getJson<Stage>(rel, STAGES_KEY).find((s) => s.id === stageId);
    if (!stage) throw new ModelError(`"${rel.description || relationshipId}" has no stage "${stageId}".`);
    const t = stage.elementId && idx.elements.has(stage.elementId) ? targetOf(idx, stage.elementId) : null;
    if (!t) throw new ModelError(`The stage "${stage.name}" is not live: link it to an element that has an address it runs at.`);
    return { id: `stage:${relationshipId}:${stageId}`, relationshipId, stageId, callerId, targetElementId: t.elementId, target: t.url, members: [relationshipId] };
  }
  const t = targetOf(idx, rel.destinationId);
  if (!t) throw new ModelError(`"${idx.el(rel.destinationId).name}" has no address it runs at. Set one on it (or on what contains it) first.`);
  const members = [...idx.relationships.values()].filter((r) => callerOf(idx, r.sourceId) === callerId && targetOf(idx, r.destinationId)?.elementId === t.elementId).map((r) => r.id);
  return { id: `${callerId}--${t.elementId}`, relationshipId, callerId, targetElementId: t.elementId, target: t.url, members };
}

/** The relationship a call through a point belongs to: the first member with a matching endpoint, the point's own relationship first. */
export function matchCall(
  ws: Workspace,
  group: Pick<InterceptGroup, "relationshipId" | "members" | "target" | "stageId">,
  method: string,
  pathAndQuery: string,
): { relationshipId: string; endpoint: Endpoint | null; suggested: Endpoint | null } {
  if (group.stageId) return { relationshipId: group.relationshipId, endpoint: null, suggested: null };
  let url: URL;
  try {
    url = new URL(pathAndQuery, group.target);
  } catch {
    return { relationshipId: group.relationshipId, endpoint: null, suggested: null };
  }
  const idx = buildIndex(ws);
  for (const id of [group.relationshipId, ...group.members.filter((m) => m !== group.relationshipId)]) {
    const rel = idx.relationships.get(id);
    const endpoint = rel && getJson<Endpoint>(rel, ENDPOINTS_KEY).find((ep) => endpointMatches(ep, method, url));
    if (endpoint) return { relationshipId: id, endpoint, suggested: null };
  }
  return { relationshipId: group.relationshipId, endpoint: null, suggested: suggestEndpoint(method, url) };
}

/** The address a point may forward to: http(s), on this machine or on a host allowed at start, never a link-local or metadata address. */
export function checkTarget(address: string, allowHosts: readonly string[]): URL {
  let u: URL;
  try {
    u = new URL(address);
  } catch {
    throw new ModelError(`"${address}" is not a URL.`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ModelError("An intercept point forwards to http:// or https:// addresses only.");
  if (u.username || u.password) throw new ModelError("The address must not contain a user name or password.");
  const host = u.hostname.toLowerCase();
  if (isLinkLocal(host)) throw new ModelError(`${u.hostname} is a link-local or metadata address: an intercept point never forwards there.`);
  if (!isLoopback(host) && !allowHosts.includes(host.replace(/^\[|\]$/g, "")) && !allowHosts.includes(host))
    throw new ModelError(`${u.hostname} is not this machine. To let intercept points forward there, start dp with: dp serve --allow-target-host ${u.hostname}`);
  return u;
}

// ------------------------------------------------------------------ messages: shown masked, edited, turned back

/** A request or a reply as it travels: nothing hidden. Kept in server memory only. */
export interface RawMessage {
  method?: string;
  /** Path and query. */
  path?: string;
  status?: number;
  headers: [string, string][];
  body: Buffer;
}

const SECRET_HEADERS = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key"]);
/** Whether a header's value is hidden. */
export function secretHeader(name: string): boolean {
  return SECRET_HEADERS.has(name.toLowerCase()) || SECRET_FIELD.test(name);
}

function header(headers: [string, string][], name: string): string {
  return headers.find(([k]) => k.toLowerCase() === name)?.[1] ?? "";
}

/** How a body can be shown and edited, from its content type. */
export function bodyKindOf(headers: [string, string][], body: Buffer): CallMessage["bodyKind"] {
  if (!body.length) return "none";
  const type = header(headers, "content-type").toLowerCase();
  if (header(headers, "content-encoding")) return "binary";
  if (/[/+]json\b/.test(type)) return "json";
  if (type.startsWith("application/x-www-form-urlencoded")) return "form";
  if (type.startsWith("text/") || /[/+]xml\b/.test(type) || type.startsWith("application/javascript")) return "text";
  // No type given: text when it reads as text.
  if (!type && !body.includes(0)) return "text";
  return "binary";
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function maskJson(v: unknown, at: string, masked: string[]): unknown {
  if (Array.isArray(v)) return v.map((x, i) => maskJson(x, `${at}.${i}`, masked));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const p = `${at}.${k}`;
      if (SECRET_FIELD.test(k) && x !== null && x !== "") {
        masked.push(p);
        out[k] = MASK;
      } else out[k] = maskJson(x, p, masked);
    }
    return out;
  }
  return v;
}

function maskPairs(text: string, at: string, masked: string[]): string {
  const q = new URLSearchParams(text);
  const out = new URLSearchParams();
  for (const [k, v] of q) {
    if (SECRET_FIELD.test(k) && v) {
      masked.push(`${at}.${k}`);
      out.append(k, MASK);
    } else out.append(k, v);
  }
  return out.toString().replace(/%E2%80%A2/g, "•");
}

function splitPath(p: string): [string, string] {
  const i = p.indexOf("?");
  return i < 0 ? [p, ""] : [p.slice(0, i), p.slice(i + 1)];
}

/** The message as the browser may see it. The same raw message always gives the same text, so an untouched edit can be told apart. */
export function maskMessage(raw: RawMessage): CallMessage {
  const masked: string[] = [];
  const headers = raw.headers.map(([k, v]): [string, string] => {
    if (!secretHeader(k)) return [k, v];
    masked.push(`header.${k.toLowerCase()}`);
    return [k, MASK];
  });
  let path = raw.path;
  if (path !== undefined) {
    const [p, q] = splitPath(path);
    path = q ? `${p}?${maskPairs(q, "query", masked)}` : p;
  }
  const kind = bodyKindOf(raw.headers, raw.body);
  let body: string | null = null;
  let bodyKind = kind;
  if (kind === "json") {
    const parsed = parseJson(raw.body.toString("utf-8"));
    if (parsed.ok) body = JSON.stringify(maskJson(parsed.value, "body", masked), null, 2);
    else {
      bodyKind = "text";
      body = raw.body.toString("utf-8");
    }
  } else if (kind === "form") body = maskPairs(raw.body.toString("utf-8"), "body", masked);
  else if (kind === "text") body = raw.body.toString("utf-8");
  return {
    ...(raw.method !== undefined ? { method: raw.method } : {}),
    ...(path !== undefined ? { path } : {}),
    ...(raw.status !== undefined ? { status: raw.status } : {}),
    headers,
    body,
    bodyKind,
    bytes: raw.body.length,
    masked,
  };
}

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const hidden = (what: string) => new ModelError(`${what} is "${MASK}", but there is no hidden value there to keep. Type the value, or leave the field as it was shown.`);

function restoreJson(edited: unknown, original: unknown, at: string): unknown {
  if (edited === MASK) {
    if (original === undefined) throw hidden(at);
    return original;
  }
  if (Array.isArray(edited)) {
    const orig = Array.isArray(original) ? original : [];
    if (edited.length !== orig.length && JSON.stringify(edited).includes(`"${MASK}"`))
      throw new ModelError(`${at} has hidden values and its number of items changed, so dp cannot tell which hidden value belongs where. Type the values, or keep the number of items.`);
    return edited.map((x, i) => restoreJson(x, orig[i], `${at}.${i}`));
  }
  if (edited && typeof edited === "object") {
    const orig = original && typeof original === "object" && !Array.isArray(original) ? (original as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(edited).map(([k, x]) => [k, restoreJson(x, SECRET_FIELD.test(k) || x !== MASK ? orig[k] : undefined, `${at}.${k}`)]));
  }
  return edited;
}

function restorePairs(edited: string, original: string, at: string): string {
  const orig = new URLSearchParams(original);
  const seen = new Map<string, number>();
  const out = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(edited)) {
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    if (v !== MASK) out.append(k, v);
    else {
      const real = SECRET_FIELD.test(k) ? orig.getAll(k)[n] : undefined;
      if (real === undefined) throw hidden(`${at}.${k}`);
      out.append(k, real);
    }
  }
  return out.toString();
}

/**
 * The real message after a person's edit of the shown one. A value left as "•••" keeps the hidden value that was
 * there; "•••" anywhere else is refused, so a hidden value can never be moved to another field.
 */
export function mergeMasked(raw: RawMessage, edit: Partial<CallMessage>): { message: RawMessage; edited: boolean } {
  const shown = maskMessage(raw);
  const out: RawMessage = { ...raw, headers: raw.headers.map(([k, v]): [string, string] => [k, v]) };
  let edited = false;

  if (edit.method !== undefined && edit.method.toUpperCase() !== raw.method?.toUpperCase()) {
    if (!TOKEN.test(edit.method)) throw new ModelError(`"${edit.method}" is not an HTTP method.`);
    out.method = edit.method.toUpperCase();
    edited = true;
  }
  if (edit.status !== undefined && edit.status !== raw.status) {
    if (!Number.isInteger(edit.status) || edit.status < 100 || edit.status > 599) throw new ModelError("A status is a number from 100 to 599.");
    out.status = edit.status;
    edited = true;
  }
  if (edit.path !== undefined && edit.path !== shown.path) {
    if (!edit.path.startsWith("/") || /[\r\n\s]/.test(edit.path)) throw new ModelError('A path starts with "/" and has no spaces.');
    const [p, q] = splitPath(edit.path);
    out.path = q ? `${p}?${restorePairs(q, splitPath(raw.path ?? "")[1], "query")}` : p;
    edited = true;
  }
  if (edit.headers !== undefined && JSON.stringify(edit.headers) !== JSON.stringify(shown.headers)) {
    const seen = new Map<string, number>();
    out.headers = edit.headers.map(([k, v]): [string, string] => {
      if (!TOKEN.test(k)) throw new ModelError(`"${k}" is not a header name.`);
      if (/[\r\n\0]/.test(v)) throw new ModelError(`The value of the header ${k} has a line break.`);
      const key = k.toLowerCase();
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      if (v !== MASK) return [k, v];
      const real = secretHeader(k) ? raw.headers.filter(([o]) => o.toLowerCase() === key)[n]?.[1] : undefined;
      if (real === undefined) throw hidden(`The header ${k}`);
      return [k, real];
    });
    edited = true;
  }
  if (edit.body !== undefined && edit.body !== shown.body) {
    if (shown.bodyKind === "binary") throw new ModelError("This body is not text, so it cannot be changed here. The path and the headers can.");
    const text = edit.body ?? "";
    if (shown.bodyKind === "json") {
      const parsed = parseJson(text);
      if (parsed.ok) {
        const orig = parseJson(raw.body.toString("utf-8"));
        out.body = Buffer.from(JSON.stringify(restoreJson(parsed.value, orig.ok ? orig.value : undefined, "body")), "utf-8");
      } else if (text.includes(MASK)) throw new ModelError(`The body is not valid JSON, so dp cannot put the hidden values ("${MASK}") back. Fix the JSON, or type the values.`);
      else out.body = Buffer.from(text, "utf-8");
    } else if (shown.bodyKind === "form") out.body = Buffer.from(restorePairs(text, raw.body.toString("utf-8"), "body"), "utf-8");
    else out.body = Buffer.from(text, "utf-8");
    edited = true;
  }
  return { message: out, edited };
}

// ------------------------------------------------------------------ breakpoints and watches

/** The value of a field of a shown message ("" for an empty one, undefined when it is not there). Values are the shown ones: a hidden value reads "•••". */
export function fieldValue(msg: CallMessage, field: string): string | undefined {
  const dot = field.indexOf(".");
  const head = (dot < 0 ? field : field.slice(0, dot)).toLowerCase();
  const rest = dot < 0 ? "" : field.slice(dot + 1);
  if (head === "status") return msg.status === undefined ? undefined : String(msg.status);
  if (head === "method") return msg.method;
  if (head === "path") return msg.path === undefined ? undefined : splitPath(msg.path)[0];
  if (head === "header") return msg.headers.find(([k]) => k.toLowerCase() === rest.toLowerCase())?.[1];
  if (head === "query") return msg.path === undefined ? undefined : (new URLSearchParams(splitPath(msg.path)[1]).get(rest) ?? undefined);
  if (head !== "body" || msg.body === null) return undefined;
  if (msg.bodyKind === "form") return new URLSearchParams(msg.body).get(rest) ?? undefined;
  if (msg.bodyKind !== "json") return rest ? undefined : msg.body;
  const parsed = parseJson(msg.body);
  if (!parsed.ok) return undefined;
  let v: unknown = parsed.value;
  for (const part of rest ? rest.split(".") : []) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  if (v === undefined) return undefined;
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function evalCondition(c: BreakpointCondition, msg: CallMessage): boolean {
  const v = fieldValue(msg, c.field);
  if (c.op === "exists") return v !== undefined;
  if (v === undefined) return c.op === "!=";
  switch (c.op) {
    case "=":
      return v === c.value;
    case "!=":
      return v !== c.value;
    case "contains":
      return v.includes(c.value);
    case ">":
      return Number(v) > Number(c.value);
    case "<":
      return Number(v) < Number(c.value);
  }
}

const OPS = new Set(["=", "!=", "contains", ">", "<", "exists"]);
const FIELD = /^(status|method|path|body(\.[^\s.]+)*|header\.[^\s.]+|query\.[^\s]+)$/i;

/** A field path as a breakpoint condition or a watch names it. */
export function cleanField(value: unknown): string {
  const f = String(value ?? "").trim();
  if (!FIELD.test(f) || f.length > 200) throw new ModelError(`"${f}" is not a field. Use body.<name>, header.<name>, query.<name>, status, method or path.`);
  return f;
}

/** Checks a breakpoint a client sent; unknown keys are dropped. */
export function cleanBreakpoint(ws: Workspace, value: unknown): Breakpoint {
  const b = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const on = (b.on && typeof b.on === "object" ? b.on : {}) as Record<string, unknown>;
  const idx = buildIndex(ws);
  const s = (v: unknown) => String(v ?? "");
  let target: Breakpoint["on"];
  if (on.type === "relationship") target = { type: "relationship", id: idx.rel(s(on.id)).id };
  else if (on.type === "element") target = { type: "element", id: idx.el(s(on.id)).id };
  else if (on.type === "step") {
    const flow = listFlows(ws).find((f) => f.key === s(on.flow));
    if (!flow?.steps.some((x) => x.order === s(on.order))) throw new ModelError("That flow has no such step.");
    target = { type: "step", flow: flow.key, order: s(on.order) };
  } else if (on.type === "stage") {
    const rel = idx.rel(s(on.relationshipId));
    if (!getJson<Stage>(rel, STAGES_KEY).some((x) => x.id === s(on.stageId))) throw new ModelError("That relationship has no such stage.");
    target = { type: "stage", relationshipId: rel.id, stageId: s(on.stageId) };
  } else throw new ModelError("A breakpoint is on a relationship, an element, a flow step or a stage.");
  const phase = b.phase === "response" || b.phase === "both" ? b.phase : "request";
  const method = s(b.method).trim().toUpperCase();
  if (method && !TOKEN.test(method)) throw new ModelError(`"${method}" is not an HTTP method.`);
  const path = s(b.path).trim();
  if (path && (!path.startsWith("/") || path.length > 500)) throw new ModelError('A breakpoint path starts with "/".');
  const conditions = (Array.isArray(b.conditions) ? b.conditions : []).slice(0, 10).map((c: Record<string, unknown>): BreakpointCondition => {
    const op = s(c?.op);
    if (!OPS.has(op)) throw new ModelError(`"${op}" is not a comparison. Use =, !=, contains, >, < or exists.`);
    return { field: cleanField(c?.field), op: op as BreakpointCondition["op"], value: s(c?.value).slice(0, 500) };
  });
  const id = /^[A-Za-z0-9_-]{1,40}$/.test(s(b.id)) ? s(b.id) : "";
  if (!id) throw new ModelError("A breakpoint needs an ID.");
  return { id, on: target, phase, ...(method ? { method } : {}), ...(path ? { path } : {}), conditions, enabled: b.enabled !== false };
}

/** Does the breakpoint stop this call in this phase? `request` and `response` are the shown messages. */
export function breakpointHits(
  ws: Workspace,
  bp: Breakpoint,
  call: { relationshipId: string; stageId?: string },
  phase: "request" | "response",
  request: CallMessage,
  response: CallMessage | null,
): boolean {
  if (!bp.enabled) return false;
  const idx = buildIndex(ws);
  const on = bp.on;
  if (on.type === "step") {
    const step = listFlows(ws)
      .find((f) => f.key === on.flow)
      ?.steps.find((s) => s.order === on.order);
    if (!step || step.relationshipId !== call.relationshipId || call.stageId) return false;
    if ((step.response ? "response" : "request") !== phase) return false;
  } else {
    if (bp.phase !== "both" && bp.phase !== phase) return false;
    if (on.type === "relationship" && (on.id !== call.relationshipId || call.stageId)) return false;
    if (on.type === "stage" && (on.relationshipId !== call.relationshipId || on.stageId !== call.stageId)) return false;
    if (on.type === "element") {
      const rel = idx.relationships.get(call.relationshipId);
      let inside = false;
      for (let id: string | null = rel?.destinationId ?? null; id; id = idx.parentOf(id)) if (id === on.id) inside = true;
      if (!inside) return false;
    }
  }
  if (bp.method && bp.method !== "*" && bp.method !== request.method?.toUpperCase()) return false;
  if (bp.path) {
    let url: URL;
    try {
      url = new URL(request.path ?? "/", "http://x");
    } catch {
      return false;
    }
    if (!endpointMatches({ method: "*", path: bp.path }, "GET", url)) return false;
  }
  const subject = phase === "response" && response ? response : request;
  // Query, method and path are the request's in either phase.
  return bp.conditions.every((c) => evalCondition(c, /^(query|method|path)\b/i.test(c.field) ? request : subject));
}
