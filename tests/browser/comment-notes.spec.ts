/** Notes on the diagram canvas: add one with a right-click, drag it, click it open (DEC-049, DEC-068). */

import type { Page } from "@playwright/test";
import { expect, openDiagram, test, waitUntil } from "./fixtures.js";

const KEY = "containers-internet-banking-system";

const threads = async (page: Page) => (await (await fetch(`${new URL(page.url()).origin}/api/comments`)).json()).threads as any[];

test("add a note at a point, move it, and open it from the canvas", async ({ page }) => {
  await openDiagram(page, KEY);
  const canvas = page.getByTestId("canvas");
  const box = (await canvas.boundingBox())!;
  // Empty canvas: the right edge, mid-height (floating bars and the palette cover the rest).
  await canvas.click({ button: "right", position: { x: box.width - 40, y: box.height / 2 } });
  await page.getByTestId("ctx-add-note").click();
  await page.getByTestId("new-note-kind-idea").click();
  await page.getByTestId("new-note-text").fill("Put a cache here");
  await page.getByTestId("new-note-name").fill("Sam");
  await page.getByTestId("new-note-submit").click();

  const note = page.locator("[data-testid^=note-]").first();
  await expect(note).toContainText("Put a cache here");
  await expect(note).toHaveAttribute("data-kind", "idea");
  const created = (await threads(page))[0];
  expect(created).toMatchObject({ kind: "idea", target: { type: "diagram", id: KEY }, author: "Sam" });
  expect(created.position).toBeTruthy();

  // A drag moves it and saves the new place; the note is still there after a reload of the comments.
  const before = (await note.boundingBox())!;
  await page.mouse.move(before.x + 20, before.y + 12);
  await page.mouse.down();
  await page.mouse.move(before.x - 80, before.y + 60, { steps: 6 });
  await page.mouse.up();
  await waitUntil(async () => {
    const p = (await threads(page))[0].position;
    return p.x !== created.position.x && p.y !== created.position.y;
  });
  const after = (await note.boundingBox())!;
  expect(Math.abs(after.x - (before.x - 100))).toBeLessThan(6);
  expect((await threads(page))[0]).toMatchObject({ author: "Sam", at: created.at });

  // A click without moving opens it in the panel.
  await note.click();
  await expect(page.locator(`[data-testid=thread-${created.id}]`)).toContainText("Put a cache here");

  // The keyboard: Enter opens, arrows move by 10.
  const pos = (await threads(page))[0].position;
  await note.focus();
  await page.keyboard.press("ArrowRight");
  await waitUntil(async () => (await threads(page))[0].position.x === pos.x + 10);
});

test("an unplaced diagram thread can be placed from the panel", async ({ page, server }) => {
  await fetch(`${server.url}api/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "question", target: { type: "diagram", id: KEY }, text: "Where is the cache?" }),
  });
  await openDiagram(page, KEY);
  await page.getByTestId("comments-open").click();
  await expect(page.locator("[data-testid^=note-]")).toHaveCount(0);
  await page.locator("[data-testid^=place-]").click();
  await expect(page.locator("[data-testid^=note-]")).toContainText("Where is the cache?");
  await page.locator("[data-testid^=unplace-]").click();
  await expect(page.locator("[data-testid^=note-]")).toHaveCount(0);
});
