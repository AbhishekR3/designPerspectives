/**
 * Job Scheduler (spec file 01 §5.3, ADR-0012): runs long work off the calling thread with progress and
 * cancellation. Two runners:
 *  - "worker": a Node worker thread loading a handler module by path (crash isolation, responsiveness);
 *  - "in-process": for small jobs and tests.
 * The Electron host may later swap the worker runner for `utilityProcess` behind the same API.
 */
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import type { JobHandler, JobProgress, JobStatus } from "@designperspectives/contracts";

export interface WorkerJobSpec {
  runner: "worker";
  /** Absolute path of an ESM module exporting the handler. */
  modulePath: string;
  exportName: string;
}
export interface InProcessJobSpec {
  runner: "in-process";
  handler: JobHandler;
}
export type JobSpec = WorkerJobSpec | InProcessJobSpec;

export type JobListener = (status: JobStatus) => void;

interface RunningJob {
  status: JobStatus;
  cancel: () => void;
  done: Promise<JobStatus>;
  output?: unknown;
}

export const WORKER_ENTRY = fileURLToPath(new URL("./worker-entry.mjs", import.meta.url));
export const DEMO_JOB_MODULE = fileURLToPath(new URL("./demo-job.mjs", import.meta.url));

export class JobScheduler {
  private readonly jobs = new Map<string, RunningJob>();
  private readonly listeners = new Set<JobListener>();
  private seq = 0;

  onUpdate(listener: JobListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(type: string, spec: JobSpec, input: unknown): string {
    const id = `job-${++this.seq}`;
    const status: JobStatus = { id, type, state: "running", progress: { fraction: 0 } };
    const job = spec.runner === "worker" ? this.startWorker(status, spec, input) : this.startInProcess(status, spec, input);
    this.jobs.set(id, job);
    this.emit(status);
    return id;
  }

  status(id: string): JobStatus | undefined {
    const j = this.jobs.get(id);
    return j ? { ...j.status } : undefined;
  }

  output(id: string): unknown {
    return this.jobs.get(id)?.output;
  }

  cancel(id: string): void {
    this.jobs.get(id)?.cancel();
  }

  wait(id: string): Promise<JobStatus> {
    const j = this.jobs.get(id);
    if (!j) return Promise.reject(new Error(`Unknown job ${id}`));
    return j.done;
  }

  private emit(status: JobStatus): void {
    for (const l of this.listeners) l({ ...status, progress: { ...status.progress } });
  }

  private progress(job: { status: JobStatus }, p: JobProgress): void {
    job.status.progress = p;
    this.emit(job.status);
  }

  private finish(job: RunningJob, state: JobStatus["state"], extra: { output?: unknown; error?: string }): JobStatus {
    job.status.state = state;
    if (extra.error !== undefined) job.status.error = extra.error;
    if (state === "succeeded") job.output = extra.output;
    this.emit(job.status);
    return { ...job.status };
  }

  private startWorker(status: JobStatus, spec: WorkerJobSpec, input: unknown): RunningJob {
    const worker = new Worker(WORKER_ENTRY);
    const job = { status, cancel: () => worker.postMessage({ type: "cancel" }) } as RunningJob;
    job.done = new Promise<JobStatus>((resolve) => {
      worker.on("message", (m: WorkerMessage) => {
        if (m.type === "progress") return this.progress(job, m.progress);
        const state = m.type === "done" ? "succeeded" : m.cancelled ? "cancelled" : "failed";
        resolve(this.finish(job, state, m.type === "done" ? { output: m.output } : { error: m.error }));
        void worker.terminate();
      });
      worker.on("error", (err) => resolve(this.finish(job, "failed", { error: String(err.message) })));
    });
    worker.postMessage({ type: "start", modulePath: spec.modulePath, exportName: spec.exportName, input });
    return job;
  }

  private startInProcess(status: JobStatus, spec: InProcessJobSpec, input: unknown): RunningJob {
    const controller = new AbortController();
    const job = { status, cancel: () => controller.abort() } as RunningJob;
    const ctx = { signal: controller.signal, reportProgress: (p: JobProgress) => this.progress(job, p) };
    job.done = Promise.resolve()
      .then(() => spec.handler.run(input, ctx))
      .then(
        (output) => this.finish(job, "succeeded", { output }),
        (err: unknown) => this.finish(job, controller.signal.aborted ? "cancelled" : "failed", { error: String(err) }),
      );
    return job;
  }
}

type WorkerMessage =
  | { type: "progress"; progress: JobProgress }
  | { type: "done"; output: unknown }
  | { type: "error"; error: string; cancelled: boolean };
