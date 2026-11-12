// Desktop smoke test (Playwright `_electron`, no browser download needed). Run after `pnpm build`:
//   xvfb-run -a node apps/desktop/e2e/smoke.mjs
// Checks: no Node globals in the page, Container View title + key + cards, element list, demo job start/cancel.
// Saves screenshots to docs/wave-views/assets/wave-0/.
import { _electron } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(appDir, "../../docs/wave-views/assets/wave-0");
await mkdir(shots, { recursive: true });

const args = [appDir];
if (process.getuid?.() === 0) {
  // Chromium refuses to start as root with its OS-level sandbox; the `sandbox: true` web preference still applies.
  args.push("--no-sandbox");
  console.log("smoke: running as root, passing --no-sandbox (Chromium OS sandbox disabled for this run)");
}

function check(cond, what) {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`ok - ${what}`);
}

const t0 = performance.now();
const app = await _electron.launch({ args, env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" } });
try {
  app.process().stdout?.on("data", (d) => process.stdout.write(`[main] ${d}`));
  app.process().stderr?.on("data", (d) => {
    const s = String(d);
    if (!/dbus|Gtk|gpu|viz_main|ozone|libva/i.test(s)) process.stderr.write(`[main:err] ${s}`);
  });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    // CSP reports are expected: the inline-script probe below and `frame-ancestors` in the <meta> copy.
    if (m.type() === "error" && !/Content Security Policy/.test(m.text())) pageErrors.push(m.text());
  });

  const title = page.getByTestId("view-title");
  await title.waitFor({ timeout: 60_000 });
  await page.locator("[data-testid=c4-card]").first().waitFor({ timeout: 30_000 });
  const firstViewMs = Math.round(performance.now() - t0);
  console.log(`smoke: first view rendered ${firstViewMs} ms after launch`);

  const globals = await page.evaluate(() => ({ require: typeof require, process: typeof process, module: typeof module, Buffer: typeof Buffer }));
  check(Object.values(globals).every((t) => t === "undefined"), `renderer has no Node globals ${JSON.stringify(globals)}`);
  const bridge = await page.evaluate(() => Object.keys(window.dp).sort());
  check(bridge.join() === "cancelJob,getView,listElements,onJobUpdate,openWorkspace,startDemoJob,version", `window.dp exposes exactly API v1 (${bridge.join(", ")})`);
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox, webSecurity: p.webSecurity };
  });
  check(prefs.contextIsolation && !prefs.nodeIntegration && prefs.sandbox && prefs.webSecurity !== false, `live web preferences ${JSON.stringify(prefs)}`);
  // (Runtime.evaluate is exempt from CSP's eval check, so probe with an injected inline script instead.)
  const inlineRan = await page.evaluate(async () => {
    const s = document.createElement("script");
    s.textContent = "window.__dpInline = true";
    document.head.append(s);
    await new Promise((r) => setTimeout(r, 50));
    return window.__dpInline === true;
  });
  check(!inlineRan, "CSP blocks inline scripts in the renderer");

  const titleText = (await title.textContent()) ?? "";
  check(/^Container View/.test(titleText), `Container View title shown: "${titleText}"`);
  const keyEntries = await page.getByTestId("key-entry").allTextContents();
  check(keyEntries.some((k) => k === "Container"), `key lists "Container" (${keyEntries.join(" | ")})`);
  const rows = await page.getByTestId("element-row").count();
  check(rows >= 5, `element list has ${rows} rows (>= 5)`);
  const cards = await page.locator("[data-testid=c4-card]").count();
  const boundaries = await page.locator("[data-testid=c4-boundary]").count();
  const edges = await page.locator(".react-flow__edge").count();
  check(cards >= 3 && edges >= 2, `canvas shows ${cards} cards, ${boundaries} boundaries, ${edges} edges`);
  console.log(`smoke: status bar: ${await page.getByTestId("status-bar").textContent()}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, "desktop-container-view.png") });

  // Demo job: start, wait for some progress, cancel, wait for the final state.
  await page.getByTestId("job-start").click();
  const status = page.getByTestId("job-status");
  await page.waitForFunction(() => {
    const p = document.querySelector("[data-testid=job-progress]");
    return p && Number(p.getAttribute("value")) >= 10;
  });
  check((await status.getAttribute("data-state")) === "running", `job running: ${await status.textContent()}`);
  await page.getByTestId("job-cancel").click();
  await page.waitForFunction(() => document.querySelector("[data-testid=job-status]")?.getAttribute("data-state") !== "running", null, { timeout: 10_000 });
  const finalState = await status.getAttribute("data-state");
  check(finalState === "cancelled", `job final state "${finalState}": ${await status.textContent()}`);
  await page.getByTestId("demo-job").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(shots, "desktop-demo-job.png") });

  // Last, because Playwright then waits for the (blocked) navigation to finish.
  const urlBefore = page.url();
  await page.evaluate(() => {
    window.open("https://example.com/");
    location.href = "https://example.com/";
  });
  await page.waitForTimeout(500);
  const urlAfter = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getURL());
  check(urlAfter === urlBefore && app.windows().length === 1, "navigation and window.open are blocked");

  check(pageErrors.length === 0, `no renderer errors${pageErrors.length ? `: ${pageErrors.join(" / ")}` : ""}`);
  console.log("smoke: PASS");
} finally {
  await app.close().catch(() => undefined);
}
