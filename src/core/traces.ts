/**
 * OpenTelemetry trace files: read spans written by the OpenTelemetry Collector's file exporter
 * (OTLP JSON: one `{"resourceSpans": [...]}` object per line, or a whole file holding one object
 * or a list of them), and lay a trace over the model.
 *
 * A span is matched to an element, in this order:
 *   1. the span attribute `dp.element` (an element ID);
 *   2. the file it ran in (`code.filepath` or `code.file.path`) against the elements' code paths. A
 *      file mapped to several elements goes to the one that lists it first (its main file), else to
 *      the element of the parent span if that is one of them, else to the first component;
 *   3. the element of the parent span, when the parent runs in the same service (a span with no file
 *      of its own, such as a database call, runs where its caller runs);
 *   4. the resource's `service.name` against an element's trace service name (`dp.otel.service`),
 *      its ID, or its name.
 * A client or producer span also names the element it calls with `peer.service` (same lookup as 4).
 * From parent to child span, a change of element is a hop; each hop is matched to a relationship
 * (directly, or between the elements' parents or children). A hop with no relationship means the
 * running system does something the model does not show.
 *
 * Files are read from one folder (default `<project>/traces`), each re-read when it changes; only the
 * last MAX_FILE_BYTES of a file are read, and the newest MAX_TRACES traces are kept.
 */

import fs from "node:fs";
import path from "node:path";
import { buildIndex, CODE_KEY, getJson, OTEL_SERVICE_KEY, slugify, type Index } from "./ops.js";
import type { Workspace } from "./workspace.js";
import { MASK, SECRET_FIELD } from "../shared/mask.js";
import type { ObservedHop, ObservedSpan, ObservedTrace, TraceList, TraceSummary } from "../shared/types.js";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TRACES = 2000;
const MAX_ATTRIBUTES = 24;
const MAX_VALUE = 300;
const TRACE_FILE = /\.(json|jsonl|ndjson)$/i;

export interface Span {
  traceId: string;
  spanId: string;
  parentId: string | null;
  name: string;
  service: string;
  kind: string;
  startNs: bigint;
  endNs: bigint;
  attributes: Record<string, unknown>;
  error: string | null;
}

const KINDS = ["unspecified", "internal", "server", "client", "producer", "consumer"];

/** OTLP JSON ids are hex; some exporters write base64 (the protobuf JSON mapping). */
function hexId(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (/^[0-9a-f]*$/i.test(s)) return s.toLowerCase();
  try {
    return Buffer.from(s, "base64").toString("hex");
  } catch {
    return "";
  }
}

function anyValue(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if ("stringValue" in o) return o.stringValue;
  if ("intValue" in o) return Number(o.intValue);
  if ("doubleValue" in o) return o.doubleValue;
  if ("boolValue" in o) return o.boolValue;
  if ("arrayValue" in o) return ((o.arrayValue as { values?: unknown[] })?.values ?? []).map(anyValue);
  if ("kvlistValue" in o) return attrs((o.kvlistValue as { values?: unknown[] })?.values);
  return null;
}

function attrs(list: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (Array.isArray(list))
    for (const kv of list) if (kv && typeof kv === "object" && typeof (kv as { key?: unknown }).key === "string") out[(kv as { key: string }).key] = anyValue((kv as { value?: unknown }).value);
  return out;
}

const nanos = (v: unknown): bigint => {
  try {
    return BigInt(typeof v === "number" ? Math.trunc(v) : typeof v === "string" && /^\d+$/.test(v) ? v : 0);
  } catch {
    return 0n;
  }
};

/** Spans in one OTLP JSON document (`{"resourceSpans": [...]}`). */
export function spansOf(doc: unknown): Span[] {
  const out: Span[] = [];
  const rs = (doc as { resourceSpans?: unknown })?.resourceSpans;
  if (!Array.isArray(rs)) return out;
  for (const r of rs) {
    const res = attrs((r as { resource?: { attributes?: unknown } })?.resource?.attributes);
    const service = String(res["service.name"] ?? "");
    const scopes = (r as { scopeSpans?: unknown; instrumentationLibrarySpans?: unknown }).scopeSpans ?? (r as { instrumentationLibrarySpans?: unknown }).instrumentationLibrarySpans;
    if (!Array.isArray(scopes)) continue;
    for (const sc of scopes) {
      const spans = (sc as { spans?: unknown }).spans;
      if (!Array.isArray(spans)) continue;
      for (const s of spans as Record<string, unknown>[]) {
        const traceId = hexId(s.traceId);
        const spanId = hexId(s.spanId);
        if (!traceId || !spanId) continue;
        const status = (s.status ?? {}) as { code?: unknown; message?: unknown };
        const failed = status.code === 2 || status.code === "STATUS_CODE_ERROR";
        const kind =
          typeof s.kind === "number"
            ? (KINDS[s.kind] ?? "internal")
            : String(s.kind ?? "")
                .replace(/^SPAN_KIND_/, "")
                .toLowerCase() || "internal";
        out.push({
          traceId,
          spanId,
          parentId: hexId(s.parentSpanId) || null,
          name: String(s.name ?? ""),
          service,
          kind,
          startNs: nanos(s.startTimeUnixNano),
          endNs: nanos(s.endTimeUnixNano),
          attributes: attrs(s.attributes),
          error: failed ? String(status.message || "error") : null,
        });
      }
    }
  }
  return out;
}

/** Spans in a trace file: JSON lines, or one JSON value (an object or a list). Bad lines are skipped. */
export function parseTraceFile(text: string): Span[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const whole: unknown = JSON.parse(trimmed);
    return (Array.isArray(whole) ? whole : [whole]).flatMap(spansOf);
  } catch {
    /* JSON lines */
  }
  const out: Span[] = [];
  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(...spansOf(JSON.parse(line)));
    } catch {
      /* a partly written or cut line */
    }
  }
  return out;
}

/** Trace files in one folder, re-read when they change. */
export class TraceStore {
  private files = new Map<string, { stamp: string; spans: Span[] }>();
  private byTrace = new Map<string, Span[]>();
  private stamp = "";

  constructor(readonly dir: string) {}

  private refresh(): void {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir).filter((n) => TRACE_FILE.test(n));
    } catch {
      names = [];
    }
    const seen = new Set<string>();
    let changed = false;
    for (const n of names) {
      const f = path.join(this.dir, n);
      let st: fs.Stats;
      try {
        st = fs.statSync(f);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      seen.add(f);
      const stamp = `${st.size}:${st.mtimeMs}`;
      if (this.files.get(f)?.stamp === stamp) continue;
      this.files.set(f, { stamp, spans: parseTraceFile(readTail(f, st.size)) });
      changed = true;
    }
    for (const f of [...this.files.keys()])
      if (!seen.has(f)) {
        this.files.delete(f);
        changed = true;
      }
    const stamp = [...this.files.values()].map((x) => x.stamp).join("|");
    if (!changed && stamp === this.stamp) return;
    this.stamp = stamp;
    const by = new Map<string, Span[]>();
    for (const { spans } of this.files.values()) for (const s of spans) by.set(s.traceId, [...(by.get(s.traceId) ?? []), s]);
    // Keep the newest traces only.
    const newest = [...by.entries()].sort((a, b) => Number(maxEnd(b[1]) - maxEnd(a[1]))).slice(0, MAX_TRACES);
    this.byTrace = new Map(newest);
  }

  exists(): boolean {
    return fs.existsSync(this.dir);
  }

  spans(traceId: string): Span[] | null {
    this.refresh();
    return this.byTrace.get(traceId.toLowerCase()) ?? null;
  }

  list(limit = 30): TraceList {
    this.refresh();
    const traces = [...this.byTrace.values()]
      .map(summary)
      .sort((a, b) => b.start - a.start)
      .slice(0, limit);
    return { dir: this.dir, exists: this.exists(), traces };
  }
}

function readTail(file: string, size: number): string {
  if (size <= MAX_FILE_BYTES) return fs.readFileSync(file, "utf-8");
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(MAX_FILE_BYTES);
    fs.readSync(fd, buf, 0, MAX_FILE_BYTES, size - MAX_FILE_BYTES);
    const text = buf.toString("utf-8");
    return text.slice(text.indexOf("\n") + 1); // drop the cut first line
  } finally {
    fs.closeSync(fd);
  }
}

const maxEnd = (spans: Span[]) => spans.reduce((m, s) => (s.endNs > m ? s.endNs : m), 0n);
const minStart = (spans: Span[]) => spans.reduce((m, s) => (s.startNs && (m === 0n || s.startNs < m) ? s.startNs : m), 0n);
const ms = (ns: bigint) => Number(ns / 1000n) / 1000;

function rootOf(spans: Span[]): Span {
  const ids = new Set(spans.map((s) => s.spanId));
  return spans.filter((s) => !s.parentId || !ids.has(s.parentId)).sort((a, b) => Number(a.startNs - b.startNs))[0] ?? spans[0]!;
}

export function summary(spans: Span[]): TraceSummary {
  const root = rootOf(spans);
  const start = minStart(spans);
  return {
    traceId: root.traceId,
    name: root.name,
    service: root.service,
    start: Math.round(ms(start)),
    durationMs: Math.round(ms(maxEnd(spans) - start) * 10) / 10,
    spanCount: spans.length,
    error: spans.some((s) => s.error),
  };
}

function shown(attributes: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attributes).slice(0, MAX_ATTRIBUTES)) {
    const text = typeof v === "string" ? v : JSON.stringify(v);
    out[k] = SECRET_FIELD.test(k) ? MASK : text.length > MAX_VALUE ? text.slice(0, MAX_VALUE) + "…" : text;
  }
  return out;
}

/** Finds elements for spans (see the header for the order). */
class Matcher {
  private byService = new Map<string, string>();
  private code: { id: string; paths: string[]; component: boolean }[] = [];

  constructor(
    idx: Index,
    private codeRoot: string | null,
  ) {
    for (const el of idx.elements.values()) {
      const svc = el.properties?.[OTEL_SERVICE_KEY];
      if (svc) this.byService.set(svc.toLowerCase(), el.id);
    }
    for (const el of idx.elements.values()) {
      for (const key of [el.id, slugify(el.name), el.name.toLowerCase()]) if (!this.byService.has(key)) this.byService.set(key, el.id);
      const paths = getJson<string>(el, CODE_KEY).map((p) => p.replace(/^\.\//, "").replace(/\/$/, ""));
      if (paths.length) this.code.push({ id: el.id, paths, component: idx.kindOf(el.id) === "component" });
    }
  }

  service(name: unknown): string | null {
    if (typeof name !== "string" || !name) return null;
    return this.byService.get(name.toLowerCase()) ?? this.byService.get(slugify(name)) ?? null;
  }

  private relFile(file: string): string {
    let f = file.replace(/\\/g, "/");
    if (this.codeRoot && path.isAbsolute(file)) {
      const r = path.relative(this.codeRoot, file).replace(/\\/g, "/");
      if (!r.startsWith("..")) f = r;
    }
    return f.replace(/^\.\//, "");
  }

  file(file: unknown, parentEl: string | null): string | null {
    if (typeof file !== "string" || !file) return null;
    const f = this.relFile(file);
    const covers = (p: string) => f === p || f.startsWith(p + "/") || f.endsWith("/" + p);
    const hits = this.code.filter((c) => c.paths.some(covers));
    if (hits.length <= 1) return hits[0]?.id ?? null;
    const main = hits.filter((c) => covers(c.paths[0]!));
    if (main.length === 1) return main[0]!.id;
    if (parentEl && hits.some((c) => c.id === parentEl)) return parentEl;
    return (hits.find((c) => c.component) ?? hits[0]!).id;
  }
}

/** Ancestors and descendants of an element, and the element itself. */
function family(idx: Index, id: string): Set<string> {
  const out = new Set([id]);
  for (let p = idx.parentOf(id); p; p = idx.parentOf(p)) out.add(p);
  const stack = [...idx.childrenOf(id)];
  while (stack.length) {
    const c = stack.pop()!;
    out.add(c);
    stack.push(...idx.childrenOf(c));
  }
  return out;
}

function findRelationship(idx: Index, from: string, to: string): string | null {
  const rels = [...idx.relationships.values()];
  const direct = rels.find((r) => r.sourceId === from && r.destinationId === to);
  if (direct) return direct.id;
  const a = family(idx, from);
  const b = family(idx, to);
  return rels.find((r) => a.has(r.sourceId) && b.has(r.destinationId))?.id ?? null;
}

/** Lay one trace over the model. `uiElementId`: the element whose UI started it (the first hop goes from it). */
export function observe(ws: Workspace, codeRoot: string | null, spans: Span[], uiElementId: string | null = null): ObservedTrace {
  const idx = buildIndex(ws);
  const m = new Matcher(idx, codeRoot);
  const ordered = [...spans].sort((a, b) => Number(a.startNs - b.startNs));
  const byId = new Map(ordered.map((s) => [s.spanId, s]));
  const elementOf = new Map<string, string | null>();
  const unmapped = new Set<string>();
  const start = minStart(spans);
  const ui = uiElementId && idx.elements.has(uiElementId) ? uiElementId : null;

  /** The element of the nearest ancestor span that has one. */
  const parentElement = (s: Span): string | null => {
    for (let p = s.parentId ? byId.get(s.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
      const e = resolve(p);
      if (e) return e;
    }
    return null;
  };
  function resolve(s: Span): string | null {
    if (elementOf.has(s.spanId)) return elementOf.get(s.spanId)!;
    elementOf.set(s.spanId, null); // guards against a cycle in bad data
    const explicit = typeof s.attributes["dp.element"] === "string" && idx.elements.has(s.attributes["dp.element"]) ? (s.attributes["dp.element"] as string) : null;
    const file = s.attributes["code.filepath"] ?? s.attributes["code.file.path"];
    // No file of its own: the span runs where its parent runs (same service), else the service is the element.
    const parent = s.parentId ? byId.get(s.parentId) : undefined;
    const inherited = parent && parent.service === s.service ? parentElement(s) : null;
    const e = explicit ?? m.file(file, parentElement(s)) ?? inherited ?? m.service(s.service);
    if (!e) unmapped.add(typeof file === "string" && file ? file : s.service || s.name);
    elementOf.set(s.spanId, e);
    return e;
  }

  const hops: ObservedHop[] = [];
  const elements: string[] = [];
  const reach = (id: string) => !elements.includes(id) && elements.push(id);
  const out: ObservedSpan[] = ordered.map((s) => {
    const e = resolve(s);
    const from = s.parentId && byId.has(s.parentId) ? parentElement(s) : ui;
    if (e) {
      if (from && from !== e) hops.push({ from, to: e, spanId: s.spanId, relationshipId: findRelationship(idx, from, e) });
      reach(e);
    }
    let peer: string | null = null;
    if (s.kind === "client" || s.kind === "producer") {
      const p = s.attributes["peer.service"];
      peer = m.service(p);
      // A called service that has its own spans in the trace is matched there, not here.
      const calledHasSpans = ordered.some((c) => c.parentId === s.spanId && c.service && c.service !== s.service);
      if (peer && e && peer !== e && !calledHasSpans) {
        hops.push({ from: e, to: peer, spanId: s.spanId, relationshipId: findRelationship(idx, e, peer) });
        reach(peer);
      } else if (!peer && typeof p === "string" && p) unmapped.add(p);
    }
    return {
      spanId: s.spanId,
      parentId: s.parentId && byId.has(s.parentId) ? s.parentId : null,
      name: s.name,
      service: s.service,
      kind: s.kind,
      elementId: e,
      peerElementId: peer,
      startMs: Math.round(ms(s.startNs - start) * 10) / 10,
      durationMs: Math.round(ms(s.endNs - s.startNs) * 10) / 10,
      error: s.error,
      attributes: shown(s.attributes),
    };
  });
  return { ...summary(spans), spans: out, hops, elements, unmapped: [...unmapped] };
}
