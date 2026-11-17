/**
 * System testing mode: one session per project (DEC-075).
 *
 * The session owns the intercept points, the calls that came through them (the run log), the calls that are
 * paused, the breakpoints and the watched fields. There is one stream of traffic, so everyone with the testing
 * right shares one session: the first person to release a paused call wins, a second release is refused.
 *
 * What is kept where:
 *   - memory only: the run log and every body, with their real values (the browser gets them masked)
 *   - `.dp/testing.json` (outside git, mode 0600): the port of each point, breakpoints, watches, options
 *
 * A paused call cannot hang a system for ever: at most MAX_HELD calls are paused, each is released unchanged
 * after `holdSeconds`, and all are released when no testing page has asked for the state for PRESENCE_MS.
 *
 * Points resolve against the main model only: they run outside any request, and a draft must not be able to
 * change where live traffic goes.
 */

import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import type { Duplex } from "node:stream";
import { ModelError } from "../core/modelEdits.js";
import {
  breakpointHits,
  checkTarget,
  cleanBreakpoint,
  cleanField,
  fieldValue,
  interceptGroup,
  maskMessage,
  matchCall,
  mergeMasked,
  secretHeader,
  type InterceptGroup,
  type RawMessage,
} from "../core/testing.js";
import { ensureGitignored } from "../core/users.js";
import { atomicWrite, isObj } from "../core/util.js";
import type { Workspace } from "../core/workspace.js";
import type { Breakpoint, CallMessage, InterceptPoint, ReleaseAction, TestCall, TestCallDetail, TestingOptions, TestingState, Watch } from "../shared/types.js";
import { closeListener, headerPairs, hostOk, listen, MAX_HELD_BYTES, passUpgrade, pipeBack, plain, readBody, reply, send, UpstreamError, type Listener } from "./interceptProxy.js";

export const MAX_HELD = 20;
export const MAX_CALLS = 200;
/** All bodies kept for the run log together; the oldest are dropped first. */
export const MAX_LOG_BYTES = 32_000_000;
/** With no testing page asking for the state for this long, nothing is paused. */
export const PRESENCE_MS = 10_000;
export const MAX_REPLY_DELAY_MS = 30_000;
const DEFAULT_OPTIONS: TestingOptions = { holdSeconds: 120 };

/** The request cannot be done in the state the session is in (HTTP 409), or names something that is not there (404). */
export class TestingError extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface TestSessionOptions {
  /** The project folder: the session's file is `<root>/.dp/testing.json`. */
  root: string;
  /** The main model, as it is now. */
  workspace: () => Workspace;
  /** Hosts besides this machine that points may forward to (--allow-target-host). */
  allowHosts?: string[];
  /** Set: the mode is off here, and this says why. */
  unavailable?: string | null;
  now?: () => number;
  /** How long with no testing page before nothing is paused (tests). */
  presenceMs?: number;
}

interface PointRec {
  group: InterceptGroup;
  port: number | null;
  listener: Listener | null;
  error?: string;
}

/** How a paused call goes on: what a person chose, already checked, or what happened instead. */
type Resolution =
  | { do: "continue"; message: RawMessage; edited: boolean; pauseOnReply: boolean; step: boolean; by?: string }
  | { do: "drop"; by?: string }
  | { do: "reply"; message: RawMessage; delayMs: number; by?: string }
  | { do: "auto"; note: string }
  | { do: "gone" };

interface Rec {
  call: TestCall;
  target: URL;
  self: string;
  request: RawMessage;
  response: RawMessage | null;
  /** The bodies were dropped to keep the log small: the call cannot be resent. */
  dropped: boolean;
  resolve?: (r: Resolution) => void;
  shown?: { request: CallMessage; response: CallMessage | null };
}

interface Client {
  req: http.IncomingMessage;
  res: http.ServerResponse;
}

interface Saved {
  points: Record<string, { port: number; relationshipId: string; stageId?: string }>;
  breakpoints: Breakpoint[];
  watches: Watch[];
  options: TestingOptions;
}

export class TestSession {
  private readonly file: string;
  private readonly now: () => number;
  private readonly allowHosts: string[];
  private readonly presenceMs: number;
  private points = new Map<string, PointRec>();
  private saved: Saved["points"] = {};
  private breakpoints: Breakpoint[] = [];
  private watches: Watch[] = [];
  private options: TestingOptions = { ...DEFAULT_OPTIONS };
  private recs: Rec[] = [];
  private held: string[] = [];
  private stepping = false;
  private version = 1;
  private seq = 0;
  private waiters = new Set<() => void>();
  private waiting = 0;
  private lastSeen = 0;
  private sweep: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(private readonly opts: TestSessionOptions) {
    this.file = path.join(opts.root, ".dp", "testing.json");
    this.now = opts.now ?? Date.now;
    this.allowHosts = (opts.allowHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean);
    this.presenceMs = opts.presenceMs ?? PRESENCE_MS;
    if (!opts.unavailable) this.load();
  }

  // ---------------------------------------------------------------- the session's file

  private load(): void {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(this.file, "utf-8"));
    } catch {
      return; // no file yet, or not readable: start empty
    }
    if (!isObj(data)) return;
    if (isObj(data.points))
      for (const [id, p] of Object.entries(data.points))
        if (isObj(p) && Number.isInteger(p.port) && typeof p.relationshipId === "string")
          this.saved[id] = { port: p.port as number, relationshipId: p.relationshipId, ...(typeof p.stageId === "string" ? { stageId: p.stageId } : {}) };
    // Breakpoints and watches that no longer fit the model are dropped one by one.
    const ws = this.opts.workspace();
    for (const b of Array.isArray(data.breakpoints) ? data.breakpoints : []) {
      try {
        this.breakpoints.push(cleanBreakpoint(ws, b));
      } catch {
        /* its object is gone */
      }
    }
    for (const w of Array.isArray(data.watches) ? data.watches : []) {
      try {
        if (isObj(w) && typeof w.id === "string") this.watches.push({ id: w.id, field: cleanField(w.field) });
      } catch {
        /* not a field any more */
      }
    }
    if (isObj(data.options)) this.options = { holdSeconds: clampHold(data.options.holdSeconds) };
  }

  private save(): void {
    const data: Saved = { points: this.saved, breakpoints: this.breakpoints, watches: this.watches, options: this.options };
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    ensureGitignored(this.opts.root);
    atomicWrite(this.file, JSON.stringify(data, null, 2) + "\n", 0o600);
  }

  // ---------------------------------------------------------------- state and waiting for a change

  private bump(): void {
    this.version++;
    for (const w of [...this.waiters]) w();
  }

  private present(): boolean {
    return this.waiting > 0 || this.now() - this.lastSeen < this.presenceMs;
  }

  private available(): void {
    if (this.opts.unavailable) throw new TestingError(409, this.opts.unavailable);
    if (this.closed) throw new TestingError(409, "The testing session is closed.");
  }

  private pointOf(id: string, p: PointRec | null): InterceptPoint {
    const s = this.saved[id];
    let group = p?.group;
    let error = p?.error;
    if (!group && s) {
      try {
        group = interceptGroup(this.opts.workspace(), s.relationshipId, s.stageId);
      } catch (e) {
        error = (e as Error).message;
      }
    }
    const port = p?.port ?? s?.port ?? null;
    const open = !!p?.listener;
    return {
      id,
      relationshipId: group?.relationshipId ?? s?.relationshipId ?? "",
      ...((group?.stageId ?? s?.stageId) ? { stageId: group?.stageId ?? s?.stageId } : {}),
      members: group?.members ?? [],
      callerId: group?.callerId ?? "",
      targetElementId: group?.targetElementId ?? "",
      target: group?.target ?? "",
      port,
      url: open ? p!.listener!.origin : null,
      state: open ? "open" : error && !group ? "error" : "saved",
      ...(error ? { error } : {}),
    };
  }

  /** The state a testing page shows. Asking for it counts as "a testing page is open". */
  state(): TestingState {
    if (this.opts.unavailable)
      return { available: false, reason: this.opts.unavailable, version: 0, points: [], breakpoints: [], watches: [], calls: [], held: [], stepping: false, options: this.options, watchValues: {} };
    this.lastSeen = this.now();
    this.refreshPoints();
    const ids = new Set([...this.points.keys(), ...Object.keys(this.saved)]);
    const watchValues: TestingState["watchValues"] = {};
    for (const w of this.watches) {
      const rows: { callId: string; value: string }[] = [];
      for (const r of this.recs) {
        const shown = this.shown(r);
        for (const m of [shown.request, shown.response]) {
          const v = m ? fieldValue(m, w.field) : undefined;
          if (v !== undefined) rows.push({ callId: r.call.id, value: v.slice(0, 500) });
        }
      }
      watchValues[w.id] = rows;
    }
    return {
      available: true,
      version: this.version,
      points: [...ids].sort().map((id) => this.pointOf(id, this.points.get(id) ?? null)),
      breakpoints: this.breakpoints,
      watches: this.watches,
      calls: this.recs.map((r) => ({ ...r.call })),
      held: [...this.held],
      stepping: this.stepping,
      options: this.options,
      watchValues,
    };
  }

  /** The state, at once when it is newer than `since`, otherwise when it changes or after `ms`. */
  async wait(since: number, ms: number): Promise<TestingState> {
    if (this.opts.unavailable || this.closed || since !== this.version || ms <= 0) return this.state();
    this.waiting++;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.waiters.add(done);
    });
    this.waiting--;
    return this.state();
  }

  private shown(r: Rec): { request: CallMessage; response: CallMessage | null } {
    r.shown ??= { request: maskMessage(r.request), response: r.response ? maskMessage(r.response) : null };
    return r.shown;
  }

  private rec(id: string): Rec {
    const r = this.recs.find((x) => x.call.id === id);
    if (!r) throw new TestingError(404, "That call is not in the run log any more.");
    return r;
  }

  detail(id: string): TestCallDetail {
    this.available();
    const r = this.rec(id);
    const shown = this.shown(r);
    const gone = (m: CallMessage): CallMessage => (r.dropped ? { ...m, body: null, bodyKind: m.bodyKind === "none" ? "none" : "dropped" } : m);
    return { ...r.call, request: gone(shown.request), response: shown.response ? gone(shown.response) : null };
  }

  // ---------------------------------------------------------------- intercept points

  /** Points follow the model: one whose relationship or address is gone, or whose address changed to somewhere not allowed, closes. */
  private refreshPoints(): void {
    let ws: Workspace;
    try {
      ws = this.opts.workspace();
    } catch {
      return; // the model cannot be read just now: keep what is open
    }
    for (const [id, p] of this.points) {
      try {
        const group = interceptGroup(ws, p.group.relationshipId, p.group.stageId);
        checkTarget(group.target, this.allowHosts);
        if (group.id !== id) throw new ModelError("Its caller or target changed in the model. Open it again from the relationship.");
        p.group = group;
      } catch (e) {
        if (p.listener) void closeListener(p.listener);
        p.listener = null;
        p.error = `Closed: ${(e as Error).message}`;
      }
    }
  }

  /** Open the point of a relationship (or of one stage of its pipeline), on the port it had before when that is free. */
  async openPoint(relationshipId: string, stageId?: string): Promise<InterceptPoint> {
    this.available();
    const group = interceptGroup(this.opts.workspace(), relationshipId, stageId);
    checkTarget(group.target, this.allowHosts);
    const had = this.points.get(group.id);
    if (had?.listener) {
      had.group = group;
      return this.pointOf(group.id, had);
    }
    const p: PointRec = { group, port: null, listener: null };
    const handlers = {
      request: (req: http.IncomingMessage, res: http.ServerResponse) => void this.arrive(p, req, res),
      upgrade: (req: http.IncomingMessage, socket: Duplex, head: Buffer) => this.upgrade(p, req, socket, head),
    };
    const wanted = this.saved[group.id]?.port ?? null;
    try {
      p.listener = await listen(wanted, handlers);
    } catch (e) {
      if (wanted === null || (e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw new ModelError(`The intercept point could not start: ${(e as Error).message}`);
      p.listener = await listen(null, handlers);
      p.error = `Port ${wanted} is in use, so the point has a new port. Update the setting of the calling service.`;
    }
    p.port = p.listener.port;
    this.points.set(group.id, p);
    this.saved[group.id] = { port: p.port, relationshipId: group.relationshipId, ...(group.stageId ? { stageId: group.stageId } : {}) };
    this.save();
    this.bump();
    return this.pointOf(group.id, p);
  }

  /** The base URL of the open point between a caller and a target element, or null. Asking does not count as a testing page being open. */
  pointUrl(callerId: string, targetElementId: string): string | null {
    for (const p of this.points.values()) if (p.listener && !p.group.stageId && p.group.callerId === callerId && p.group.targetElementId === targetElementId) return p.listener.origin;
    return null;
  }

  /** Start every point whose port is remembered. Returns what could not start. */
  async startSaved(): Promise<string[]> {
    this.available();
    const failed: string[] = [];
    for (const [id, s] of Object.entries(this.saved)) {
      if (this.points.get(id)?.listener) continue;
      try {
        await this.openPoint(s.relationshipId, s.stageId);
      } catch (e) {
        failed.push(`${id}: ${(e as Error).message}`);
      }
    }
    return failed;
  }

  /** Close a point and forget its port. Calls paused at it are released unchanged. */
  async closePoint(id: string): Promise<void> {
    this.available();
    const p = this.points.get(id);
    if (!p && !this.saved[id]) throw new TestingError(404, "There is no such intercept point.");
    for (const r of this.recs) if (r.call.pointId === id) r.resolve?.({ do: "auto", note: "released: the intercept point was closed" });
    this.points.delete(id);
    delete this.saved[id];
    this.save();
    this.bump();
    // Let the released calls finish before the listener's connections are cut.
    if (p?.listener) setTimeout(() => void closeListener(p.listener!), 250).unref();
  }

  // ---------------------------------------------------------------- breakpoints, watches, options

  setBreakpoints(list: unknown): void {
    this.available();
    if (!Array.isArray(list) || list.length > 100) throw new ModelError('"breakpoints" must be a list of at most 100 breakpoints.');
    const ws = this.opts.workspace();
    this.breakpoints = list.map((b) => cleanBreakpoint(ws, b));
    this.save();
    this.bump();
  }

  setWatches(list: unknown): void {
    this.available();
    if (!Array.isArray(list) || list.length > 20) throw new ModelError('"watches" must be a list of at most 20 fields.');
    this.watches = list.map((w, i) => ({ id: isObj(w) && typeof w.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(w.id) ? w.id : `w${i + 1}`, field: cleanField(isObj(w) ? w.field : w) }));
    this.save();
    this.bump();
  }

  setOptions(o: unknown): void {
    this.available();
    if (!isObj(o)) throw new ModelError("Options are an object.");
    if ("holdSeconds" in o) {
      const n = Number(o.holdSeconds);
      if (!Number.isFinite(n) || n < 10 || n > 600) throw new ModelError("A paused call is released after 10 to 600 seconds.");
      this.options = { ...this.options, holdSeconds: Math.round(n) };
    }
    this.save();
    this.bump();
  }

  /** Pause the next call that arrives (or the next reply), whatever the breakpoints say. */
  step(on = true): void {
    this.available();
    this.stepping = on;
    this.bump();
  }

  clearCalls(): void {
    this.available();
    this.recs = this.recs.filter((r) => r.resolve || r.call.state === "forwarded");
    this.bump();
  }

  // ---------------------------------------------------------------- a call arrives

  private upgrade(p: PointRec, req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!p.listener || !hostOk(req, p.listener.port)) return void socket.destroy();
    let target: URL;
    try {
      target = checkTarget(p.group.target, this.allowHosts);
    } catch {
      return void socket.destroy();
    }
    const r = this.add(p, target, { method: req.method ?? "GET", path: req.url ?? "/", headers: headerPairs(req), body: Buffer.alloc(0) });
    this.finish(r, "passed", "not paused: a connection upgrade (WebSocket) is passed through");
    passUpgrade(req, socket, head, target, p.listener.origin);
  }

  private add(p: PointRec, target: URL, request: RawMessage, resentFrom?: string): Rec {
    const method = (request.method ?? "GET").toUpperCase();
    const pathAndQuery = request.path ?? "/";
    let match: ReturnType<typeof matchCall> = { relationshipId: p.group.relationshipId, endpoint: null, suggested: null };
    try {
      match = matchCall(this.opts.workspace(), p.group, method, pathAndQuery);
    } catch {
      /* the model cannot be read just now: the call is put down to the point's relationship */
    }
    const trace = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i.exec(request.headers.find(([k]) => k.toLowerCase() === "traceparent")?.[1] ?? "");
    const seq = ++this.seq;
    const shownPath = maskMessage({ ...request, body: Buffer.alloc(0) }).path ?? "/";
    const rec: Rec = {
      call: {
        id: `c${seq}`,
        seq,
        pointId: p.group.id,
        relationshipId: match.relationshipId,
        ...(p.group.stageId ? { stageId: p.group.stageId } : {}),
        method,
        path: shownPath,
        endpoint: match.endpoint,
        suggested: match.suggested,
        state: "forwarded",
        start: this.now(),
        durationMs: null,
        status: null,
        traceId: trace ? trace[1]!.toLowerCase() : null,
        ...(resentFrom ? { resentFrom } : {}),
        edited: false,
      },
      target,
      self: p.listener?.origin ?? `http://127.0.0.1:${p.port ?? 0}`,
      request,
      response: null,
      dropped: false,
    };
    this.recs.push(rec);
    this.trim();
    this.bump();
    return rec;
  }

  /** Keep the log within its limits: the oldest finished calls go first, then the oldest bodies. */
  private trim(): void {
    while (this.recs.length > MAX_CALLS) {
      const i = this.recs.findIndex((r) => !r.resolve && r.call.state !== "forwarded" && r.call.state !== "held-request" && r.call.state !== "held-response");
      if (i < 0) break;
      this.recs.splice(i, 1);
    }
    let total = this.recs.reduce((n, r) => n + (r.dropped ? 0 : r.request.body.length + (r.response?.body.length ?? 0)), 0);
    for (const r of this.recs) {
      if (total <= MAX_LOG_BYTES) break;
      if (r.dropped || r.resolve || r.call.state === "forwarded") continue;
      total -= r.request.body.length + (r.response?.body.length ?? 0);
      const shown = this.shown(r); // what was shown stays shown; only the bytes go
      r.request = { ...r.request, body: Buffer.alloc(0) };
      if (r.response) r.response = { ...r.response, body: Buffer.alloc(0) };
      r.shown = shown;
      r.dropped = true;
    }
  }

  private finish(r: Rec, state: TestCall["state"], note?: string): void {
    r.call.state = state;
    r.call.durationMs = this.now() - r.call.start;
    if (note) r.call.note = r.call.note ? `${r.call.note}; ${note}` : note;
    delete r.call.heldUntil;
    this.bump();
  }

  private async arrive(p: PointRec, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!p.listener || !hostOk(req, p.listener.port)) return plain(res, 403, "This intercept point only answers requests addressed to it on this machine.", "refused");
    // A request line that names another address ("GET http://other/…") is not a call to this target.
    if (!req.url?.startsWith("/")) return plain(res, 400, "An intercept point takes requests with a path only.", "refused");
    let target: URL;
    try {
      target = checkTarget(p.group.target, this.allowHosts);
    } catch (e) {
      return plain(res, 502, `dp does not forward this call: ${(e as Error).message}`, "refused");
    }
    const head: RawMessage = { method: req.method ?? "GET", path: req.url ?? "/", headers: headerPairs(req), body: Buffer.alloc(0) };
    const encoded = req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity";
    let why = "";
    if (req.method === "OPTIONS" && req.headers["access-control-request-method"]) why = "a browser's preflight request is passed through";
    else if (encoded) why = "a compressed request body is passed through";
    else if (Number(req.headers["content-length"] ?? 0) > MAX_HELD_BYTES) why = "a request body over 1 MB is passed through";
    let first: Buffer[] = [];
    if (!why) {
      try {
        const read = await readBody(req);
        if (read.complete) head.body = Buffer.concat(read.chunks);
        else {
          first = read.chunks;
          why = "a request body over 1 MB is passed through";
        }
      } catch {
        return void res.destroy();
      }
    }
    const rec = this.add(p, target, head);
    if (why) return this.passThrough(rec, { req, res }, first, `not paused: ${why}`);
    await this.run(rec, { req, res }, true);
  }

  /** A call that cannot be held: forwarded as it arrives, its reply sent back as it arrives. */
  private async passThrough(rec: Rec, client: Client, first: Buffer[], note: string): Promise<void> {
    rec.call.note = note;
    try {
      const back = await send(rec.target, { ...rec.request, body: Buffer.concat(first) }, rec.self, client.req);
      rec.call.status = back.statusCode ?? null;
      pipeBack(client.res, back, [], rec.target, rec.self);
      back.on("end", () => this.finish(rec, "passed"));
      back.on("error", () => this.finish(rec, "failed", "the reply broke off"));
    } catch (e) {
      this.unreachable(rec, client, e as Error);
    }
  }

  private unreachable(rec: Rec, client: Client | null, e: Error): void {
    const timedOut = e instanceof UpstreamError && e.timedOut;
    if (client) plain(client.res, timedOut ? 504 : 502, `dp could not reach ${rec.target.origin}: ${e.message}`, timedOut ? "timeout" : "unreachable");
    rec.call.status = timedOut ? 504 : 502;
    this.finish(rec, "failed", `the target did not answer: ${e.message}`);
  }

  private hit(rec: Rec, phase: "request" | "response"): Breakpoint | null {
    let ws: Workspace;
    try {
      ws = this.opts.workspace();
    } catch {
      return null;
    }
    const shown = this.shown(rec);
    return this.breakpoints.find((b) => breakpointHits(ws, b, rec.call, phase, shown.request, shown.response)) ?? null;
  }

  /** Whether a call that should pause can: a testing page is open and fewer than MAX_HELD calls are paused. Otherwise the call goes on, with a note. */
  private mayHold(rec: Rec): boolean {
    const why = !this.present() ? "no testing page is open" : this.held.length >= MAX_HELD ? `${MAX_HELD} calls are already paused` : "";
    if (!why) return true;
    rec.call.note = `not paused: ${why}`;
    return false;
  }

  private hold(rec: Rec, state: "held-request" | "held-response", bp: Breakpoint | null, client: Client | null): Promise<Resolution> {
    const ms = this.options.holdSeconds * 1000;
    rec.call.state = state;
    rec.call.heldUntil = this.now() + ms;
    if (bp) rec.call.breakpointId = bp.id;
    else delete rec.call.breakpointId;
    this.held.push(rec.call.id);
    this.stepping = false;
    this.sweep ??= setInterval(() => this.releaseIfAlone(), Math.min(3000, this.presenceMs)).unref();
    return new Promise<Resolution>((resolve) => {
      const onClose = () => !client?.res.writableEnded && rec.resolve?.({ do: "gone" });
      const timer = setTimeout(() => rec.resolve?.({ do: "auto", note: `released automatically after ${this.options.holdSeconds} seconds` }), ms);
      timer.unref();
      client?.res.on("close", onClose);
      rec.resolve = (r) => {
        clearTimeout(timer);
        client?.res.off("close", onClose);
        delete rec.resolve;
        delete rec.call.heldUntil;
        this.held = this.held.filter((id) => id !== rec.call.id);
        if (!this.held.length && this.sweep) {
          clearInterval(this.sweep);
          this.sweep = null;
        }
        resolve(r);
      };
      this.bump();
    });
  }

  private releaseIfAlone(): void {
    if (this.present()) return;
    for (const r of this.recs) r.resolve?.({ do: "auto", note: "released: no testing page is open" });
  }

  /** Take one call from its request to its reply, pausing where a breakpoint, a step or the person asks. `client` null: a resent call, whose reply only goes to the log. */
  private async run(rec: Rec, client: Client | null, pauseRequest: boolean): Promise<void> {
    let pauseReply = false;
    if (pauseRequest) {
      const bp = this.hit(rec, "request");
      if ((bp || this.stepping) && this.mayHold(rec)) {
        const r = await this.hold(rec, "held-request", bp, client);
        if (await this.settle(rec, client, r)) return;
        if (r.do === "continue") pauseReply = r.pauseOnReply;
      }
    }
    rec.call.state = "forwarded";
    this.bump();

    let back: http.IncomingMessage;
    try {
      back = await send(rec.target, rec.request, rec.self);
    } catch (e) {
      return this.unreachable(rec, client, e as Error);
    }
    rec.call.status = back.statusCode ?? null;
    const head: RawMessage = { status: back.statusCode ?? 502, headers: headerPairs(back), body: Buffer.alloc(0) };
    const type = String(back.headers["content-type"] ?? "");
    let why = "";
    if (/text\/event-stream/i.test(type)) why = "an event stream is passed through";
    else if (Number(back.headers["content-length"] ?? 0) > MAX_HELD_BYTES) why = "a reply over 1 MB is passed through";
    let first: Buffer[] = [];
    if (!why) {
      try {
        const read = await readBody(back);
        if (read.complete) head.body = Buffer.concat(read.chunks);
        else {
          first = read.chunks;
          why = "a reply over 1 MB is passed through";
        }
      } catch {
        client?.res.destroy();
        return this.finish(rec, "failed", "the reply broke off");
      }
    }
    rec.response = head;
    delete rec.shown;
    if (why) {
      if (client) pipeBack(client.res, back, first, rec.target, rec.self);
      else back.resume();
      back.on("end", () => this.finish(rec, "done", `the reply was not paused: ${why}`));
      back.on("error", () => this.finish(rec, "failed", "the reply broke off"));
      return;
    }

    const bp = this.hit(rec, "response");
    if ((bp || pauseReply || this.stepping) && this.mayHold(rec)) {
      const r = await this.hold(rec, "held-response", bp, client);
      if (await this.settle(rec, client, r)) return;
    }
    if (client) reply(client.res, rec.response, rec.target, rec.self);
    rec.call.status = rec.response.status ?? rec.call.status;
    this.trim();
    this.finish(rec, "done");
  }

  /** Apply how a paused call goes on. True: the call ended here (dropped, answered by a person, or the caller left). */
  private async settle(rec: Rec, client: Client | null, r: Resolution): Promise<boolean> {
    const wasReply = rec.call.state === "held-response";
    if ("by" in r && r.by) rec.call.by = r.by;
    if (r.do === "gone") {
      this.finish(rec, "failed", "the caller gave up while the call was paused");
      return true;
    }
    if (r.do === "drop") {
      client?.res.destroy();
      this.finish(rec, "dropped");
      return true;
    }
    if (r.do === "reply") {
      rec.call.edited = true;
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs).unref());
      rec.response = r.message;
      delete rec.shown;
      rec.call.status = r.message.status ?? null;
      if (client) reply(client.res, r.message, rec.target, rec.self);
      this.finish(rec, "replied");
      return true;
    }
    if (r.do === "auto") {
      rec.call.note = r.note;
      return false;
    }
    if (r.edited) {
      rec.call.edited = true;
      if (wasReply) rec.response = r.message;
      else {
        rec.request = r.message;
        rec.call.method = (r.message.method ?? rec.call.method).toUpperCase();
      }
      delete rec.shown;
      if (!wasReply) rec.call.path = this.shown(rec).request.path ?? rec.call.path;
    }
    if (r.step) this.stepping = true;
    return false;
  }

  // ---------------------------------------------------------------- what a person does with a call

  /** Release a paused call. Refused (409) when someone else already did. */
  release(id: string, action: ReleaseAction, by?: string): void {
    this.available();
    const rec = this.rec(id);
    if (!rec.resolve) throw new TestingError(409, "This call is no longer paused: it was released already.");
    const who = by ? { by } : {};
    const atReply = rec.call.state === "held-response";
    switch (action.do) {
      case "drop":
        return rec.resolve({ do: "drop", ...who });
      case "reply": {
        const status = Number(action.status);
        if (!Number.isInteger(status) || status < 100 || status > 599) throw new ModelError("A status is a number from 100 to 599.");
        const delayMs = Math.min(Math.max(Number(action.delayMs ?? 0) || 0, 0), MAX_REPLY_DELAY_MS);
        const headers = pairs(action.headers ?? [["Content-Type", "application/json"]]);
        for (const [k, v] of headers) if (v === "•••" && secretHeader(k)) throw new ModelError(`Type a value for the header ${k}: a reply you write has no hidden values.`);
        return rec.resolve({ do: "reply", message: { status, headers, body: Buffer.from(String(action.body ?? ""), "utf-8") }, delayMs, ...who });
      }
      case "continue": {
        if (atReply) throw new ModelError("This call is paused at its reply: continue the reply, answer it yourself or drop it.");
        const { message, edited } = mergeMasked(rec.request, cleanEdit(action.request));
        return rec.resolve({ do: "continue", message, edited, pauseOnReply: action.pauseOnReply === true, step: action.step === true, ...who });
      }
      case "continue-response": {
        if (!atReply || !rec.response) throw new ModelError("This call is paused at its request, not at its reply.");
        const { message, edited } = mergeMasked(rec.response, cleanEdit(action.response));
        return rec.resolve({ do: "continue", message, edited, pauseOnReply: false, step: action.step === true, ...who });
      }
      default:
        throw new ModelError('"do" must be continue, continue-response, drop or reply.');
    }
  }

  /** Release every paused call unchanged. */
  releaseAll(by?: string): void {
    this.available();
    for (const id of [...this.held]) {
      const rec = this.rec(id);
      this.release(id, rec.call.state === "held-response" ? { do: "continue-response" } : { do: "continue" }, by);
    }
  }

  /** Send a logged request again (changed when `edit` is given). Its reply goes to the run log only. Returns the new call's ID. */
  resend(id: string, edit: unknown, by?: string): string {
    this.available();
    const orig = this.rec(id);
    if (orig.dropped) throw new TestingError(409, "This call's body is no longer kept, so it cannot be sent again.");
    if (orig.call.note?.includes("passed through")) throw new TestingError(409, "This call was passed through without being read, so it cannot be sent again.");
    const p = this.points.get(orig.call.pointId);
    if (!p?.listener) throw new TestingError(409, "Its intercept point is closed. Open the point again first.");
    const target = checkTarget(p.group.target, this.allowHosts);
    const { message, edited } = mergeMasked(orig.request, cleanEdit(edit));
    const rec = this.add(p, target, message, orig.call.id);
    rec.call.edited = edited;
    if (by) rec.call.by = by;
    void this.run(rec, null, false);
    return rec.call.id;
  }

  /** Close every point and let every paused call and waiting page go. */
  async close(): Promise<void> {
    this.closed = true;
    for (const r of this.recs) r.resolve?.({ do: "auto", note: "released: dp is stopping" });
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
    for (const w of [...this.waiters]) w();
    const open = [...this.points.values()].flatMap((p) => (p.listener ? [p.listener] : []));
    this.points.clear();
    await Promise.all(open.map(closeListener));
  }
}

function clampHold(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 10), 600) : DEFAULT_OPTIONS.holdSeconds;
}

function pairs(v: unknown): [string, string][] {
  if (!Array.isArray(v) || v.length > 200) throw new ModelError("Headers are a list of [name, value] pairs.");
  return v.map((h) => {
    if (!Array.isArray(h) || typeof h[0] !== "string" || typeof h[1] !== "string") throw new ModelError("Headers are a list of [name, value] pairs.");
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(h[0])) throw new ModelError(`"${h[0]}" is not a header name.`);
    if (/[\r\n\0]/.test(h[1])) throw new ModelError(`The value of the header ${h[0]} has a line break.`);
    return [h[0], h[1]];
  });
}

/** The parts of a message a client may send as an edit; anything else is dropped. */
function cleanEdit(v: unknown): Partial<CallMessage> {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) throw new ModelError("An edit is an object with method, path, status, headers or body.");
  const out: Partial<CallMessage> = {};
  if (typeof v.method === "string") out.method = v.method.trim();
  if (typeof v.path === "string") out.path = v.path.trim();
  if (typeof v.status === "number") out.status = v.status;
  if (v.headers !== undefined) out.headers = pairs(v.headers);
  if (typeof v.body === "string") {
    if (Buffer.byteLength(v.body, "utf-8") > MAX_HELD_BYTES) throw new ModelError("A body is at most 1 MB.");
    out.body = v.body;
  }
  return out;
}
