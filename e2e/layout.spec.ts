/** Stage P5: nothing spills, overlaps or is cut off at the usual window sizes, with long names. Geometry, not pixels. */
import { type Locator, type Page } from "@playwright/test";
import { clickEmptyCanvas, expect, node, openDiagram, test, type Server } from "./fixtures.js";

type Box = { x: number; y: number; width: number; height: number };
const SIZES = [
  { width: 1024, height: 640 },
  { width: 1280, height: 760 },
  { width: 1440, height: 900 },
] as const;
const KEY = "containers-internet-banking-system";
const LONG = "Mobile application for retail and business customers on iOS and Android with offline support and many more words to fill the line";
const TOKEN = "x".repeat(80);

const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const byId = (page: Page, id: string) => page.getByTestId(id);

/** True when the two rectangles share no area (touching edges do not count; half a pixel of slack for rounding). */
export function noOverlap(a: Box, b: Box): boolean {
  const e = 0.5;
  return a.x + a.width <= b.x + e || b.x + b.width <= a.x + e || a.y + a.height <= b.y + e || b.y + b.height <= a.y + e;
}
const inside = (inner: Box, outer: Box, slack = 1) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;
const send = (server: Server, method: string, p: string, body?: unknown, draft?: string) =>
  fetch(server.url + "api" + p, {
    method,
    headers: { "Content-Type": "application/json", ...(draft ? { "X-DP-Model": `draft:${draft}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function openPalette(page: Page) {
  const t = byId(page, "palette-toggle");
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await expect(byId(page, "add-container")).toBeVisible();
}
async function openRightPanel(page: Page) {
  if (await byId(page, "panel-open").isVisible()) await byId(page, "panel-open").click();
  await expect(byId(page, "panel")).toBeVisible();
}
const noPageScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
const noScrollX = (l: Locator) => l.evaluate((e) => e.scrollWidth <= e.clientWidth);
const bars = (page: Page) => ({ nav: byId(page, "bar-nav"), actions: byId(page, "bar-actions"), tools: byId(page, "bar-tools"), flows: byId(page, "flows-menu") });
async function expectBarsApart(page: Page) {
  const boxes: [string, Box][] = [];
  for (const [k, l] of Object.entries(bars(page))) boxes.push([k, await box(l)]);
  const at = (i: number) => boxes[i]!;
  const wrap = await box(byId(page, "canvas-wrap"));
  for (const [k, b] of boxes) expect(inside(b, wrap), `${k} inside the canvas`).toBe(true);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(noOverlap(at(i)[1], at(j)[1]), `${at(i)[0]} / ${at(j)[0]}`).toBe(true);
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("the bars, the dock, the palette and the zoom buttons do not overlap", async ({ page }) => {
      await openDiagram(page, KEY);
      await node(page, "mobile-app").click();
      await openPalette(page);
      await byId(page, "dock-tags").click();
      await expect(byId(page, "dock")).toBeVisible();
      await page.waitForTimeout(300);
      await expectBarsApart(page);
      const wrap = await box(byId(page, "canvas-wrap"));
      const dock = await box(byId(page, "dock"));
      const palette = await box(byId(page, "palette"));
      expect(noOverlap(dock, await box(page.locator(".react-flow__controls"))), "dock / zoom buttons").toBe(true);
      expect(noOverlap(dock, palette), "dock / palette").toBe(true);
      expect(noOverlap(palette, await box(byId(page, "flows-menu"))), "palette / flows").toBe(true);
      expect(inside(dock, wrap), "dock inside the canvas").toBe(true);
      expect(inside(palette, wrap), "palette inside the canvas").toBe(true);
      // The quick bar above the selected box is whole: inside the canvas, not under a bar.
      const qb = await box(page.locator(".quick-bar"));
      expect(inside(qb, wrap), "quick bar inside the canvas").toBe(true);
      for (const [k, l] of Object.entries(bars(page))) expect(noOverlap(qb, await box(l)), `quick bar / ${k}`).toBe(true);
      expect(await noPageScroll(page)).toBe(true);
      expect(await noScrollX(page.locator(".sidebar"))).toBe(true);
      // With the right panel open the canvas column is at its narrowest.
      await openRightPanel(page);
      expect(await noScrollX(byId(page, "panel"))).toBe(true);
      expect(await noPageScroll(page)).toBe(true);
      expect((await box(byId(page, "canvas-wrap"))).width).toBeGreaterThanOrEqual(419);
      await page.waitForTimeout(300);
      await expectBarsApart(page);
    });

    test("fit-to-view leaves the palette, the bars, the dock and the zoom buttons free", async ({ page }) => {
      await openDiagram(page, KEY);
      await openPalette(page);
      await page.keyboard.press("Control+0");
      await page.waitForTimeout(500);
      const covered = [await box(byId(page, "palette")), await box(byId(page, "topbar")), await box(byId(page, "dock")), await box(page.locator(".react-flow__controls"))];
      const nodes = page.locator('[data-testid^="node-"], [data-testid="boundary"]');
      const n = await nodes.count();
      expect(n).toBeGreaterThan(5);
      for (let i = 0; i < n; i++) {
        const b = await box(nodes.nth(i));
        for (const c of covered) expect(noOverlap(b, c), `box ${i} is clear of the floating controls`).toBe(true);
      }
      // The zoom buttons' own fit button does the same.
      await page.locator(".react-flow__controls-fitview").click();
      await page.waitForTimeout(500);
      for (let i = 0; i < n; i++) expect(noOverlap(await box(nodes.nth(i)), covered[0]!), `box ${i} is clear of the palette`).toBe(true);
    });
  });
}

test.describe("long names", () => {
  test.use({ viewport: { width: 1280, height: 760 } });

  test("120 characters with spaces, and 80 without: the text stays in the box, the panel and the bars", async ({ page, server }) => {
    await send(server, "PATCH", "/elements/mobile-app", { name: LONG, description: `${LONG} ${TOKEN}` });
    await send(server, "PATCH", "/elements/web-application", { name: TOKEN });
    await send(server, "PATCH", "/elements/internet-banking-system", { name: LONG });
    const d = (await (await send(server, "GET", `/diagrams/${KEY}`)).json()) as { edges: { id: string; source: string }[] };
    const edge = d.edges[0]!;
    await send(server, "PATCH", `/relationships/${edge.id}`, { description: `${LONG} ${TOKEN}` });
    await page.reload();
    await openDiagram(page, KEY);
    for (const id of ["mobile-app", "web-application"]) {
      const n = await box(node(page, id));
      const parts = node(page, id).locator(".c4-content > *, .c4-title, .c4-name, .c4-desc");
      for (let i = 0; i < (await parts.count()); i++) expect(inside(await box(parts.nth(i)), n, 1.5), `${id}: text part ${i} inside the box`).toBe(true);
      expect(
        await node(page, id)
          .locator(".c4-name")
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true);
    }
    // The boundary label stays within the boundary.
    const boundary = await box(byId(page, "boundary"));
    expect(inside(await box(page.locator(".boundary-label")), boundary, 1.5)).toBe(true);
    expect(inside(await box(page.locator(".boundary-foot")), boundary, 1.5)).toBe(true);
    // An edge label with a long description keeps its maximum width and is clamped.
    const label = await box(byId(page, `edge-${edge.id}`));
    expect(label.width).toBeLessThanOrEqual(181);
    expect(label.height).toBeLessThan(120);
    // The breadcrumb stays inside its bar, and the bars do not overlap.
    expect(inside(await box(byId(page, "breadcrumb")), await box(byId(page, "bar-nav")), 1)).toBe(true);
    await expectBarsApart(page);
    // The panel has no horizontal scroll, for a box and for a line.
    await node(page, "mobile-app").click();
    await expect(byId(page, "object-panel")).toBeVisible();
    expect(await noScrollX(byId(page, "panel"))).toBe(true);
    const panel = await box(byId(page, "panel"));
    for (const sel of [".panel-kind", "[data-testid=field-name]", "[data-testid=field-description]"]) expect(inside(await box(page.locator(`.panel ${sel}`).first()), panel, 1)).toBe(true);
    await node(page, "web-application").click();
    expect(await noScrollX(byId(page, "panel"))).toBe(true);
    await clickEmptyCanvas(page);
    await byId(page, `edge-${edge.id}`).click();
    await expect(byId(page, "edge-panel")).toBeVisible();
    expect(await noScrollX(byId(page, "panel"))).toBe(true);
    expect(await noPageScroll(page)).toBe(true);
  });

  test("the sidebar truncates long names and keeps its marks and buttons", async ({ page, server }) => {
    await send(server, "PATCH", "/elements/internet-banking-system", { name: LONG });
    await send(server, "PATCH", "/elements/mainframe-banking-system", { name: TOKEN });
    await send(server, "POST", "/tag-groups", {
      name: `Group ${LONG}`,
      values: [
        { name: LONG, color: "#ff0000" },
        { name: TOKEN, color: "#00ff00" },
      ],
    });
    await page.reload();
    await openDiagram(page, KEY);
    const side = await box(page.locator(".sidebar"));
    expect(await noScrollX(page.locator(".sidebar"))).toBe(true);
    for (const row of [byId(page, `diagram-${KEY}`), byId(page, "diagram-containers-mainframe-banking-system")]) {
      expect(inside(await box(row), side, 1)).toBe(true);
      expect(
        await row
          .locator(".tree-label")
          .first()
          .evaluate((e) => getComputedStyle(e).textOverflow),
      ).toBe("ellipsis");
    }
    // The delete button of the tag group is still inside the sidebar.
    const del = page.locator(".sidebar").getByRole("button", { name: /^Delete Group/ });
    await del.scrollIntoViewIfNeeded();
    expect(inside(await box(del), side, 1)).toBe(true);
  });

  test("a draft with a 70-character title at 1024x640: the buttons stay in view, the strip is at most two rows", async ({ page, server }) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    const title = "Split the API into accounts and payments services next quarter ok!!";
    expect(title.length).toBe(67);
    const id = ((await (await send(server, "POST", "/drafts", { title: `${title}123` })).json()) as { id: string }).id;
    await page.reload();
    await openDiagram(page, KEY);
    await byId(page, `draft-${id}`).click();
    const strip = byId(page, "draft-banner");
    await expect(strip).toBeVisible();
    const view = { x: 0, y: 0, width: 1024, height: 640 };
    for (const t of ["draft-apply", "draft-discard", "draft-exit"]) {
      await expect(byId(page, t)).toBeVisible();
      expect(inside(await box(byId(page, t)), view, 0.5), `${t} is inside the window`).toBe(true);
    }
    const s = await box(strip);
    expect(s.height).toBeLessThanOrEqual(90);
    expect(inside(s, view, 0.5)).toBe(true);
    // Counts are compact chips on one line each; the full title is in the tooltip.
    for (const c of await byId(page, "change-summary").locator(".change-count").all()) expect((await box(c)).height).toBeLessThan(30);
    await expect(byId(page, "strip-title")).toHaveAttribute("title", /Draft: Split the API/);
    expect(await byId(page, "strip-title").evaluate((e) => getComputedStyle(e).textOverflow)).toBe("ellipsis");
    expect(await noPageScroll(page)).toBe(true);
    // The same at the narrowest canvas column (right panel open).
    await openRightPanel(page);
    const narrow = await box(strip);
    expect(narrow.height).toBeLessThanOrEqual(120);
    for (const t of ["draft-apply", "draft-discard", "draft-exit"]) expect(inside(await box(byId(page, t)), view, 0.5), `${t} is inside the window (narrow)`).toBe(true);
  });
});

test.describe("the quick bar", () => {
  test.use({ viewport: { width: 1024, height: 640 } });

  test("stays whole inside the canvas: below a box at the top, and moved in from the edge", async ({ page }) => {
    await openDiagram(page, KEY);
    const wrap = await box(byId(page, "canvas-wrap"));
    const check = async (what: string) => {
      await page.waitForTimeout(300);
      const qb = await box(page.locator(".quick-bar"));
      expect(inside(qb, wrap, 1), `${what}: inside the canvas`).toBe(true);
      for (const [k, l] of Object.entries(bars(page))) expect(noOverlap(qb, await box(l)), `${what}: quick bar / ${k}`).toBe(true);
    };
    // The box at the very top of the diagram: its bar cannot go above it, so it goes below.
    await node(page, "personal-banking-customer").click();
    await check("top box");
    // Slide the view (drag empty canvas) so the box is at the right edge, then at the left edge.
    for (const [startX, dx, edge] of [
      [wrap.x + 245, wrap.width * 0.5, "right"],
      [wrap.x + wrap.width * 0.92, -wrap.width * 0.95, "left"],
    ] as const) {
      const before = await box(node(page, "personal-banking-customer"));
      const y = wrap.y + wrap.height * 0.55;
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(startX + dx, y, { steps: 8 });
      await page.mouse.up();
      const after = await box(node(page, "personal-banking-customer"));
      expect(Math.abs(after.x - before.x), "the view was moved").toBeGreaterThan(80);
      await check(`box near the ${edge} edge`);
    }
  });
});

test.describe("panels and the palette", () => {
  test("the Add palette collapses to a button and remembers it", async ({ page }) => {
    await openDiagram(page, "landscape");
    await expect(byId(page, "palette-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(byId(page, "add-person")).toBeVisible();
    await byId(page, "palette-toggle").click();
    await expect(byId(page, "palette-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(byId(page, "add-person")).toHaveCount(0);
    expect((await box(byId(page, "palette"))).width).toBeLessThan(110);
    await page.reload();
    await expect(byId(page, "palette-toggle")).toHaveAttribute("aria-expanded", "false");
    await byId(page, "palette-toggle").click();
    await page.reload();
    await expect(byId(page, "palette-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(byId(page, "add-person")).toBeVisible();
  });

  test("the palette starts collapsed on a narrow canvas, and scrolls inside itself on a short window", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.reload();
    await openDiagram(page, KEY);
    await expect(byId(page, "palette-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: 1500, height: 520 });
    await page.reload();
    await openDiagram(page, KEY);
    await expect(byId(page, "palette-toggle")).toHaveAttribute("aria-expanded", "true");
    await byId(page, "dock-tags").click();
    const dock = await box(byId(page, "dock"));
    const palette = await box(byId(page, "palette"));
    expect(noOverlap(dock, palette)).toBe(true);
    expect(await page.locator(".palette-scroll").evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  });

  test("resizing the sidebars cannot shrink the canvas below 420 px; the window re-clamps them", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.reload();
    await openDiagram(page, KEY);
    const canvas = () => page.locator(".canvas-wrap").evaluate((e) => e.getBoundingClientRect().width);
    const drag = async (id: string, dx: number) => {
      const r = await box(byId(page, id));
      await page.mouse.move(r.x + 2, r.y + 200);
      await page.mouse.down();
      await page.mouse.move(r.x + 2 + dx, r.y + 200, { steps: 8 });
      await page.mouse.up();
    };
    await drag("resize-left", 600);
    expect(await canvas()).toBeGreaterThanOrEqual(419);
    await drag("resize-left", -600);
    await drag("resize-right", -600);
    expect(await canvas()).toBeGreaterThanOrEqual(419);
    await page.setViewportSize({ width: 1500, height: 760 });
    await page.waitForTimeout(200);
    await drag("resize-right", -500);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.waitForTimeout(300);
    expect(await canvas()).toBeGreaterThanOrEqual(419);
    expect(await noPageScroll(page)).toBe(true);
  });

  test("the right panel collapses to a rail with a marker, and opens again; the choice is remembered", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.reload();
    await openDiagram(page, KEY);
    await expect(byId(page, "panel")).toBeVisible();
    const before = (await box(byId(page, "canvas-wrap"))).width;
    await byId(page, "panel-close").click();
    await expect(byId(page, "panel")).toBeHidden();
    await expect(byId(page, "panel-rail")).toBeVisible();
    expect((await box(byId(page, "canvas-wrap"))).width).toBeGreaterThan(before + 200);
    await expect(byId(page, "panel-selected")).toHaveCount(0);
    // Selecting does not force it open, but marks the rail.
    await node(page, "mobile-app").click();
    await expect(byId(page, "panel")).toBeHidden();
    await expect(byId(page, "panel-selected")).toBeVisible();
    await page.reload();
    await expect(byId(page, "panel-rail")).toBeVisible();
    await byId(page, "panel-open").click();
    await expect(byId(page, "panel")).toBeVisible();
    await expect(byId(page, "panel-rail")).toHaveCount(0);
    await page.reload();
    await expect(byId(page, "panel")).toBeVisible();
  });

  test("a window under 1100 px starts with the right panel collapsed; under 760 px both panels are collapsed", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await page.reload();
    await openDiagram(page, KEY);
    await expect(byId(page, "panel-rail")).toBeVisible();
    await expect(byId(page, "panel")).toBeHidden();
    await page.setViewportSize({ width: 700, height: 600 });
    await page.waitForTimeout(300);
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(byId(page, "panel")).toBeHidden();
    await expect(byId(page, "canvas")).toBeVisible();
    expect(await noPageScroll(page)).toBe(true);
    expect((await box(byId(page, "canvas-wrap"))).width).toBeGreaterThan(600);
  });
});

test.describe("dialogs at 1024x640", () => {
  test.use({ viewport: { width: 1024, height: 640 } });
  const view = { x: 0, y: 0, width: 1024, height: 640 };

  test("the apply dialog fits the window with its buttons in view", async ({ page, server }) => {
    const id = ((await (await send(server, "POST", "/drafts", { title: "Many additions" })).json()) as { id: string }).id;
    for (let i = 0; i < 30; i++) await send(server, "POST", "/elements", { kind: "person", name: `Person ${i} ${LONG}` }, id);
    await page.reload();
    await openDiagram(page, KEY);
    await byId(page, `draft-${id}`).click();
    await byId(page, "draft-apply").click();
    const dialog = page.getByRole("dialog");
    await expect(byId(page, "apply-confirm")).toBeVisible();
    await expect(dialog.getByTestId("change-list")).toBeVisible();
    expect(inside(await box(dialog), view, 0.5)).toBe(true);
    expect(inside(await box(byId(page, "apply-confirm")), view, 0.5)).toBe(true);
    expect(await dialog.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true); // it scrolls inside
    expect(await noScrollX(dialog)).toBe(true);
    await page.keyboard.press("Escape");
  });

  test("Move to… fits the window with its buttons in view", async ({ page, server }) => {
    for (let i = 0; i < 25; i++) await send(server, "POST", "/elements", { kind: "softwareSystem", name: `System ${i} ${LONG}` });
    await page.reload();
    await openDiagram(page, KEY);
    await node(page, "mobile-app").click({ button: "right" });
    await byId(page, "ctx-move").click();
    const dialog = byId(page, "move-dialog");
    await expect(dialog).toBeVisible();
    expect(inside(await box(dialog), view, 0.5)).toBe(true);
    for (const t of ["move-confirm", "move-cancel"]) expect(inside(await box(byId(page, t)), view, 0.5), t).toBe(true);
    expect(await noScrollX(dialog)).toBe(true);
    await page.keyboard.press("Escape");
  });

  test("a dialog with a very long title wraps it and keeps its buttons", async ({ page, server }) => {
    await send(server, "PATCH", "/elements/mobile-app", { name: `${LONG} ${TOKEN}` });
    await page.reload();
    await openDiagram(page, KEY);
    await node(page, "mobile-app").click({ button: "right" });
    await byId(page, "ctx-move").click();
    const dialog = byId(page, "move-dialog");
    expect(inside(await box(dialog), view, 0.5)).toBe(true);
    expect(await noScrollX(dialog)).toBe(true);
    expect(inside(await box(byId(page, "move-cancel")), view, 0.5)).toBe(true);
    await page.keyboard.press("Escape");
  });
});

test.describe("feedback", () => {
  test("a thin loading bar shows while another diagram loads", async ({ page }) => {
    await openDiagram(page, "landscape");
    await expect(byId(page, "loading-bar")).toHaveCount(0);
    await page.route("**/api/diagrams/**", async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    await byId(page, `diagram-${KEY}`).click();
    await expect(byId(page, "loading-bar")).toBeVisible();
    expect(await box(byId(page, "loading-bar"))).toMatchObject({ height: 2 });
    await expect(byId(page, "loading-bar")).toHaveCount(0);
    await expect(byId(page, `crumb-${KEY}`)).toBeVisible();
  });

  test("a button that starts a request shows it is busy", async ({ page, server }) => {
    const id = ((await (await send(server, "POST", "/drafts", { title: "Busy" })).json()) as { id: string }).id;
    await send(server, "POST", "/elements", { kind: "person", name: "Someone" }, id);
    await page.reload();
    await openDiagram(page, "landscape");
    await byId(page, `draft-${id}`).click();
    await byId(page, "draft-apply").click();
    await expect(byId(page, "apply-confirm")).toBeEnabled();
    await page.route("**/api/drafts/*/apply", async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    await byId(page, "apply-confirm").click();
    await expect(byId(page, "apply-confirm")).toHaveAttribute("aria-busy", "true");
    await expect(byId(page, "toast-success")).toBeVisible();
  });
});

test.describe("details", () => {
  test("every icon-only button has a name and a tooltip, and the help card lists the shortcuts", async ({ page }) => {
    await openDiagram(page, KEY);
    await node(page, "mobile-app").click();
    await byId(page, "dock-tags").click();
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((b) => !/[A-Za-z0-9]/.test(b.textContent ?? "") && b.offsetParent !== null)
        .filter((b) => !b.getAttribute("aria-label") || !(b.getAttribute("title") || b.closest("[title]")))
        .map((b) => b.outerHTML.slice(0, 120)),
    );
    expect(bad).toEqual([]);
    await byId(page, "help").click();
    const rows = await byId(page, "help-shortcuts").locator(".key-row").allTextContents();
    const text = rows.join(" | ");
    for (const key of ["?", "K", "F2", "Delete", "Arrow", "Shift+click", "C", "V", "D", "Z", "Shift+F10", "Escape"]) expect(text, key).toContain(key);
    await page.keyboard.press("Escape");
    await expect(byId(page, "help-card")).toHaveCount(0);
  });
});

test.describe("the first-run card", () => {
  test.use({ project: "empty" });
  for (const width of [1280, 1440]) {
    test(`is centred in the free canvas area at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 });
      await page.reload();
      const card = byId(page, "empty-state");
      await expect(card).toBeVisible();
      await page.waitForTimeout(300);
      const c = await box(card);
      const wrap = await box(byId(page, "canvas-wrap"));
      const palette = await box(byId(page, "palette"));
      const controls = await box(page.locator(".react-flow__controls"));
      expect(noOverlap(c, palette)).toBe(true);
      expect(noOverlap(c, controls)).toBe(true);
      expect(noOverlap(c, await box(byId(page, "topbar")))).toBe(true);
      expect(inside(c, wrap)).toBe(true);
      const left = palette.x + palette.width;
      const right = controls.x;
      expect(Math.abs(c.x + c.width / 2 - (left + right) / 2)).toBeLessThan(40);
    });
  }
});

test.describe("collapsed palette", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("is only its button, not an empty box", async ({ page }) => {
    await expect(page.getByTestId("add-softwareSystem").or(page.getByTestId("add-container")).first()).toBeVisible();
    await page.getByTestId("palette-toggle").click();
    const b = await page.locator(".palette").boundingBox();
    expect(b!.height).toBeLessThan(50);
  });
});
