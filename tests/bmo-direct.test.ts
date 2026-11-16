/** Stage S8: the direct backend (src/bmo/direct.ts) against a local stub: request shapes, answers, errors, retries, schemas, run log. No network. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CredentialStore } from "../src/core/credentials.js";
import { IMPORT_SCHEMA, parseImportFile } from "../src/import/schema.js";
import { BmoError, type BmoRequest } from "../src/bmo/backend.js";
import { ANTHROPIC_VERSION, directBackend, logRun, MAX_REQUEST_BYTES, providerSchema, restoreAnswer, RUNS_KEPT, runsDir, toProviderValue, type DirectFetch } from "../src/bmo/direct.js";
import { DECISION_SCHEMA } from "../src/bmo/prompts.js";
import { parseSettings, type BmoSettings } from "../src/bmo/settings.js";
import { tmpDir } from "./helpers.js";
import { sampleImport } from "./import-fixture.js";

const KEY = "sk-ant-PLANTED-SECRET-KEY-0123456789-QZXW";
/** Everything a test saw (errors, results, requests' error paths) is checked for the key at the end of each test that collects. */
const seen: string[] = [];

function settings(v: Record<string, unknown>): BmoSettings {
  const r = parseSettings({ enabled: true, backend: "direct", ...v });
  if (!r.settings) throw new Error(JSON.stringify(r.errors));
  return r.settings;
}

function creds(provider: string) {
  const s = new CredentialStore(tmpDir(), null);
  s.add({ name: "llm", provider, value: KEY });
  return s;
}

interface Reply {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  throws?: Error;
  /** Wait for the request's signal to abort, then fail as fetch does. */
  hang?: boolean;
}

function stub(replies: Reply[]) {
  const calls: { url: string; init: Parameters<DirectFetch>[1] }[] = [];
  const fetch: DirectFetch = (url, init) => {
    calls.push({ url, init });
    const r = replies.shift() ?? { status: 500, body: "{}" };
    if (r.hang) {
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
    }
    if (r.throws) return Promise.reject(r.throws);
    const status = r.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
      text: () => Promise.resolve(r.body ?? ""),
    });
  };
  const waits: number[] = [];
  const sleep = (ms: number) => {
    waits.push(ms);
    return Promise.resolve();
  };
  return { fetch, sleep, calls, waits };
}

const req = (over: Partial<BmoRequest> = {}): BmoRequest => ({ system: "SYSTEM-TEXT", user: "USER-TEXT", maxOutputTokens: 32_000, task: "explain", ...over });

async function fails(p: Promise<unknown>): Promise<BmoError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(BmoError);
    seen.push((e as Error).message, JSON.stringify(e), String(e));
    return e as BmoError;
  }
  throw new Error("expected a BmoError");
}

function sse(events: unknown[]): string {
  return events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

function claudeStream(text: string, stop = "end_turn", extra: unknown[] = []): string {
  return sse([
    { type: "message_start", message: { id: "msg_1", type: "message", model: "claude-opus-5-5", usage: { input_tokens: 100, cache_read_input_tokens: 20, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    { type: "content_block_stop", index: 0 },
    ...extra,
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    { type: "ping" },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(0, 3) } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(3) } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 42 } },
    { type: "message_stop" },
  ]);
}

const openaiAnswer = (content: string | null, finish = "stop", refusal: string | null = null) =>
  JSON.stringify({
    id: "c1",
    model: "gpt-6-astra",
    choices: [{ index: 0, message: { role: "assistant", content, refusal }, finish_reason: finish }],
    usage: { prompt_tokens: 120, completion_tokens: 30 },
  });

const ollamaAnswer = (content: string, done = "stop") =>
  JSON.stringify({ model: "qwen3:32b", message: { role: "assistant", content }, done: true, done_reason: done, prompt_eval_count: 90, eval_count: 15 });

const SAMPLE_DECISION = {
  title: "Split the ledger",
  context: "Writes are slow.",
  decision: "Move writes.",
  alternatives: [{ name: "Keep", whyNot: "Coupled." }, { name: "Other" }],
  affects: ["ledger"],
};

describe("Claude API", () => {
  const s = settings({ provider: "anthropic", credential: "llm", maxOutputTokens: 20_000 });

  it("sends the exact request: pinned URL, key in x-api-key, version, streaming, JSON schema output, fallback", async () => {
    const st = stub([{ body: claudeStream('{"title":"x"}') }]);
    const out = await directBackend(s, creds("anthropic"), st).run(req({ schema: DECISION_SCHEMA }));
    expect(st.calls).toHaveLength(1);
    const { url, init } = st.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({
      "content-type": "application/json",
      accept: "text/event-stream",
      "x-api-key": KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": "server-side-fallback-2026-07-01",
    });
    expect(ANTHROPIC_VERSION).toBe("2026-10-21");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 20_000,
      stream: true,
      system: "SYSTEM-TEXT",
      messages: [{ role: "user", content: "USER-TEXT" }],
      output_config: { format: { type: "json_schema", schema: providerSchema("anthropic", DECISION_SCHEMA) } },
      fallbacks: "default",
    });
    expect(body).not.toHaveProperty("temperature");
    expect(init.body).not.toContain(KEY);
    expect(out).toEqual({ text: '{"title":"x"}', usage: { inputTokens: 120, outputTokens: 42 }, model: "claude-opus-5-5" });
  });

  it("leaves out the schema for text tasks and the fallback when turned off or for other models", async () => {
    const st = stub([{ body: claudeStream("Plain text.") }, { body: claudeStream("Again.") }]);
    await directBackend(settings({ provider: "anthropic", anthropicFallback: false }), creds("anthropic"), st).run(req({ maxOutputTokens: 2000 }));
    await directBackend(settings({ provider: "anthropic", model: "claude-haiku-5-5" }), creds("anthropic"), st).run(req());
    for (const c of st.calls) {
      expect(c.init.headers).not.toHaveProperty("anthropic-beta");
      expect(JSON.parse(c.init.body)).not.toHaveProperty("output_config");
      expect(JSON.parse(c.init.body)).not.toHaveProperty("fallbacks");
    }
    expect(JSON.parse(st.calls[0]!.init.body).max_tokens).toBe(2000);
    expect(JSON.parse(st.calls[1]!.init.body).model).toBe("claude-haiku-5-5");
  });

  it("reads a plain JSON message too, and only the text after a fallback switch", async () => {
    const msg = {
      type: "message",
      model: "claude-opus-4-8",
      content: [
        { type: "text", text: "declined part" },
        { type: "fallback", from: { model: "a" }, to: { model: "b" } },
        { type: "text", text: "Answer." },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 6 },
    };
    const st = stub([{ body: JSON.stringify(msg) }]);
    expect(await directBackend(s, creds("anthropic"), st).run(req())).toEqual({ text: "Answer.", usage: { inputTokens: 5, outputTokens: 6 }, model: "claude-opus-4-8" });
  });

  it("maps a refusal, a cut-off and a malformed answer", async () => {
    const st = stub([
      { body: claudeStream("partial", "refusal", [{ type: "message_delta", delta: { stop_details: { type: "refusal", category: "cyber" } } }]) },
      { body: claudeStream('{"ti', "max_tokens") },
      { body: "data: {not json\n\n" },
      { body: sse([{ type: "ping" }]) },
      { body: sse([{ type: "message_start", message: { model: "m" } }]) },
    ]);
    const b = directBackend(s, creds("anthropic"), st);
    const r = await fails(b.run(req()));
    expect(r.kind).toBe("refused");
    expect(r.message).toMatch(/declined.*cyber/);
    const c = await fails(b.run(req()));
    expect(c.kind).toBe("invalid-output");
    expect(c.message).toMatch(/cut off/);
    expect((await fails(b.run(req()))).kind).toBe("invalid-output");
    expect((await fails(b.run(req()))).kind).toBe("invalid-output");
    expect((await fails(b.run(req()))).message).toMatch(/ended before it was complete/);
  });

  it("retries once on an overloaded error inside the stream", async () => {
    const st = stub([
      {
        body: sse([
          { type: "message_start", message: {} },
          { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
        ]),
      },
      { body: claudeStream("ok") },
    ]);
    expect((await directBackend(s, creds("anthropic"), st).run(req())).text).toBe("ok");
    expect(st.calls).toHaveLength(2);
  });

  it("sends the key to a custom endpoint only when allowed, and to that host only", async () => {
    const st = stub([{ body: claudeStream("ok") }]);
    await directBackend(settings({ provider: "anthropic", endpoint: "https://gw.example.com/claude/", allowCustomEndpoint: true }), creds("anthropic"), st).run(req());
    expect(st.calls[0]!.url).toBe("https://gw.example.com/claude/v1/messages");
  });
});

describe("OpenAI API", () => {
  const s = settings({ provider: "openai" });

  it("sends the exact request: pinned URL, Bearer key, developer message, strict JSON schema", async () => {
    const st = stub([{ body: openaiAnswer(JSON.stringify(toProviderValue("openai", DECISION_SCHEMA, SAMPLE_DECISION))) }]);
    const out = await directBackend(s, creds("openai"), st).run(req({ schema: DECISION_SCHEMA, maxOutputTokens: 4000 }));
    const { url, init } = st.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: `Bearer ${KEY}` });
    expect(JSON.parse(init.body)).toEqual({
      model: "gpt-6-astra",
      messages: [
        { role: "developer", content: "SYSTEM-TEXT" },
        { role: "user", content: "USER-TEXT" },
      ],
      max_completion_tokens: 4000,
      store: false,
      response_format: { type: "json_schema", json_schema: { name: "dp_answer", strict: true, schema: providerSchema("openai", DECISION_SCHEMA) } },
    });
    expect(init.body).not.toContain(KEY);
    // The nulls of optional fields are dropped again, so the task's validate sees the original shape.
    expect(JSON.parse(out.text)).toEqual(SAMPLE_DECISION);
    expect(out.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
    expect(out.model).toBe("gpt-6-astra");
  });

  it("maps a refusal, a content filter, a cut-off and a malformed answer", async () => {
    const st = stub([
      { body: openaiAnswer(null, "stop", "I can't help with that.") },
      { body: openaiAnswer("x", "content_filter") },
      { body: openaiAnswer('{"a', "length") },
      { body: "<html>" },
      { body: openaiAnswer(null) },
    ]);
    const b = directBackend(s, creds("openai"), st);
    expect((await fails(b.run(req()))).kind).toBe("refused");
    expect((await fails(b.run(req()))).kind).toBe("refused");
    const cut = await fails(b.run(req()));
    expect([cut.kind, cut.message]).toEqual(["invalid-output", expect.stringMatching(/cut off/)]);
    expect((await fails(b.run(req()))).kind).toBe("invalid-output");
    expect((await fails(b.run(req()))).kind).toBe("invalid-output");
  });
});

describe("Ollama", () => {
  const s = settings({ provider: "ollama", model: "qwen3:32b" });

  it("sends the exact request to 127.0.0.1:11434 with no key at all", async () => {
    const st = stub([{ body: ollamaAnswer('{"title":"t"}') }]);
    const c = creds("ollama");
    const out = await directBackend(s, c, st).run(req({ schema: DECISION_SCHEMA, maxOutputTokens: 2000 }));
    const { url, init } = st.calls[0]!;
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.stringify(init)).not.toContain(KEY);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "qwen3:32b",
      messages: [
        { role: "system", content: "SYSTEM-TEXT" },
        { role: "user", content: "USER-TEXT" },
      ],
      stream: false,
      format: providerSchema("ollama", DECISION_SCHEMA),
      options: { num_predict: 2000 },
    });
    expect(body.options.num_ctx).toBeGreaterThan(2000);
    expect(out).toEqual({ text: '{"title":"t"}', usage: { inputTokens: 90, outputTokens: 15 }, model: "qwen3:32b" });
    expect(c.list().credentials[0]!.lastUsed).toBeNull(); // the store was not even read for a value
  });

  it("maps a cut-off, an error body and a malformed answer; a custom endpoint is used", async () => {
    const st = stub([{ body: ollamaAnswer("{", "length") }, { status: 404, body: JSON.stringify({ error: "model 'nope' not found" }) }, { body: "nope" }, { body: ollamaAnswer("hi") }]);
    const b = directBackend(s, creds("ollama"), st);
    expect((await fails(b.run(req()))).message).toMatch(/cut off/);
    const e = await fails(b.run(req()));
    expect([e.kind, e.message]).toEqual(["backend", "Ollama answered 404: model 'nope' not found"]);
    expect((await fails(b.run(req()))).kind).toBe("invalid-output");
    const st2 = stub([{ body: ollamaAnswer("hi") }]);
    await directBackend(settings({ provider: "ollama", model: "m", endpoint: "https://gpu.example.com/ollama" }), creds("ollama"), st2).run(req());
    expect(st2.calls[0]!.url).toBe("https://gpu.example.com/ollama/api/chat");
  });
});

describe("errors, retries and limits", () => {
  const s = settings({ provider: "openai" });
  const ok = { body: openaiAnswer("fine") };

  it("401 is not retried and names no key", async () => {
    const st = stub([{ status: 401, body: JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } }) }]);
    const e = await fails(directBackend(s, creds("openai"), st).run(req()));
    expect([e.kind, e.message]).toEqual(["backend", "The OpenAI API refused the credential (401)."]);
    expect(st.calls).toHaveLength(1);
  });

  it("429 then success: one retry, after retry-after (capped at 10 s)", async () => {
    const st = stub([{ status: 429, headers: { "retry-after": "3" }, body: "{}" }, ok]);
    expect((await directBackend(s, creds("openai"), st).run(req())).text).toBe("fine");
    expect(st.calls).toHaveLength(2);
    expect(st.waits).toEqual([3000]);
    const st2 = stub([{ status: 503, headers: { "retry-after": "600" } }, ok]);
    await directBackend(s, creds("openai"), st2).run(req());
    expect(st2.waits).toEqual([10_000]);
  });

  it("500 twice is an error after exactly two calls; 400 is not retried; messages are cut to 300 characters", async () => {
    const st = stub([{ status: 500, body: JSON.stringify({ error: { message: "boom" } }) }, { status: 502, body: JSON.stringify({ error: { message: "x".repeat(1000) } }) }, ok]);
    const e = await fails(directBackend(s, creds("openai"), st).run(req()));
    expect(e.kind).toBe("backend");
    expect(e.message.length).toBeLessThanOrEqual(301);
    expect(st.calls).toHaveLength(2);
    const st2 = stub([{ status: 400, body: JSON.stringify({ error: { message: `bad request, key was ${KEY}` } }) }, ok]);
    const e2 = await fails(directBackend(s, creds("openai"), st2).run(req()));
    expect(e2.message).toBe("The OpenAI API answered 400: bad request, key was [key]");
    expect(st2.calls).toHaveLength(1);
  });

  it("a network error is retried once; two are an error that names only the host", async () => {
    const st = stub([{ throws: new TypeError(`fetch failed ${KEY}`) }, ok]);
    expect((await directBackend(s, creds("openai"), st).run(req())).text).toBe("fine");
    const st2 = stub([{ throws: new TypeError("fetch failed") }, { throws: new TypeError("fetch failed") }, ok]);
    const e = await fails(directBackend(s, creds("openai"), st2).run(req()));
    expect(e.message).toBe("Could not reach api.openai.com.");
    expect(st2.calls).toHaveLength(2);
  });

  it("a redirect is an error and is not followed or retried", async () => {
    const st = stub([{ status: 302, headers: { location: "https://evil.example.com/" } }, ok]);
    const e = await fails(directBackend(s, creds("openai"), st).run(req()));
    expect([e.kind, e.message]).toEqual(["backend", expect.stringMatching(/redirect \(302\)/)]);
    expect(st.calls).toHaveLength(1);
    expect(st.calls.every((c) => c.url.startsWith("https://api.openai.com/"))).toBe(true);
  });

  it("times out after timeoutSeconds, and a cancelled run says so", async () => {
    const st = stub([{ hang: true }]);
    const t0 = Date.now();
    const e = await fails(directBackend(settings({ provider: "openai", timeoutSeconds: 1 }), creds("openai"), st).run(req()));
    expect([e.kind, e.message]).toEqual(["backend", "The OpenAI API gave no answer in 1 seconds."]);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(st.calls).toHaveLength(1);
    const ac = new AbortController();
    const st2 = stub([{ hang: true }]);
    const p = directBackend(s, creds("openai"), st2).run(req({ signal: ac.signal }));
    ac.abort();
    expect((await fails(p)).message).toBe("The run was cancelled.");
  });

  it("refuses an oversized request before sending anything", async () => {
    const st = stub([ok]);
    const e = await fails(directBackend(s, creds("openai"), st).run(req({ user: "x".repeat(MAX_REQUEST_BYTES + 1) })));
    expect(e.kind).toBe("too-large");
    expect(st.calls).toHaveLength(0);
  });

  it("does nothing when off or without a usable credential", async () => {
    const st = stub([ok]);
    expect((await fails(directBackend(settings({ provider: "openai", enabled: false }), creds("openai"), st).run(req()))).kind).toBe("off");
    expect((await fails(directBackend(settings({ provider: "openai", backend: "handoff" }), creds("openai"), st).run(req()))).kind).toBe("off");
    expect((await fails(directBackend(settings({ provider: "openai" }), creds("anthropic"), st).run(req()))).kind).toBe("off");
    expect((await fails(directBackend(settings({ provider: "ollama" }), creds("ollama"), st).run(req()))).kind).toBe("off"); // no model
    expect(st.calls).toHaveLength(0);
  });

  it("never shows the planted key in any error seen in this file", () => {
    expect(seen.length).toBeGreaterThan(20);
    for (const m of seen) expect(m).not.toContain(KEY);
  });
});

// ------------------------------------------------------------------ schemas

type S = Record<string, unknown>;
const isObj = (v: unknown): v is S => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every schema node of a provider schema (through properties, items, anyOf, $defs). */
function nodes(s: unknown, out: S[] = []): S[] {
  if (!isObj(s)) return out;
  out.push(s);
  for (const k of ["properties", "$defs"]) if (isObj(s[k])) for (const v of Object.values(s[k] as S)) nodes(v, out);
  for (const k of ["anyOf", "oneOf", "allOf"]) if (Array.isArray(s[k])) for (const v of s[k] as unknown[]) nodes(v, out);
  if (isObj(s.items)) nodes(s.items, out);
  if (isObj(s.additionalProperties)) nodes(s.additionalProperties, out);
  return out;
}

/** A small validator for the keywords the provider schemas use. */
function valid(root: S, node: S, v: unknown, at = ""): string[] {
  let n = node;
  while (typeof n.$ref === "string") n = (root.$defs as S)[(n.$ref as string).replace("#/$defs/", "")] as S;
  if (Array.isArray(n.anyOf)) return (n.anyOf as S[]).some((b) => valid(root, b, v, at).length === 0) ? [] : [`${at}: no anyOf branch`];
  const errs: string[] = [];
  const t = v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
  if (n.type !== undefined && n.type !== t && !(n.type === "number" && t === "integer")) return [`${at}: ${t} is not ${String(n.type)}`];
  if (Array.isArray(n.enum) && !n.enum.includes(v)) errs.push(`${at}: not in enum`);
  if ("const" in n && n.const !== v) errs.push(`${at}: not const`);
  if (typeof n.pattern === "string" && typeof v === "string" && !new RegExp(n.pattern).test(v)) errs.push(`${at}: pattern`);
  if (Array.isArray(v)) {
    if (typeof n.maxItems === "number" && v.length > n.maxItems) errs.push(`${at}: maxItems`);
    if (typeof n.minItems === "number" && v.length < n.minItems) errs.push(`${at}: minItems`);
    if (isObj(n.items)) v.forEach((x, i) => errs.push(...valid(root, n.items as S, x, `${at}/${i}`)));
  }
  if (isObj(v) && isObj(n.properties)) {
    for (const r of (n.required as string[]) ?? []) if (!(r in v)) errs.push(`${at}/${r}: required`);
    for (const [k, x] of Object.entries(v)) {
      const ps = (n.properties as S)[k];
      if (ps === undefined) {
        if (n.additionalProperties === false) errs.push(`${at}/${k}: not allowed`);
      } else errs.push(...valid(root, ps as S, x, `${at}/${k}`));
    }
  }
  return errs;
}

const NOT_FOR: Record<"anthropic" | "openai", string[]> = {
  anthropic: ["minLength", "maxLength", "pattern", "minimum", "maximum", "minItems", "maxItems", "prefixItems", "propertyNames", "maxProperties", "oneOf", "$schema", "$id"],
  openai: ["minLength", "maxLength", "prefixItems", "propertyNames", "maxProperties", "oneOf", "const", "$schema", "$id"],
};

describe("providerSchema", () => {
  const schemas: [string, object, unknown][] = [
    ["import file", IMPORT_SCHEMA, sampleImport()],
    ["decision", DECISION_SCHEMA, SAMPLE_DECISION],
  ];

  for (const provider of ["anthropic", "openai"] as const) {
    for (const [name, schema, sample] of schemas) {
      it(`${provider}, ${name}: keeps to the provider's restrictions`, () => {
        const ps = providerSchema(provider, schema);
        expect(ps.type).toBe("object");
        expect(ps).not.toHaveProperty("anyOf");
        for (const n of nodes(ps)) {
          for (const k of NOT_FOR[provider]) expect(n, `${provider} ${name} ${k}`).not.toHaveProperty(k);
          expect(n.items === false).toBe(false);
          if (n.type === "object" || isObj(n.properties)) {
            expect(n.additionalProperties).toBe(false);
            if (provider === "openai") expect([...((n.required as string[]) ?? [])].sort()).toEqual(Object.keys(n.properties as S).sort());
          } else expect(isObj(n.additionalProperties)).toBe(false);
        }
        expect(JSON.stringify(schema)).toBe(JSON.stringify(schema === IMPORT_SCHEMA ? IMPORT_SCHEMA : DECISION_SCHEMA)); // not changed in place
      });

      it(`${provider}, ${name}: describes the same data (there and back)`, () => {
        const ps = providerSchema(provider, schema);
        const pv = toProviderValue(provider, schema, sample);
        expect(valid(ps, ps, pv)).toEqual([]);
        const back = JSON.parse(restoreAnswer(provider, schema, JSON.stringify(pv)));
        expect(back).toEqual(sample);
        if (schema === IMPORT_SCHEMA) expect(parseImportFile(JSON.stringify(back)).errors).toEqual([]);
        // The original shape is not valid under the provider schema when it differs (maps, missing optionals).
        if (name === "import file") expect(valid(ps, ps, sample).length).toBeGreaterThan(0);
      });
    }
  }

  it("turns tags into key/value pairs for the strict providers and keeps them as a map for Ollama", () => {
    const tags = (s: S) => (((s.$defs as S).object as S).properties as S).tags as S;
    expect(tags(providerSchema("anthropic", IMPORT_SCHEMA))).toMatchObject({
      type: "array",
      items: { properties: { key: { type: "string" } }, required: ["key", "value"], additionalProperties: false },
    });
    const ot = tags(providerSchema("openai", IMPORT_SCHEMA));
    expect((ot.anyOf as S[])[0]).toMatchObject({ type: "array", maxItems: 50 });
    expect((ot.anyOf as S[])[1]).toEqual({ type: "null" });
    const ollama = providerSchema("ollama", IMPORT_SCHEMA);
    expect(ollama).not.toHaveProperty("$schema");
    expect(ollama).not.toHaveProperty("$id");
    expect(tags(ollama)).toEqual(tags(IMPORT_SCHEMA as S));
    expect({ ...ollama, $schema: IMPORT_SCHEMA.$schema, $id: IMPORT_SCHEMA.$id }).toEqual(IMPORT_SCHEMA);
  });

  it("leaves text that is not JSON alone and keeps unknown keys for validate to refuse", () => {
    expect(restoreAnswer("openai", DECISION_SCHEMA, "not json")).toBe("not json");
    expect(JSON.parse(restoreAnswer("openai", DECISION_SCHEMA, JSON.stringify({ title: "t", extra: 1, alternatives: null })))).toEqual({ title: "t", extra: 1 });
  });

  it("restores an import answer end to end through the Claude adapter", async () => {
    const pv = toProviderValue("anthropic", IMPORT_SCHEMA, sampleImport());
    const st = stub([{ body: claudeStream(JSON.stringify(pv)) }]);
    const out = await directBackend(settings({ provider: "anthropic" }), creds("anthropic"), st).run(req({ schema: IMPORT_SCHEMA }));
    expect(JSON.parse(out.text)).toEqual(sampleImport());
  });
});

// ------------------------------------------------------------------ run log

describe("run log", () => {
  const entry = {
    task: "import-level",
    promptHash: "abc123",
    provider: "anthropic",
    model: "claude-opus-5-5",
    host: "api.anthropic.com",
    who: "ada",
    when: "2026-11-16T10:00:00.000Z",
    usage: { inputTokens: 10, outputTokens: 5 },
    outcome: "ok" as const,
    attachments: [{ path: "src/app.ts", bytes: 1234 }],
    prompt: { system: "SYSTEM-TEXT", user: `USER-TEXT with code` },
  };

  it("writes .dp/bmo/runs/<n>.json with mode 0600, without the prompt unless keepPrompts", () => {
    const dp = path.join(tmpDir(), ".dp");
    const f1 = logRun(dp, entry);
    expect(path.relative(dp, f1)).toBe(path.join("bmo", "runs", "1.json"));
    expect(fs.statSync(f1).mode & 0o777).toBe(0o600);
    const r1 = JSON.parse(fs.readFileSync(f1, "utf-8"));
    expect(r1).toEqual({
      task: "import-level",
      promptHash: "abc123",
      provider: "anthropic",
      model: "claude-opus-5-5",
      host: "api.anthropic.com",
      who: "ada",
      when: "2026-11-16T10:00:00.000Z",
      usage: { inputTokens: 10, outputTokens: 5 },
      outcome: "ok",
      attachments: [{ path: "src/app.ts", bytes: 1234 }],
    });
    expect(fs.readFileSync(f1, "utf-8")).not.toContain("USER-TEXT");
    const f2 = logRun(dp, { ...entry, outcome: "backend", error: "x".repeat(500) }, true);
    expect(path.basename(f2)).toBe("2.json");
    const r2 = JSON.parse(fs.readFileSync(f2, "utf-8"));
    expect(r2.prompt).toEqual(entry.prompt);
    expect(r2.error.length).toBeLessThanOrEqual(301);
  });

  it("keeps the newest runs only", () => {
    const dp = path.join(tmpDir(), ".dp");
    for (let i = 0; i < RUNS_KEPT + 5; i++) logRun(dp, entry);
    const files = fs.readdirSync(runsDir(dp)).sort((a, b) => parseInt(a) - parseInt(b));
    expect(files).toHaveLength(RUNS_KEPT);
    expect(files[0]).toBe("6.json");
    expect(files.at(-1)).toBe(`${RUNS_KEPT + 5}.json`);
  });

  it("holds no key after a failed run is logged", async () => {
    const dp = path.join(tmpDir(), ".dp");
    const st = stub([{ status: 400, body: JSON.stringify({ error: { message: `bad ${KEY}` } }) }]);
    const e = await fails(directBackend(settings({ provider: "openai" }), creds("openai"), st).run(req()));
    const f = logRun(dp, { ...entry, outcome: e.kind, error: e.message });
    expect(fs.readFileSync(f, "utf-8")).not.toContain(KEY);
  });
});
