import { describe, expect, it } from "vitest";
import type { JobStatus } from "@designperspectives/contracts";
import { DEMO_JOB_MODULE, JobScheduler } from "./index.js";

const demo = { runner: "worker" as const, modulePath: DEMO_JOB_MODULE, exportName: "demoCountJob" };

describe("JobScheduler (worker runner)", () => {
  it("runs the demo job in a worker thread and reports progress", async () => {
    const s = new JobScheduler();
    const updates: JobStatus[] = [];
    s.onUpdate((u) => updates.push(u));
    const id = s.start("demo.count", demo, { steps: 5, delayMs: 5 });
    const final = await s.wait(id);
    expect(final.state).toBe("succeeded");
    expect(s.output(id)).toEqual({ counted: 5 });
    const fractions = updates.map((u) => u.progress.fraction).filter((f) => f !== undefined);
    expect(fractions).toContain(1);
    expect(fractions).toEqual([...fractions].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("cancels a running job", async () => {
    const s = new JobScheduler();
    const id = s.start("demo.count", demo, { steps: 1000, delayMs: 10 });
    await new Promise((r) => setTimeout(r, 60));
    s.cancel(id);
    const final = await s.wait(id);
    expect(final.state).toBe("cancelled");
  });

  it("reports a missing handler as failed, not a crash", async () => {
    const s = new JobScheduler();
    const id = s.start("x", { ...demo, exportName: "nope" }, {});
    const final = await s.wait(id);
    expect(final.state).toBe("failed");
    expect(final.error).toMatch(/No job handler/);
  });
});

describe("JobScheduler (in-process runner)", () => {
  it("runs and cancels", async () => {
    const s = new JobScheduler();
    const handler = {
      type: "slow",
      run: (_: unknown, ctx: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          if (ctx.signal.aborted) return reject(new Error("aborted"));
          ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    };
    const id = s.start("slow", { runner: "in-process", handler }, {});
    s.cancel(id);
    expect((await s.wait(id)).state).toBe("cancelled");
  });
});
