/** Linked work settings and the hub's work list (DEC-087, DEC-088): the severity mapping in the sidecar, used by imports and the status refresh, and open work across projects. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanWorkSeverity, emptySidecar, parseSidecar, sidecarData, sameWorkSeverity } from "../../src/core/designPerspectivesFile.js";
import { parseWorkReport } from "../../src/core/workImport.js";
import { ADAPTERS } from "../../src/core/workStatus.js";
import { linkRest, type Conn } from "../../src/core/workTools/types.js";
import { copyDemoHub, createHubApp } from "../../src/server/hub.js";
import { setRole } from "../../src/core/users.js";
import { DEFAULT_WORK_SEVERITY, type WorkSeverityMaps } from "../../src/shared/types.js";
import { severityOf } from "../../src/shared/workLinks.js";
import { Client, client, demoDir, demoWs, ok, tmpDir, writeTestUsers } from "./helpers.js";

const sarif = (...results: unknown[]) => JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: "t" } }, results }] });
const result = (level: string, score?: number) => ({
  ruleId: `r-${level}-${score}`,
  level,
  message: { text: `${level} ${score ?? ""}` },
  ...(score === undefined ? {} : { properties: { "security-severity": String(score) } }),
});

describe("the severity mapping", () => {
  it("defaults when absent; names are trimmed and lower-cased; bad tables and scores are refused with a reason", () => {
    expect(cleanWorkSeverity(undefined)).toEqual(DEFAULT_WORK_SEVERITY);
    const m = cleanWorkSeverity({ jira: { " P1 ": "critical", P2: "high", Trivial: "" } });
    expect(m.jira).toEqual({ p1: "critical", p2: "high", trivial: "" });
    expect(m.sonar).toEqual(DEFAULT_WORK_SEVERITY.sonar); // tables left out keep the defaults
    for (const [bad, why] of [
      [{ jira: { p1: "urgent" } }, /critical, high, medium, low/],
      [{ jira: { P1: "high", p1: "low" } }, /twice/],
      [{ jira: "x" }, /must be an object/],
      [{ sarifScore: { critical: 5, high: 7, medium: 4 } }, /go down/],
      [{ sarifScore: { critical: 11 } }, /0 to 10/],
      [{ jira: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`p${i}`, "low"])) }, /more than 50/],
    ] as const)
      expect(() => cleanWorkSeverity(bad), JSON.stringify(bad)).toThrow(why);
    expect(severityOf(m.jira, "P1")).toBe("critical");
    expect(severityOf(m.jira, "trivial")).toBeUndefined(); // "" is none
    expect(severityOf(m.jira, "constructor")).toBeUndefined(); // not a name in the table
  });

  it("the sidecar leaves the default out, writes a change in a fixed order and reads it back", () => {
    const sc = emptySidecar();
    expect(sidecarData(sc)).not.toHaveProperty("work");
    sc.work.severity = { ...DEFAULT_WORK_SEVERITY, jira: { ...DEFAULT_WORK_SEVERITY.jira, blocker: "critical" } };
    const data = sidecarData(sc);
    expect(Object.keys(data)).toContain("work");
    expect(Object.keys((data.work as any).severity)).toEqual(["sarifScore", "sarifLevel", "codeQuality", "sonar", "jira"]);
    const back = parseSidecar(JSON.stringify(data));
    expect(back.work.severity.jira.blocker).toBe("critical");
    // The same names in another order are still the default: nothing written.
    const reordered = emptySidecar();
    reordered.work.severity.jira = Object.fromEntries(Object.entries(DEFAULT_WORK_SEVERITY.jira).reverse()) as WorkSeverityMaps["jira"];
    expect(sameWorkSeverity(reordered.work.severity, DEFAULT_WORK_SEVERITY)).toBe(true);
    expect(sidecarData(reordered)).not.toHaveProperty("work");
  });

  it("imports use it: SARIF levels and scores, Code Quality and Sonar names", () => {
    const ws = demoWs();
    const sev = (format: string, text: string, maps?: WorkSeverityMaps) => parseWorkReport(format, text, ws, maps).pushes.map((p) => p.item.severity);
    const report = sarif(result("error"), result("warning"), result("note"), result("warning", 9.5), result("warning", 6));
    expect(sev("sarif", report)).toEqual(["high", "medium", "low", "critical", "medium"]);
    const strict = cleanWorkSeverity({ sarifLevel: { error: "critical", warning: "high", note: "" }, sarifScore: { critical: 9.8, high: 5, medium: 2 } });
    expect(sev("sarif", report, strict)).toEqual(["critical", "high", undefined, "high", "high"]);
    const cq = JSON.stringify([{ description: "a", fingerprint: "1", severity: "major", location: { path: "x" } }]);
    expect(sev("gitlab-codequality", cq)).toEqual(["high"]);
    expect(sev("gitlab-codequality", cq, cleanWorkSeverity({ codeQuality: { major: "medium" } }))).toEqual(["medium"]);
    const sq = JSON.stringify({ issues: [{ key: "k", message: "m", severity: "MAJOR", component: "p:x" }] });
    expect(sev("sonar-issues", sq, cleanWorkSeverity({ sonar: { major: "low" } }))).toEqual(["low"]);
  });

  it("the status refresh uses it: Jira priorities (a site's own names too) and Sonar severities", () => {
    const read = (c: Conn, link: string, bodies: unknown[], maps: WorkSeverityMaps) => {
      const at = linkRest(link, c)!;
      const a = ADAPTERS[c.tool];
      return a.read(bodies, a.match(at.link, at.rest, c)!, maps);
    };
    const JIRA: Conn = { id: "j", tool: "jira", base: "https://jira.example.com", builtIn: false, auth: "bearer" };
    const issue = (priority: string) => [{ fields: { status: { name: "To Do", statusCategory: { key: "new" } }, priority: { name: priority } } }];
    const custom = cleanWorkSeverity({ jira: { "P1 - Outage": "critical", highest: "high" } });
    expect(read(JIRA, "https://jira.example.com/browse/AB-1", issue("P1 - Outage"), DEFAULT_WORK_SEVERITY).severity).toBeUndefined();
    expect(read(JIRA, "https://jira.example.com/browse/AB-1", issue("P1 - Outage"), custom).severity).toBe("critical");
    expect(read(JIRA, "https://jira.example.com/browse/AB-1", issue("Highest"), custom).severity).toBe("high");
    const SQ: Conn = { id: "s", tool: "sonar", base: "https://sonar.example.com", builtIn: false, auth: "bearer" };
    const link = "https://sonar.example.com/project/issues?id=p&issues=K1";
    const body = [{ issues: [{ key: "K1", status: "OPEN", severity: "MAJOR" }] }];
    expect(read(SQ, link, body, DEFAULT_WORK_SEVERITY).severity).toBe("high");
    expect(read(SQ, link, body, cleanWorkSeverity({ sonar: { major: "medium" } })).severity).toBe("medium");
  });
});

describe("PUT /api/work-settings", () => {
  it("changes the mapping in the model (one undo step), imports follow it, null puts back the defaults", async () => {
    const c = client();
    expect((await ok(c.get("/api/state"))).workSeverity).toEqual(DEFAULT_WORK_SEVERITY);
    await ok(c.put("/api/work-settings", { severity: { sarifLevel: { error: "critical", warning: "medium", note: "low", none: "low" } } }));
    expect((await ok(c.get("/api/state"))).workSeverity.sarifLevel.error).toBe("critical");
    const r = await ok(c.post("/api/work/import", { format: "sarif", report: sarif(result("error")) }));
    expect(r.added).toBe(1);
    const row = (await ok(c.get("/api/work"))).rows.find((x: any) => x.item.title === "error");
    expect(row.item.severity).toBe("critical");
    await ok(c.post("/api/undo"));
    await ok(c.post("/api/undo"));
    expect((await ok(c.get("/api/state"))).workSeverity).toEqual(DEFAULT_WORK_SEVERITY);
    await ok(c.put("/api/work-settings", { severity: { jira: { p1: "critical" } } }));
    await ok(c.put("/api/work-settings", { severity: null }));
    expect((await ok(c.get("/api/state"))).workSeverity).toEqual(DEFAULT_WORK_SEVERITY);
  });

  it("refuses a bad mapping with the reason, a body without severity, and a viewer", async () => {
    const c = client();
    const bad = await c.put("/api/work-settings", { severity: { sarifScore: { critical: 1, high: 2, medium: 3 } } });
    expect(bad.status).toBe(422);
    expect(bad.json().detail).toMatch(/go down/);
    expect((await c.put("/api/work-settings", {})).status).toBe(422);
    const dir = demoDir();
    writeTestUsers(dir);
    const viewer = await client(dir).as("viewer");
    expect((await viewer.put("/api/work-settings", { severity: null })).status).toBe(403);
  });

  it("is part of the model: a draft has its own mapping, shown as a change", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/drafts", { title: "Stricter" }));
    const d = c.at(`draft:${id}`, "base");
    await ok(d.put("/api/work-settings", { severity: { codeQuality: { major: "critical" } } }));
    expect((await ok(d.get("/api/state"))).workSeverity.codeQuality.major).toBe("critical");
    expect((await ok(c.get("/api/state"))).workSeverity.codeQuality.major).toBe("high");
    expect(JSON.stringify(await ok(d.get("/api/changes")))).toContain("Linked work settings");
  });
});

describe("GET /api/hub/work", () => {
  const on = (c: Client, project: string) => new Client("", {}, c.app, { ...c.headers, "X-DP-Project": project });

  it("a single project: its rows, each with the project", async () => {
    const c = client();
    await ok(c.put("/api/work/target", { target: { type: "project" }, work: [{ title: "Mine", url: "https://gitlab.com/g/p/-/issues/1" }] }));
    const list = await ok(c.get("/api/hub/work"));
    expect(list.projects).toHaveLength(1);
    const mine = list.rows.find((r: any) => r.item.title === "Mine");
    expect(mine).toMatchObject({ project: list.projects[0].id, tool: "gitlab", target: { type: "project" } });
    expect(list.projects[0].total).toBe(list.rows.length);
    expect(list.connections.map((x: any) => x.id)).toContain("gitlab");
  });

  it("a hub: every project the user may see, with open and total counts; a hidden project is left out", async () => {
    const dir = tmpDir();
    copyDemoHub(dir);
    writeTestUsers(dir);
    setRole(path.join(dir, ".dp", "users.json"), "viewer", "none", "payments");
    const c = new Client("", {}, createHubApp(dir).app);
    const arch = await c.as("architect");
    await ok(on(arch, "payments").put("/api/work/target", { target: { type: "element", id: "ledger-worker" }, work: [{ title: "Ledger bug", severity: "high" }] }));
    const all = await ok(arch.get("/api/hub/work"));
    expect(all.projects.map((p: any) => p.id)).toEqual(["onboarding", "payments", "catalog"]);
    const pay = all.projects.find((p: any) => p.id === "payments");
    expect(pay).toMatchObject({ name: "Payments", catalog: false, error: null, total: 3, open: 2 }); // the demo's two items on the Payments API (one done) and this one
    expect(all.rows.find((r: any) => r.item.title === "Ledger bug")).toMatchObject({ project: "payments", label: "Ledger Worker", targetKind: "container" });
    expect(all.rows.filter((r: any) => r.project === "onboarding").length).toBeGreaterThan(0); // the demo hub's own items
    const viewer = await c.as("viewer");
    const seen = await ok(viewer.get("/api/hub/work"));
    expect(seen.projects.map((p: any) => p.id)).toEqual(["onboarding", "catalog"]);
    expect(JSON.stringify(seen)).not.toContain("Ledger bug");
  });

  it("a project that cannot be loaded is listed with its error", async () => {
    const dir = tmpDir();
    copyDemoHub(dir);
    fs.writeFileSync(path.join(dir, "onboarding", "architecture", "workspace.json"), "{not json");
    const list = await ok(new Client("", {}, createHubApp(dir).app).get("/api/hub/work"));
    expect(list.projects.find((p: any) => p.id === "onboarding")).toMatchObject({ error: expect.any(String), total: 0 });
    expect(list.rows.every((r: any) => r.project !== "onboarding")).toBe(true);
  });
});
