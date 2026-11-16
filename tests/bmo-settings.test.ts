/** Stage S8: BMO's server-side settings (src/bmo/settings.ts): file, strict parsing, endpoint rules, gates, public status, cost. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CredentialStore } from "../src/core/credentials.js";
import { ModelError } from "../src/core/ops.js";
import {
  BMO_SETTINGS_FILE,
  canRun,
  checkEndpoint,
  defaultSettings,
  estimateCost,
  isLoopback,
  parseSettings,
  publicStatus,
  readSettings,
  writeSettings,
  type BmoSettings,
} from "../src/bmo/settings.js";
import type { Role } from "../src/shared/types.js";
import { tmpDir } from "./helpers.js";

const KEY = "sk-ant-PLANTED-SECRET-KEY-0123456789-QZXW";
const ROLES: Role[] = ["architect", "engineer", "viewer"];

function settings(v: Record<string, unknown>): BmoSettings {
  const r = parseSettings(v);
  if (!r.settings) throw new Error(JSON.stringify(r.errors));
  return r.settings;
}

function store(entries: { name: string; provider: string; value?: string }[] = [{ name: "claude", provider: "anthropic" }]) {
  const dir = tmpDir();
  const s = new CredentialStore(dir, null);
  for (const e of entries) s.add({ name: e.name, provider: e.provider, value: e.value ?? KEY });
  return s;
}

const errorsOf = (v: unknown) => parseSettings(v).errors;
const pointers = (v: unknown) => errorsOf(v).map((e) => e.pointer);

describe("BMO settings file", () => {
  it("has safe defaults when there is no file", () => {
    const s = readSettings(tmpDir());
    expect(s).toEqual(defaultSettings());
    expect(s.enabled).toBe(false);
    expect(s.backend).toBe("handoff");
    expect(s.allowedRoles).toEqual(ROLES);
    expect(s.passBudgetTokens).toBe(100_000);
    expect(s.timeoutSeconds).toBe(180);
    expect(s.keepPrompts).toBe(false);
  });

  it("is written atomically with mode 0600 in .dp/ (0700), only what differs from the defaults, and read back", () => {
    const dir = tmpDir();
    const input = { enabled: true, backend: "direct", provider: "anthropic", credential: "claude", allowedRoles: ["architect"], pricePerMTok: { input: 4, output: 20 } };
    const s = writeSettings(dir, input);
    const file = path.join(dir, BMO_SETTINGS_FILE);
    expect(path.relative(dir, file)).toBe(path.join(".dp", "bmo.json"));
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual(input);
    expect(readSettings(dir)).toEqual(s);
    expect(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses to write bad settings and leaves the file alone", () => {
    const dir = tmpDir();
    writeSettings(dir, { enabled: true });
    expect(() => writeSettings(dir, { enabled: "yes" })).toThrow(ModelError);
    expect(readSettings(dir).enabled).toBe(true);
  });

  it("reads a broken file as an error, never as defaults", () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, ".dp"));
    fs.writeFileSync(path.join(dir, BMO_SETTINGS_FILE), "{not json");
    expect(() => readSettings(dir)).toThrow(/not valid JSON/);
    fs.writeFileSync(path.join(dir, BMO_SETTINGS_FILE), JSON.stringify({ enabled: true, endpoint: "https://x.example" }));
    expect(() => readSettings(dir)).toThrow(ModelError);
  });

  it("parses strictly: unknown keys and wrong values are field errors", () => {
    expect(pointers({ enabled: true, apiKey: "x" })).toEqual(["/apiKey"]);
    expect(pointers({ backend: "remote" })).toEqual(["/backend"]);
    expect(pointers({ provider: "gemini" })).toEqual(["/provider"]);
    expect(pointers({ allowedRoles: ["architect", "admin"] })).toEqual(["/allowedRoles"]);
    expect(pointers({ allowedRoles: "viewer" })).toEqual(["/allowedRoles"]);
    expect(pointers({ passBudgetTokens: 10 })).toEqual(["/passBudgetTokens"]);
    expect(pointers({ maxOutputTokens: 1_000_000 })).toEqual(["/maxOutputTokens"]);
    expect(pointers({ timeoutSeconds: 1.5 })).toEqual(["/timeoutSeconds"]);
    expect(pointers({ pricePerMTok: { input: 1 } })).toEqual(["/pricePerMTok"]);
    expect(pointers({ pricePerMTok: { input: 1, output: 2, cached: 3 } })).toEqual(["/pricePerMTok"]);
    expect(pointers({ model: "bad model name" })).toEqual(["/model"]);
    expect(pointers({ credential: "../x" })).toEqual(["/credential"]);
    expect(pointers({ keepPrompts: 1 })).toEqual(["/keepPrompts"]);
    expect(pointers({ projects: { payments: { allowedRoles: ["viewer"], extra: 1 } } })).toEqual(["/projects/payments"]);
    expect(pointers({ projects: { payments: { allowedRoles: ["root"] } } })).toEqual(["/projects/payments/allowedRoles"]);
    expect(pointers([])).toEqual([""]);
    expect(settings({ allowedRoles: ["viewer", "viewer"] }).allowedRoles).toEqual(["viewer"]);
    expect(settings({ allowedRoles: [] }).allowedRoles).toEqual([]);
  });
});

describe("endpoint rules", () => {
  it("pins the cloud hosts unless allowCustomEndpoint is also set", () => {
    expect(settings({ provider: "anthropic" }).endpoint).toBeUndefined();
    expect(pointers({ provider: "anthropic", endpoint: "https://gateway.example.com" })).toEqual(["/endpoint"]);
    expect(pointers({ provider: "openai", endpoint: "https://api.openai.com" })).toEqual(["/endpoint"]);
    expect(errorsOf({ provider: "anthropic", endpoint: "https://gateway.example.com" })[0]!.message).toMatch(/api\.anthropic\.com.*allowCustomEndpoint/);
    expect(pointers({ provider: "anthropic", endpoint: "https://gateway.example.com/anthropic", allowCustomEndpoint: true })).toEqual([]);
    expect(pointers({ provider: "openai", endpoint: "https://gateway.example.com", allowCustomEndpoint: true })).toEqual([]);
  });

  it("lets Ollama use another address; non-loopback hosts need https", () => {
    expect(checkEndpoint("ollama", undefined, false)).toEqual({ base: "http://127.0.0.1:11434" });
    expect(checkEndpoint("ollama", "http://localhost:11434/", false)).toEqual({ base: "http://localhost:11434" });
    expect(checkEndpoint("ollama", "http://127.8.9.10:8080", false)).toEqual({ base: "http://127.8.9.10:8080" });
    expect(checkEndpoint("ollama", "http://[::1]:11434", false)).toEqual({ base: "http://[::1]:11434" });
    expect(checkEndpoint("ollama", "https://ollama.example.com", false)).toEqual({ base: "https://ollama.example.com" });
    for (const bad of ["http://10.0.0.5:11434", "http://ollama.example.com", "http://128.0.0.1", "http://localhost.example.com", "http://[fe80::1]:11434"]) {
      expect(checkEndpoint("ollama", bad, false), bad).toHaveProperty("error");
    }
    expect(checkEndpoint("anthropic", "http://gateway.example.com", true)).toHaveProperty("error");
    expect(checkEndpoint("anthropic", "http://127.0.0.1:9000", true)).toEqual({ base: "http://127.0.0.1:9000" });
  });

  it("refuses credentials, queries, fragments and other schemes in an endpoint", () => {
    for (const bad of [
      "https://user:pass@gateway.example.com",
      "https://user@gateway.example.com",
      "https://gateway.example.com/?key=1",
      "https://gateway.example.com/?",
      "https://gateway.example.com/#x",
      "ftp://gateway.example.com",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(checkEndpoint("openai", bad, true), bad).toHaveProperty("error");
      expect(checkEndpoint("ollama", bad, false), bad).toHaveProperty("error");
    }
    expect(pointers({ endpoint: "https://x.example.com" })).toEqual(["/endpoint"]); // no provider
  });

  it("knows the loopback hosts", () => {
    for (const h of ["localhost", "LOCALHOST", "127.0.0.1", "127.255.255.254", "[::1]", "::1"]) expect(isLoopback(h), h).toBe(true);
    for (const h of ["10.0.0.1", "127.0.0.256", "localhost.example.com", "example.com", "[::2]", "0.0.0.0"]) expect(isLoopback(h), h).toBe(false);
  });
});

describe("canRun gates", () => {
  const ready = { enabled: true, backend: "direct", provider: "anthropic", credential: "claude" };

  it("passes when everything is in place", () => {
    expect(canRun(settings(ready), store(), "viewer")).toEqual({ ok: true });
    expect(canRun(settings({ ...ready, credential: undefined }), store(), "engineer")).toEqual({ ok: true }); // first credential of the provider
  });

  it("refuses for each missing piece, with a reason", () => {
    const creds = store();
    const no = (v: Record<string, unknown>, c = creds, role: Role = "architect") => {
      const r = canRun(settings(v), c, role);
      expect(r.ok).toBe(false);
      return r.ok ? "" : r.reason;
    };
    expect(no({ ...ready, enabled: false })).toMatch(/turned off/);
    expect(no({ ...ready, backend: "handoff" })).toMatch(/own coding agent/);
    expect(no({ enabled: true, backend: "direct" })).toMatch(/No provider/);
    expect(no({ ...ready, credential: "missing" })).toMatch(/no credential "missing"/);
    expect(no({ ...ready, credential: undefined }, store([]))).toMatch(/no stored credential/);
    expect(no({ ...ready, credential: "gh" }, store([{ name: "gh", provider: "github" }]))).toMatch(/cannot be used/);
    expect(no({ enabled: true, backend: "direct", provider: "ollama" })).toMatch(/local model/);
  });

  it("refuses a credential locked by another DP_SECRET_KEY", () => {
    const dir = tmpDir();
    new CredentialStore(dir, "first secret").add({ name: "claude", provider: "anthropic", value: KEY });
    const r = canRun(settings(ready), new CredentialStore(dir, "second secret"), "architect");
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/locked/) });
  });

  it("needs no credential for Ollama", () => {
    expect(canRun(settings({ enabled: true, backend: "direct", provider: "ollama", model: "qwen3:32b" }), store([]), "viewer")).toEqual({ ok: true });
  });

  it("is open to every role by default and follows a restricted allowedRoles exactly", () => {
    const creds = store();
    for (const role of ROLES) expect(canRun(settings(ready), creds, role).ok).toBe(true);
    for (const only of ROLES) {
      const s = settings({ ...ready, allowedRoles: [only] });
      for (const role of ROLES) {
        const r = canRun(s, creds, role);
        expect(r.ok, `${only} only, ${role}`).toBe(role === only);
        if (!r.ok) expect(r.reason).toMatch(new RegExp(`not open to the ${role} role`));
      }
    }
    expect(canRun(settings({ ...ready, allowedRoles: [] }), creds, "architect").ok).toBe(false);
  });

  it("uses a hub project's own allowedRoles", () => {
    const s = settings({ ...ready, allowedRoles: ["architect"], projects: { payments: { allowedRoles: ["viewer", "engineer"] } } });
    const creds = store();
    expect(canRun(s, creds, "viewer").ok).toBe(false);
    expect(canRun(s, creds, "viewer", "payments").ok).toBe(true);
    expect(canRun(s, creds, "architect", "payments").ok).toBe(false);
    expect(canRun(s, creds, "viewer", "other").ok).toBe(false);
  });
});

describe("publicStatus and cost", () => {
  it("shows what a client may see and never the key or its hint", () => {
    const creds = store();
    const st = publicStatus(settings({ enabled: true, backend: "direct", provider: "anthropic", credential: "claude", pricePerMTok: { input: 4, output: 20 } }), creds);
    expect(st).toEqual({
      enabled: true,
      backend: "direct",
      provider: "anthropic",
      model: "claude-opus-5-5",
      host: "api.anthropic.com",
      credential: "claude",
      hasCredential: true,
      allowedRoles: ROLES,
      passBudgetTokens: 100_000,
      maxOutputTokens: null,
      timeoutSeconds: 180,
      pricePerMTok: { input: 4, output: 20 },
    });
    const text = JSON.stringify(st);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(KEY.slice(-4));
    expect(text).not.toContain("••••");
    expect(JSON.stringify(publicStatus(defaultSettings(), creds))).not.toContain(KEY.slice(-4));
  });

  it("shows the destination host of a custom endpoint and the default for Ollama", () => {
    expect(publicStatus(settings({ provider: "openai", endpoint: "https://gw.example.com:8443/openai", allowCustomEndpoint: true }), store([])).host).toBe("gw.example.com:8443");
    const o = publicStatus(settings({ provider: "ollama", model: "llama4" }), store([]));
    expect(o.host).toBe("127.0.0.1:11434");
    expect(o.hasCredential).toBe(true);
    expect(o.credential).toBeNull();
  });

  it("estimates cost only from prices the person entered", () => {
    expect(estimateCost(defaultSettings(), { inputTokens: 1_000_000, outputTokens: 1 })).toBeNull();
    const s = settings({ pricePerMTok: { input: 4, output: 20 } });
    expect(estimateCost(s, { inputTokens: 500_000, outputTokens: 100_000 })).toEqual({ input: 2, output: 2, total: 4 });
    expect(estimateCost(s, 250_000)).toEqual({ input: 1, output: 0, total: 1 });
    expect(estimateCost(s, {})).toEqual({ input: 0, output: 0, total: 0 });
  });
});
