import { describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { registerIpc, type IpcServices } from "./ipc.js";

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function setup(overrides: Partial<IpcServices> = {}) {
  const handlers = new Map<string, Listener>();
  const services: IpcServices = {
    version: () => ({ app: "0.1.0", contracts: "0.1.0", ipcApi: 1, electron: "x", node: "y" }),
    openWorkspace: async () => {
      throw new Error("boom");
    },
    listElements: () => [],
    getView: async () => {
      throw new Error("unused");
    },
    startDemoJob: (n) => `job-${n}`,
    cancelJob: () => undefined,
    isTrustedSender: () => true,
    ...overrides,
  };
  const channels = registerIpc({ handle: (c, l) => handlers.set(c, l) }, services);
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({} as IpcMainInvokeEvent, ...args);
  return { channels, call };
}

describe("IPC API v1 handlers", () => {
  it("registers one handler per request channel", () => {
    const { channels } = setup();
    const expected = Object.values(IPC_CHANNELS).filter((c) => c !== IPC_CHANNELS.jobUpdate);
    expect([...channels].sort()).toEqual([...expected].sort());
  });

  it("returns errors as Result values instead of throwing", async () => {
    const { call } = setup();
    expect(await call(IPC_CHANNELS.openWorkspace)).toEqual({ ok: false, error: "boom" });
    expect(await call(IPC_CHANNELS.startDemoJob, "50")).toMatchObject({ ok: false });
    expect(await call(IPC_CHANNELS.startDemoJob, 50)).toEqual({ ok: true, value: "job-50" });
    expect(await call(IPC_CHANNELS.getView, 42)).toMatchObject({ ok: false, error: expect.stringMatching(/viewId/) });
  });

  it("rejects calls from untrusted senders", async () => {
    const { call } = setup({ isTrustedSender: () => false });
    expect(await call(IPC_CHANNELS.version)).toMatchObject({ ok: false, error: expect.stringMatching(/untrusted/) });
  });
});
