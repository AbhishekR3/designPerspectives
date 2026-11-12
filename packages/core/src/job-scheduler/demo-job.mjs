// Demo job used by tests and the desktop shell (Wave 0 scope item 7): counts to `steps`,
// reporting progress, and stops promptly when cancelled.
export const demoCountJob = {
  type: "demo.count",
  async run(input, ctx) {
    const steps = input?.steps ?? 10;
    const delayMs = input?.delayMs ?? 20;
    for (let i = 1; i <= steps; i++) {
      if (ctx.signal.aborted) throw new Error("cancelled");
      await new Promise((r) => setTimeout(r, delayMs));
      ctx.reportProgress({ fraction: i / steps, message: `step ${i} of ${steps}` });
    }
    return { counted: steps };
  },
};
