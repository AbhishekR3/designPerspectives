/** The default line shape of a diagram (sidecar `layouts[key].lineShape`). */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseSidecar, sidecarData } from "../src/core/sidecar.js";
import { client, demoDir, ok } from "./helpers.js";

const KEY = "containers-internet-banking-system";
const sidecarFile = (dir: string) => path.join(dir, "architecture", "designperspectives.json");
const readSidecar = (dir: string) => fs.readFileSync(sidecarFile(dir), "utf-8");

describe("diagram line shape", () => {
  test("is null until set, saved, returned and removed with null", async () => {
    const dir = demoDir();
    const before = readSidecar(dir);
    const c = client(dir);
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBeNull();

    await ok(c.put(`/api/diagrams/${KEY}/layout`, { lineShape: "straight" }));
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBe("straight");
    expect((await ok(c.get("/api/diagrams/landscape"))).lineShape).toBeNull();
    expect(JSON.parse(readSidecar(dir)).layouts[KEY].lineShape).toBe("straight");

    await ok(c.put(`/api/diagrams/${KEY}/layout`, { lineShape: null }));
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBeNull();
    expect(readSidecar(dir)).toBe(before);
  });

  test("rejects a value that is not a line shape and leaves the file alone", async () => {
    const dir = demoDir();
    const before = readSidecar(dir);
    const c = client(dir);
    for (const bad of ["zigzag", 3, true, ""]) {
      const r = await c.put(`/api/diagrams/${KEY}/layout`, { lineShape: bad });
      expect(r.status, String(bad)).toBe(422);
      expect(r.text).toMatch(/Line shape must be one of/);
    }
    expect((await c.put("/api/diagrams/nope/layout", { lineShape: "straight" })).status).toBe(404);
    expect(readSidecar(dir)).toBe(before);
  });

  test("is a normal undo step", async () => {
    const c = client();
    await ok(c.put(`/api/diagrams/${KEY}/layout`, { lineShape: "curved" }));
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBe("curved");
    await ok(c.post("/api/undo"));
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBeNull();
    await ok(c.post("/api/redo"));
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBe("curved");
  });

  test("a line's own shape is kept next to the diagram default", async () => {
    const c = client();
    const rid = "web-application--single-page-application";
    await ok(c.put(`/api/diagrams/${KEY}/layout`, { lineShape: "straight", edges: { [rid]: { routing: "smooth" } } }));
    const d = await ok(c.get(`/api/diagrams/${KEY}`));
    expect(d.lineShape).toBe("straight");
    expect(d.edges.find((e: any) => e.id === rid).layout.routing).toBe("smooth");
  });

  test("is written first in the layout, and files without it do not change", () => {
    const sc = parseSidecar(JSON.stringify({ version: 1, layouts: { landscape: { positions: { a: { y: 2, x: 1 } }, lineShape: "orthogonal", sizes: { a: { h: 5, w: 6 } } } } }));
    expect(sc.layouts.landscape!.lineShape).toBe("orthogonal");
    expect(Object.keys((sidecarData(sc).layouts as any).landscape)).toEqual(["lineShape", "sizes", "positions"]);
    // A value that is not a line shape is dropped on reading.
    const bad = parseSidecar(JSON.stringify({ version: 1, layouts: { landscape: { lineShape: "zigzag", positions: { a: { x: 1, y: 2 } } } } }));
    expect(bad.layouts.landscape).not.toHaveProperty("lineShape");
    // A layout with nothing but the default shape is kept; an empty one is not written.
    expect(sidecarData(parseSidecar(JSON.stringify({ version: 1, layouts: { landscape: { lineShape: "curved" } } }))).layouts).toEqual({ landscape: { lineShape: "curved" } });
    expect(sidecarData(parseSidecar(JSON.stringify({ version: 1, layouts: { landscape: {} } }))).layouts).toBeUndefined();
  });

  test("survives renaming an element and reopening the files", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.put(`/api/diagrams/${KEY}/layout`, { lineShape: "orthogonal" }));
    await ok(c.patch("/api/elements/database", { name: "Ledger store" }));
    expect((await ok(client(dir).get(`/api/diagrams/${KEY}`))).lineShape).toBe("orthogonal");
  });

  test("a draft that changes it shows as a layout change, and applying it sets the main model", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Straight lines" }));
    const d = c.at(`draft:${id}`);
    await ok(d.put(`/api/diagrams/${KEY}/layout`, { lineShape: "straight" }));
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBeNull();

    const changes = await ok(d.at(`draft:${id}`, "base").get("/api/changes"));
    expect(changes.summary.layout).toBeGreaterThanOrEqual(1);
    expect((await ok(d.get(`/api/diagrams/${KEY}`))).lineShape).toBe("straight");

    const preview = await ok(c.get(`/api/drafts/${id}/apply-preview`));
    expect(preview.conflicts ?? []).toEqual([]);
    await ok(c.post(`/api/drafts/${id}/apply`));
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBe("straight");
    expect(JSON.parse(readSidecar(dir)).layouts[KEY].lineShape).toBe("straight");
  });

  test("a draft that removes the default takes it off main when applied", async () => {
    const c = client();
    await ok(c.put(`/api/diagrams/${KEY}/layout`, { lineShape: "curved" }));
    const { id } = await ok(c.post("/api/drafts", { title: "Back to default" }));
    await ok(c.at(`draft:${id}`).put(`/api/diagrams/${KEY}/layout`, { lineShape: null }));
    await ok(c.post(`/api/drafts/${id}/apply`));
    expect((await ok(c.get(`/api/diagrams/${KEY}`))).lineShape).toBeNull();
  });
});
