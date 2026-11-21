/**
 * The direct backend (COD-02, plan section 5): dp calls a model itself, opt in, through one of three
 * providers: the Claude API, the OpenAI API, or Ollama on this computer. Plain `fetch` (injectable), no SDK,
 * no new dependency: each provider is one small request shape.
 *
 * Common rules:
 * - the address comes from the settings only (settings.ts pins the cloud hosts and checks every endpoint);
 *   nothing in a prompt or an answer can change the URL, the headers or which files are read;
 * - `redirect: "error"`: the key never follows an answer to another address; a 3xx is an error;
 * - one deadline (`timeoutSeconds`) for the whole run, combined with the caller's signal;
 * - ONE retry on 429, 5xx or a network error, after `retry-after` (at most 10 s) or 1 s;
 * - a request body over `MAX_REQUEST_BYTES` is refused before anything is sent;
 * - structured output is requested with the task's schema, adapted to what each provider accepts
 *   (`providerSchema`), and the answer is turned back into the original shape (`restoreAnswer`); the task's
 *   own `validate` still checks it;
 * - errors carry the provider's message cut to 300 characters, never a header, the key or the prompt.
 *
 * `logRun` keeps a record of each run in `.dp/bmo/runs/<n>.json` (not in `architecture/`: prompts hold code
 * excerpts): the task, the prompt's hash, provider, model, host, who, when, usage, outcome and the files sent
 * with their sizes; the prompt itself only with `keepPrompts`.
 */

import fs from "node:fs";
import path from "node:path";
import { atomicWrite, isObj } from "../core/util.js";
import { BmoError, estimateTokens, type Backend, type BmoRequest, type BmoResult } from "./backend.js";
import { credentialFor, destination, effectiveModel, MAX_OUTPUT_LIMIT, type BmoSettings, type Credentials, type Provider } from "./settings.js";

/** The `fetch` the direct backend uses (the global `fetch` fits; tests inject a stub). */
export type DirectFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: "error" },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(reason?: unknown): Promise<void> } } | null;
  text(): Promise<string>;
}>;

export interface DirectOptions {
  fetch?: DirectFetch;
  /** Waiting before the retry (tests pass one that does not wait). */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_RETRY_WAIT_MS = 10_000;
const ERROR_TEXT = 300;

/** The path added to the base address, per provider. */
export const PROVIDER_PATH: Record<Provider, string> = { anthropic: "/v1/messages", openai: "/v1/chat/completions", ollama: "/api/chat" };

const PROVIDER_NAME: Record<Provider, string> = { anthropic: "The Claude API", openai: "The OpenAI API", ollama: "Ollama" };

/** API version sent to the Claude API (verified 2026-11-16 against the claude-api reference). */
export const ANTHROPIC_VERSION = "2026-10-21";
/** Server-side refusal fallback (beta): the API re-runs a declined request on a fallback model it chooses. */
const ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01";
const ANTHROPIC_FALLBACK_MODELS = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

// ------------------------------------------------------------------ schemas

type S = Record<string, unknown>;

/** Keywords each provider's structured output does not accept; they are left out (validate still checks them). */
const DROP: Record<Provider, Set<string>> = {
  // Claude API (claude-api reference, 2026-11-16): no numerical or string constraints, no complex array
  // constraints, additionalProperties only false. `pattern` is not in its supported list, so it is left out.
  anthropic: new Set([
    "$schema",
    "$id",
    "title",
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minItems",
    "maxItems",
    "uniqueItems",
    "prefixItems",
    "propertyNames",
    "minProperties",
    "maxProperties",
    "patternProperties",
  ]),
  // OpenAI strict mode (developers.openai.com structured outputs, "Supported schemas", 2026-11-16): strings
  // keep pattern and format, numbers their bounds, arrays minItems and maxItems; nothing else.
  openai: new Set(["$schema", "$id", "title", "minLength", "maxLength", "uniqueItems", "prefixItems", "propertyNames", "minProperties", "maxProperties", "patternProperties"]),
  // Ollama takes a JSON Schema as `format`; only the document's own metadata is left out.
  ollama: new Set(["$schema", "$id"]),
};

const isMapNode = (s: S): boolean => isObj(s.additionalProperties);

function adapt(provider: Provider, node: unknown): unknown {
  if (!isObj(node)) return node;
  const strict = provider !== "ollama";
  if (strict && isMapNode(node)) {
    // A map (name → value) cannot be described when every object must have additionalProperties false, so it
    // becomes a list of {key, value} pairs; restoreAnswer turns it back.
    const out: S = {
      type: "array",
      description: `${typeof node.description === "string" ? node.description + " " : ""}Written as a list of {"key", "value"} pairs, each key once.`,
      items: {
        type: "object",
        properties: { key: { type: "string" }, value: adapt(provider, node.additionalProperties) },
        required: ["key", "value"],
        additionalProperties: false,
      },
    };
    if (provider === "openai" && typeof node.maxProperties === "number") out.maxItems = node.maxProperties;
    return out;
  }
  const out: S = {};
  for (const [k, v] of Object.entries(node)) {
    if (DROP[provider].has(k)) continue;
    if (k === "properties" && isObj(v)) out.properties = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, adapt(provider, s)]));
    else if (k === "$defs" && isObj(v)) out.$defs = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, adapt(provider, s)]));
    else if ((k === "oneOf" || k === "anyOf" || k === "allOf") && Array.isArray(v)) out[strict && k === "oneOf" ? "anyOf" : k] = v.map((s) => adapt(provider, s));
    else if (k === "items") {
      if (v === false && strict) continue; // the tuple form: replaced below
      out.items = adapt(provider, v);
    } else if (k === "const" && provider === "openai") out.enum = [v];
    else out[k] = v;
  }
  if (strict && Array.isArray(node.prefixItems) && node.prefixItems.length > 0) {
    // A tuple ([a, b]) becomes a list of the first item's kind; OpenAI keeps the length through min/maxItems.
    out.items = adapt(provider, node.prefixItems[0]);
  }
  if (strict && (node.type === "object" || isObj(node.properties))) {
    out.additionalProperties = false;
    if (provider === "openai" && isObj(out.properties)) {
      // Every property must be required; an optional one may be null instead (and is dropped again on the way back).
      const req = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
      const props = out.properties as S;
      for (const p of Object.keys(props)) if (!req.has(p)) props[p] = { anyOf: [props[p], { type: "null" }] };
      out.required = Object.keys(props);
    }
  }
  return out;
}

/** The answer schema in the form a provider's structured output accepts (see `DROP` and `adapt`). */
export function providerSchema(provider: Provider, schema: object): S {
  return adapt(provider, schema) as S;
}

function resolve(root: S, node: S): S {
  let n = node;
  for (let i = 0; i < 20 && typeof n.$ref === "string"; i++) {
    const m = /^#\/\$defs\/([^/]+)$/.exec(n.$ref);
    const defs = root.$defs;
    const next = m && isObj(defs) ? defs[m[1]!] : undefined;
    if (!isObj(next)) return n;
    n = next;
  }
  return n;
}

function branchFor(root: S, branches: unknown[], value: unknown): S | undefined {
  const objs = branches.filter(isObj).map((b) => resolve(root, b));
  if (!isObj(value)) return undefined;
  return objs.find((b) => isObj(b.properties) && Object.entries(b.properties).every(([k, s]) => !isObj(s) || !("const" in s) || value[k] === s.const));
}

/** One step of turning an answer back: pairs into maps; for OpenAI, nulls of optional properties dropped. */
function back(provider: Provider, root: S, node: unknown, value: unknown): unknown {
  if (!isObj(node)) return value;
  const n = resolve(root, node);
  if (isMapNode(n)) {
    if (!Array.isArray(value) || !value.every((p) => isObj(p) && typeof p.key === "string")) return value;
    const out: S = {};
    for (const p of value as S[]) out[p.key as string] = back(provider, root, n.additionalProperties, p.value);
    return out;
  }
  const alts = Array.isArray(n.oneOf) ? n.oneOf : Array.isArray(n.anyOf) ? n.anyOf : null;
  if (alts) {
    const b = branchFor(root, alts, value);
    return b ? back(provider, root, b, value) : value;
  }
  if (isObj(n.properties) && isObj(value)) {
    const req = new Set(Array.isArray(n.required) ? (n.required as string[]) : []);
    const out: S = {};
    for (const [k, v] of Object.entries(value)) {
      const ps = (n.properties as S)[k];
      if (ps === undefined) out[k] = v;
      else if (v === null && provider === "openai" && !req.has(k)) continue;
      else out[k] = back(provider, root, ps, v);
    }
    return out;
  }
  if (Array.isArray(value) && isObj(n.items)) return value.map((v) => back(provider, root, n.items, v));
  return value;
}

/** An answer written against `providerSchema` turned back into the original schema's shape (text that is not JSON is returned as is). */
export function restoreAnswer(provider: Provider, schema: object, text: string): string {
  if (provider === "ollama") return text;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return text;
  }
  return JSON.stringify(back(provider, schema as S, schema, v));
}

/** The opposite of `restoreAnswer`, for a value of the original schema (used by the tests to show both describe the same data). */
export function toProviderValue(provider: Provider, schema: object, value: unknown): unknown {
  const root = schema as S;
  const fwd = (node: unknown, v: unknown): unknown => {
    if (!isObj(node) || provider === "ollama") return v;
    const n = resolve(root, node);
    if (isMapNode(n)) return isObj(v) ? Object.entries(v).map(([key, x]) => ({ key, value: fwd(n.additionalProperties, x) })) : v;
    const alts = Array.isArray(n.oneOf) ? n.oneOf : Array.isArray(n.anyOf) ? n.anyOf : null;
    if (alts) {
      const b = branchFor(root, alts, v);
      return b ? fwd(b, v) : v;
    }
    if (isObj(n.properties) && isObj(v)) {
      const out: S = {};
      for (const [k, ps] of Object.entries(n.properties)) {
        if (k in v) out[k] = fwd(ps, v[k]);
        else if (provider === "openai") out[k] = null;
      }
      return out;
    }
    if (Array.isArray(v) && isObj(n.items)) return v.map((x) => fwd(n.items, x));
    return v;
  };
  return fwd(schema, value);
}

// ------------------------------------------------------------------ requests

interface Call {
  url: string;
  headers: Record<string, string>;
  body: S;
  parse(text: string): BmoResult;
}

/** Thrown by an attempt that may be tried once more. */
class Retryable extends Error {
  constructor(
    readonly waitMs: number,
    readonly final: BmoError,
  ) {
    super(final.message);
  }
}

const cut = (s: string) => (s.length > ERROR_TEXT ? `${s.slice(0, ERROR_TEXT)}…` : s);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The provider's own error message from an error body (`{error: {message}}` or `{error: "..."}`). */
/**
 * The answer's text, read as a stream and cut off at `max` bytes: a server that sends more than that (or never
 * stops) is not read to the end. A declared length over the limit is refused before reading. Falls back to `text()` for
 * a response without a readable body (tests).
 */
export async function readCapped(res: Awaited<ReturnType<DirectFetch>>, max: number, who: string): Promise<string> {
  const declared = Number(res.headers?.get("content-length") ?? "");
  const tooLarge = () => new BmoError("too-large", `The answer from ${who} is too large.`);
  if (Number.isFinite(declared) && declared > max) throw tooLarge();
  const reader = res.body?.getReader?.();
  if (!reader) {
    const text = await res.text();
    if (Buffer.byteLength(text, "utf-8") > max) throw tooLarge();
    return text;
  }
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength ?? 0;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

function providerMessage(body: string): string {
  const j = jsonOrNull(body);
  if (isObj(j)) {
    const e = j.error;
    if (typeof e === "string") return e;
    if (isObj(e) && typeof e.message === "string") return e.message;
    if (typeof j.message === "string") return j.message;
  }
  return "";
}

const cutOff = (provider: Provider) =>
  new BmoError("invalid-output", `The answer was cut off at the output limit (${PROVIDER_NAME[provider]} stopped before it was complete). Ask for less, or raise the output limit.`);
const refused = (provider: Provider, detail?: string) => new BmoError("refused", `${PROVIDER_NAME[provider]} declined to answer${detail ? ` (${cut(detail)})` : ""}.`);

function anthropicCall(base: string, model: string, key: string, req: BmoRequest, maxOut: number, s: BmoSettings): Call {
  // Verified 2026-11-16 (claude-api reference: curl/examples.md, shared/tool-use-concepts.md, error-codes.md):
  // POST /v1/messages, headers x-api-key and anthropic-version 2026-10-21; JSON output with
  // output_config.format {type: "json_schema", schema}; max_tokens up to 128K, where long outputs call for
  // streaming, so this asks for a stream (SSE) and assembles it; usage input_tokens/output_tokens (+ cache
  // fields); stop_reason "refusal" and "max_tokens"; errors {type: "error", error: {type, message}}.
  const headers: Record<string, string> = { "content-type": "application/json", accept: "text/event-stream", "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION };
  const body: S = { model, max_tokens: maxOut, stream: true, system: req.system, messages: [{ role: "user", content: req.user }] };
  if (req.schema) body.output_config = { format: { type: "json_schema", schema: providerSchema("anthropic", req.schema) } };
  if (s.anthropicFallback && ANTHROPIC_FALLBACK_MODELS.has(model)) {
    headers["anthropic-beta"] = ANTHROPIC_FALLBACK_BETA;
    body.fallbacks = "default";
  }
  return { url: `${base}${PROVIDER_PATH.anthropic}`, headers, body, parse: (text) => parseAnthropic(text, req) };
}

/** The Claude API's answer: a server-sent event stream (or one JSON message, from a proxy that does not stream). */
export function parseAnthropic(text: string, req: Pick<BmoRequest, "schema">): BmoResult {
  const blocks: { type: string; text: string }[] = [];
  let stop: string | null = null;
  let model: string | undefined;
  let detail: string | undefined;
  const usage: { input?: number; cacheW?: number; cacheR?: number; output?: number } = {};
  const takeUsage = (u: unknown) => {
    if (!isObj(u)) return;
    usage.input = num(u.input_tokens) ?? usage.input;
    usage.cacheW = num(u.cache_creation_input_tokens) ?? usage.cacheW;
    usage.cacheR = num(u.cache_read_input_tokens) ?? usage.cacheR;
    usage.output = num(u.output_tokens) ?? usage.output;
  };
  const streamError = (e: unknown): never => {
    const type = isObj(e) && typeof e.type === "string" ? e.type : "";
    const err = new BmoError("backend", `The Claude API failed while answering${type ? ` (${type})` : ""}: ${cut(isObj(e) && typeof e.message === "string" ? e.message : "no message")}`);
    if (type === "overloaded_error" || type === "api_error") throw new Retryable(1000, err);
    throw err;
  };
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    const m = jsonOrNull(trimmed);
    if (!isObj(m)) throw new BmoError("invalid-output", "The Claude API sent an answer that is not JSON.");
    if (m.type === "error") streamError(m.error);
    if (!Array.isArray(m.content)) throw new BmoError("invalid-output", "The Claude API sent a message with no content.");
    for (const b of m.content) if (isObj(b) && typeof b.type === "string") blocks.push({ type: b.type, text: typeof b.text === "string" ? b.text : "" });
    stop = typeof m.stop_reason === "string" ? m.stop_reason : null;
    model = typeof m.model === "string" ? m.model : undefined;
    if (isObj(m.stop_details) && typeof m.stop_details.category === "string") detail = m.stop_details.category;
    takeUsage(m.usage);
  } else {
    let sawStart = false;
    for (const chunk of text.split(/\r?\n\r?\n/)) {
      const data = chunk
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      const ev = jsonOrNull(data);
      if (!isObj(ev)) throw new BmoError("invalid-output", "The Claude API sent an event that is not JSON.");
      switch (ev.type) {
        case "message_start":
          sawStart = true;
          if (isObj(ev.message)) {
            if (typeof ev.message.model === "string") model = ev.message.model;
            takeUsage(ev.message.usage);
          }
          break;
        case "content_block_start": {
          const i = num(ev.index);
          const b = ev.content_block;
          if (i !== undefined && isObj(b) && typeof b.type === "string") blocks[i] = { type: b.type, text: typeof b.text === "string" ? b.text : "" };
          break;
        }
        case "content_block_delta": {
          const i = num(ev.index);
          const d = ev.delta;
          if (i !== undefined && blocks[i] && isObj(d) && d.type === "text_delta" && typeof d.text === "string") blocks[i]!.text += d.text;
          break;
        }
        case "message_delta":
          if (isObj(ev.delta)) {
            if (typeof ev.delta.stop_reason === "string") stop = ev.delta.stop_reason;
            if (isObj(ev.delta.stop_details) && typeof ev.delta.stop_details.category === "string") detail = ev.delta.stop_details.category;
          }
          takeUsage(ev.usage);
          break;
        case "error":
          streamError(ev.error);
          break;
        default:
          break; // ping, content_block_stop, message_stop, and event types added later
      }
    }
    if (!sawStart) throw new BmoError("invalid-output", "The Claude API sent no message.");
  }
  if (stop === "refusal") throw refused("anthropic", detail);
  if (stop === "max_tokens") throw cutOff("anthropic");
  if (stop === null) throw new BmoError("invalid-output", "The Claude API's answer ended before it was complete.");
  // After a server-side fallback, only the text after the last switch point is the answer.
  const lastFallback = blocks.reduce((at, b, i) => (b?.type === "fallback" ? i : at), -1);
  const out = blocks
    .slice(lastFallback + 1)
    .filter((b) => b?.type === "text")
    .map((b) => b.text)
    .join("");
  if (!out.trim()) throw new BmoError("invalid-output", "The Claude API sent no text.");
  const inputTokens = usage.input === undefined && usage.cacheW === undefined && usage.cacheR === undefined ? undefined : (usage.input ?? 0) + (usage.cacheW ?? 0) + (usage.cacheR ?? 0);
  const result: BmoResult = { text: req.schema ? restoreAnswer("anthropic", req.schema, out) : out, usage: {} };
  if (inputTokens !== undefined) result.usage!.inputTokens = inputTokens;
  if (usage.output !== undefined) result.usage!.outputTokens = usage.output;
  if (model) result.model = model;
  return result;
}

function openaiCall(base: string, model: string, key: string, req: BmoRequest, maxOut: number): Call {
  // Verified 2026-11-16 (developers.openai.com: Chat Completions create reference, structured outputs guide):
  // POST /v1/chat/completions, Authorization: Bearer; `developer` messages for instructions;
  // max_completion_tokens (max_tokens is deprecated); response_format {type: "json_schema", json_schema:
  // {name, strict, schema}} with every property required, additionalProperties false, optional as a union with
  // null; choices[0].message.content / .refusal; finish_reason "length" and "content_filter"; usage
  // prompt_tokens/completion_tokens. Not verified: `store: false` (a long-documented field, kept as the safe choice).
  const body: S = {
    model,
    messages: [
      { role: "developer", content: req.system },
      { role: "user", content: req.user },
    ],
    max_completion_tokens: maxOut,
    store: false,
  };
  if (req.schema) body.response_format = { type: "json_schema", json_schema: { name: "dp_answer", strict: true, schema: providerSchema("openai", req.schema) } };
  return {
    url: `${base}${PROVIDER_PATH.openai}`,
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body,
    parse: (text) => parseOpenai(text, req),
  };
}

export function parseOpenai(text: string, req: Pick<BmoRequest, "schema">): BmoResult {
  const j = jsonOrNull(text);
  if (!isObj(j) || !Array.isArray(j.choices) || !isObj(j.choices[0])) throw new BmoError("invalid-output", "The OpenAI API sent an answer that is not a chat completion.");
  const c = j.choices[0];
  const msg = isObj(c.message) ? c.message : {};
  if (typeof msg.refusal === "string" && msg.refusal) throw refused("openai", msg.refusal);
  if (c.finish_reason === "content_filter") throw refused("openai", "content filter");
  if (c.finish_reason === "length") throw cutOff("openai");
  if (typeof msg.content !== "string" || !msg.content.trim()) throw new BmoError("invalid-output", "The OpenAI API sent no text.");
  const result: BmoResult = { text: req.schema ? restoreAnswer("openai", req.schema, msg.content) : msg.content, usage: {} };
  if (isObj(j.usage)) {
    const i = num(j.usage.prompt_tokens);
    const o = num(j.usage.completion_tokens);
    if (i !== undefined) result.usage!.inputTokens = i;
    if (o !== undefined) result.usage!.outputTokens = o;
  }
  if (typeof j.model === "string") result.model = j.model;
  return result;
}

function ollamaCall(base: string, model: string, req: BmoRequest, maxOut: number): Call {
  // Verified 2026-11-16 (docs.ollama.com: /api/chat, structured outputs, errors): POST /api/chat with model,
  // messages, stream false, `format` a JSON schema, options.num_predict; message.content, done, done_reason,
  // prompt_eval_count, eval_count; errors {error: "..."}. Not verified: done_reason "length" at num_predict,
  // and options.num_ctx (set so a long prompt is not cut silently at the small default context).
  const body: S = {
    model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    stream: false,
    options: { num_predict: maxOut, num_ctx: Math.min(262_144, estimateTokens(req.system) + estimateTokens(req.user) + maxOut + 1024) },
  };
  if (req.schema) body.format = providerSchema("ollama", req.schema);
  return { url: `${base}${PROVIDER_PATH.ollama}`, headers: { "content-type": "application/json" }, body, parse: (text) => parseOllama(text) };
}

/** What an Ollama error says, when the body is exactly `{"error": "<short text>"}`; otherwise "" (the body is not repeated). */
function ollamaErrorText(body: string): string {
  const j = jsonOrNull(body);
  return isObj(j) && Object.keys(j).length === 1 && typeof j.error === "string" && j.error.length <= 300 ? j.error : "";
}

const NOT_EXPECTED = "The model server did not answer in the expected format.";

export function parseOllama(text: string): BmoResult {
  const j = jsonOrNull(text);
  // Nothing of a reply in another shape is repeated: the endpoint is reached by the server, so a wrong address could otherwise show what is behind it.
  if (!isObj(j)) throw new BmoError("invalid-output", NOT_EXPECTED);
  const err = ollamaErrorText(text);
  if (err) throw new BmoError("backend", `Ollama failed: ${cut(err)}`);
  if (j.done_reason === "length") throw cutOff("ollama");
  const content = isObj(j.message) ? j.message.content : undefined;
  if (typeof content !== "string" || !content.trim()) throw new BmoError("invalid-output", NOT_EXPECTED);
  const result: BmoResult = { text: content, usage: {} };
  const i = num(j.prompt_eval_count);
  const o = num(j.eval_count);
  if (i !== undefined) result.usage!.inputTokens = i;
  if (o !== undefined) result.usage!.outputTokens = o;
  if (typeof j.model === "string") result.model = j.model;
  return result;
}

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

function retryAfterMs(h: string | null | undefined): number {
  if (!h) return 1000;
  const secs = Number(h);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_RETRY_WAIT_MS);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_WAIT_MS) : 1000;
}

/**
 * The direct backend for the provider in the settings. The settings are read once here; the key is read
 * from the credentials store on each run and sent only to the settings' destination.
 */
export function directBackend(settings: BmoSettings, credentials: Credentials, opts: DirectOptions = {}): Backend {
  const doFetch: DirectFetch = opts.fetch ?? ((url, init) => fetch(url, init));
  const sleep = opts.sleep ?? defaultSleep;
  const provider = settings.provider;
  return {
    id: provider ? `direct:${provider}` : "direct",
    async run(req) {
      if (!settings.enabled || settings.backend !== "direct" || !provider) throw new BmoError("off", "Direct runs are not turned on in the BMO settings.");
      const base = destination(settings);
      if (!base) throw new BmoError("off", "The endpoint in the BMO settings is not allowed.");
      const model = effectiveModel(settings);
      if (!model) throw new BmoError("off", "Name the model to use in the BMO settings.");
      const host = new URL(base).host;
      let key = "";
      if (provider !== "ollama") {
        const c = credentialFor(settings, credentials);
        const v = c?.usable ? credentials.get(c.name) : null;
        if (!v) throw new BmoError("off", `There is no usable credential for ${PROVIDER_NAME[provider]}.`);
        key = v;
      }
      /** Every message that leaves this function goes through here: no key, cut short. */
      const clean = (s: string) => {
        let t = s;
        if (key) t = t.split(key).join("[key]");
        return cut(t.replace(/\b(sk|key)-[A-Za-z0-9_*.-]{6,}/g, "[key]"));
      };
      const maxOut = Math.max(1, Math.min(req.maxOutputTokens, settings.maxOutputTokens ?? MAX_OUTPUT_LIMIT, MAX_OUTPUT_LIMIT));
      const call =
        provider === "anthropic" ? anthropicCall(base, model, key, req, maxOut, settings) : provider === "openai" ? openaiCall(base, model, key, req, maxOut) : ollamaCall(base, model, req, maxOut);
      // The address is the settings' destination and nothing else (a last check before the key goes out).
      if (new URL(call.url).host !== host) throw new BmoError("refused", "The request address does not match the settings.");
      const body = JSON.stringify(call.body);
      if (Buffer.byteLength(body, "utf-8") > MAX_REQUEST_BYTES) {
        throw new BmoError("too-large", `The request is over ${MAX_REQUEST_BYTES / (1024 * 1024)} MB; lower the digest budget or split the work.`);
      }
      const timeoutMs = settings.timeoutSeconds * 1000;
      const signal = req.signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), req.signal]) : AbortSignal.timeout(timeoutMs);
      const stopped = () =>
        req.signal?.aborted ? new BmoError("backend", "The run was cancelled.") : new BmoError("backend", `${PROVIDER_NAME[provider]} gave no answer in ${settings.timeoutSeconds} seconds.`);

      const attempt = async (): Promise<BmoResult> => {
        let res;
        let text: string;
        try {
          res = await doFetch(call.url, { method: "POST", headers: call.headers, body, signal, redirect: "error" });
          text = await readCapped(res, MAX_RESPONSE_BYTES, host);
        } catch (e) {
          if (e instanceof BmoError) throw e;
          if (signal.aborted) throw stopped();
          throw new Retryable(1000, new BmoError("backend", `Could not reach ${host}.`));
        }
        if (res.status >= 300 && res.status < 400) throw new BmoError("backend", `${host} answered with a redirect (${res.status}); redirects are not followed.`);
        if (!res.ok) {
          // Ollama is on this computer or a machine the settings name: only its own error shape ({"error": "..."}) is repeated, never another body.
          const msg = provider === "ollama" ? ollamaErrorText(text) : providerMessage(text);
          if (res.status === 401 || res.status === 403) throw new BmoError("backend", `${PROVIDER_NAME[provider]} refused the credential (${res.status}).`);
          const err = new BmoError("backend", clean(`${PROVIDER_NAME[provider]} answered ${res.status}${msg ? `: ${msg}` : ""}`));
          if (res.status === 429 || res.status >= 500) throw new Retryable(retryAfterMs(res.headers?.get("retry-after")), err);
          throw err;
        }
        try {
          return call.parse(text);
        } catch (e) {
          if (e instanceof Retryable) throw new Retryable(e.waitMs, new BmoError(e.final.kind, clean(e.final.message)));
          if (e instanceof BmoError) throw new BmoError(e.kind, clean(e.message));
          throw new BmoError("invalid-output", `${PROVIDER_NAME[provider]} sent an answer that could not be read.`);
        }
      };

      try {
        return await attempt();
      } catch (e) {
        if (!(e instanceof Retryable)) throw e;
        try {
          await sleep(e.waitMs, signal);
        } catch {
          throw stopped();
        }
        try {
          return await attempt();
        } catch (e2) {
          throw e2 instanceof Retryable ? e2.final : e2;
        }
      }
    },
  };
}

// ------------------------------------------------------------------ run log

export const RUNS_KEPT = 200;

export interface RunLogEntry {
  task: string;
  promptHash: string;
  provider: Provider | "handoff" | string;
  model: string | null;
  host: string | null;
  /** The signed-in user (or null with sign-in off). */
  who: string | null;
  /** ISO time the run started. */
  when: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  outcome: "ok" | "invalid" | BmoError["kind"];
  /** The error message (already free of keys), when the run failed. */
  error?: string;
  /** The file excerpts sent, by path and size. */
  attachments: { path: string; bytes: number }[];
  /** The prompt itself; written only when `keepPrompts` is set. */
  prompt?: { system: string; user: string };
}

export const runsDir = (dpDir: string): string => path.join(dpDir, "bmo", "runs");

/** Write one run record to `<dpDir>/bmo/runs/<n>.json` (mode 0600) and keep the newest `RUNS_KEPT`. Returns the file. */
export function logRun(dpDir: string, entry: RunLogEntry, keepPrompts = false): string {
  const dir = runsDir(dpDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const nums = fs
    .readdirSync(dir)
    .map((f) => /^(\d{1,12})\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  const n = (nums.at(-1) ?? 0) + 1;
  const record: Record<string, unknown> = {
    task: entry.task,
    promptHash: entry.promptHash,
    provider: entry.provider,
    model: entry.model,
    host: entry.host,
    who: entry.who,
    when: entry.when,
    usage: entry.usage ?? null,
    outcome: entry.outcome,
    attachments: entry.attachments.map((a) => ({ path: a.path, bytes: a.bytes })),
  };
  if (entry.error) record.error = cut(entry.error);
  if (keepPrompts && entry.prompt) record.prompt = { system: entry.prompt.system, user: entry.prompt.user };
  const file = path.join(dir, `${n}.json`);
  atomicWrite(file, JSON.stringify(record, null, 2) + "\n", 0o600);
  const all = [...nums, n];
  for (const old of all.slice(0, Math.max(0, all.length - RUNS_KEPT))) fs.rmSync(path.join(dir, `${old}.json`), { force: true });
  return file;
}
