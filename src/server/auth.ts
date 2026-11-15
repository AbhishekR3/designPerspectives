/**
 * Optional sign-in and roles (Stage P4).
 *
 * Sign-in is on when the users file (`<project>/.dp/users.json`, or `dp serve --users <file>`)
 * exists; without it every request acts as an architect, as before (a viewer under --read-only).
 * Sessions are random cookies kept in memory: a restart signs everyone out.
 *
 * Every change is decided in one place, `decide()`, from the route's action (ROUTE_RULES), the
 * user's role and the model version the request selected:
 *
 *   action          architect   engineer              viewer
 *   edit            yes         in a draft only        no      model, sidecar, positions, undo/redo
 *   code            yes         in a draft only        no      code files (main: the code folder; draft: planned edits)
 *   draft.create    yes         yes                    no
 *   draft.edit      yes         yes                    no      title, description, branch, link
 *   draft.discard   yes         own drafts only        no
 *   draft.apply     yes         no                     no
 *   (unlisted)      yes         no                     no      deny by default
 *
 * A git version (`ref:`) is read-only for everyone; --read-only makes everyone a viewer.
 * Lenses stay a default view: every role can read everything (DEC-008).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { matchedRoutes } from "hono/route";
import { isHidden } from "../core/codefs.js";
import { isObj } from "../core/json.js";
import { dummyHash, MAX_PASSWORD, readUsers, usersPath, UsersError, verifyPassword, type UserEntry } from "../core/users.js";
import type { MeResponse, Permissions, Role, SessionUser } from "../shared/types.js";
import type { Ctx } from "./context.js";

export const SESSION_COOKIE = "dp_session";
/** A session ends after this long without a request. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
/** Failed sign-ins per name within FAIL_WINDOW_MS before that name is locked for LOCK_MS. */
export const MAX_FAILURES = 5;
export const FAIL_WINDOW_MS = 5 * 60 * 1000;
export const LOCK_MS = 30 * 1000;
const MAX_SESSIONS = 10_000;
const MAX_TRACKED_NAMES = 1_000;

export const WRONG_LOGIN = "Wrong name or password.";
export const SIGN_IN = "Sign in to continue.";
export const READ_ONLY_SERVER = "This server is read-only (viewer role).";
export const READ_ONLY_VERSION = "This version of the model is read-only.";

/** Routes that answer without a session. */
const OPEN_PATHS = new Set(["/api/login", "/api/logout", "/api/me", "/api/health"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type Action = "open" | "edit" | "code" | "draft.create" | "draft.edit" | "draft.discard" | "draft.apply";

/**
 * What every non-GET API route does, by "METHOD path" as registered ("ALL" for app.all). A route
 * that is not listed is refused for everyone but architects (and a test fails until it is listed here).
 */
export const ROUTE_RULES: Record<string, Action> = {
  // auth.ts: open to everyone (sign-in works on a read-only server too)
  "POST /api/login": "open",
  "POST /api/logout": "open",
  // app.ts: the 404 answer for unknown API paths
  "ALL /api/*": "open",
  // routes/model.ts
  "PUT /api/diagrams/:key/positions": "edit",
  "PATCH /api/workspace": "edit",
  "POST /api/elements": "edit",
  "PATCH /api/elements/:id": "edit",
  "POST /api/elements/:id/move": "edit",
  "POST /api/elements/delete": "edit",
  "DELETE /api/elements/:id": "edit",
  "POST /api/elements/:id/duplicate": "edit",
  "POST /api/relationships": "edit",
  "PATCH /api/relationships/:id": "edit",
  "DELETE /api/relationships/:id": "edit",
  // routes/sidecar.ts
  "POST /api/tag-groups": "edit",
  "PUT /api/tag-groups/:name": "edit",
  "DELETE /api/tag-groups/:name": "edit",
  "PUT /api/characteristics": "edit",
  "PUT /api/cost-settings": "edit",
  "POST /api/lenses": "edit",
  "PUT /api/lenses/:id": "edit",
  "DELETE /api/lenses/:id": "edit",
  "PUT /api/diagrams/:key/layout": "edit",
  "PUT /api/styles/:target{.+}": "edit",
  // routes/flows.ts
  "POST /api/flows": "edit",
  "PUT /api/flows/:key": "edit",
  "DELETE /api/flows/:key": "edit",
  // routes/history.ts (undo/redo of the selected version)
  "POST /api/undo": "edit",
  "POST /api/redo": "edit",
  // routes/code.ts (main: the code folder itself; a draft: its planned edits)
  "PUT /api/code/file": "code",
  "POST /api/code/file": "code",
  "DELETE /api/code/file": "code",
  "POST /api/code/revert": "code",
  // routes/drafts.ts (by draft id in the path, whatever version is selected)
  "POST /api/drafts": "draft.create",
  "PATCH /api/drafts/:id": "draft.edit",
  "DELETE /api/drafts/:id": "draft.discard",
  "POST /api/drafts/:id/apply": "draft.apply",
};

/** Who is asking, as the request's middleware found it. */
export interface Who {
  /** The signed-in user (null when sign-in is off). */
  user: SessionUser | null;
  /** The role the request acts with: the user's role, "architect" when sign-in is off, "viewer" under --read-only. */
  role: Role;
  loginRequired: boolean;
  readOnlyServer: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    dpWho: Who;
  }
}

const sameName = (a: string | null | undefined, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

/**
 * Null if `who` may do `action` on the version `ref` (for draft.discard: of the draft whose author
 * is `author`); otherwise the reason, which says what the role can do instead.
 */
export function decide(action: Action | undefined, who: Who, ref: string, author?: string | null): string | null {
  if (action === "open") return null;
  if (who.readOnlyServer) return READ_ONLY_SERVER;
  const versioned = action === "edit" || action === "code";
  if (versioned && ref.startsWith("ref:")) return READ_ONLY_VERSION;
  const role = who.role;
  if (role === "architect") return null;
  if (role === "viewer") {
    return "You are signed in as a viewer: you can look at everything, but not change it. Ask an architect or an engineer to make the change.";
  }
  // engineer
  const inDraft = ref.startsWith("draft:");
  switch (action) {
    case "edit":
      return inDraft ? null : "Engineers cannot change the main model. Start a draft to propose the change; an architect applies it.";
    case "code":
      return inDraft ? null : "Engineers cannot change code files directly. Open a draft to plan code edits; an architect applies them.";
    case "draft.create":
    case "draft.edit":
      return null;
    case "draft.discard":
      if (who.user && sameName(author, who.user.name)) return null;
      return `Engineers can discard only drafts they started. ${author ? `This draft was started by ${author}.` : "This draft has no author."} Ask an architect to discard it.`;
    case "draft.apply":
      return "Only an architect can apply a draft. You can keep working on it; ask an architect to apply it.";
    default:
      return "Only an architect can do this.";
  }
}

/** What `who` may do on the version `ref`; `openDraftAuthor`: the author of the draft `ref` names. */
export function permissions(who: Who, ref: string, openDraftAuthor: string | null = null): Permissions {
  const yes = (a: Action, r = ref, author?: string | null) => decide(a, who, r, author) === null;
  return {
    editThis: yes("edit"),
    createDraft: yes("draft.create"),
    applyDraft: yes("draft.apply"),
    discardDraft: ref.startsWith("draft:") && yes("draft.discard", ref, openDraftAuthor),
    writeCode: ref === "main" && yes("code"),
  };
}

const LENS_BY_ROLE: Record<Role, string> = { architect: "architect", engineer: "engineer", viewer: "overview" };
/** The lens a signed-in user starts in (null: use the model-based default). */
export const defaultLensFor = (who: Who): string | null => (who.user ? LENS_BY_ROLE[who.user.role] : null);

// ---------------------------------------------------------------- users file, sessions, lockout

interface Session {
  /** The user's name, lower case. */
  key: string;
  /** The user's entry when the session started; any change to it ends the session. */
  fp: string;
  seen: number;
}

interface Failures {
  times: number[];
  until: number;
}

const fingerprint = (u: UserEntry) => `${u.name}\0${u.role}\0${u.password}`;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function stampOf(file: string): string {
  try {
    const s = fs.statSync(file, { bigint: true });
    return `${s.mtimeNs}:${s.size}:${s.ino}`;
  } catch {
    return "-";
  }
}

export interface AuthOptions {
  /** Users file (default `<root>/.dp/users.json`). A given file must exist. */
  usersFile?: string | null;
  readOnly?: boolean;
  /** The code folder: a users file inside it must be in a hidden folder, or the code routes could read it. */
  codeRoot: string;
  /** Clock in milliseconds (tests). */
  now?: () => number;
}

export class Auth {
  readonly file: string;
  readonly readOnly: boolean;
  private on: boolean;
  private users = new Map<string, UserEntry>();
  private stamp: string;
  /** Why sign-in is unavailable right now (a users file that stopped being valid), or null. */
  private broken: string | null = null;
  private sessions = new Map<string, Session>();
  private failures = new Map<string, Failures>();
  private readonly now: () => number;

  /** Throws UsersError for a users file that is not valid (the server must not start without its login). */
  constructor(root: string, opts: AuthOptions) {
    this.file = path.resolve(opts.usersFile ?? usersPath(root));
    this.readOnly = opts.readOnly ?? false;
    this.now = opts.now ?? Date.now;
    if (opts.usersFile && !fs.existsSync(this.file)) throw new UsersError(`There is no users file at ${this.file}.`);
    const rel = path.relative(path.resolve(opts.codeRoot), this.file);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel) && !isHidden(rel)) {
      throw new UsersError(`The users file ${this.file} is inside the code folder, where the app could read it. Keep it in .dp/ or outside the code folder.`);
    }
    this.stamp = stampOf(this.file);
    const users = readUsers(this.file);
    this.on = users !== null;
    if (users) this.setUsers(users);
    if (this.on) dummyHash(); // made now, so the first sign-in with an unknown name is not slower than the rest
  }

  /** True when sign-in is required (the users file exists, or existed since the server started). */
  get loginRequired(): boolean {
    this.refresh();
    return this.on;
  }

  get userCount(): number {
    return this.users.size;
  }

  private setUsers(users: UserEntry[]): void {
    this.users = new Map(users.map((u) => [u.name.toLowerCase(), u]));
  }

  /** Re-read the users file when it changed on disk. Sign-in never turns off while the server runs:
   *  a removed or broken file leaves nobody able to sign in. */
  private refresh(): void {
    const st = stampOf(this.file);
    if (st === this.stamp) return;
    this.stamp = st;
    try {
      const users = readUsers(this.file);
      if (users === null) {
        if (this.on) console.error(`designPerspectives: ${this.file} was removed; nobody can sign in until it is back.`);
        this.users = new Map();
        this.broken = null;
        return;
      }
      this.on = true;
      this.broken = null;
      this.setUsers(users);
    } catch (e) {
      this.users = new Map();
      this.broken = (e as Error).message;
      console.error(`designPerspectives: ${this.broken} Nobody can sign in until it is fixed.`);
    }
  }

  /** The user of the request's session cookie, or null; ends sessions that are idle or whose user changed. */
  private sessionUser(c: Context): { token: string; user: SessionUser } | null {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token || !TOKEN_RE.test(token)) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    const now = this.now();
    const u = this.users.get(s.key);
    if (now - s.seen > SESSION_IDLE_MS || !u || fingerprint(u) !== s.fp) {
      this.sessions.delete(token);
      return null;
    }
    s.seen = now;
    return { token, user: { name: u.name, role: u.role } };
  }

  private who(user: SessionUser | null): Who {
    const role: Role = this.readOnly ? "viewer" : this.on ? (user?.role ?? "viewer") : "architect";
    return { user, role, loginRequired: this.on, readOnlyServer: this.readOnly };
  }

  /** Middleware (before the version is selected): finds the session; 401 without one when sign-in is on. */
  authenticate: MiddlewareHandler = async (c, next) => {
    this.refresh();
    const s = this.on ? this.sessionUser(c) : null;
    if (this.on && !s && !OPEN_PATHS.has(c.req.path)) return c.json({ detail: SIGN_IN }, 401);
    c.set("dpWho", this.who(s?.user ?? null));
    await next();
  };

  me(c: Context): MeResponse {
    const who = c.get("dpWho");
    return { loginRequired: who.loginRequired, user: who.user };
  }

  // ------------------------------------------------------------ lockout

  private lockedFor(key: string): number {
    const f = this.failures.get(key);
    return f && f.until > this.now() ? f.until - this.now() : 0;
  }

  private recordFailure(key: string): Failures {
    const now = this.now();
    let f = this.failures.get(key);
    if (!f) {
      if (this.failures.size >= MAX_TRACKED_NAMES) {
        for (const [k, v] of this.failures) if (v.until <= now && v.times.every((t) => now - t > FAIL_WINDOW_MS)) this.failures.delete(k);
        while (this.failures.size >= MAX_TRACKED_NAMES) this.failures.delete(this.failures.keys().next().value!);
      }
      f = { times: [], until: 0 };
      this.failures.set(key, f);
    }
    f.times = [...f.times.filter((t) => now - t <= FAIL_WINDOW_MS), now].slice(-MAX_FAILURES * 2);
    return f;
  }

  // ------------------------------------------------------------ routes

  private async login(c: Context): Promise<Response> {
    if (!this.on) return c.json({ detail: "Sign-in is off on this server." }, 400);
    let b: unknown;
    try {
      b = JSON.parse((await c.req.text()) || "null");
    } catch {
      return c.json({ detail: "The request body is not valid JSON." }, 422);
    }
    if (!isObj(b) || typeof b.name !== "string" || typeof b.password !== "string") return c.json({ detail: '"name" and "password" are required.' }, 422);
    if (this.broken) return c.json({ detail: "Sign-in is not available: the users file on the server is not valid. See the server log." }, 503);
    const name = b.name.trim();
    const key = name.toLowerCase().slice(0, 64);
    const wait = this.lockedFor(key);
    if (wait > 0) {
      const s = Math.ceil(wait / 1000);
      return c.json({ detail: `Too many failed sign-ins for this name. Try again in ${s} second${s === 1 ? "" : "s"}.` }, 429);
    }
    // Counted before the check, so parallel guesses cannot get past the limit; a success clears it.
    const f = this.recordFailure(key);
    const user = this.users.get(key);
    const password = b.password.length > MAX_PASSWORD ? "" : b.password;
    // An unknown name is checked against a dummy hash, so the time taken does not tell which names exist.
    const match = await verifyPassword(password, user?.password ?? dummyHash());
    const current = this.users.get(key);
    if (!user || !match || !current || fingerprint(current) !== fingerprint(user) || b.password.length > MAX_PASSWORD) {
      if (f.times.length >= MAX_FAILURES) f.until = this.now() + LOCK_MS;
      return c.json({ detail: WRONG_LOGIN }, 401);
    }
    this.failures.delete(key);
    if (this.sessions.size >= MAX_SESSIONS) {
      const now = this.now();
      for (const [t, s] of this.sessions) if (now - s.seen > SESSION_IDLE_MS) this.sessions.delete(t);
      while (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value!);
    }
    const token = crypto.randomBytes(32).toString("base64url");
    this.sessions.set(token, { key, fp: fingerprint(user), seen: this.now() });
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: "Strict", path: "/", secure: isHttps(c) });
    return c.json({ user: { name: user.name, role: user.role } satisfies SessionUser });
  }

  private logout(c: Context): Response {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) this.sessions.delete(token);
    deleteCookie(c, SESSION_COOKIE, { httpOnly: true, sameSite: "Strict", path: "/", secure: isHttps(c) });
    return c.json({ ok: true });
  }

  register(app: Hono): void {
    app.post("/api/login", (c) => this.login(c));
    app.post("/api/logout", (c) => this.logout(c));
    app.get("/api/me", (c) => c.json(this.me(c)));
  }
}

/** The request came over https (directly, or through a proxy that says so). */
function isHttps(c: Context): boolean {
  const fwd = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return fwd === "https" || new URL(c.req.url).protocol === "https:";
}

/** Middleware (after the version is selected): refuses changes the request's role may not make. */
export function authorize(ctx: Ctx): MiddlewareHandler {
  return async function dpAuthorize(c, next) {
    const method = c.req.method;
    if (SAFE_METHODS.has(method)) return next();
    // The route that will answer: the first one registered after this middleware that matches the
    // method (all middleware is registered before it, so an "ALL" route here is a handler).
    const route = matchedRoutes(c)
      .slice(c.req.routeIndex + 1)
      .find((r) => r.method === method || r.method === "ALL");
    if (!route) return next(); // nothing answers: Hono's own 404
    const action = ROUTE_RULES[`${method} ${route.path}`];
    const who = c.get("dpWho");
    let author: string | null = null;
    if (action === "draft.discard" && who.role === "engineer") {
      const m = /^\/api\/drafts\/([^/]+)$/.exec(c.req.path);
      let id = "";
      try {
        id = decodeURIComponent(m?.[1] ?? "");
      } catch {
        /* not a draft id: drafts.info says there is no such draft */
      }
      author = ctx.drafts.info(id).author ?? null;
    }
    const why = decide(action, who, ctx.sel().ref, author);
    if (why) return c.json({ detail: why }, 403);
    await next();
  };
}
