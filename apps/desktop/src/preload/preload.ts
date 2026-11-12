/**
 * Sandboxed preload: exposes IPC API v1 as `window.dp`. Bundled into one CommonJS file whose only
 * `require` is `electron`. Neither `ipcRenderer` nor IPC event objects ever reach the page.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { JobStatus } from "@designperspectives/contracts";
import { IPC_CHANNELS, type DesktopApi } from "../shared/ipc.js";

const api: DesktopApi = {
  version: () => ipcRenderer.invoke(IPC_CHANNELS.version),
  openWorkspace: (root) => ipcRenderer.invoke(IPC_CHANNELS.openWorkspace, root),
  listElements: () => ipcRenderer.invoke(IPC_CHANNELS.listElements),
  getView: (viewId) => ipcRenderer.invoke(IPC_CHANNELS.getView, viewId),
  startDemoJob: (steps) => ipcRenderer.invoke(IPC_CHANNELS.startDemoJob, steps),
  cancelJob: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.cancelJob, jobId),
  onJobUpdate: (listener) => {
    const wrapped = (_event: IpcRendererEvent, status: JobStatus): void => listener(status);
    ipcRenderer.on(IPC_CHANNELS.jobUpdate, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.jobUpdate, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("dp", api);
