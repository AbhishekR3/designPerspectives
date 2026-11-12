/**
 * IPC API v1 handlers (contract in ../shared/ipc.ts). One `ipcMain.handle` per request channel; every
 * handler validates its arguments and the sender, and returns a `Result` — nothing is thrown across the bridge.
 */
import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS, type ElementRow, type Result, type VersionInfo, type ViewPayload, type WorkspaceSummary } from "../shared/ipc.js";

/** The part of `ipcMain` used here (injected so the registration can be tested without Electron). */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void;
}

export interface IpcServices {
  version(): VersionInfo;
  openWorkspace(root?: string): Promise<WorkspaceSummary>;
  listElements(): ElementRow[];
  getView(viewId: string): Promise<ViewPayload>;
  startDemoJob(steps: number): string;
  cancelJob(jobId: string): void;
  /** Returns false when the IPC message does not come from the app's own window. */
  isTrustedSender(event: IpcMainInvokeEvent): boolean;
}

export const MAX_DEMO_STEPS = 10_000;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || v.length === 0 || v.length > 4096) throw new Error(`${what} must be a non-empty string`);
  return v;
}

function optStr(v: unknown, what: string): string | undefined {
  return v === undefined || v === null ? undefined : str(v, what);
}

function steps(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > MAX_DEMO_STEPS) {
    throw new Error(`steps must be an integer between 1 and ${MAX_DEMO_STEPS}`);
  }
  return v;
}

/** Registers all request channels; returns the list of channels registered. */
export function registerIpc(ipc: IpcMainLike, s: IpcServices): string[] {
  const channels: string[] = [];
  const handle = <T>(channel: string, fn: (...args: unknown[]) => T | Promise<T>): void => {
    channels.push(channel);
    ipc.handle(channel, async (event, ...args): Promise<Result<T>> => {
      try {
        if (!s.isTrustedSender(event)) return { ok: false, error: "IPC call from an untrusted sender" };
        return { ok: true, value: await fn(...args) };
      } catch (err) {
        return { ok: false, error: message(err) };
      }
    });
  };
  handle(IPC_CHANNELS.version, () => s.version());
  handle(IPC_CHANNELS.openWorkspace, (root) => s.openWorkspace(optStr(root, "root")));
  handle(IPC_CHANNELS.listElements, () => s.listElements());
  handle(IPC_CHANNELS.getView, (viewId) => s.getView(str(viewId, "viewId")));
  handle(IPC_CHANNELS.startDemoJob, (n) => s.startDemoJob(steps(n)));
  handle(IPC_CHANNELS.cancelJob, (jobId) => {
    s.cancelJob(str(jobId, "jobId"));
  });
  return channels;
}
