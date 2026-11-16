/** Linked work status from GitHub (DEC-059): one button refreshes every GitHub issue and pull request link of the shown version. */

import type { Hono } from "hono";
import { applyStates, fetchStates, gitHubLinks } from "../../core/workStatus.js";
import type { WorkRefresh } from "../../shared/types.js";
import type { Ctx } from "../context.js";

export function registerWork(app: Hono, ctx: Ctx): void {
  app.post("/api/work/refresh", async (c) => {
    const project = ctx.writable();
    project.reloadIfChanged();
    const urls = gitHubLinks(project.workspace);
    const cred = urls.length ? ctx.credentials.byProvider("github") : null;
    const states = urls.length ? await fetchStates(urls, cred?.value ?? null, ctx.fetch) : new Map();
    // Look on a copy first: nothing to change, nothing written (and no undo step).
    const would = applyStates(structuredClone(project.workspace), structuredClone(project.sidecar), states);
    const updated = would.length ? ctx.edit((ws, sc) => applyStates(ws, sc, states)) : [];
    const failed = [...states].filter(([, s]) => "error" in s).map(([url, s]) => ({ url, reason: (s as { error: string }).error }));
    return c.json({ checked: urls.length, updated, failed, usedCredential: cred?.name ?? null } satisfies WorkRefresh);
  });
}
