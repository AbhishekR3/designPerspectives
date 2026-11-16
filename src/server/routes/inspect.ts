/** Live UI inspector routes: open an element's live UI through the local proxy, and say what calls seen there mean in the model. */

import type { Hono } from "hono";
import { inspectCalls } from "../../core/inspect.js";
import { observe } from "../../core/traces.js";
import { isObj } from "../../core/json.js";
import { buildIndex, UI_URL_KEY } from "../../core/ops.js";
import type { ObservedCall } from "../../shared/types.js";
import { HttpError, needStr, objBody, type Ctx } from "../context.js";
import { isLoopback } from "../uiProxy.js";

export function registerInspect(app: Hono, ctx: Ctx): void {
  const { sel, uiProxies, traces, project } = ctx;

  app.post("/api/ui-proxy", async (c) => {
    const b = await objBody(c);
    // The proxy listens on 127.0.0.1, so only a browser on this machine can show it.
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    let hostname = "";
    try {
      hostname = new URL(`http://${host}`).hostname;
    } catch {
      /* refused below */
    }
    if (!isLoopback(hostname)) throw new HttpError(422, "The live UI inspector works only in a browser on the machine that runs dp serve.");
    const el = buildIndex(sel().src.workspace).el(needStr(b, "elementId"));
    const address = el.properties?.[UI_URL_KEY];
    if (!address) throw new HttpError(422, `"${el.name}" has no live UI address. Set one in its panel first.`);
    const url = await uiProxies.urlFor(address);
    return c.json({ url, origin: new URL(url).origin });
  });

  app.get("/api/traces", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 30) || 30, 1), 200);
    return c.json(traces.list(limit));
  });

  app.get("/api/traces/:id", (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f]{16,32}$/i.test(id)) throw new HttpError(422, "A trace ID is 32 hexadecimal characters.");
    const spans = traces.spans(id);
    if (!spans) throw new HttpError(404, `Trace ${id} is not in the trace files (yet).`);
    const ui = c.req.query("ui") || null;
    return c.json(observe(sel().src.workspace, project.codeRoot, spans, ui));
  });

  app.post("/api/inspect", async (c) => {
    const b = await objBody(c);
    const elementId = needStr(b, "elementId");
    if (!Array.isArray(b.calls)) throw new HttpError(422, '"calls" must be a list of {method, url}.');
    const calls: ObservedCall[] = b.calls.filter(isObj).map((x) => ({ method: String(x.method ?? "GET"), url: String(x.url ?? "") }));
    return c.json(inspectCalls(sel().src.workspace, elementId, calls));
  });
}
