/** Stage S8 (routes): BMO's routes with the fake backend and a stub fetch: settings, preview, run, roles, logs. No network. */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BmoError, type Backend } from "../../src/assistant/backend.js";
import { fakeBackend, type FakeAnswer } from "../../src/assistant/fakeBackend.js";
import { runsDir } from "../../src/assistant/providerBackend.js";
import { RUN_HEADROOM_TOKENS, runTokenLimit } from "../../src/assistant/settings.js";
import type { Fetch } from "../../src/core/githubWorkStatus.js";
import { decide, ROUTE_RULES, type Who } from "../../src/server/auth.js";
import { copyDemoHub, createHubApp } from "../../src/server/hub.js";
import type { ImportFile } from "../../src/shared/types.js";
import { Client, client, demoDir, ok, ROLE_USERS, tmpDir, writeTestUsers } from "./helpers.js";
import { sampleImport } from "./importFixture.js";

const json = (v: unknown) => JSON.stringify(v);
const c2File = (): ImportFile => ({ ...sampleImport(), level: "c2" });
const dpDir = (dir: string) => path.join(dir, ".dp");
const DIAGRAM = "containers-internet-banking-system";
const KEY = "sk-ant-api03-PLANTEDKEY0123456789abcdefghijkl";

const user = (note: string) => [{ kind: "user" as const, note }];
const describeAnswer = () =>
  json({
    schemaVersion: 1,
    level: "all",
    objects: [{ id: "ledger-service", type: "container", name: "Ledger Service", parent: "internet-banking-system", evidence: user("the Ledger Service") }],
    relationships: [{ source: "ledger-service", target: "database", description: "Writes ledger entries to", evidence: user("writes to the database") }],
  });
const decisionAnswer = () =>
  json({
    title: "Separate ledger service",
    context: "The API writes balances.",
    decision: "Move ledger writes out.",
    alternatives: [{ name: "Keep it", whyNot: "Couples releases." }],
    affects: ["api-application"],
  });
const labelsAnswer = (id: string, source: string, target: string) =>
  json({ schemaVersion: 1, level: "all", objects: [], relationships: [{ id, source, target, description: "Looks up customer accounts in", evidence: user("staff do this") }] });

const TEXT = "**Summary**: one\n\n- two";

/** Every file under `dir` (not the run log) with a hash of its content. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).split(path.sep).join("/");
      if (rel === ".dp/bmo/runs") continue;
      if (e.isDirectory()) walk(p);
      else out[rel] = createHash("sha1").update(fs.readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return out;
}
const runLog = (dir: string) => {
  const d = runsDir(dpDir(dir));
  return fs.existsSync(d)
    ? fs
        .readdirSync(d)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map((f) => ({ file: path.join(d, f), text: fs.readFileSync(path.join(d, f), "utf-8"), json: JSON.parse(fs.readFileSync(path.join(d, f), "utf-8")) }))
    : [];
};

/** The fake answers every task in the way its validator accepts. */
function answers(extra: Record<string, FakeAnswer> = {}): Record<string, FakeAnswer> {
  return { explain: TEXT, challenge: TEXT, "draft-summary": TEXT, "decision-from-draft": decisionAnswer(), "describe-to-model": describeAnswer(), "import-level": json(c2File()), ...extra };
}

/** The selectors every task is run with. */
const BODY: Record<string, Record<string, unknown>> = {
  explain: { task: "explain", diagram: DIAGRAM, lens: "overview" },
  challenge: { task: "challenge", diagram: DIAGRAM },
  "draft-summary": { task: "draft-summary" },
  "decision-from-draft": { task: "decision-from-draft" },
  "describe-to-model": { task: "describe-to-model", text: "Customers pay through the Ledger Service, which writes to the database." },
  "import-level": { task: "import-level", level: "c2" },
  "suggest-labels": { task: "suggest-labels" },
};

/** The body for a route: a run also carries a hash (here a placeholder, for refusals that come before it is looked at). */
const forRoute = (route: string, body: Record<string, unknown>) => (route.endsWith("/run") ? { ...body, hash: "x" } : body);

/** Preview then run; returns both responses. */
async function previewRun(c: Client, body: Record<string, unknown>) {
  const pv = await c.post("/api/bmo/preview", body);
  if (pv.status !== 200) return { pv, run: pv };
  return { pv, run: await c.post("/api/bmo/run", { ...body, hash: pv.json().hash }) };
}

/** A draft with a change (so there is something to summarise), made by `c`; returns its id and a client on it. */
async function draftWithChange(c: Client, title = "Add a ledger"): Promise<{ id: string; on: Client }> {
  const { id } = await ok(c.post("/api/drafts", { title }));
  const on = c.at(`draft:${id}`);
  await ok(on.post("/api/elements", { kind: "container", parentId: "internet-banking-system", name: "Ledger" }));
  return { id, on };
}

/** A project with the fake plugged in. */
function app(opts: { users?: true; readOnly?: boolean; answers?: Record<string, FakeAnswer> } = {}) {
  const dir = demoDir();
  const backend = fakeBackend(opts.answers ?? answers());
  const c = client(dir, { bmoBackend: backend, ...(opts.users ? { users: ROLE_USERS } : {}), ...(opts.readOnly ? { readOnly: true } : {}) });
  return { dir, backend, c };
}

describe("off by default, and the settings", () => {
  it("is off without a settings file: the status says why, preview and run are refused, nothing is written or sent", async () => {
    const dir = demoDir();
    const sent: string[] = [];
    const fetch: Fetch = (url) => {
      sent.push(url);
      return Promise.reject(new Error("no network in tests"));
    };
    const c = client(dir, { fetch });
    const before = tree(dir);
    const st = await ok(c.get("/api/bmo"));
    expect(st).toMatchObject({ enabled: false, backend: "handoff", provider: null, fake: false, canAdmin: true, problem: null });
    expect(st.canRun).toEqual({ ok: false, reason: "BMO is turned off in the settings." });
    expect(st.tasks.map((t: any) => t.id).sort()).toEqual(["ask", "challenge", "decision-from-draft", "describe-to-model", "draft-summary", "explain", "import-level", "suggest-labels"]);
    expect(st.tasks.find((t: any) => t.id === "explain")).toEqual({ id: "explain", title: "Explain", output: "text" });
    expect(st.settings).toMatchObject({ enabled: false, allowedRoles: ["architect", "engineer", "viewer"] });
    for (const path of ["/api/bmo/preview", "/api/bmo/run"]) {
      const r = await c.post(path, forRoute(path, BODY.explain!));
      expect(r.status, path).toBe(409);
      expect(r.json().detail).toMatch(/turned off/);
      expect(r.json().stale, path).toBeUndefined();
    }
    expect(sent).toEqual([]);
    expect(tree(dir)).toEqual(before);
    expect(fs.existsSync(dpDir(dir))).toBe(false);
  });

  it("a settings file that cannot be read is reported, not thrown", async () => {
    const dir = demoDir();
    fs.mkdirSync(dpDir(dir), { recursive: true });
    fs.writeFileSync(path.join(dpDir(dir), "bmo.json"), '{"enabled": "yes"}');
    const st = await ok(client(dir).get("/api/bmo"));
    expect(st.problem).toMatch(/enabled/);
    expect(st.canRun.ok).toBe(false);
  });

  it("architects replace the settings; the answer never holds a key; the file is private", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.post("/api/credentials", { name: "anthropic-key", provider: "anthropic", value: KEY }));
    const bad = await c.put("/api/bmo/settings", { enabled: true, provider: "foo", colour: "red" });
    expect(bad.status).toBe(422);
    expect(
      bad
        .json()
        .errors.map((e: any) => e.pointer)
        .sort(),
    ).toEqual(["/colour", "/provider"]);
    expect(fs.existsSync(path.join(dpDir(dir), "bmo.json"))).toBe(false);
    expect((await c.put("/api/bmo/settings", { enabled: true, provider: "anthropic", endpoint: "http://evil.example/" })).status).toBe(422);

    const r = await c.put("/api/bmo/settings", { enabled: true, backend: "direct", provider: "anthropic", credential: "anthropic-key", keepPrompts: false });
    expect(r.status, r.text).toBe(200);
    expect(r.text).not.toContain(KEY);
    expect(r.text).not.toContain("0123456789abcdefghijkl");
    const st = r.json();
    expect(st).toMatchObject({ enabled: true, provider: "anthropic", host: "api.anthropic.com", credential: "anthropic-key", hasCredential: true, canRun: { ok: true } });
    const file = path.join(dpDir(dir), "bmo.json");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(file, "utf-8")).not.toContain(KEY);
    expect((await c.get("/api/bmo")).text).not.toContain(KEY);
  });

  it("only architects change the settings, and not on a read-only server", async () => {
    const { c: signed } = app({ users: true });
    const eng = await signed.as("engineer");
    const view = await signed.as("viewer");
    const arch = await signed.as("architect");
    for (const who of [eng, view]) {
      const r = await who.put("/api/bmo/settings", { enabled: true });
      expect(r.status).toBe(403);
      const st = await ok(who.get("/api/bmo"));
      expect(st.canAdmin).toBe(false);
      expect(st.settings).toBeNull();
    }
    expect((await arch.put("/api/bmo/settings", { allowedRoles: ["architect", "engineer"] })).status).toBe(200);
    const ro = app({ readOnly: true });
    expect((await ro.c.put("/api/bmo/settings", { enabled: true })).status).toBe(403);
    expect((await ok(ro.c.get("/api/bmo"))).canAdmin).toBe(false);
  });

  it("every non-GET BMO route is listed, and bmo.run is open to every role and server", () => {
    expect(ROUTE_RULES["PUT /api/bmo/settings"]).toBe("admin");
    expect(ROUTE_RULES["POST /api/bmo/preview"]).toBe("bmo.run");
    expect(ROUTE_RULES["POST /api/bmo/run"]).toBe("bmo.run");
    for (const role of ["architect", "engineer", "viewer"] as const) {
      for (const readOnlyServer of [false, true]) {
        const who: Who = { user: null, role, loginRequired: false, readOnlyServer };
        expect(decide("bmo.run", who, "main")).toBeNull();
      }
    }
  });
});

describe("every task, preview then run", () => {
  it("explain a diagram, an element and a relationship: what is shown is what the backend gets, and the text is stored nowhere", async () => {
    const { dir, backend, c } = app();
    const before = tree(dir);
    const rel = (await ok(c.get("/api/state"))).relationships[0].id;
    const bodies = [BODY.explain!, { task: "explain", element: "api-application", lens: "Architect" }, { task: "explain", relationship: rel, lens: "engineer" }];
    for (const b of bodies) {
      const pv = await ok(c.post("/api/bmo/preview", b));
      expect(pv).toMatchObject({ task: "explain", output: "text", destination: { provider: "fake", model: null, host: null }, estCost: null });
      expect(pv.hash).toMatch(/^[0-9a-f]{40}$/);
      expect(pv.estTokens).toBeGreaterThan(50);
      expect(pv.files).toEqual([]);
      expect(pv.system.length).toBeGreaterThan(100);
      const r = await ok(c.post("/api/bmo/run", { ...b, hash: pv.hash }));
      expect(r).toMatchObject({ output: "text", text: TEXT, model: null });
      expect(r.usage.inputTokens).toBeGreaterThan(0);
      const sent = backend.calls.at(-1)!;
      expect(sent.system).toBe(pv.system);
      expect(sent.user).toBe(pv.user);
      expect(sent.task).toBe("explain");
    }
    expect(backend.calls[0]!.user).toContain("Lens: Overview");
    expect(backend.calls[0]!.user).toContain("Diagram:");
    expect(backend.calls[1]!.user).toContain("Object: container api-application");
    expect(backend.calls[2]!.user).toContain(`Relationship: ${rel}`);
    // Nothing but the run log was written: not the project, not .dp.
    expect(tree(dir)).toEqual(before);
    const log = runLog(dir);
    expect(log).toHaveLength(3);
    for (const l of log) {
      expect(l.text).not.toContain("Summary");
      expect(l.text).not.toContain("Diagram:");
      expect(l.json).toMatchObject({ task: "explain", provider: "fake", outcome: "ok", who: null, attachments: [] });
      expect(l.json.promptHash).toMatch(/^[0-9a-f]{40}$/);
      expect(l.json.prompt).toBeUndefined();
      expect(fs.statSync(l.file).mode & 0o777).toBe(0o600);
    }
  });

  it("explain refuses an unknown or missing subject and lens", async () => {
    const { c } = app();
    const code = async (b: unknown) => (await c.post("/api/bmo/preview", b)).status;
    expect(await code({ task: "explain", lens: "overview" })).toBe(422);
    expect(await code({ task: "explain", diagram: DIAGRAM, element: "api-application", lens: "overview" })).toBe(422);
    expect(await code({ task: "explain", diagram: DIAGRAM })).toBe(422);
    expect(await code({ task: "explain", diagram: DIAGRAM, lens: "nobody" })).toBe(422);
    expect(await code({ task: "explain", diagram: "context-nowhere", lens: "overview" })).toBe(404);
    expect(await code({ task: "explain", element: "nope", lens: "overview" })).toBe(404);
    expect(await code({ task: "explain", relationship: "nope", lens: "overview" })).toBe(404);
    expect(await code({ task: "nonsense" })).toBe(422);
    expect(await code({})).toBe(422);
    expect(await code([1])).toBe(422);
  });

  it("challenge: the lints are dp's own findings about the diagram", async () => {
    const { backend, c } = app();
    await ok(c.post("/api/elements", { kind: "container", parentId: "internet-banking-system", name: "Bare Box" }));
    const edge = (await ok(c.get(`/api/diagrams/${DIAGRAM}`))).edges.find((e: any) => !e.derived);
    await ok(c.patch(`/api/relationships/${edge.relationshipIds[0]}`, { description: "Uses" }));
    const { pv, run } = await previewRun(c, BODY.challenge!);
    expect(pv.status).toBe(200);
    expect(run.json()).toMatchObject({ output: "text", text: TEXT });
    const user = backend.calls[0]!.user;
    expect(user).toContain('name="lint"');
    expect(user).toContain('has only the label "Uses"');
    expect(user).toContain('The container "Bare Box" has no description.');
    expect(user).toContain('The container "Bare Box" has no technology.');
  });

  it("draft-summary and decision-from-draft work on the selected draft; the decision is one undo step in that draft", async () => {
    const { dir, backend, c } = app();
    const { id, on } = await draftWithChange(c);
    const mainTree = tree(dir);
    const sum = await previewRun(on, BODY["draft-summary"]!);
    expect(sum.run.status, sum.run.text).toBe(200);
    expect(sum.run.json()).toMatchObject({ output: "text", text: TEXT });
    expect(backend.calls[0]!.user).toContain("Draft: Add a ledger");
    expect(backend.calls[0]!.user).toMatch(/added container .*ledger/i);
    expect(backend.calls[0]!.user).toContain("## Architecture changes");
    expect(tree(dir)).toEqual(mainTree);

    const decsBefore = (await ok(on.get("/api/decisions"))).length;
    const dec = await previewRun(on, BODY["decision-from-draft"]!);
    expect(dec.run.status, dec.run.text).toBe(200);
    const made = dec.run.json();
    expect(made).toMatchObject({ output: "decision", decision: { title: "Separate ledger service" } });
    expect(made.decision.file).toMatch(/^\d{4}-separate-ledger-service\.md$/);
    const decs = await ok(on.get("/api/decisions"));
    expect(decs).toHaveLength(decsBefore + 1);
    expect(decs.find((d: any) => d.id === made.decision.id)).toMatchObject({ status: "proposed", affects: ["api-application"] });
    expect(await ok(c.get("/api/decisions"))).toHaveLength(decsBefore); // main untouched
    expect(fs.existsSync(path.join(dir, "architecture", "drafts", id))).toBe(true);
    await ok(on.post("/api/undo"));
    expect(await ok(on.get("/api/decisions"))).toHaveLength(decsBefore);
    expect(runLog(dir).map((l) => l.json.task)).toEqual(["draft-summary", "decision-from-draft"]);
  });

  it("draft tasks need a draft to be selected", async () => {
    const { c } = app();
    for (const t of ["draft-summary", "decision-from-draft"]) {
      const r = await c.post("/api/bmo/preview", BODY[t]);
      expect(r.status, t).toBe(422);
      expect(r.json().detail).toMatch(/draft/);
    }
  });

  it("describe-to-model makes a draft credited to the caller; the answer is checked, not repaired", async () => {
    const { dir, c } = app();
    const mainTree = tree(dir);
    const { pv, run } = await previewRun(c, BODY["describe-to-model"]!);
    expect(pv.status).toBe(200);
    expect(run.status, run.text).toBe(200);
    const r = run.json();
    expect(r).toMatchObject({ output: "import-file", draftId: expect.any(String) });
    expect(r.report.created.length).toBeGreaterThan(0);
    const drafts = (await ok(c.get("/api/state"))).drafts;
    const d = drafts.find((x: any) => x.id === r.draftId);
    expect(d.title).toBe("BMO: from a description");
    // The main model did not change: only the draft (and the import review beside it) was made.
    const after = tree(dir);
    for (const [f, h] of Object.entries(mainTree)) expect(after[f], f).toBe(h);
    const main = await ok(c.get("/api/state"));
    expect(main.elements.some((e: any) => e.id === "ledger-service")).toBe(false);
    const inDraft = await ok(c.at(`draft:${r.draftId}`).get("/api/state"));
    expect(inDraft.elements.some((e: any) => e.id === "ledger-service")).toBe(true);
  });

  it("a second run of the same task gets a free draft title", async () => {
    const { c } = app();
    const first = (await previewRun(c, BODY["describe-to-model"]!)).run.json();
    // The second answer must not collide with the first draft's objects only in the draft: main is unchanged, so it is accepted again.
    const second = (await previewRun(c, BODY["describe-to-model"]!)).run.json();
    expect(second.draftId).not.toBe(first.draftId);
    const titles = (await ok(c.get("/api/state"))).drafts.map((d: any) => d.title);
    expect(titles).toEqual(expect.arrayContaining(["BMO: from a description", "BMO: from a description (2)"]));
  });

  it("import-level (after a scan) and suggest-labels make drafts", async () => {
    const { dir, backend, c } = app();
    const early = await c.post("/api/bmo/preview", BODY["import-level"]);
    expect(early.status).toBe(422);
    expect(early.json().detail).toMatch(/Scan the code first/);
    await ok(c.post("/api/import/scan"));
    const lvl = await previewRun(c, BODY["import-level"]!);
    expect(lvl.pv.status, lvl.pv.text).toBe(200);
    expect(lvl.pv.json().files.map((f: any) => f.path)).toEqual(["sample_code/api/Dockerfile", "sample_code/docker-compose.yml", "sample_code/payments/package.json"]); // the demo's C2 manifests
    expect(lvl.run.status, lvl.run.text).toBe(200);
    const made = lvl.run.json();
    expect(made.draftId).toBeTruthy();
    expect((await ok(c.get("/api/state"))).drafts.find((d: any) => d.id === made.draftId).title).toBe("BMO: import C2");
    expect(backend.calls.map((x) => x.task)).toEqual(["import-level"]);

    // suggest-labels: the demo has relationships labelled "Uses".
    const rel = (await ok(c.get("/api/state"))).relationships.find((r: any) => r.description.toLowerCase() === "uses");
    const withLabels = fakeBackend({ "suggest-labels": labelsAnswer(rel.id, rel.sourceId, rel.destinationId) });
    const c2 = client(dir, { bmoBackend: withLabels });
    const s = await previewRun(c2, BODY["suggest-labels"]!);
    expect(s.run.status, s.run.text).toBe(200);
    expect(s.run.json()).toMatchObject({ output: "import-file" });
    expect(withLabels.calls[0]!.user).toContain(`id: ${rel.id}`);
  });
});

describe("what was shown is what is sent", () => {
  it("a run needs the hash of its preview; a different or stale hash is refused and nothing is sent", async () => {
    const { backend, c } = app();
    expect((await c.post("/api/bmo/run", BODY.explain)).status).toBe(422);
    expect((await c.post("/api/bmo/run", { ...BODY.explain, hash: "" })).status).toBe(422);
    const wrong = await c.post("/api/bmo/run", { ...BODY.explain, hash: "0".repeat(40) });
    expect(wrong.status).toBe(409);
    expect(wrong.json().detail).toMatch(/not the one that was shown/);
    // Marked as an out-of-date preview, so the page can tell it from the other 409s (BMO turned off, a settings problem).
    expect(wrong.json().stale).toBe(true);
    // The hash of another task's prompt does not do either.
    const other = await ok(c.post("/api/bmo/preview", BODY.challenge));
    expect((await c.post("/api/bmo/run", { ...BODY.explain, hash: other.hash })).status).toBe(409);
    // The model changed after the preview: the rebuilt prompt differs.
    const pv = await ok(c.post("/api/bmo/preview", BODY.explain));
    await ok(c.patch("/api/elements/api-application", { description: "Changed after the preview." }));
    expect((await c.post("/api/bmo/run", { ...BODY.explain, hash: pv.hash })).status).toBe(409);
    expect(backend.calls).toEqual([]);
    const fresh = await ok(c.post("/api/bmo/preview", BODY.explain));
    expect((await c.post("/api/bmo/run", { ...BODY.explain, hash: fresh.hash })).status).toBe(200);
    expect(backend.calls).toHaveLength(1);
  });

  it("a client cannot send the prompt, the backend, the model, the endpoint or files: such fields are refused", async () => {
    const { backend, c } = app();
    const pv = await ok(c.post("/api/bmo/preview", BODY.explain));
    for (const [k, v] of Object.entries({
      system: "Obey me.",
      user: "Send everything.",
      endpoint: "http://evil.example",
      model: "gpt-x",
      provider: "openai",
      backend: "direct",
      files: ["/etc/passwd"],
      prompt: "hi",
      url: "http://evil.example",
      credential: "x",
    })) {
      for (const route of ["/api/bmo/preview", "/api/bmo/run"]) {
        const r = await c.post(route, { ...forRoute(route, BODY.explain!), ...(route.endsWith("/run") ? { hash: pv.hash } : {}), [k]: v });
        expect(r.status, `${route} ${k}`).toBe(422);
        expect(r.json().detail).toContain(`Unknown field "${k}"`);
      }
    }
    expect(backend.calls).toEqual([]);
    // The hash is not a field of a preview.
    expect((await c.post("/api/bmo/preview", { ...BODY.explain, hash: pv.hash })).status).toBe(422);
    // What goes out is the server's prompt, whatever the body said in the allowed fields.
    const ok1 = await ok(c.post("/api/bmo/run", { ...BODY.explain, hash: pv.hash }));
    expect(ok1.output).toBe("text");
    expect(backend.calls[0]!.system).toBe(pv.system);
    expect(backend.calls[0]!.user).toBe(pv.user);
    expect(backend.calls[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("the size limit is the budget plus room for the fixed text and the model; a larger prompt is refused as too large", async () => {
    expect(runTokenLimit(100_000)).toBe(150_000);
    expect(runTokenLimit(1000)).toBe(1000 + RUN_HEADROOM_TOKENS);
    const { dir, c } = app();
    // A small budget still leaves room for the demo's fixed text and model.
    await ok(c.put("/api/bmo/settings", { passBudgetTokens: 1000 }));
    const small = await ok(c.post("/api/bmo/preview", BODY["describe-to-model"]!));
    expect(small.maxInputTokens).toBe(1000 + RUN_HEADROOM_TOKENS);
    expect(small.estTokens).toBeLessThan(small.maxInputTokens);
    // A model too large for the limit: the run is refused, nothing is sent.
    const f = path.join(dir, "architecture", "workspace.json");
    const ws = JSON.parse(fs.readFileSync(f, "utf-8"));
    const sys = ws.model.softwareSystems.find((s: any) => s.containers?.length);
    for (let i = 0; i < 400; i++) sys.containers.push({ id: `svc-${i}`, name: `Service ${i}`, description: `Part ${i} of the business. `.repeat(20), tags: "Element,Container" });
    fs.writeFileSync(f, JSON.stringify(ws));
    const body = BODY["describe-to-model"]!;
    const pv = await ok(c.post("/api/bmo/preview", body));
    expect(pv.estTokens).toBeGreaterThan(pv.maxInputTokens);
    const r = await c.post("/api/bmo/run", { ...body, hash: pv.hash });
    expect(r.status).toBe(413);
    expect(r.json().detail).toMatch(/tokens.*budget in the BMO settings/);
    // The description itself has a limit too.
    const big = await c.post("/api/bmo/preview", { task: "describe-to-model", text: "x".repeat(70 * 1024) });
    expect(big.status).toBe(413);
  });

  it("the code digest is cut at the lower of the intake's budget and the settings' budget", async () => {
    const { dir, c } = app();
    // More code than 1000 tokens: six services with a Dockerfile each.
    for (let i = 0; i < 6; i++) {
      const d = path.join(dir, "sample_code", `svc${i}`);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, "Dockerfile"), Array.from({ length: 40 }, (_, k) => `RUN echo "step ${k} of service ${i}"`).join("\n") + "\n");
    }
    await ok(c.post("/api/import/scan"));
    const full = await ok(c.post("/api/bmo/preview", BODY["import-level"]!));
    expect(full.user).not.toMatch(/did not fit in the budget/);
    await ok(c.put("/api/bmo/settings", { passBudgetTokens: 1000 }));
    const cut = await ok(c.post("/api/bmo/preview", BODY["import-level"]!));
    expect(cut.user).toMatch(/did not fit in the budget of 1000 tokens/);
    expect(cut.files.length).toBeLessThan(full.files.length);
    expect(cut.estTokens).toBeLessThan(full.estTokens);
  });
});

describe("failures", () => {
  it("an answer that cannot be used comes back as errors and the text to paste back; nothing is created or repaired", async () => {
    const bad = json({ ...JSON.parse(describeAnswer()), relationships: [{ source: "ledger-service", target: "database", description: "uses" }] });
    const { dir, c } = app({ answers: answers({ "describe-to-model": bad }) });
    const before = tree(dir);
    const { run } = await previewRun(c, BODY["describe-to-model"]!);
    expect(run.status).toBe(422);
    const b = run.json();
    expect(b.errors.length).toBeGreaterThan(0);
    expect(b.errors[0]).toEqual({ pointer: expect.any(String), message: expect.any(String) });
    expect(b.pasteBack).toContain("dp could not use your answer (task describe-to-model");
    expect(b.detail).toMatch(/could not be used/);
    expect(tree(dir)).toEqual(before);
    expect((await ok(c.get("/api/state"))).drafts).toEqual([]);
    expect(runLog(dir).map((l) => l.json.outcome)).toEqual(["invalid"]);

    const notJson = app({ answers: answers({ explain: "   " }) });
    const e = await previewRun(notJson.c, BODY.explain!);
    expect(e.run.status).toBe(422);
    expect(e.run.json().errors[0].message).toMatch(/empty/);
  });

  it("backend errors map to statuses, and are logged", async () => {
    const kinds: [BmoError["kind"], number][] = [
      ["backend", 502],
      ["refused", 422],
      ["off", 409],
      ["too-large", 413],
      ["invalid-output", 422],
    ];
    for (const [kind, status] of kinds) {
      const { dir, c } = app({
        answers: answers({
          explain: () => {
            throw new BmoError(kind, `It failed: ${kind}`);
          },
        }),
      });
      const { run } = await previewRun(c, BODY.explain!);
      expect(run.status, kind).toBe(status);
      expect(run.json().detail).toBe(`It failed: ${kind}`);
      expect(runLog(dir)[0]!.json).toMatchObject({ outcome: kind, error: `It failed: ${kind}` });
    }
  });
});

describe("who may run what", () => {
  it("a viewer may run text tasks; tasks that make a draft are refused with the handoff as the alternative", async () => {
    const { c } = app({ users: true });
    const view = await c.as("viewer");
    const arch = await c.as("architect");
    const { id } = await draftWithChange(arch);
    const onDraft = view.at(`draft:${id}`);
    expect((await previewRun(view, BODY.explain!)).run.status).toBe(200);
    expect((await previewRun(view, BODY.challenge!)).run.status).toBe(200);
    expect((await previewRun(onDraft, BODY["draft-summary"]!)).run.status).toBe(200);
    const st = await ok(view.get("/api/bmo"));
    expect(st.canRun).toEqual({ ok: true });
    expect(st.canAdmin).toBe(false);
    for (const t of ["describe-to-model", "import-level", "suggest-labels"]) {
      for (const route of ["/api/bmo/preview", "/api/bmo/run"]) {
        const r = await view.post(route, forRoute(route, BODY[t]!));
        expect(r.status, `${t} ${route}`).toBe(403);
        expect(r.json().detail).toMatch(/viewer/);
        expect(r.json().detail).toMatch(/coding agent/);
      }
    }
    const dec = await onDraft.post("/api/bmo/preview", BODY["decision-from-draft"]);
    expect(dec.status).toBe(403);
    expect(await ok(arch.get("/api/state"))).toMatchObject({ drafts: [expect.objectContaining({ id })] });
  });

  it("an engineer makes drafts, and writes a decision only into their own draft", async () => {
    const dir = demoDir();
    const backend = fakeBackend(answers());
    const c = client(dir, { bmoBackend: backend, users: [...ROLE_USERS, { name: "engineer2", role: "engineer" }] });
    const eng = await c.as("engineer");
    const eng2 = await c.as("engineer2");
    const made = (await previewRun(eng, BODY["describe-to-model"]!)).run;
    expect(made.status, made.text).toBe(200);
    const draft = (await ok(eng.get("/api/state"))).drafts.find((d: any) => d.id === made.json().draftId);
    expect(draft.author).toBe("engineer");
    expect(runLog(dir)[0]!.json.who).toBe("engineer");

    const mine = await draftWithChange(eng);
    const theirs = await draftWithChange(eng2, "Their draft");
    expect((await previewRun(mine.on, BODY["decision-from-draft"]!)).run.status).toBe(200);
    const denied = await previewRun(eng.at(`draft:${theirs.id}`), BODY["decision-from-draft"]!);
    expect(denied.pv.status).toBe(403);
    expect(denied.pv.json().detail).toMatch(/engineer2/);
    expect((await eng.at(`draft:${theirs.id}`).post("/api/bmo/run", { ...BODY["decision-from-draft"], hash: "x" })).status).toBe(403);
    // Reading another engineer's draft for a text summary is fine.
    expect((await previewRun(eng.at(`draft:${theirs.id}`), BODY["draft-summary"]!)).run.status).toBe(200);
    expect(await ok(eng2.at(`draft:${theirs.id}`).get("/api/decisions"))).toHaveLength(7);
    // An architect may write into any draft.
    const arch = await c.as("architect");
    expect((await previewRun(arch.at(`draft:${theirs.id}`), BODY["decision-from-draft"]!)).run.status).toBe(200);
  });

  it("allowedRoles restricts who runs BMO at all", async () => {
    const { c } = app({ users: true });
    const arch = await c.as("architect");
    const eng = await c.as("engineer");
    const view = await c.as("viewer");
    await ok(arch.put("/api/bmo/settings", { allowedRoles: ["architect", "engineer"] }));
    expect((await previewRun(eng, BODY.explain!)).run.status).toBe(200);
    expect((await previewRun(arch, BODY.explain!)).run.status).toBe(200);
    const r = await view.post("/api/bmo/preview", BODY.explain);
    expect(r.status).toBe(403);
    expect(r.json().detail).toBe("BMO is not open to the viewer role here.");
    expect((await view.post("/api/bmo/run", { ...BODY.explain, hash: "x" })).status).toBe(403);
    expect((await ok(view.get("/api/bmo"))).canRun).toEqual({ ok: false, reason: "BMO is not open to the viewer role here." });
    expect((await ok(eng.get("/api/bmo"))).canRun).toEqual({ ok: true });
    // Signed out: nothing.
    expect((await new Client("", {}, c.app).get("/api/bmo")).status).toBe(401);
  });

  it("on a read-only server text tasks run, and tasks that make or change a draft are refused", async () => {
    const dir = demoDir();
    // A draft made before the server went read-only.
    const writer = client(dir);
    const { id } = await draftWithChange(writer);
    const backend = fakeBackend(answers());
    const ro = client(dir, { bmoBackend: backend, readOnly: true });
    expect((await previewRun(ro, BODY.explain!)).run.status).toBe(200);
    expect((await previewRun(ro, BODY.challenge!)).run.status).toBe(200);
    expect((await previewRun(ro.at(`draft:${id}`), BODY["draft-summary"]!)).run.status).toBe(200);
    for (const t of ["describe-to-model", "import-level", "suggest-labels"]) {
      const r = await ro.post("/api/bmo/preview", BODY[t]);
      expect(r.status, t).toBe(403);
      expect(r.json().detail).toMatch(/read-only/);
    }
    const dec = await ro.at(`draft:${id}`).post("/api/bmo/preview", BODY["decision-from-draft"]);
    expect(dec.status).toBe(403);
    expect(dec.json().detail).toMatch(/read-only/);
    expect(backend.calls.map((x) => x.task)).toEqual(["explain", "challenge", "draft-summary"]);
    expect(await ok(ro.at(`draft:${id}`).get("/api/decisions"))).toHaveLength(7);
  });
});

describe("the direct backend through the server", () => {
  /** A stub fetch that answers like the Claude API and records what it was sent. */
  function stub(answer: (body: any) => { status: number; body: unknown }) {
    const calls: { url: string; headers: Record<string, string>; body: any; redirect?: string }[] = [];
    const fetch: Fetch = (url, init) => {
      const body = JSON.parse(init.body ?? "null");
      calls.push({ url, headers: init.headers, body, redirect: init.redirect });
      const r = answer(body);
      const text = JSON.stringify(r.body);
      return Promise.resolve({ ok: r.status < 300, status: r.status, json: () => Promise.resolve(r.body), text: () => Promise.resolve(text) });
    };
    return { fetch, calls };
  }
  const message = (text: string) => ({
    status: 200,
    body: { type: "message", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 1200, output_tokens: 80 } },
  });

  async function direct(opts: { users?: true; fetch: Fetch; settings?: Record<string, unknown> }) {
    const dir = demoDir();
    const c = client(dir, { fetch: opts.fetch, ...(opts.users ? { users: ROLE_USERS } : {}) });
    const arch = opts.users ? await c.as("architect") : c;
    await ok(arch.post("/api/credentials", { name: "anthropic-key", provider: "anthropic", value: KEY }));
    await ok(arch.put("/api/bmo/settings", { enabled: true, backend: "direct", provider: "anthropic", credential: "anthropic-key", pricePerMTok: { input: 5, output: 25 }, ...opts.settings }));
    return { dir, c, arch };
  }

  it("sends the shown prompt to the pinned host with the key, logs the run without the key or the prompt, and never leaks the key", async () => {
    const st = stub(() => message(TEXT));
    const { dir, c } = await direct({ fetch: st.fetch });
    const seen: string[] = [];
    seen.push((await c.get("/api/bmo")).text);
    const pv = await c.post("/api/bmo/preview", BODY.explain);
    seen.push(pv.text);
    expect(pv.json().destination).toEqual({ provider: "anthropic", model: "claude-opus-5-5", host: "api.anthropic.com" });
    expect(pv.json().estCost).toMatchObject({ output: 0 });
    expect(pv.json().estCost.input).toBeCloseTo((pv.json().estTokens * 5) / 1_000_000, 8);
    expect(st.calls).toHaveLength(0); // a preview sends nothing
    const run = await c.post("/api/bmo/run", { ...BODY.explain, hash: pv.json().hash });
    seen.push(run.text);
    expect(run.status, run.text).toBe(200);
    expect(run.json()).toMatchObject({ output: "text", text: TEXT, model: "claude-opus-5-5", usage: { inputTokens: 1200, outputTokens: 80 } });
    expect(run.json().estCost.total).toBeCloseTo((1200 * 5 + 80 * 25) / 1_000_000, 8);
    expect(st.calls).toHaveLength(1);
    const call = st.calls[0]!;
    expect(new URL(call.url).host).toBe("api.anthropic.com");
    expect(call.headers["x-api-key"]).toBe(KEY);
    expect(call.redirect).toBe("error");
    expect(call.body.system).toBe(pv.json().system);
    expect(call.body.messages[0].content).toBe(pv.json().user);
    // A client cannot redirect the run.
    const evil = await c.post("/api/bmo/run", { ...BODY.explain, hash: pv.json().hash, endpoint: "http://evil.example" });
    expect(evil.status).toBe(422);
    expect(st.calls).toHaveLength(1);

    const log = runLog(dir);
    expect(log).toHaveLength(1);
    expect(log[0]!.json).toMatchObject({ task: "explain", provider: "anthropic", model: "claude-opus-5-5", host: "api.anthropic.com", outcome: "ok", usage: { inputTokens: 1200, outputTokens: 80 } });
    for (const f of Object.values(tree(dir)).length ? [log[0]!.text] : []) {
      expect(f).not.toContain(KEY);
      expect(f).not.toContain(call.body.messages[0].content.slice(0, 80));
    }
    for (const text of seen) expect(text).not.toContain(KEY);
    // The key is only in the credentials store.
    for (const [f] of Object.entries(tree(dir))) {
      if (f === ".dp/credentials.json") continue;
      expect(fs.readFileSync(path.join(dir, f), "utf-8"), f).not.toContain(KEY);
    }
  });

  it("a settings change between the preview and the run (another model or provider) refuses the run and sends nothing", async () => {
    const st = stub(() => message(TEXT));
    const { c } = await direct({ fetch: st.fetch });
    const pv = await ok(c.post("/api/bmo/preview", BODY.explain));
    await ok(c.put("/api/bmo/settings", { enabled: true, backend: "direct", provider: "anthropic", credential: "anthropic-key", model: "claude-sonnet-5-5", pricePerMTok: { input: 5, output: 25 } }));
    const stale = await c.post("/api/bmo/run", { ...BODY.explain, hash: pv.hash });
    expect(stale.status).toBe(409);
    expect(stale.json().detail).toMatch(/not the one that was shown/);
    expect(st.calls).toHaveLength(0);
    const again = await ok(c.post("/api/bmo/preview", BODY.explain));
    expect(again.hash).not.toBe(pv.hash);
    expect(again.destination.model).toBe("claude-sonnet-5-5");
    expect((await c.post("/api/bmo/run", { ...BODY.explain, hash: again.hash })).status).toBe(200);
    expect(st.calls).toHaveLength(1);
  });

  it("keepPrompts puts the prompt in the log, still not the key", async () => {
    const st = stub(() => message(TEXT));
    const { dir, c } = await direct({ fetch: st.fetch, settings: { keepPrompts: true } });
    const pv = await ok(c.post("/api/bmo/preview", BODY.explain));
    await ok(c.post("/api/bmo/run", { ...BODY.explain, hash: pv.hash }));
    const l = runLog(dir)[0]!;
    expect(l.json.prompt).toEqual({ system: pv.system, user: pv.user });
    expect(l.text).not.toContain(KEY);
  });

  it("a refused credential is a 502 that does not echo the key; the failed run is logged", async () => {
    const st = stub(() => ({ status: 401, body: { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` } } }));
    const { dir, c } = await direct({ fetch: st.fetch });
    const { run } = await previewRun(c, BODY.explain!);
    expect(run.status).toBe(502);
    expect(run.text).not.toContain(KEY);
    expect(run.json().detail).toMatch(/refused the credential/);
    const l = runLog(dir)[0]!;
    expect(l.json.outcome).toBe("backend");
    expect(l.text).not.toContain(KEY);
  });

  it("a model answer that is not valid output is a 422 with errors; a model's text never picks files or URLs", async () => {
    const st = stub(() =>
      message(json({ ...JSON.parse(describeAnswer()), objects: [{ id: "x", type: "system", name: "X", evidence: user("n"), url: "http://evil.example/x", path: "/etc/passwd" }] })),
    );
    const { dir, c } = await direct({ fetch: st.fetch });
    const { run } = await previewRun(c, BODY["describe-to-model"]!);
    expect(run.status).toBe(422);
    expect(run.json().errors.length).toBeGreaterThan(0);
    expect(st.calls).toHaveLength(1); // no second request for anything the answer mentioned
    expect(new URL(st.calls[0]!.url).host).toBe("api.anthropic.com");
    expect((await ok(c.get("/api/state"))).drafts).toEqual([]);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("a signed-in engineer runs with the architect's key under the engineer's own role; the log names them", async () => {
    const st = stub(() => message(TEXT));
    const { dir, c } = await direct({ fetch: st.fetch, users: true });
    const eng = await c.as("engineer");
    const { run } = await previewRun(eng, BODY.explain!);
    expect(run.status, run.text).toBe(200);
    expect(runLog(dir)[0]!.json.who).toBe("engineer");
    const status = await ok(eng.get("/api/bmo"));
    expect(status.canRun).toEqual({ ok: true });
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(status.credential).toBe("anthropic-key");
  });
});

describe("a hub", () => {
  it("settings, credentials and the run log live in the hub folder; roles are per project", async () => {
    const dir = tmpDir();
    copyDemoHub(dir);
    writeTestUsers(dir, [...ROLE_USERS, { name: "engineer2", role: "engineer" }]);
    const backend: Backend & { calls: unknown[] } = fakeBackend(answers());
    const { app: hubApp } = createHubApp(dir, { bmoBackend: backend });
    const base = new Client("", {}, hubApp);
    const arch = await base.as("architect");
    const onPayments = (c: Client) => new Client("", {}, c.app, { ...c.headers, "X-DP-Project": "payments" });
    const onOnboarding = (c: Client) => new Client("", {}, c.app, { ...c.headers, "X-DP-Project": "onboarding" });
    const a = onPayments(arch);
    expect((await ok(a.get("/api/bmo"))).fake).toBe(true);
    const put = await a.put("/api/bmo/settings", { projects: { payments: { allowedRoles: ["architect"] } } });
    expect(put.status, put.text).toBe(200);
    expect(fs.existsSync(path.join(dir, ".dp", "bmo.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "payments", ".dp", "bmo.json"))).toBe(false);

    const eng = await base.as("engineer");
    // The role list of the project applies; the other project keeps the default.
    expect((await onPayments(eng).get("/api/bmo")).json().canRun).toEqual({ ok: false, reason: "BMO is not open to the engineer role here." });
    expect((await onOnboarding(eng).get("/api/bmo")).json().canRun).toEqual({ ok: true });
    expect((await onPayments(eng).post("/api/bmo/preview", BODY.explain)).status).toBe(403);
    // An engineer cannot change the settings.
    expect((await onPayments(eng).put("/api/bmo/settings", { enabled: true })).status).toBe(403);

    const ws = await ok(a.get("/api/state"));
    const diagram = ws.diagrams.find((d: any) => d.key.startsWith("containers-"))?.key ?? "landscape";
    const body = { task: "explain", diagram, lens: "architect" };
    const { run } = await previewRun(a, body);
    expect(run.status, run.text).toBe(200);
    expect(runLog(dir)).toHaveLength(1);
    expect(runLog(dir)[0]!.json).toMatchObject({ task: "explain", who: "architect" });
    expect(fs.existsSync(path.join(dir, "payments", ".dp", "bmo"))).toBe(false);
  });

  it("a project architect who is not an architect of the hub cannot change the shared settings", async () => {
    const dir = tmpDir();
    copyDemoHub(dir);
    writeTestUsers(dir, [
      { name: "boss", role: "architect" },
      { name: "lead", role: "engineer" },
    ]);
    const users = JSON.parse(fs.readFileSync(path.join(dir, ".dp", "users.json"), "utf-8"));
    for (const u of users.users ?? users) if (u.name === "lead") u.projects = { payments: "architect" };
    fs.writeFileSync(path.join(dir, ".dp", "users.json"), JSON.stringify(users));
    const { app: hubApp } = createHubApp(dir, { bmoBackend: fakeBackend(answers()) });
    const lead = await new Client("", {}, hubApp).as("lead");
    const onP = new Client("", {}, lead.app, { ...lead.headers, "X-DP-Project": "payments" });
    const r = await onP.put("/api/bmo/settings", { enabled: true });
    expect(r.status, r.text).toBe(403);
    expect(r.json().detail).toMatch(/whole hub/);
    expect((await ok(onP.get("/api/bmo"))).canAdmin).toBe(false);
  });
});

describe("the hub's own BMO settings routes", () => {
  function hub() {
    const dir = tmpDir();
    copyDemoHub(dir);
    writeTestUsers(dir, [
      { name: "boss", role: "architect" },
      { name: "lead", role: "engineer" },
      { name: "eng", role: "engineer" },
    ]);
    const users = JSON.parse(fs.readFileSync(path.join(dir, ".dp", "users.json"), "utf-8"));
    for (const u of users.users ?? users) if (u.name === "lead") u.projects = { payments: "architect" };
    fs.writeFileSync(path.join(dir, ".dp", "users.json"), JSON.stringify(users));
    const { app } = createHubApp(dir, { bmoBackend: fakeBackend(answers()) });
    return { dir, base: new Client("", {}, app) };
  }

  it("answer without a project header, from the hub's own settings and the caller's role in the hub", async () => {
    const { dir, base } = hub();
    expect((await base.get("/api/bmo")).status).toBe(401);
    const boss = await base.as("boss");
    const st = await ok(boss.get("/api/bmo"));
    expect(st).toMatchObject({ canAdmin: true, enabled: false });
    expect(st.settings).not.toBeNull();
    expect(st.tasks.length).toBeGreaterThan(0);
    const put = await boss.put("/api/bmo/settings", { enabled: true, backend: "direct", provider: "ollama", model: "qwen3:32b", projects: { payments: { allowedRoles: ["architect"] } } });
    expect(put.status, put.text).toBe(200);
    expect(put.json()).toMatchObject({ enabled: true, provider: "ollama", model: "qwen3:32b" });
    expect(fs.existsSync(path.join(dir, ".dp", "bmo.json"))).toBe(true);
    // The same file the projects read: a project sees the setting.
    const onP = new Client("", {}, boss.app, { ...boss.headers, "X-DP-Project": "onboarding" });
    expect((await ok(onP.get("/api/bmo"))).provider).toBe("ollama");
    // A bad body is refused with the field errors.
    const bad = await boss.put("/api/bmo/settings", { provider: "nope" });
    expect(bad.status).toBe(422);
  });

  it("an engineer, and an architect of one project only, can read the status but not change the settings or see them", async () => {
    const { base } = hub();
    for (const who of ["eng", "lead"]) {
      const c = await base.as(who);
      const st = await ok(c.get("/api/bmo"));
      expect(st.canAdmin, who).toBe(false);
      expect(st.settings, who).toBeNull();
      const r = await c.put("/api/bmo/settings", { enabled: true });
      expect(r.status, who).toBe(403);
    }
  });
});
