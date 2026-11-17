/**
 * BMO's server-side settings (plan section 5, owner answers 3 and 4): whether BMO may call a model itself,
 * which provider, model and endpoint, which stored credential, who may run it, and the limits of a run.
 *
 *   <hub or project>/.dp/bmo.json    mode 0600, next to `.dp/credentials.json` (DEC-056): the same folder the
 *                                    `CredentialStore` is given (the hub in a hub, else the project)
 *
 * Not in the sidecar and not in git: an engineer can edit a draft's sidecar, and an endpoint there would send
 * the key and the code excerpts to another host. Changed by architects only (the routes check that).
 *
 * The endpoint decides where the key and the code go, so it is the security core of this file:
 * - Claude API and OpenAI API: the host is pinned (api.anthropic.com, api.openai.com); `endpoint` is refused
 *   unless `allowCustomEndpoint: true` is also set;
 * - Ollama: `http://127.0.0.1:11434` by default; another endpoint is allowed;
 * - any endpoint is http(s) with no user name or password, query or fragment, and a host that is not loopback
 *   (127.0.0.0/8, ::1, localhost) must use https.
 * The key is only ever sent to the configured provider's host; Ollama gets no key.
 */

import { baseOf, checkServiceUrl, isLinkLocal, isLoopback } from "../core/hosts.js";
import fs from "node:fs";
import path from "node:path";
import { ModelError } from "../core/modelEdits.js";
import { ensureGitignored } from "../core/users.js";
import { atomicWrite, isObj } from "../core/util.js";
import type { CredentialStore } from "../core/credentials.js";
import type { FieldError, Role } from "../shared/types.js";

export const BMO_SETTINGS_FILE = path.join(".dp", "bmo.json");
export const PROVIDERS = ["anthropic", "openai", "ollama"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const BACKENDS = ["handoff", "direct"] as const;
export type BackendKind = (typeof BACKENDS)[number];
export const ROLES: readonly Role[] = ["architect", "engineer", "viewer"];

/** The host each cloud provider is pinned to, and Ollama's default address. */
export const PROVIDER_BASE: Record<Provider, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  ollama: "http://127.0.0.1:11434",
};

/** The model used when the settings name none (Ollama has no default: the person names a local model). */
export const DEFAULT_MODEL: Record<Provider, string | null> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-6-astra",
  ollama: null,
};

/** Largest output a run may ask for (the cloud providers' current maximum). */
export const MAX_OUTPUT_LIMIT = 128_000;

export interface BmoSettings {
  enabled: boolean;
  backend: BackendKind;
  provider?: Provider;
  model?: string;
  /** Base address (scheme, host, optional port and path prefix); the provider's path is added to it. */
  endpoint?: string;
  /** Needed for an `endpoint` with the Claude API or the OpenAI API (a gateway or proxy of the team's own). */
  allowCustomEndpoint?: boolean;
  /** Name in the credentials store; without it, the first usable credential of the provider. */
  credential?: string;
  /** Roles that may run BMO (default: all three). */
  allowedRoles: Role[];
  /** Per hub project: its own `allowedRoles` (like the other per-project role rules, DEC-057). */
  projects?: Record<string, { allowedRoles: Role[] }>;
  /** Digest budget per run (estimated tokens). */
  passBudgetTokens: number;
  /** Cap on the output tokens of a run (each task asks for its own amount; the lower one is used). */
  maxOutputTokens?: number;
  /** Time for one run, both attempts included. */
  timeoutSeconds: number;
  /** Prices the person entered (per million tokens, in their currency); there are no built-in prices. */
  pricePerMTok?: { input: number; output: number };
  /** Keep the prompt text in the run log (default false: prompts hold code excerpts). */
  keepPrompts: boolean;
  /** Claude API only: let the API answer a refusal with another model (server-side fallback, beta). Default true. */
  anthropicFallback: boolean;
}

export const DEFAULT_SETTINGS: BmoSettings = Object.freeze({
  enabled: false,
  backend: "handoff",
  allowedRoles: [...ROLES],
  passBudgetTokens: 100_000,
  timeoutSeconds: 180,
  keepPrompts: false,
  anthropicFallback: true,
}) as BmoSettings;

export const defaultSettings = (): BmoSettings => ({ ...DEFAULT_SETTINGS, allowedRoles: [...ROLES] });

/**
 * Room in a prompt for what is not the code digest: the fixed system text, the task's instructions and the model
 * as text. Measured on 2026-11-16 (estimated tokens, outside the digest): 3k–10k for the demo, 21k–30k with 300
 * more containers and 600 relationships. Half the budget is used when that is more, so the default budget keeps
 * its old limit (1.5 × 100k).
 */
export const RUN_HEADROOM_TOKENS = 32_000;

/** The size (estimated tokens) over which a run is refused as too large: the digest budget plus room for the rest. */
export const runTokenLimit = (passBudgetTokens: number): number => passBudgetTokens + Math.max(Math.ceil(passBudgetTokens / 2), RUN_HEADROOM_TOKENS);

const KEYS = new Set([
  "enabled",
  "backend",
  "provider",
  "model",
  "endpoint",
  "allowCustomEndpoint",
  "credential",
  "allowedRoles",
  "projects",
  "passBudgetTokens",
  "maxOutputTokens",
  "timeoutSeconds",
  "pricePerMTok",
  "keepPrompts",
  "anthropicFallback",
]);
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/;
const CREDENTIAL_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

export { isLinkLocal, isLoopback };

/**
 * Check an endpoint for a provider. Returns the normalised base (no trailing slash) or an error message.
 * The rules are the same whether the endpoint is the default or a custom one, so a default can never be weaker.
 */
export function checkEndpoint(provider: Provider, endpoint: string | undefined, allowCustom: boolean): { base: string } | { error: string } {
  const raw = endpoint ?? PROVIDER_BASE[provider];
  if (endpoint !== undefined && provider !== "ollama" && !allowCustom) {
    return { error: `The ${provider === "anthropic" ? "Claude API" : "OpenAI API"} is reached at ${PROVIDER_BASE[provider]} only; another endpoint needs "allowCustomEndpoint": true as well.` };
  }
  try {
    return { base: baseOf(checkServiceUrl(raw, "endpoint")) };
  } catch (e) {
    if (e instanceof ModelError) return { error: e.message };
    throw e;
  }
}

function roles(v: unknown, at: string, errors: FieldError[]): Role[] | undefined {
  if (!Array.isArray(v) || v.some((r) => typeof r !== "string" || !(ROLES as readonly string[]).includes(r))) {
    errors.push({ pointer: at, message: `A list of roles: ${ROLES.join(", ")}.` });
    return undefined;
  }
  return [...new Set(v as Role[])];
}

function int(v: unknown, at: string, min: number, max: number, errors: FieldError[]): number | undefined {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    errors.push({ pointer: at, message: `A whole number from ${min} to ${max}.` });
    return undefined;
  }
  return v;
}

function bool(v: unknown, at: string, errors: FieldError[]): boolean | undefined {
  if (typeof v !== "boolean") {
    errors.push({ pointer: at, message: "true or false." });
    return undefined;
  }
  return v;
}

/**
 * Strict reading of a settings object: unknown keys are refused, every field is checked, the endpoint rules
 * apply. Missing fields take their defaults. Returns the settings, or the field errors (JSON pointers).
 */
export function parseSettings(value: unknown): { settings?: BmoSettings; errors: FieldError[] } {
  const errors: FieldError[] = [];
  if (!isObj(value)) return { errors: [{ pointer: "", message: "The BMO settings must be a JSON object." }] };
  for (const k of Object.keys(value)) if (!KEYS.has(k)) errors.push({ pointer: `/${k}`, message: `Unknown setting "${k}".` });
  const s = defaultSettings();
  const v = value;
  if (v.enabled !== undefined) s.enabled = bool(v.enabled, "/enabled", errors) ?? false;
  if (v.backend !== undefined) {
    if (typeof v.backend === "string" && (BACKENDS as readonly string[]).includes(v.backend)) s.backend = v.backend as BackendKind;
    else errors.push({ pointer: "/backend", message: `One of: ${BACKENDS.join(", ")}.` });
  }
  if (v.provider !== undefined) {
    if (typeof v.provider === "string" && (PROVIDERS as readonly string[]).includes(v.provider)) s.provider = v.provider as Provider;
    else errors.push({ pointer: "/provider", message: `One of: ${PROVIDERS.join(", ")}.` });
  }
  if (v.model !== undefined) {
    if (typeof v.model === "string" && MODEL_RE.test(v.model)) s.model = v.model;
    else errors.push({ pointer: "/model", message: "A model name: letters, digits and . _ : / @ - (up to 200)." });
  }
  if (v.allowCustomEndpoint !== undefined) {
    const b = bool(v.allowCustomEndpoint, "/allowCustomEndpoint", errors);
    if (b !== undefined) s.allowCustomEndpoint = b;
  }
  if (v.endpoint !== undefined) {
    if (typeof v.endpoint !== "string" || !v.endpoint || v.endpoint.length > 500) errors.push({ pointer: "/endpoint", message: "A web address (up to 500 characters)." });
    else if (s.provider === undefined) errors.push({ pointer: "/endpoint", message: "An endpoint needs a provider." });
    else s.endpoint = v.endpoint;
  }
  if (s.provider !== undefined) {
    const c = checkEndpoint(s.provider, s.endpoint, s.allowCustomEndpoint === true);
    if ("error" in c) errors.push({ pointer: "/endpoint", message: c.error });
  }
  if (v.credential !== undefined) {
    if (typeof v.credential === "string" && CREDENTIAL_RE.test(v.credential)) s.credential = v.credential;
    else errors.push({ pointer: "/credential", message: "The name of a stored credential." });
  }
  if (v.allowedRoles !== undefined) s.allowedRoles = roles(v.allowedRoles, "/allowedRoles", errors) ?? s.allowedRoles;
  if (v.projects !== undefined) {
    if (!isObj(v.projects)) errors.push({ pointer: "/projects", message: 'An object: project ID to {"allowedRoles": [...]}.' });
    else {
      const projects: Record<string, { allowedRoles: Role[] }> = {};
      for (const [id, p] of Object.entries(v.projects)) {
        const at = `/projects/${id.replace(/~/g, "~0").replace(/\//g, "~1")}`;
        if (!PROJECT_RE.test(id)) errors.push({ pointer: at, message: "A project ID." });
        else if (!isObj(p) || Object.keys(p).some((k) => k !== "allowedRoles") || p.allowedRoles === undefined) errors.push({ pointer: at, message: 'Only {"allowedRoles": [...]}.' });
        else {
          const r = roles(p.allowedRoles, `${at}/allowedRoles`, errors);
          if (r) projects[id] = { allowedRoles: r };
        }
      }
      s.projects = projects;
    }
  }
  if (v.passBudgetTokens !== undefined) s.passBudgetTokens = int(v.passBudgetTokens, "/passBudgetTokens", 1_000, 2_000_000, errors) ?? s.passBudgetTokens;
  if (v.maxOutputTokens !== undefined) {
    const n = int(v.maxOutputTokens, "/maxOutputTokens", 256, MAX_OUTPUT_LIMIT, errors);
    if (n !== undefined) s.maxOutputTokens = n;
  }
  if (v.timeoutSeconds !== undefined) s.timeoutSeconds = int(v.timeoutSeconds, "/timeoutSeconds", 1, 3_600, errors) ?? s.timeoutSeconds;
  if (v.pricePerMTok !== undefined) {
    const p = v.pricePerMTok;
    const ok = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 10_000;
    if (!isObj(p) || Object.keys(p).some((k) => k !== "input" && k !== "output") || !ok(p.input) || !ok(p.output)) {
      errors.push({ pointer: "/pricePerMTok", message: '{"input": n, "output": n}: prices per million tokens, 0 to 10000.' });
    } else s.pricePerMTok = { input: p.input as number, output: p.output as number };
  }
  if (v.keepPrompts !== undefined) s.keepPrompts = bool(v.keepPrompts, "/keepPrompts", errors) ?? false;
  if (v.anthropicFallback !== undefined) s.anthropicFallback = bool(v.anthropicFallback, "/anthropicFallback", errors) ?? true;
  return errors.length ? { errors } : { settings: s, errors };
}

const settingsFile = (root: string) => path.join(path.resolve(root), BMO_SETTINGS_FILE);

/** The settings of a hub or project folder (defaults when there is no file). Throws `ModelError` for a bad file. */
export function readSettings(root: string): BmoSettings {
  const file = settingsFile(root);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return defaultSettings();
    throw e;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ModelError(`${BMO_SETTINGS_FILE} is not valid JSON.`);
  }
  const { settings, errors } = parseSettings(doc);
  if (!settings) throw new ModelError(`${BMO_SETTINGS_FILE}: ${errors.map((e) => `${e.pointer || "/"}: ${e.message}`).join("; ")}`);
  return settings;
}

/** Only what differs from the defaults is written, in a fixed key order. */
function toFile(s: BmoSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const d = DEFAULT_SETTINGS;
  for (const k of KEYS) {
    const v = s[k as keyof BmoSettings];
    if (v === undefined) continue;
    if (k === "allowedRoles" ? (v as Role[]).length === ROLES.length && ROLES.every((r) => (v as Role[]).includes(r)) : v === d[k as keyof BmoSettings]) continue;
    out[k] = v;
  }
  return out;
}

/** Check and write the settings (atomic, mode 0600, in a 0700 folder; `.dp/` is added to .gitignore). */
export function writeSettings(root: string, input: unknown): BmoSettings {
  const { settings, errors } = parseSettings(input);
  if (!settings) throw new ModelError(errors.map((e) => `${e.pointer || "/"}: ${e.message}`).join("; "));
  const file = settingsFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  atomicWrite(file, JSON.stringify(toFile(settings), null, 2) + "\n", 0o600);
  ensureGitignored(root);
  return settings;
}

// ------------------------------------------------------------------ what a run needs

/** The credentials store as BMO uses it (a `CredentialStore`, or a stand-in in tests). */
export type Credentials = Pick<CredentialStore, "list" | "get">;

/** The model a run uses: the one named, or the provider's default (null: none, Ollama needs one). */
export const effectiveModel = (s: BmoSettings): string | null => (s.provider ? (s.model ?? DEFAULT_MODEL[s.provider]) : null);

/** The base address a run goes to (checked again), or null without a provider or with a bad endpoint. */
export function destination(s: BmoSettings): string | null {
  if (!s.provider) return null;
  const c = checkEndpoint(s.provider, s.endpoint, s.allowCustomEndpoint === true);
  return "base" in c ? c.base : null;
}

/** The stored credential a run would use (name only; never the value), and whether it can be read. */
export function credentialFor(s: BmoSettings, creds: Credentials): { name: string; usable: boolean } | null {
  if (!s.provider || s.provider === "ollama") return null;
  let list;
  try {
    list = creds.list().credentials;
  } catch {
    return null;
  }
  if (s.credential) {
    const c = list.find((x) => x.name === s.credential);
    return c ? { name: c.name, usable: c.provider === s.provider && !c.locked } : null;
  }
  const c = list.find((x) => x.provider === s.provider && !x.locked);
  return c ? { name: c.name, usable: true } : null;
}

/** The roles allowed to run BMO, in a hub project or overall. */
export const allowedRolesFor = (s: BmoSettings, project?: string): Role[] => (project && s.projects?.[project] ? s.projects[project].allowedRoles : s.allowedRoles);

/**
 * Whether a person with `role` may run BMO directly now: enabled, backend "direct", a provider and a model,
 * a valid endpoint, a usable credential (Ollama needs none), and the role in `allowedRoles`.
 */
export function canRun(s: BmoSettings, creds: Credentials, role: Role, project?: string): { ok: true } | { ok: false; reason: string } {
  if (!s.enabled) return { ok: false, reason: "BMO is turned off in the settings." };
  if (s.backend !== "direct") return { ok: false, reason: "BMO is set to hand the prompt to your own coding agent; dp calls no model." };
  if (!s.provider) return { ok: false, reason: "No provider is chosen in the BMO settings." };
  if (!effectiveModel(s)) return { ok: false, reason: "Name the local model to use in the BMO settings." };
  if (!destination(s)) return { ok: false, reason: "The endpoint in the BMO settings is not allowed." };
  if (s.provider !== "ollama") {
    const c = credentialFor(s, creds);
    if (!c) return { ok: false, reason: s.credential ? `There is no credential "${s.credential}".` : `There is no stored credential for ${s.provider}.` };
    if (!c.usable) return { ok: false, reason: `The credential "${c.name}" cannot be used (another provider, or locked by another DP_SECRET_KEY).` };
  }
  if (!allowedRolesFor(s, project).includes(role)) return { ok: false, reason: `BMO is not open to the ${role} role here.` };
  return { ok: true };
}

export interface BmoPublicStatus {
  enabled: boolean;
  backend: BackendKind;
  provider: Provider | null;
  model: string | null;
  /** Host (and port) the prompt would go to, or null. */
  host: string | null;
  /** The stored credential's name (names are listed by the credentials API too); never its value or hint. */
  credential: string | null;
  hasCredential: boolean;
  allowedRoles: Role[];
  passBudgetTokens: number;
  maxOutputTokens: number | null;
  timeoutSeconds: number;
  pricePerMTok: { input: number; output: number } | null;
}

/** What a client may see of the settings: never a key or anything derived from one. */
export function publicStatus(s: BmoSettings, creds: Credentials, project?: string): BmoPublicStatus {
  const base = destination(s);
  const c = credentialFor(s, creds);
  return {
    enabled: s.enabled,
    backend: s.backend,
    provider: s.provider ?? null,
    model: effectiveModel(s),
    host: base ? new URL(base).host : null,
    credential: c?.name ?? null,
    hasCredential: s.provider === "ollama" ? true : !!c?.usable,
    allowedRoles: [...allowedRolesFor(s, project)],
    passBudgetTokens: s.passBudgetTokens,
    maxOutputTokens: s.maxOutputTokens ?? null,
    timeoutSeconds: s.timeoutSeconds,
    pricePerMTok: s.pricePerMTok ? { ...s.pricePerMTok } : null,
  };
}

/**
 * Cost of a run from the prices the person entered (null when none were entered: no built-in prices).
 * `usage`: the run's token counts, or an estimate of input tokens (a number) before the run.
 */
export function estimateCost(s: BmoSettings, usage: { inputTokens?: number; outputTokens?: number } | number): { input: number; output: number; total: number } | null {
  if (!s.pricePerMTok) return null;
  const u = typeof usage === "number" ? { inputTokens: usage, outputTokens: 0 } : usage;
  const input = ((u.inputTokens ?? 0) * s.pricePerMTok.input) / 1_000_000;
  const output = ((u.outputTokens ?? 0) * s.pricePerMTok.output) / 1_000_000;
  return { input, output, total: input + output };
}
