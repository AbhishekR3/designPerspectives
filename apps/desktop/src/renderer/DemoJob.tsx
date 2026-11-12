/** Demo background job: start, watch progress, cancel. Runs in a worker thread of the host. */
import { useEffect, useState } from "react";
import type { JobStatus } from "@designperspectives/contracts";
import { dp } from "./dp.js";

const STEPS = 50;

export function DemoJob() {
  const [jobId, setJobId] = useState<string>();
  const [updates, setUpdates] = useState<Record<string, JobStatus>>({});
  const [error, setError] = useState<string>();

  useEffect(() => dp().onJobUpdate((s) => setUpdates((u) => ({ ...u, [s.id]: s }))), []);

  const status = jobId ? updates[jobId] : undefined;
  const running = status ? status.state === "running" || status.state === "queued" : jobId !== undefined;
  const percent = Math.round((status?.progress.fraction ?? 0) * 100);

  const start = async () => {
    setError(undefined);
    const r = await dp().startDemoJob(STEPS);
    if (r.ok) setJobId(r.value);
    else setError(r.error);
  };
  const cancel = async () => {
    if (!jobId) return;
    const r = await dp().cancelJob(jobId);
    if (!r.ok) setError(r.error);
  };

  return (
    <section className="demo-job" aria-labelledby="job-heading" data-testid="demo-job">
      <h2 id="job-heading">Demo background job</h2>
      <div className="job-buttons">
        <button type="button" onClick={start} disabled={running} data-testid="job-start">
          Start ({STEPS} steps)
        </button>
        <button type="button" onClick={cancel} disabled={!running} data-testid="job-cancel">
          Cancel
        </button>
      </div>
      <progress max={100} value={percent} aria-label="Demo job progress" data-testid="job-progress" />
      <div className="job-status" role="status" aria-live="polite" data-testid="job-status" data-state={status?.state ?? "idle"}>
        {status
          ? `${status.id}: ${status.state}${status.progress.message ? ` — ${status.progress.message}` : ""} (${percent}%)${status.error && status.state !== "cancelled" ? ` — ${status.error}` : ""}`
          : "Not started"}
      </div>
      {error ? <div className="error" role="alert">{error}</div> : null}
    </section>
  );
}
