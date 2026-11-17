/** Stage A3: architecture characteristics (ratings 1-5) and cost line items with roll-up, linked work. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_CHARACTERISTICS, emptySidecar, makeLens, sidecarData } from "../../src/core/designPerspectivesFile.js";
import { errors } from "../../src/core/validate.js";
import { diagramCost } from "../../ui/src/diagramCost.js";
import { client, Client, demoDir, demoWs, element, ok } from "./helpers.js";

describe("characteristics and cost", () => {
  test("default characteristics and cost settings", async () => {
    const s = await ok(client().get("/api/state"));
    const names = s.characteristics.map((c: any) => c.name);
    for (const n of ["Scalability", "Deployability", "Testability"]) expect(names).toContain(n);
    expect(s.costSettings.currency).toBe("USD");
    expect(s.costSettings.bands[s.costSettings.bands.length - 1].max).toBeNull();
    expect(s.sections).toContain("characteristics");
    expect(s.sections).toContain("cost");
  });

  test("rate characteristics", async () => {
    const c = client();
    await ok(
      c.patch("/api/elements/web-application", {
        characteristics: [
          { name: "Scalability", rating: 4, driving: true, note: " stateless " },
          { name: "Testability", rating: "2" },
          { name: "Security" }, // nothing set: dropped
        ],
      }),
    );
    expect((await element(c, "web-application")).characteristics).toEqual([
      { name: "Scalability", rating: 4, driving: true, note: "stateless" },
      { name: "Testability", rating: 2 },
    ]);
    for (const rows of [[{ name: "Scalability", rating: 6 }], [{ name: "Scalability", rating: "high" }], [{ name: "Prettiness", rating: 3 }]]) {
      expect((await c.patch("/api/elements/web-application", { characteristics: rows })).status).toBe(422);
    }
  });

  test("cost items, total and roll-up", async () => {
    const c = client();
    await ok(c.patch("/api/elements/sign-in-controller", { cost: [{ item: "Licence", monthly: "12.5" }] }));
    const api = await element(c, "api-application");
    const own = api.cost.reduce((a: number, x: any) => a + x.monthly, 0);
    expect(api.costTotal).toBe(own);
    expect(api.costRollup).toBe(Math.round((own + 12.5) * 100) / 100);
    const system = await element(c, "internet-banking-system");
    expect(system.costTotal).toBe(0);
    expect(system.costRollup).toBeGreaterThanOrEqual(api.costRollup);
    expect((await c.patch("/api/elements/web-application", { cost: [{ item: "x", monthly: -1 }] })).status).toBe(422);
    expect((await c.patch("/api/elements/web-application", { cost: [{ item: "", monthly: 5 }] })).status).toBe(422);
    await ok(c.patch("/api/elements/web-application", { cost: [{ item: "", monthly: "" }] }));
    expect((await element(c, "web-application")).cost).toEqual([]);
  });

  test("rename and remove characteristics", async () => {
    const dir = demoDir();
    const c = new Client(dir);
    const defs = (await ok(c.get("/api/state"))).characteristics;
    const body: any[] = [];
    for (const d of defs) {
      if (d.name === "Testability") continue; // removed
      if (d.name === "Scalability") body.push({ name: "Scale", description: d.description, previousName: "Scalability" });
      else body.push(d);
    }
    body.push({ name: "Observability", description: "How well it can be monitored." });
    await ok(c.put("/api/characteristics", body));
    const names = (await element(c, "api-application")).characteristics.map((r: any) => r.name);
    expect(names).toContain("Scale");
    expect(names).not.toContain("Scalability");
    expect(names).not.toContain("Testability");
    const sc = JSON.parse(fs.readFileSync(path.join(dir, "architecture", "designperspectives.json"), "utf-8"));
    expect(sc.characteristics.some((x: any) => x.name === "Observability")).toBe(true);
    expect((await c.put("/api/characteristics", [{ name: "A" }, { name: "A" }])).status).toBe(422);
  });

  test("cost settings", async () => {
    const c = client();
    const s = (await ok(c.get("/api/state"))).costSettings;
    s.currency = "EUR";
    s.bands[1].max = 50;
    await ok(c.put("/api/cost-settings", s));
    expect((await ok(c.get("/api/state"))).costSettings.currency).toBe("EUR");
    const unordered = {
      currency: "EUR",
      bands: [
        { name: "A", max: 10, color: "#000000" },
        { name: "B", max: 5, color: "#000000" },
        { name: "C", color: "#000000" },
      ],
    };
    expect((await c.put("/api/cost-settings", unordered)).status).toBe(422);
    expect((await c.put("/api/cost-settings", { currency: "EUR", bands: [{ name: "A", max: 10, color: "#000000" }] })).status).toBe(422);
  });

  test("defaults are not written", () => {
    let data = sidecarData(emptySidecar());
    expect(data).not.toHaveProperty("characteristics");
    expect(data).not.toHaveProperty("cost");
    const sc = emptySidecar();
    sc.characteristics = DEFAULT_CHARACTERISTICS.slice(0, 2);
    sc.cost.currency = "GBP";
    data = sidecarData(sc);
    expect((data.characteristics as unknown[]).length).toBe(2);
    expect((data.cost as any).currency).toBe("GBP");
  });

  test("lens default overlay may be cost or a characteristic", () => {
    const ws = demoWs();
    const lensErrors = (lenses: ReturnType<typeof makeLens>[]) => {
      const sc = emptySidecar();
      sc.lenses = lenses;
      return errors(ws, sc).filter((e) => e.includes("Lens"));
    };
    expect(lensErrors([makeLens({ id: "a", name: "A", defaultOverlay: "@cost" }), makeLens({ id: "b", name: "B", defaultOverlay: "@char:Scalability" })])).toEqual([]);
    expect(lensErrors([makeLens({ id: "c", name: "C", defaultOverlay: "@char:Nope" })]).some((e) => e.includes("Nope"))).toBe(true);
  });

  test("create typed element with unique name", async () => {
    const c = client();
    const a = await ok(c.post("/api/elements", { kind: "container", parentId: "internet-banking-system", name: "Database", archType: "database", uniqueName: true }));
    const el = await element(c, a.id);
    expect([el.name, el.archType]).toEqual(["Database 2", "database"]);
    expect((await c.post("/api/elements", { kind: "container", parentId: "internet-banking-system", name: "Database" })).status).toBe(422);
  });

  test("work items on elements and relationships", async () => {
    const c = client();
    await ok(
      c.patch("/api/elements/web-application", {
        work: [
          { type: "security", title: "CVE in TLS library", url: "https://example.com/cve", status: "open", severity: "high" },
          { type: "pr", title: "", url: "https://example.com/pr/12", status: "done" },
          { type: "backlog", title: "", url: "" }, // empty: dropped
        ],
      }),
    );
    const el = await element(c, "web-application");
    expect(el.work[0].severity).toBe("high");
    expect(el.work[1].title).toBe("https://example.com/pr/12");
    expect(el.work).toHaveLength(2);
    for (const bad of [
      [{ type: "epic", title: "x" }],
      [{ type: "pr", title: "x", status: "merged" }],
      [{ type: "pr", title: "x", url: "javascript:alert(1)" }],
      [{ type: "pr", title: "x", severity: "urgent" }],
    ]) {
      expect((await c.patch("/api/elements/web-application", { work: bad })).status).toBe(422);
    }
    const rel = (await ok(c.get("/api/state"))).relationships[0];
    await ok(c.patch(`/api/relationships/${rel.id}`, { work: [{ type: "update", title: "Move to TLS 1.3" }] }));
    const rel2 = (await ok(c.get("/api/state"))).relationships.find((r: any) => r.id === rel.id);
    expect(rel2.work).toEqual([{ type: "update", title: "Move to TLS 1.3", status: "open" }]);
    expect(new Set((await ok(c.get("/api/state"))).enums.workTypes.map((t: any) => t.id))).toEqual(new Set(["security", "pr", "issue", "backlog", "update"]));
  });
});

describe("diagram cost", () => {
  test("a diagram shows the cost of its scope; costly boxes around it get their own figure", async () => {
    const c = client();
    const state = await ok(c.get("/api/state"));
    const land = await ok(c.get("/api/diagrams/landscape"));
    const ibs = land.nodes.find((n: any) => n.name === "Internet Banking System");
    const cont = await ok(c.get(`/api/diagrams/${ibs.drillKey}`));

    // The landscape has no scope: the boxes shown add up.
    const sum = Math.round(land.nodes.reduce((s: number, n: any) => s + (n.costRollup ?? 0), 0) * 100) / 100;
    expect(diagramCost(land, state.elements)).toEqual({ total: sum, outside: 0, outsideLabel: "" });

    // The containers of Internet Banking System add up to 8,690; the Mainframe's 9,500 is outside, not inside.
    const own = diagramCost(cont, state.elements);
    expect(own.total).toBe(8690);
    expect(own.outside).toBeGreaterThanOrEqual(9500);
    expect(own.outsideLabel).toBe("Outside this system");
    expect(cont.nodes.reduce((s: number, n: any) => s + (n.costRollup ?? 0), 0)).toBeGreaterThan(own.total);

    // The context diagram of the same system shows the same figure.
    const ctx = await ok(c.get(`/api/diagrams/context-${ibs.id}`));
    expect(diagramCost(ctx, state.elements).total).toBe(8690);

    // Components: a container's own roll-up, with its sibling containers as "outside".
    const api = cont.nodes.find((n: any) => n.name === "API Application");
    const comp = await ok(c.get(`/api/diagrams/${api.drillKey}`));
    const compCost = diagramCost(comp, state.elements);
    expect(compCost.total).toBe(api.costRollup);
    expect(compCost.outsideLabel).toBe("Outside this container");
  });
});
