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
 *   comment         yes         yes                    yes     comments, ideas, questions, replies, resolving (own text only to change or delete; an architect any)
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
import { dummyHash, MAX_PASSWORD, readUsers, roleIn, usersPath, UsersError, verifyPassword, type UserEntry } from "../core/users.js";
import type { MeResponse, Permissions, Role, SessionUser } from "../shared/types.js";
import type { Ctx } from "./context.js";

/** Cookie name stem; the name used is `dp_session_<port>`, see sessionCookie(). */
export const SESSION_COOKIE = "dp_session";
/** A session ends after this long without a request. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
/** Failed sign-ins per name within FAIL_WINDOW_MS before that name is locked for LOCK_MS. */
export const MAX_FAILURES = 5;
export const FAIL_WINDOW_MS = 5 * 60 * 1000;
export const LOCK_MS = 30 * 1000;
/** Defaults for AuthOptions.limits. */
export const AUTH_LIMITS = { sessions: 10_000, sessionsPerUser: 10, names: 1_000 };

export const WRONG_LOGIN = "Wrong name or password.";
export const USERS_UNAVAILABLE = "Sign-in is not available: the users file on the server is missing or not valid. See the server log.";
export const SIGN_IN = "Sign in to continue.";
export const READ_ONLY_SERVER = "This server is read-only (viewer role).";
export const READ_ONLY_VERSION = "This version of the model is read-only.";

/** Routes that answer without a session. */
const OPEN_PATHS = new Set(["/api/login", "/api/logout", "/api/me", "/api/health"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** "admin": hub and server settings (adding a project, credentials); architects only. */
export type Action = "open" | "comment" | "edit" | "code" | "draft.create" | "draft.edit" | "draft.discard" | "draft.apply" | "admin";

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
  // routes/catalog.ts: linked copies of shared catalog elements (DEC-054)
  "POST /api/elements/from-catalog": "edit",
  "POST /api/elements/:id/catalog": "edit",
  "POST /api/elements/:id/catalog/sync": "edit",
  "DELETE /api/elements/:id/catalog": "edit",
  // routes/credentials.ts: integration credentials, architects only (DEC-055)
  "POST /api/credentials": "admin",
  "PUT /api/credentials/:name": "admin",
  "PATCH /api/credentials/:name": "admin",
  "DELETE /api/credentials/:name": "admin",
  // routes/work.ts: linked work status from GitHub, written to the model (DEC-058)
  "POST /api/work/refresh": "edit",
  // routes/decisions.ts: decision records are part of the model (DEC-050)
  "POST /api/decisions": "edit",
  "PUT /api/decisions/:id": "edit",
  "PATCH /api/decisions/:id/status": "edit",
  "DELETE /api/decisions/:id": "edit",
  // routes/history.ts (undo/redo of the selected version)
  "POST /api/undo": "edit",
  "POST /api/redo": "edit",
  // routes/code.ts (main: the code folder itself; a draft: its planned edits)
  "PUT /api/code/file": "code",
  "POST /api/code/file": "code",
  "DELETE /api/code/file": "code",
  "POST /api/code/revert": "code",
  // routes/inspect.ts: the live UI inspector reads the model and opens a local proxy; it changes nothing
  "POST /api/ui-proxy": "open",
  // routes/comments.ts: a conversation about the model, kept in its own file, not part of it (DEC-049)
  "POST /api/comments": "comment",
  "POST /api/comments/:id/replies": "comment",
  "PATCH /api/comments/:id": "comment",
  "DELETE /api/comments/:id": "comment",
  "DELETE /api/comments/:id/replies/:rid": "comment",
  "POST /api/inspect": "open",
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
  if (action === "comment") return null; // every role, on every version
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
    comment: yes("comment"),
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
  /** Name and role when the session started (shown by /api/me while the users file is unreadable). */
  user: SessionUser;
  seen: number;
}

/**
 * Sign-in attempts for one name. Each attempt is recorded before its password check (so parallel
 * guesses count at once); a correct one clears the record. The 5th attempt in the window locks the
 * name for LOCK_MS. When the lock ends the count starts afresh, so a name cannot be kept locked for
 * good by one wrong guess every 30 seconds. Trade-off: a guesser gets 5 tries per lock period
 * (about 10 a minute) instead of fewer; with generated 16-character passwords that is harmless.
 * The count is per name, not per client address: behind a proxy, and in this local tool, every
 * request comes from the same address, so an address would not tell guessers apart.
 */
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

/** A path with every existing part resolved to its real name (symlinks, and letter case on
 *  case-insensitive disks); the parts that do not exist yet are kept as given. */
function realLoose(p: string): string {
  const loose = path.resolve(p);
  const rest: string[] = [];
  let cur = loose;
  for (;;) {
    try {
      const real = fs.realpathSync.native(cur);
      return rest.length ? path.join(real, ...rest.reverse()) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return loose;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

/** True if `file` is inside `root` but not in a hidden folder, so the code routes could read it. */
export function readableAsCode(root: string, file: string): boolean {
  const rel = path.relative(realLoose(root), realLoose(file));
  if (rel === "" || path.isAbsolute(rel) || rel === ".." || rel.startsWith(`..${path.sep}`)) return false;
  return !isHidden(rel);
}

export interface AuthOptions {
  /** Users file (default `<root>/.dp/users.json`). A given file must exist. */
  usersFile?: string | null;
  readOnly?: boolean;
  /** The code folder: a users file inside it must be in a hidden folder, or the code routes could read it. */
  codeRoot: string;
  /** Clock in milliseconds (tests). */
  now?: () => number;
  /** Caps on sessions and on names with recorded failures (tests). */
  limits?: Partial<typeof AUTH_LIMITS>;
}

export class Auth {
  readonly file: string;
  readonly readOnly: boolean;
  private on: boolean;
  private users = new Map<string, UserEntry>();
  private stamp: string;
  /** Why sign-in is unavailable right now (the users file is missing or not valid), or null. */
  private broken: string | null = null;
  private sessions = new Map<string, Session>();
  private failures = new Map<string, Failures>();
  private readonly now: () => number;
  private readonly limits: typeof AUTH_LIMITS;

  /** Throws UsersError for a users file that is not valid (the server must not start without its login). */
  constructor(root: string, opts: AuthOptions) {
    this.file = path.resolve(opts.usersFile ?? usersPath(root));
    this.readOnly = opts.readOnly ?? false;
    this.now = opts.now ?? Date.now;
    this.limits = { ...AUTH_LIMITS, ...opts.limits };
    if (opts.usersFile && !fs.existsSync(this.file)) throw new UsersError(`There is no users file at ${this.file}.`);
    if (readableAsCode(opts.codeRoot, this.file)) {
      throw new UsersError(`The users file ${this.file} is inside the code folder, where the app could read it. Keep it in .dp/ or outside the code folder.`);
    }
    this.stamp = stampOf(this.file);
    const users = readUsers(this.file);
    this.on = users !== null;
    if (users) this.setUsers(users);
    if (this.on) dummyHash(); // made now, so the first sign-in with an unknown name is not slower than the rest
  }

  /** A signed-in user's role in a hub project (DEC-056): read live, so a change applies on the next request. */
  roleIn(name: string, project: string): Role | null {
    this.refresh();
    const u = this.users.get(name.toLowerCase());
    return u ? roleIn(u, project) : null;
  }

  /** Middleware for a hub project's app (after `authenticate`): the request acts with the user's role in that project. */
  projectRole(project: string): MiddlewareHandler {
    return async (c, next) => {
      const w = c.get("dpWho");
      if (w?.user && !w.readOnlyServer) {
        const role = this.roleIn(w.user.name, project) ?? w.role;
        c.set("dpWho", { ...w, role, user: { ...w.user, role } });
      }
      await next();
    };
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

  /**
   * Re-read the users file when it changed on disk. A file that exists always turns sign-in on,
   * valid or not, and sign-in never turns off while the server runs. While the file is missing or
   * not valid nobody can sign in or use a session, but sessions are kept: a half-written save must
   * not sign everyone out. They are checked again against the next valid file.
   */
  private refresh(): void {
    const st = stampOf(this.file);
    if (st === this.stamp) return;
    this.stamp = st;
    try {
      const users = readUsers(this.file);
      if (users === null) {
        if (this.on) {
          this.broken = `${this.file} is missing.`;
          console.error(`designPerspectives: ${this.broken} Nobody can sign in until it is back.`);
        }
        return;
      }
      this.on = true;
      this.broken = null;
      this.setUsers(users);
    } catch (e) {
      this.on = true;
      this.broken = (e as Error).message;
      console.error(`designPerspectives: ${this.broken} Nobody can sign in until it is fixed.`);
    }
  }

  /** The request's session, or null; ends sessions that are idle, or whose user a valid users file
   *  no longer has (or has with another role or password). */
  private session(c: Context): { token: string; s: Session } | null {
    const token = getCookie(c, sessionCookie(c));
    if (!token || !TOKEN_RE.test(token)) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    const now = this.now();
    if (now - s.seen > SESSION_IDLE_MS) {
      this.sessions.delete(token);
      return null;
    }
    if (!this.broken) {
      const u = this.users.get(s.key);
      if (!u || fingerprint(u) !== s.fp) {
        this.sessions.delete(token);
        return null;
      }
      s.seen = now;
    }
    return { token, s };
  }

  private who(user: SessionUser | null): Who {
    const role: Role = this.readOnly ? "viewer" : this.on ? (user?.role ?? "viewer") : "architect";
    return { user, role, loginRequired: this.on, readOnlyServer: this.readOnly };
  }

  /** Middleware (before the version is selected): finds the session; 401 without one when sign-in is
   *  on, 503 while the users file is missing or not valid. */
  authenticate: MiddlewareHandler = async (c, next) => {
    this.refresh();
    const found = this.on ? this.session(c) : null;
    if (this.on && !OPEN_PATHS.has(c.req.path)) {
      if (this.broken) return c.json({ detail: USERS_UNAVAILABLE }, 503);
      if (!found) return c.json({ detail: SIGN_IN }, 401);
    }
    c.set("dpWho", this.who(found ? { ...found.s.user } : null));
    await next();
  };

  me(c: Context): MeResponse {
    const who = c.get("dpWho");
    return { loginRequired: who.loginRequired, user: who.user };
  }

  // ------------------------------------------------------------ lockout

  /** The failure record for `key`, made room for if needed; null when every tracked name is locked. */
  private failuresOf(key: string): Failures | null {
    const now = this.now();
    let f = this.failures.get(key);
    if (f) return f;
    if (this.failures.size >= this.limits.names) {
      const unlocked = [...this.failures].filter(([, v]) => v.until <= now);
      // Names with no recent failure first, then the other unlocked ones, oldest first; never a locked one.
      const stale = unlocked.filter(([, v]) => v.times.every((t) => now - t > FAIL_WINDOW_MS));
      for (const [k] of [...stale, ...unlocked.filter((e) => !stale.includes(e))]) {
        if (this.failures.size < this.limits.names) break;
        this.failures.delete(k);
      }
      if (this.failures.size >= this.limits.names) return null;
    }
    f = { times: [], until: 0 };
    this.failures.set(key, f);
    return f;
  }

  /** Record an attempt before its password check. Returns the milliseconds to wait (the name is locked) or 0. */
  private startAttempt(f: Failures): number {
    const now = this.now();
    if (f.until > now) return f.until - now;
    if (f.until) f.times = []; // the lock has ended: a fresh count
    f.until = 0;
    f.times = [...f.times.filter((t) => now - t <= FAIL_WINDOW_MS), now];
    if (f.times.length >= MAX_FAILURES) f.until = now + LOCK_MS; // this attempt still runs; the next ones wait
    return 0;
  }

  // ------------------------------------------------------------ sessions

  private addSession(key: string, user: UserEntry): string {
    const mine = [...this.sessions].filter(([, s]) => s.key === key).sort((a, b) => a[1].seen - b[1].seen);
    for (const [t] of mine.slice(0, Math.max(0, mine.length - this.limits.sessionsPerUser + 1))) this.sessions.delete(t);
    if (this.sessions.size >= this.limits.sessions) {
      const now = this.now();
      for (const [t, s] of this.sessions) if (now - s.seen > SESSION_IDLE_MS) this.sessions.delete(t);
      const idlest = [...this.sessions].sort((a, b) => a[1].seen - b[1].seen);
      for (const [t] of idlest.slice(0, Math.max(0, this.sessions.size - this.limits.sessions + 1))) this.sessions.delete(t);
    }
    const token = crypto.randomBytes(32).toString("base64url");
    this.sessions.set(token, { key, fp: fingerprint(user), user: { name: user.name, role: user.role }, seen: this.now() });
    return token;
  }

  // ------------------------------------------------------------ routes

  private async login(c: Context): Promise<Response> {
    this.refresh();
    if (!this.on) return c.json({ detail: "Sign-in is off on this server." }, 400);
    let b: unknown;
    try {
      b = JSON.parse((await c.req.text()) || "null");
    } catch {
      return c.json({ detail: "The request body is not valid JSON." }, 422);
    }
    if (!isObj(b) || typeof b.name !== "string" || typeof b.password !== "string") return c.json({ detail: '"name" and "password" are required.' }, 422);
    if (this.broken) return c.json({ detail: USERS_UNAVAILABLE }, 503);
    const name = b.name.trim();
    const key = name.toLowerCase().slice(0, 64);
    const f = this.failuresOf(key);
    if (!f) return c.json({ detail: "Too many failed sign-ins right now. Try again in a minute." }, 429);
    // Counted (and the lock set) before the check, with nothing awaited in between, so parallel
    // guesses cannot get past the limit; a correct password clears the count.
    const wait = this.startAttempt(f);
    if (wait > 0) {
      const s = Math.ceil(wait / 1000);
      return c.json({ detail: `Too many failed sign-ins for this name. Try again in ${s} second${s === 1 ? "" : "s"}.` }, 429);
    }
    const user = this.users.get(key);
    const tooLong = b.password.length > MAX_PASSWORD;
    // An unknown name is checked against a dummy hash, so the time taken does not tell which names exist.
    const match = await verifyPassword(tooLong ? "" : b.password, user?.password ?? dummyHash());
    const current = this.users.get(key);
    if (!user || !match || tooLong || this.broken || !current || fingerprint(current) !== fingerprint(user)) {
      return c.json({ detail: this.broken ? USERS_UNAVAILABLE : WRONG_LOGIN }, this.broken ? 503 : 401);
    }
    this.failures.delete(key);
    const token = this.addSession(key, user);
    setCookie(c, sessionCookie(c), token, { httpOnly: true, sameSite: "Strict", path: "/", secure: isHttps(c) });
    return c.json({ user: { name: user.name, role: user.role } satisfies SessionUser });
  }

  private logout(c: Context): Response {
    const token = getCookie(c, sessionCookie(c));
    if (token) this.sessions.delete(token);
    deleteCookie(c, sessionCookie(c), { httpOnly: true, sameSite: "Strict", path: "/", secure: isHttps(c) });
    return c.json({ ok: true });
  }

  register(app: Hono): void {
    app.post("/api/login", (c) => this.login(c));
    app.post("/api/logout", (c) => this.logout(c));
    app.get("/api/me", (c) => c.json(this.me(c)));
  }
}

/**
 * The session cookie's name for the server this request was addressed to. Browsers do not keep
 * cookies apart by port, so two servers on localhost would sign each other out with one shared
 * name; the port from the Host header makes the name differ (no port: the plain name).
 */
export function sessionCookie(c: Context): string {
  const host = c.req.header("host") ?? "";
  const port = /:(\d{1,5})$/.exec(host)?.[1];
  return port ? `${SESSION_COOKIE}_${port}` : SESSION_COOKIE;
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
    // Keyed on the matched route's own method, so an "ALL" route (the 404 answer) finds its rule.
    const action = ROUTE_RULES[`${route.method} ${route.path}`];
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
