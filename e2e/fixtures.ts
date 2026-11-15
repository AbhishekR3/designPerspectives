/** Browser-test fixtures: a real server on a free port with a fresh demo (or empty) project, and a page on it. */

import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { serve } from "@hono/node-server";
import { test as base, expect, type Page } from "@playwright/test";
import { hashPassword, usersPath, writeUsers } from "../src/core/users.js";
import { initProject, staticDir } from "../src/core/store.js";
import type { Role } from "../src/shared/types.js";
import { createApp } from "../src/server/app.js";

export interface Server {
  url: string;
  root: string;
}

/** Which project a test starts on: the demo (default) or an empty model. Opt in with `test.use({ project: "empty" })`. */
export type ProjectKind = "demo" | "empty";

export interface TestUser {
  name: string;
  role: Role;
}
/** One user of each role; `testPassword(name)` is the password of each. */
export const ROLE_USERS: TestUser[] = [
  { name: "architect", role: "architect" },
  { name: "engineer", role: "engineer" },
  { name: "viewer", role: "viewer" },
];
export const testPassword = (name: string) => `${name.toLowerCase()}-password`;
/** Fast hashes, so sign-in in a test takes milliseconds (the parameters are stored in each hash). */
const TEST_HASH = { N: 1024, r: 8, p: 1 };

/** Turn sign-in on for `root`: write `.dp/users.json`. */
export function writeTestUsers(root: string, users: TestUser[]): void {
  writeUsers(
    usersPath(root),
    users.map((u) => ({ name: u.name, role: u.role, password: hashPassword(testPassword(u.name), TEST_HASH) })),
  );
}

export interface UsersOption {
  list: TestUser[];
}

export const test = base.extend<{ server: Server; project: ProjectKind; readOnly: boolean; users: UsersOption | null }>({
  project: ["demo", { option: true }],
  readOnly: [false, { option: true }],
  /** Turn sign-in on with these users (null: off). Opt in with `test.use({ users: { list: ROLE_USERS } })`
   *  (wrapped, because Playwright reads an array given to `use` as a fixture/options pair). */
  users: [null, { option: true }],
  server: async ({ project, readOnly, users }, use, testInfo) => {
    testInfo.skip(staticDir() === null, "UI not built (run `npm ci && npm run build` in ui/)");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dp-e2e-"));
    initProject(root, { demo: project === "demo" });
    if (users) writeTestUsers(root, users.list);
    const app = createApp(root, { readOnly });
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

/** Fill in the sign-in page and wait for the app to open. */
export async function signIn(page: Page, name: string, password = testPassword(name)): Promise<void> {
  await page.getByTestId("sign-in-name").fill(name);
  await page.getByTestId("sign-in-password").fill(password);
  await page.getByTestId("sign-in-submit").click();
  await page.getByTestId("breadcrumb").waitFor();
}

/** An API call as a signed-in user, from the test itself (not from the page): { status, json }. */
export async function callAs(server: Server, name: string, method: string, p: string, opts: { body?: unknown; draft?: string } = {}): Promise<{ status: number; json: any }> {
  const login = await fetch(server.url + "api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password: testPassword(name) }) });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json", Cookie: cookie };
  if (opts.draft) headers["X-DP-Model"] = `draft:${opts.draft}`;
  const r = await fetch(server.url + "api" + p, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { status: r.status, json: await r.json() };
}

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
