/** Integration credentials (DEC-055): architects list, add, rotate, edit and remove them. Values are write-only. */

import type { Hono } from "hono";
import { CredentialStore } from "../../core/credentials.js";
import { objBody } from "../context.js";
import { needAdmin, type HubCtx } from "./hub.js";

export function registerCredentials(app: Hono, hub: HubCtx, secret?: string | null): void {
  const store = new CredentialStore(hub.dir, secret === undefined ? (process.env.DP_SECRET_KEY ?? null) : secret);
  const name = (n: string) => decodeURIComponent(n);

  app.get("/api/credentials", (c) => {
    needAdmin(hub, c);
    return c.json(store.list());
  });
  app.post("/api/credentials", async (c) => {
    needAdmin(hub, c);
    store.add(await objBody(c));
    return c.json({ ok: true });
  });
  app.put("/api/credentials/:name", async (c) => {
    needAdmin(hub, c);
    store.rotate(name(c.req.param("name")), (await objBody(c)).value);
    return c.json({ ok: true });
  });
  app.patch("/api/credentials/:name", async (c) => {
    needAdmin(hub, c);
    store.update(name(c.req.param("name")), await objBody(c));
    return c.json({ ok: true });
  });
  app.delete("/api/credentials/:name", (c) => {
    needAdmin(hub, c);
    store.remove(name(c.req.param("name")));
    return c.json({ ok: true });
  });
}
