/**
 * Electron main process (ADR-0003): a hardened window over the headless core. The page is sandboxed,
 * context-isolated and has no Node; it reaches the host only through IPC API v1 (../shared/ipc.ts).
 */
import { app, BrowserWindow, ipcMain, session, type IpcMainInvokeEvent } from "electron";
import { fileURLToPath } from "node:url";
import { CONTRACTS_VERSION } from "@designperspectives/contracts";
import { DEMO_JOB_MODULE, JobScheduler } from "@designperspectives/core";
import { LikeC4ModelPort } from "@designperspectives/plugin-model-likec4";
import { IPC_API_VERSION, IPC_CHANNELS } from "../shared/ipc.js";
import { registerIpc } from "./ipc.js";
import { CONTENT_SECURITY_POLICY, secureWebPreferences } from "./window-options.js";
import { WorkspaceService } from "./workspace.js";

const startedAt = performance.now();
const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const PRELOAD = here("../preload/preload.cjs");
const INDEX_HTML = here("../renderer/index.html");
const RENDERER_URL = new URL("../renderer/index.html", import.meta.url).href;
/** apps/desktop/out/main → repository root. */
const DEFAULT_WORKSPACE = process.env["DP_WORKSPACE"] || here("../../../../examples/internet-banking");

let win: BrowserWindow | undefined;
const workspace = new WorkspaceService({ port: new LikeC4ModelPort(), defaultRoot: DEFAULT_WORKSPACE });
const jobs = new JobScheduler();

jobs.onUpdate((status) => {
  if (win && !win.isDestroyed()) win.webContents.send(IPC_CHANNELS.jobUpdate, status);
});

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  return !!win && event.sender === win.webContents && event.senderFrame?.url === RENDERER_URL;
}

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-redirect", (event) => event.preventDefault());
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

app.on("window-all-closed", () => app.quit());

async function createWindow(): Promise<void> {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CONTENT_SECURITY_POLICY] } });
  });

  registerIpc(ipcMain, {
    version: () => ({
      app: app.getVersion(),
      contracts: CONTRACTS_VERSION,
      ipcApi: IPC_API_VERSION,
      electron: process.versions.electron ?? "unknown",
      node: process.versions.node,
    }),
    openWorkspace: async (root) => {
      const t0 = performance.now();
      const summary = await workspace.open(root);
      console.log(`[dp] workspace "${summary.name}" opened in ${Math.round(performance.now() - t0)} ms (${summary.root})`);
      return summary;
    },
    listElements: () => workspace.listElements(),
    getView: async (viewId) => {
      const t0 = performance.now();
      const payload = await workspace.getView(viewId);
      console.log(`[dp] view "${viewId}" laid out in ${Math.round(performance.now() - t0)} ms (${Math.round(performance.now() - startedAt)} ms after main start)`);
      return payload;
    },
    startDemoJob: (steps) => jobs.start("demo.count", { runner: "worker", modulePath: DEMO_JOB_MODULE, exportName: "demoCountJob" }, { steps, delayMs: 60 }),
    cancelJob: (jobId) => jobs.cancel(jobId),
    isTrustedSender,
  });

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "designPerspectives",
    backgroundColor: "#f7f7f5",
    webPreferences: secureWebPreferences(PRELOAD),
  });
  win.on("closed", () => {
    win = undefined;
  });
  await win.loadFile(INDEX_HTML);
  console.log(`[dp] window loaded ${Math.round(performance.now() - startedAt)} ms after main start`);
}

app.whenReady().then(createWindow, (err: unknown) => {
  console.error("[dp] failed to start", err);
  app.exit(1);
});
