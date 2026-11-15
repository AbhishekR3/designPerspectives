/** Browser-test fixtures: a real server on a free port with a fresh demo project, and a page on it. */

import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { serve } from "@hono/node-server";
import { test as base, expect, type Page } from "@playwright/test";
import { initProject, staticDir } from "../src/core/store.js";
import { createApp } from "../src/server/app.js";

export interface Server {
  url: string;
  root: string;
}

export const test = base.extend<{ server: Server }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a test needs from this destructuring, so it must stay an object pattern
  server: async ({}, use, testInfo) => {
    testInfo.skip(staticDir() === null, "UI not built (run `npm ci && npm run build` in ui/)");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dp-e2e-"));
    initProject(root, { demo: true });
    const app = createApp(root);
    const srv = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(s));
    });
    const { port } = srv.address() as AddressInfo;
    await use({ url: `http://127.0.0.1:${port}/`, root });
    // Browsers keep connections open; without this, close() can wait on them until the test times out.
    (srv as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise((r) => srv.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  },
  page: async ({ page, server }, use) => {
    // The app has its own dialogs; a native one (alert, confirm, prompt) is a regression.
    const native: string[] = [];
    page.on("dialog", (d) => {
      native.push(`${d.type()}: ${d.message()}`);
      void d.dismiss();
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(server.url);
    await use(page);
    expect(errors).toEqual([]);
    expect(native).toEqual([]);
  },
});

export { expect };

export async function api(server: Server, p: string): Promise<any> {
  const r = await fetch(server.url + "api" + p);
  return r.json();
}

/** Open a diagram by its key. Waits for the app's own first navigation (the lens's start diagram)
 *  first, so it cannot land after ours and replace it. */
export async function openDiagram(page: Page, key: string): Promise<void> {
  await page.getByTestId("breadcrumb").waitFor();
  await page.waitForFunction(() => /^#\/d\/./.test(window.location.hash));
  await page.evaluate((k) => (window.location.hash = `#/d/${k}`), key);
  await page.waitForFunction((k) => window.location.hash === `#/d/${k}`, key);
  await page.waitForTimeout(1200); // layout and fit-to-view settle
}

export const node = (page: Page, id: string) => page.getByTestId(`node-${id}`);

/** Click the canvas where no box is: the right edge, mid-height (floating bars and the palette cover the rest). */
export async function clickEmptyCanvas(page: Page): Promise<void> {
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByTestId("canvas").click({ position: { x: box.width - 15, y: box.height / 2 } });
}

/** Poll until `check` returns a truthy value (saves are asynchronous); return that value. */
export async function waitUntil<T>(check: () => Promise<T>, timeout = 5000): Promise<NonNullable<T>> {
  const end = Date.now() + timeout;
  for (;;) {
    let value: T | undefined;
    try {
      value = await check();
    } catch {
      value = undefined;
    }
    if (value) return value as NonNullable<T>;
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function center(page: Page, testId: string): Promise<{ x: number; y: number }> {
  const b = (await page.getByTestId(testId).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Confirm the in-app dialog that is open (Delete, Discard, OK ...); wait until it is gone. */
export async function confirmDialog(page: Page): Promise<void> {
  const dialog = page.getByTestId("dialog");
  await dialog.getByTestId("dialog-confirm").click();
  await expect(dialog).toHaveCount(0);
}

/** Type into the in-app prompt dialog that is open and confirm it. */
export async function fillDialog(page: Page, text: string): Promise<void> {
  await page.getByTestId("dialog-input").fill(text);
  await confirmDialog(page);
}
