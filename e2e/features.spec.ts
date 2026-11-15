/** Browser tests of the stage A2 features. */

import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { api, clickEmptyCanvas, expect, node, openDiagram, test } from "./fixtures.js";

const rects = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".react-flow__node-c4")].map((n) => {
      const r = n.getBoundingClientRect();
      return { id: n.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );

async function dragBy(page: Page, x: number, y: number, dx: number, dy: number, steps = 6) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up();
}

const edgeOf = async (server: { url: string }, key: string, id: string) => (await api(server as any, `/diagrams/${key}`)).edges.find((e: any) => e.id === id);

test("new objects do not overlap", async ({ page }) => {
  await openDiagram(page, "landscape");
  for (let i = 0; i < 4; i++) {
    await page.getByTestId("add-person").click();
    await clickEmptyCanvas(page);
  }
  await page.waitForTimeout(500);
  const rs = await rects(page);
  expect(rs.length).toBeGreaterThanOrEqual(12);
  for (let i = 0; i < rs.length; i++) {
    for (const b of rs.slice(i + 1)) {
      const a = rs[i]!;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart, JSON.stringify([a, b])).toBe(true);
    }
  }
});

test("connect any side and line editing", async ({ page, server }) => {
  await openDiagram(page, "landscape");
  const src = node(page, "atm");
  const dst = node(page, "e-mail-system");
  await src.hover();
  await src.locator(".connect-handle.h-b").dragTo(dst.locator(".connect-handle.h-t"), { force: true });
  await expect(page.getByTestId("edge-panel")).toBeVisible();
  const rel = (await api(server, "/state")).relationships.filter((r: any) => r.sourceId === "atm" && r.destinationId === "e-mail-system");
  expect(rel.length, "relationship not created").toBeGreaterThan(0);
  const rid = rel[0].id;
  let edge = await edgeOf(server, "landscape", rid);
  expect(edge.layout.sourceAnchor).toEqual({ x: 0.5, y: 1 });
  expect(edge.layout.targetAnchor).toEqual({ x: 0.5, y: 0 });
  // drag the bend grip: the control point is stored
  const grip = (await page.getByTestId("grip-bend").boundingBox())!;
  await dragBy(page, grip.x + grip.width / 2, grip.y + grip.height / 2, 80, 40);
  await page.waitForTimeout(600);
  edge = await edgeOf(server, "landscape", rid);
  expect(edge.layout).toHaveProperty("control");
  // line shape and reset
  await page.getByTestId("line-shape").selectOption("orthogonal");
  await page.waitForTimeout(500);
  expect((await edgeOf(server, "landscape", rid)).layout.routing).toBe("orthogonal");
  await page.getByTestId("reset-line").click();
  await page.waitForTimeout(500);
  expect((await edgeOf(server, "landscape", rid)).layout).toEqual({});
});

test("resize and style a box", async ({ page, server }) => {
  await openDiagram(page, "landscape");
  await node(page, "atm").click();
  const handle = (await page.locator(".react-flow__resize-control.handle.bottom.right").boundingBox())!;
  await dragBy(page, handle.x + handle.width / 2, handle.y + handle.height / 2, 80, 50);
  await page.waitForTimeout(800);
  let n = (await api(server, "/diagrams/landscape")).nodes.find((x: any) => x.id === "atm");
  expect(n.size).toBeTruthy();
  expect(n.size.w).toBeGreaterThan(225 * 0.9);
  // style: open Appearance, pick a swatch
  await node(page, "atm").click();
  if (!(await page.getByLabel("Fill #dcfce7").isVisible())) {
    await page.getByTestId("sec-style").getByRole("button", { name: "Appearance" }).click();
  }
  await page.getByLabel("Fill #dcfce7").click();
  await page.waitForTimeout(600);
  n = (await api(server, "/diagrams/landscape")).nodes.find((x: any) => x.id === "atm");
  expect(n.style.fill).toBe("#dcfce7");
});

test("technology tags, notes, sensitive and symbol", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await node(page, "api-application").click();
  const tech = page.getByTestId("field-technology-input");
  await tech.fill("Redis");
  await tech.press("Enter");
  await page.waitForTimeout(600);
  const el = async () => (await api(server, "/state")).elements.find((e: any) => e.id === "api-application");
  let e = await el();
  expect(e.technologies).toContain("Redis");
  expect(e.technology.endsWith("Redis")).toBe(true);
  await page.getByTestId("field-arch").selectOption("cache");
  await page.waitForTimeout(500);
  expect((await el()).archType).toBe("cache");
  await expect(page.getByTestId("sensitive-api-application")).toContainText("confidential");
  const notes = page.getByTestId("field-notes");
  await notes.fill("Extra note");
  await notes.blur();
  await page.waitForTimeout(500);
  e = await el();
  expect(e.notes.endsWith("Extra note")).toBe(true);
});

test("connector detail, code and file edit", async ({ page, server }) => {
  await openDiagram(page, "containers-analytics-platform");
  await page.getByTestId("edge-event-stream--data-warehouse").dblclick();
  await expect(page.getByTestId("connector-panel")).toBeVisible();
  for (const name of ["Consume events", "Mask PII", "Load to warehouse"]) {
    await expect(page.locator(".react-flow__node-c4", { hasText: name })).toBeVisible();
  }
  // a stage that names a component opens that component's code
  await page.locator(".react-flow__node-c4", { hasText: "Mask PII" }).dblclick();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("code-panel")).toBeVisible();
  await page.getByTestId("node-file:sample_code/pipeline/mask_pii.py").dblclick();
  const editor = page.getByTestId("code-editor");
  await expect(editor).toBeVisible();
  await editor.fill((await editor.inputValue()) + "\n# edited in the browser\n");
  await page.getByTestId("code-save").click();
  await page.waitForTimeout(500);
  expect(fs.readFileSync(path.join(server.root, "sample_code/pipeline/mask_pii.py"), "utf-8")).toContain("# edited in the browser");
});

test("sidebars resize and levels indent", async ({ page }) => {
  const left = page.locator(".sidebar");
  let before = (await left.boundingBox())!.width;
  let r = (await page.getByTestId("resize-left").boundingBox())!;
  await dragBy(page, r.x + 2, r.y + 100, 120, 0, 5);
  expect((await left.boundingBox())!.width).toBeGreaterThan(before + 80);
  const right = page.locator(".panel");
  before = (await right.boundingBox())!.width;
  r = (await page.getByTestId("resize-right").boundingBox())!;
  await dragBy(page, r.x + 2, r.y + 100, -80, 0, 5);
  expect((await right.boundingBox())!.width).toBeGreaterThan(before + 50);
  // C-levels shown and each level indented further than the one above
  const tag = (k: string) => page.getByTestId(`level-${k}`);
  await expect(tag("containers-internet-banking-system")).toHaveText("C2");
  await expect(tag("components-api-application")).toHaveText("C3");
  await expect(tag("code-sign-in-controller")).toHaveText("C4");
  const x = async (k: string) => (await tag(k).boundingBox())!.x;
  expect(await x("containers-internet-banking-system")).toBeLessThan(await x("components-api-application"));
  expect(await x("components-api-application")).toBeLessThan(await x("code-sign-in-controller"));
});

test("undo and redo", async ({ page, server }) => {
  await openDiagram(page, "landscape");
  const names = async () => (await api(server, "/state")).elements.map((e: any) => e.name);
  await page.getByTestId("add-person").click();
  await page.waitForTimeout(500);
  expect(await names()).toContain("New person");
  await clickEmptyCanvas(page);
  await page.getByTestId("undo").click();
  await page.waitForTimeout(500);
  expect(await names()).not.toContain("New person");
  await page.getByTestId("redo").click();
  await page.waitForTimeout(500);
  expect(await names()).toContain("New person");
});

test("back and forward between diagrams", async ({ page }) => {
  await openDiagram(page, "landscape");
  await page.getByTestId("breadcrumb").waitFor();
  await page.evaluate(() => (window.location.hash = "#/d/containers-internet-banking-system"));
  await page.waitForTimeout(1000);
  expect(page.url()).toContain("containers-internet-banking-system");
  await page.getByTestId("nav-back").click();
  await page.waitForTimeout(1000);
  expect(page.url().endsWith("landscape")).toBe(true);
  await page.getByTestId("nav-forward").click();
  await page.waitForTimeout(1000);
  expect(page.url()).toContain("containers-internet-banking-system");
});

test("shortcuts: copy, paste, duplicate, undo; export menu", async ({ page, server }) => {
  await openDiagram(page, "landscape");
  const count = async () => (await api(server, "/state")).elements.length;
  const before = await count();
  await node(page, "internet-banking-system").click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(800);
  expect(await count()).toBe(before + 1);
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(800);
  expect(await count()).toBe(before + 2);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);
  expect(await count()).toBe(before + 1);
  await page.getByTestId("export").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-svg").click();
  expect((await download).suggestedFilename().endsWith(".svg")).toBe(true);
});

test("flow side panel shows step data", async ({ page }) => {
  await openDiagram(page, "flow-sign-in");
  await page.getByTestId("step-next").click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("step-example")).toContainText("alice");
});
