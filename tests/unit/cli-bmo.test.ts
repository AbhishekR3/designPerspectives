/** `dp bmo status | set | run`: the settings file, the endpoint rules, and a run against a local stand-in for Ollama (no real network). */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialStore } from "../../src/core/credentials.js";
import { demoDir } from "./helpers.js";

const tsx = path.resolve("node_modules", ".bin", "tsx");
const KEY = "sk-ant-api03-PLANTEDKEY0123456789abcdefghijkl";

interface Out {
  status: number | null;
  stdout: string;
  stderr: string;
}
/** Run `dp` without blocking this process, so a stand-in server in it can answer. */
function dp(...args: string[]): Promise<Out> {
  return new Promise((resolve) => {
    const child = spawn(tsx, ["src/cli.ts", ...args], { env: { ...process.env, DP_SECRET_KEY: "" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

const settingsFile = (dir: string) => path.join(dir, ".dp", "bmo.json");
const readSettingsFile = (dir: string) => JSON.parse(fs.readFileSync(settingsFile(dir), "utf-8"));
const runFiles = (dir: string) => {
  const d = path.join(dir, ".dp", "bmo", "runs");
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
};
/** The model files of a project, to see that a text run changed nothing. */
function modelFiles(dir: string): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.statSync(p).mtimeMs;
    }
  };
  walk(path.join(dir, "architecture"));
  return out;
}

// ------------------------------------------------------------------ a stand-in for Ollama on this computer

let server: http.Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

/** Listens on a free local port; `answer` is the text it returns for each chat request. */
async function ollama(answer: () => string): Promise<{ endpoint: string; requests: { url: string; body: any }[] }> {
  const requests: { url: string; body: any }[] = [];
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      requests.push({ url: req.url ?? "", body: JSON.parse(raw || "null") });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ model: "llama3", message: { role: "assistant", content: answer() }, done: true, done_reason: "stop", prompt_eval_count: 321, eval_count: 12 }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

describe("dp bmo status and set", () => {
  it("is off by default and says why a run is not possible", async () => {
    const dir = demoDir();
    const r = await dp("bmo", "status", dir);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("BMO is off.");
    expect(r.stdout).toContain("backend:     handoff");
    expect(r.stdout).toContain("A run is not possible: BMO is turned off in the settings.");
    const j = JSON.parse((await dp("bmo", "status", dir, "--json")).stdout);
    expect(j).toMatchObject({ enabled: false, backend: "handoff", provider: null, canRun: { ok: false } });
    expect(fs.existsSync(settingsFile(dir))).toBe(false);
  });

  it("set writes .dp/bmo.json (mode 0600), changes only what is given, and status never shows a key", async () => {
    const dir = demoDir();
    new CredentialStore(dir, null).add({ name: "anthropic-key", provider: "anthropic", value: KEY });
    const r = await dp("bmo", "set", dir, "--enabled", "--backend", "direct", "--provider", "anthropic", "--credential", "anthropic-key", "--roles", "architect,engineer", "--budget", "50000");
    expect(r.status, r.stderr).toBe(0);
    expect(fs.statSync(settingsFile(dir)).mode & 0o777).toBe(0o600);
    expect(readSettingsFile(dir)).toEqual({ enabled: true, backend: "direct", provider: "anthropic", credential: "anthropic-key", allowedRoles: ["architect", "engineer"], passBudgetTokens: 50000 });
    // A second set keeps the rest.
    expect((await dp("bmo", "set", dir, "--model", "claude-sonnet-5-5")).status).toBe(0);
    expect(readSettingsFile(dir)).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5", passBudgetTokens: 50000 });
    const st = await dp("bmo", "status", dir);
    expect(st.stdout).toContain("BMO is on.");
    expect(st.stdout).toContain("sends to:    api.anthropic.com");
    expect(st.stdout).toContain("credential:  anthropic-key");
    expect(st.stdout).toContain("roles:       architect, engineer");
    expect(st.stdout).toContain("A run is possible.");
    for (const out of [st.stdout, st.stderr, (await dp("bmo", "status", dir, "--json")).stdout, r.stdout, r.stderr]) expect(out).not.toContain(KEY);
    expect((await dp("bmo", "set", dir, "--disabled")).status).toBe(0);
    expect(readSettingsFile(dir).enabled).toBeUndefined();
  });

  it("refuses an endpoint the rules do not allow, and leaves the file as it was", async () => {
    const dir = demoDir();
    expect((await dp("bmo", "set", dir, "--backend", "direct", "--provider", "ollama", "--model", "llama3")).status).toBe(0);
    const before = fs.readFileSync(settingsFile(dir), "utf-8");
    const plain = await dp("bmo", "set", dir, "--endpoint", "http://models.example.com");
    expect(plain.status).toBe(1);
    expect(plain.stderr).toMatch(/must use https/);
    const local = await dp("bmo", "set", dir, "--endpoint", "http://localhost:9999");
    expect(local.status, local.stderr).toBe(0);
    expect(readSettingsFile(dir).endpoint).toBe("http://localhost:9999");
    expect((await dp("bmo", "set", dir, "--endpoint", "http://u:p@localhost:9999")).status).toBe(1);

    expect((await dp("bmo", "set", dir, "--clear-endpoint", "--provider", "anthropic")).status).toBe(0);
    const cloud = await dp("bmo", "set", dir, "--endpoint", "https://gateway.example.com/anthropic");
    expect(cloud.status).toBe(1);
    expect(cloud.stderr).toMatch(/allowCustomEndpoint/);
    const gateway = await dp("bmo", "set", dir, "--endpoint", "https://gateway.example.com/anthropic", "--allow-custom-endpoint");
    expect(gateway.status, gateway.stderr).toBe(0);
    expect(readSettingsFile(dir)).toMatchObject({ endpoint: "https://gateway.example.com/anthropic", allowCustomEndpoint: true });
    expect(before).toContain("ollama");

    for (const bad of [
      ["--enabled", "--disabled"],
      ["--roles", "architect,boss"],
      ["--budget", "five"],
      ["--endpoint", "https://a.example", "--clear-endpoint"],
      ["--provider", "mystery"],
    ]) {
      const r = await dp("bmo", "set", dir, ...bad);
      expect(r.status, bad.join(" ")).toBe(1);
    }
  });
});

describe("dp bmo run", () => {
  async function enable(dir: string, endpoint: string, extra: string[] = []): Promise<void> {
    const r = await dp("bmo", "set", dir, "--enabled", "--backend", "direct", "--provider", "ollama", "--model", "llama3", "--endpoint", endpoint, ...extra);
    expect(r.status, r.stderr).toBe(0);
  }

  it("refuses while BMO is off", async () => {
    const dir = demoDir();
    const r = await dp("bmo", "run", "explain", dir, "--diagram", "landscape");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BMO cannot run: BMO is turned off/);
  });

  it("without --yes-send shows what would be sent and sends nothing (exit 1)", async () => {
    const dir = demoDir();
    const stand = await ollama(() => "never asked");
    await enable(dir, stand.endpoint);
    const r = await dp("bmo", "run", "explain", dir, "--diagram", "containers-internet-banking-system");
    expect(r.status).toBe(1);
    const host = new URL(stand.endpoint).host;
    expect(r.stderr).toContain(`task explain (prompt 1.0.0) would be sent to ollama llama3 at ${host}.`);
    expect(r.stderr).toMatch(/Files in the prompt: 0\./);
    expect(r.stderr).toMatch(/Estimated input: about \d+ tokens/);
    expect(r.stderr).toContain("Nothing was sent. Run the same command with --yes-send");
    expect(r.stdout).toBe("");
    expect(stand.requests).toEqual([]);
    expect(runFiles(dir)).toEqual([]);

    const shown = await dp("bmo", "run", "explain", dir, "--diagram", "landscape", "--show-prompt");
    expect(shown.status).toBe(1);
    expect(shown.stderr).toContain("--- system ---");
    expect(shown.stderr).toContain("Lens: Architect");
    expect(stand.requests).toEqual([]);
    // A wrong selector is a plain message, not a stack.
    const bad = await dp("bmo", "run", "explain", dir, "--diagram", "context-nowhere");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/No diagram/);
    expect((await dp("bmo", "run", "nonsense", dir)).status).toBe(1);
  });

  it("with --yes-send sends exactly the shown prompt, prints a text answer to stdout, stores nothing but the run log", async () => {
    const dir = demoDir();
    const stand = await ollama(() => "Two boxes talk to each other.");
    await enable(dir, stand.endpoint);
    const before = modelFiles(dir);
    const r = await dp("bmo", "run", "explain", dir, "--element", "api-application", "--lens", "overview", "--yes-send");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe("Two boxes talk to each other.\n");
    expect(r.stderr).toContain("Used 321 input and 12 output tokens");
    expect(stand.requests).toHaveLength(1);
    expect(stand.requests[0]!.url).toBe("/api/chat");
    expect(stand.requests[0]!.body.messages[1].content).toContain("Object: container api-application");
    expect(stand.requests[0]!.body.messages[1].content).toContain("Lens: Overview");
    expect(modelFiles(dir)).toEqual(before);
    const runs = runFiles(dir);
    expect(runs).toEqual(["1.json"]);
    const log = fs.readFileSync(path.join(dir, ".dp", "bmo", "runs", "1.json"), "utf-8");
    expect(JSON.parse(log)).toMatchObject({ task: "explain", provider: "ollama", model: "llama3", outcome: "ok", usage: { inputTokens: 321, outputTokens: 12 } });
    expect(log).not.toContain("Two boxes");
    expect(log).not.toContain("api-application");
  });

  it("describe-to-model reads --text-file and prints the new draft's ID; an unusable answer exits 1 with the text to paste back", async () => {
    const dir = demoDir();
    const file = path.join(dir, "description.txt");
    fs.writeFileSync(file, "Customers pay through the Ledger Service, which writes to the database.");
    const user = (note: string) => [{ kind: "user", note }];
    const good = JSON.stringify({
      schemaVersion: 1,
      level: "all",
      objects: [{ id: "ledger-service", type: "container", name: "Ledger Service", parent: "internet-banking-system", evidence: user("the Ledger Service") }],
      relationships: [{ source: "ledger-service", target: "database", description: "Writes ledger entries to", evidence: user("writes to the database") }],
    });
    let answer = good;
    const stand = await ollama(() => answer);
    await enable(dir, stand.endpoint);
    const r = await dp("bmo", "run", "describe-to-model", dir, "--text-file", file, "--yes-send");
    expect(r.status, r.stderr).toBe(0);
    const id = r.stdout.trim();
    expect(fs.existsSync(path.join(dir, "architecture", "drafts", id, "workspace.json"))).toBe(true);
    expect(stand.requests[0]!.body.format).toBeTruthy(); // the answer schema went along
    expect(stand.requests[0]!.body.messages[1].content).toContain("Ledger Service, which writes");
    const drafts = fs.readdirSync(path.join(dir, "architecture", "drafts"));

    answer = JSON.stringify({ schemaVersion: 1, level: "all", objects: [], relationships: [{ source: "nope", target: "database", description: "Uses" }] });
    const bad = await dp("bmo", "run", "describe-to-model", dir, "--text-file", file, "--yes-send");
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe("");
    expect(bad.stderr).toContain("could not be used");
    expect(bad.stderr).toContain("dp could not use your answer (task describe-to-model");
    expect(fs.readdirSync(path.join(dir, "architecture", "drafts"))).toEqual(drafts);
    expect(runFiles(dir)).toHaveLength(2);
  });
});
