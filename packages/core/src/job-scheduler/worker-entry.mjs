// Job Worker entry (ADR-0012). Plain ESM JavaScript so it runs unchanged from source and from dist.
// Protocol (parent → worker): { type: "start", modulePath, exportName, input } | { type: "cancel" }
// Protocol (worker → parent): { type: "progress", progress } | { type: "done", output } | { type: "error", error, cancelled }
import { parentPort } from "node:worker_threads";
import { pathToFileURL } from "node:url";

const controller = new AbortController();

async function start(msg) {
  try {
    const mod = await import(pathToFileURL(msg.modulePath).href);
    const handler = mod[msg.exportName] ?? mod.default?.[msg.exportName];
    if (!handler || typeof handler.run !== "function") throw new Error(`No job handler "${msg.exportName}" in ${msg.modulePath}`);
    const ctx = {
      signal: controller.signal,
      reportProgress: (progress) => parentPort.postMessage({ type: "progress", progress }),
    };
    const output = await handler.run(msg.input, ctx);
    parentPort.postMessage({ type: "done", output });
  } catch (err) {
    parentPort.postMessage({ type: "error", error: String(err?.message ?? err), cancelled: controller.signal.aborted });
  }
}

parentPort.on("message", (msg) => {
  if (msg.type === "start") void start(msg);
  if (msg.type === "cancel") controller.abort();
});
