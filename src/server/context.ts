/** What the route modules share: the project, drafts and git readers, the model version a request
 *  selects, and the small request-parsing helpers. */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Context, MiddlewareHandler } from "hono";
import * as diagrams from "../core/diagrams.js";
import { diffModels } from "../core/diff.js";
import { Drafts } from "../core/drafts.js";
import { DiskCode, NO_CODE, type CodeSource } from "../core/codeFiles.js";
import { currentBranch, GitCodes, GitModels, gitUserName, listRefs } from "../core/git.js";
import { decisionSummary } from "../core/decisions.js";
import { CredentialStore } from "../core/credentials.js";
import type { Fetch } from "../core/workStatus.js";
import * as flows from "../core/flows.js";
import { isObj, type Obj } from "../core/util.js";
import * as ops from "../core/ops.js";
import { buildIndex, elementSummary, relationshipSummary } from "../core/ops.js";
import { BUILTIN_LENSES, lensData, SECTIONS, styleData, type Sidecar } from "../core/sidecar.js";
import { Project, type ModelSource } from "../core/project.js";
import type { Workspace } from "../core/workspace.js";
import type { AppState, Decision, DraftInfo, Lens, Permissions, SessionUser, Style } from "../shared/types.js";
import { Auth, defaultLensFor, permissions, type AuthOptions, type Who } from "./auth.js";
import { UiProxies } from "./uiProxy.js";
import { TraceStore } from "../core/traces.js";
import { CommentStore, commentsPath } from "../core/comments.js";
import path from "node:path";

/** An HTTP error with a status code; the body is {"detail": message}. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The model version a request works on (header X-DP-Model) and the one it is compared with
 *  (header X-DP-Compare). */
export interface Selection {
  src: ModelSource;
  ref: string;
  title: string;
  cmp: ModelSource | null;
  cmpRef: string | null;
  cmpTitle: string | null;
  /** Where each version reads source files from. */
  code: CodeSource;
  cmpCode: CodeSource | null;
  /** Files the shown draft plans to edit. */
  planned: string[];
}

/** The two code sources of a comparison, for `diffModels`. */
export function codePair(sel: Selection) {
  return sel.cmpCode ? { before: sel.cmpCode, after: sel.code, planned: sel.planned } : undefined;
}

/** The request's user and what they may do (see auth.ts); `state()` without it acts as before sign-in existed. */
export interface Access {
  me: SessionUser | null;
  loginRequired: boolean;
  can: Permissions;
  /** Lens for a signed-in user's role, or null for the model-based default. */
  defaultLens: string | null;
  canDiscard: (d: DraftInfo) => boolean;
  /** Whether the user may change the draft: its model, planned code, title and details. */
  canEdit: (d: DraftInfo) => boolean;
}

export function state(project: Project, readOnly = false, sel?: Selection, drafts?: Drafts, gitModels?: GitModels, access?: Access): AppState {
  const src = sel?.src ?? project;
  const legacyEdit = !(readOnly || src.readOnly);
  const can: Permissions = access?.can ?? {
    editThis: legacyEdit,
    createDraft: !readOnly,
    applyDraft: !readOnly,
    discardDraft: !readOnly && (sel?.ref ?? "main").startsWith("draft:"),
    writeCode: legacyEdit && (sel?.ref ?? "main") === "main",
    comment: !readOnly,
  };
  const draftList = drafts?.list() ?? [];
  const ws = src.workspace;
  const sc = src.sidecar;
  const editable = src instanceof Project ? src : null;
  const idx = buildIndex(ws);
  return {
    workspace: { name: ws.name, description: ws.description || "" },
    root: project.root,
    elements: [...idx.elements.keys()].map((e) => elementSummary(idx, e)),
    relationships: [...idx.relationships.values()].map(relationshipSummary),
    diagrams: diagrams.diagramList(ws),
    tagGroups: sc.tagGroups.map((g) => ({ name: g.name, values: g.values.map((v) => ({ name: v.name, color: v.color })) })),
    characteristics: sc.characteristics.map((c) => ({ name: c.name, description: c.description })),
    costSettings: { currency: sc.cost.currency, bands: sc.cost.bands.map((b) => ({ name: b.name, max: b.max ?? null, color: b.color })) },
    lenses: [...BUILTIN_LENSES, ...sc.lenses].map((l) => ({ ...lensData(l), defaultOverlay: l.defaultOverlay ?? null, builtin: l.builtin }) as unknown as Lens),
    defaultLens: access?.defaultLens ?? ([...idx.elements.keys()].some((id) => idx.kindOf(id) === "container") ? "engineer" : "architect"),
    flows: flows.listFlows(ws),
    decisions: src.decisions.map(decisionSummary),
    loadErrors: src.loadErrors,
    enums: ops.ENUMS,
    technologies: ops.technologyCatalog(idx),
    styles: Object.fromEntries(Object.entries(sc.styles).map(([k, v]) => [k, styleData(v) as Style])),
    canUndo: (editable?.undoStack.length ?? 0) > 0,
    canRedo: (editable?.redoStack.length ?? 0) > 0,
    codeRoot: project.codeRoot,
    sections: [...SECTIONS],
    readOnly: !can.editThis,
    me: access?.me ?? null,
    loginRequired: access?.loginRequired ?? false,
    can,
    model: { ref: sel?.ref ?? "main", title: sel?.title ?? "Main model" },
    version: `${src.revision}/${sel?.cmp?.revision ?? ""}`,
    drafts: access ? draftList.map((d) => ({ ...d, canDiscard: access.canDiscard(d), canEdit: access.canEdit(d) })) : draftList,
    git: (() => {
      const repo = gitModels?.get();
      return repo ? { branch: currentBranch(repo), refs: listRefs(repo) } : null;
    })(),
    compare: sel?.cmp && sel.cmpRef ? { against: sel.cmpRef, title: sel.cmpTitle ?? sel.cmpRef, summary: diffModels(sel.cmp, src, sel.cmpRef, codePair(sel)).summary } : null,
  };
}

// ---------------------------------------------------------------- request body helpers

export async function body(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(422, "The request body is not valid JSON.");
  }
}

export async function objBody(c: Context): Promise<Obj> {
  const b = await body(c);
  if (!isObj(b)) throw new HttpError(422, "The request body must be a JSON object.");
  return b;
}

export function needStr(o: Obj, key: string): string {
  if (typeof o[key] !== "string") throw new HttpError(422, `"${key}" is required and must be text.`);
  return o[key] as string;
}

export function optStr(o: Obj, key: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new HttpError(422, `"${key}" must be text.`);
  return v;
}

export function num(v: unknown, what: string): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new HttpError(422, `${what} must be a number.`);
  return n;
}

export function point(v: unknown, what: string): { x: number; y: number } {
  if (!isObj(v)) throw new HttpError(422, `${what} must be an object with x and y.`);
  return { x: num(v.x, `${what}.x`), y: num(v.y, `${what}.y`) };
}

export function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new HttpError(422, `${what} must be a list of text.`);
  return v as string[];
}

// ---------------------------------------------------------------- the shared context

export interface AppOptions {
  codeRoot?: string | null;
  readOnly?: boolean;
  /** Users file for sign-in (default `<root>/.dp/users.json`; sign-in is off when it does not exist). */
  usersFile?: string | null;
  /** Clock in milliseconds for sessions and sign-in lockout (tests). */
  now?: () => number;
  /** Caps on sessions and on names with recorded sign-in failures (tests; see AUTH_LIMITS). */
  authLimits?: AuthOptions["limits"];
  /** Host names (as in the Host header, without the port; IPv6 in brackets) the server answers to.
   *  Default: the loopback names. null turns the check off (a server bound to another interface). */
  allowedHosts?: string[] | null;
  /** Hosts besides this machine whose live UIs may be opened through the UI proxy (--allow-ui-host). */
  uiAllowHosts?: string[];
  /** Folder of OpenTelemetry trace files (default `<project>/traces`). */
  tracesDir?: string | null;
  /** Sign-in shared with other projects (a hub); default: this project's own. */
  auth?: Auth;
  /** This project's ID in a hub: requests act with the user's role in it (DEC-057). */
  projectId?: string | null;
  /** The hub's shared catalog model (DEC-055); absent or null: no catalog. */
  catalog?: () => Workspace | null;
  /** Key for credentials at rest (DEC-056); default: the DP_SECRET_KEY environment variable (tests set it). */
  secretKey?: string | null;
  /** Where credentials are kept (a hub's store); default: this project's `.dp/credentials.json`. */
  credentials?: CredentialStore;
  /** How the server calls other services (tests replace it); default: the global fetch. */
  fetch?: Fetch;
}

/** Everything the route modules work with, built once per app by `createContext`. */
export interface Ctx {
  readOnly: boolean;
  auth: Auth;
  /** The request's user and role (set by the sign-in middleware). */
  who: (c: Context) => Who;
  /** The request's user and what they may do on the selected version. */
  access: (c: Context) => Access;
  project: Project;
  drafts: Drafts;
  gitModels: GitModels;
  gitCodes: GitCodes;
  disk: DiskCode;
  ok: (c: Context) => Response;
  /** The model version and comparison the current request selected. */
  sel: () => Selection;
  /** The editable model of the selected version (403 for a read-only version). */
  writable: () => Project;
  edit: <T>(fn: (ws: Workspace, sc: Sidecar, decisions: Decision[]) => T, record?: boolean) => T;
  draftId: (ref: string) => string;
  /** Middleware: reads X-DP-Model / X-DP-Compare and runs the rest of the request with that selection. */
  selectVersion: MiddlewareHandler;
  /** Live UI proxies, one local listener per app origin (uiProxy.ts). */
  uiProxies: UiProxies;
  /** Trace files (traces.ts). */
  traces: TraceStore;
  /** Comments, ideas and questions (comments.ts); one store for the project, whatever version a request shows. */
  comments: CommentStore;
  /** The hub's shared catalog model, or null (no hub, no catalog, or this is the catalog). */
  catalog: () => Workspace | null;
  /** Integration credentials (DEC-056): the hub's, or the project's own. */
  credentials: CredentialStore;
  fetch: Fetch;
}

export function createContext(root: string, opts: AppOptions = {}): Ctx {
  const readOnly = opts.readOnly ?? false;
  const project = new Project(root, opts.codeRoot);
  const auth = opts.auth ?? new Auth(root, { usersFile: opts.usersFile, readOnly, codeRoot: project.codeRoot, now: opts.now, limits: opts.authLimits });
  const drafts = new Drafts(project, gitUserName(project.dir));
  const gitModels = new GitModels(project.dir);
  const gitCodes = new GitCodes(project.codeRoot);
  const disk = new DiskCode(project.codeRoot);
  const ok = (c: Context) => c.json({ ok: true });

  // Each request selects a model version; handlers read it from here (requests interleave at
  // `await`, so this cannot be a plain variable).
  const selection = new AsyncLocalStorage<Selection>();
  const sel = (): Selection => selection.getStore() ?? { src: project, ref: "main", title: "Main model", cmp: null, cmpRef: null, cmpTitle: null, code: disk, cmpCode: null, planned: [] };
  const src = () => sel().src;
  const writable = (): Project => {
    const s = src();
    if (!(s instanceof Project)) throw new HttpError(403, "This version of the model is read-only.");
    return s;
  };
  const edit = <T>(fn: (ws: Workspace, sc: Sidecar, decisions: Decision[]) => T, record = true) => writable().edit(fn, record);

  const draftId = (ref: string) => ref.slice("draft:".length);
  /** A version's model, title and code. */
  const resolve = (ref: string): [ModelSource, string, CodeSource] => {
    if (ref === "main") return [project, "Main model", disk];
    if (ref.startsWith("draft:")) {
      const id = draftId(ref);
      return [drafts.get(id), `Draft: ${drafts.info(id).title}`, drafts.code(id)];
    }
    if (ref.startsWith("ref:")) {
      const name = ref.slice("ref:".length);
      const snap = gitModels.at(name);
      let code: CodeSource;
      try {
        code = gitCodes.at(name);
      } catch {
        code = NO_CODE; // the code folder is in another repository without that ref
      }
      return [snap, `Git: ${name} (${snap.sha.slice(0, 7)})${snap.present ? "" : ", no model"}`, code];
    }
    throw new HttpError(422, `Unknown model version "${ref}".`);
  };
  const resolveCompare = (ref: string, against: string): [ModelSource, string, CodeSource] => {
    if (against === "base") {
      if (!ref.startsWith("draft:")) throw new HttpError(422, "Only a draft has a base to compare with.");
      // A draft's planned code edits are compared with the code folder as it is now.
      return [drafts.base(draftId(ref)), "Main model when the draft was made", disk];
    }
    return resolve(against);
  };

  const selectVersion: MiddlewareHandler = async (c, next) => {
    const ref = c.req.header("x-dp-model")?.trim() || "main";
    const [s, title, code] = resolve(ref);
    s.reloadIfChanged();
    const against = c.req.header("x-dp-compare")?.trim() || null;
    let cmp: ModelSource | null = null;
    let cmpTitle: string | null = null;
    let cmpCode: CodeSource | null = null;
    if (against) {
      [cmp, cmpTitle, cmpCode] = resolveCompare(ref, against);
      cmp.reloadIfChanged();
    }
    const planned = ref.startsWith("draft:") ? [...drafts.codePlan(draftId(ref)).files().keys()] : [];
    await selection.run({ src: s, ref, title, cmp, cmpRef: against, cmpTitle, code, cmpCode, planned }, next);
  };

  const who = (c: Context): Who => c.get("dpWho") ?? { user: null, role: readOnly ? "viewer" : "architect", loginRequired: false, readOnlyServer: readOnly };
  const access = (c: Context): Access => {
    const w = who(c);
    const { ref } = sel();
    const authorOf = (id: string) => {
      try {
        return drafts.info(id).author ?? null;
      } catch {
        return null;
      }
    };
    return {
      me: w.user,
      loginRequired: w.loginRequired,
      can: permissions(w, ref, ref.startsWith("draft:") ? authorOf(draftId(ref)) : null),
      defaultLens: defaultLensFor(w),
      canDiscard: (d) => permissions(w, `draft:${d.id}`, d.author ?? null).discardDraft,
      canEdit: (d) => permissions(w, `draft:${d.id}`, d.author ?? null).editThis,
    };
  };

  const uiProxies = new UiProxies({ allowHosts: opts.uiAllowHosts ?? [] });
  const traces = new TraceStore(opts.tracesDir ? path.resolve(opts.tracesDir) : path.join(project.root, "traces"));
  return {
    readOnly,
    auth,
    who,
    access,
    project,
    drafts,
    gitModels,
    gitCodes,
    disk,
    ok,
    sel,
    writable,
    edit,
    draftId,
    selectVersion,
    uiProxies,
    traces,
    comments: new CommentStore(commentsPath(project.root), opts.now),
    catalog: opts.catalog ?? (() => null),
    credentials: opts.credentials ?? new CredentialStore(project.root, opts.secretKey === undefined ? (process.env.DP_SECRET_KEY ?? null) : opts.secretKey),
    fetch: opts.fetch ?? ((url, init) => fetch(url, init)),
  };
}
