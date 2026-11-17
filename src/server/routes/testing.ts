/**
 * System testing routes (DEC-075): intercept points, the run log, paused calls, breakpoints and watches.
 *
 * Every route here refuses a browser that is not on this machine: the points listen on 127.0.0.1, and pausing
 * live traffic is not offered at a distance. The changing routes carry the "testing" action (auth.ts). The GET
 * routes return live data, so they ask for the same right themselves: the role check skips safe methods.
 */

import type { Context, Hono } from "hono";
import { isLoopback } from "../../core/hosts.js";
import type { ReleaseAction } from "../../shared/types.js";
import { decide } from "../auth.js";
import { HttpError, needStr, objBody, optStr, type Ctx } from "../routeContext.js";
import { TestingError } from "../testSession.js";

export function registerTesting(app: Hono, ctx: Ctx): void {
  const { testing, who, ok } = ctx;

  const local = (c: Context): void => {
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    let hostname = "";
    try {
      hostname = new URL(`http://${host}`).hostname;
    } catch {
      /* refused below */
    }
    if (!isLoopback(hostname)) throw new HttpError(403, "System testing works only in a browser on the machine that runs dp serve.");
  };
  /** The session's own errors as HTTP answers. */
  const run = async <T>(c: Context, fn: () => T | Promise<T>): Promise<T> => {
    local(c);
    try {
      return await fn();
    } catch (e) {
      if (e instanceof TestingError) throw new HttpError(e.status, e.message);
      throw e;
    }
  };
  /** For the GET routes: the right the changing routes get from the role check. */
  const allowed = (c: Context): void => {
    local(c);
    const no = decide("testing", who(c), "main");
    if (no) throw new HttpError(403, no);
  };
  const by = (c: Context): string | undefined => who(c).user?.name;

  app.get("/api/testing", (c) => {
    allowed(c);
    return c.json(testing.state());
  });

  // Long-poll: answers at once when the state is newer than `since`, otherwise when it changes or after `wait` seconds.
  app.get("/api/testing/events", async (c) => {
    allowed(c);
    const since = Number(c.req.query("since") ?? 0) || 0;
    const wait = Math.min(Math.max(Number(c.req.query("wait") ?? 25) || 0, 0), 25);
    return c.json(await testing.wait(since, wait * 1000));
  });

  app.get("/api/testing/calls/:id", (c) => {
    allowed(c);
    return run(c, () => c.json(testing.detail(c.req.param("id"))));
  });

  app.post("/api/testing/points", async (c) => {
    const b = await objBody(c);
    if (b.saved === true) return run(c, async () => c.json({ failed: await testing.startSaved() }));
    return run(c, async () => c.json(await testing.openPoint(needStr(b, "relationshipId"), optStr(b, "stageId") ?? undefined)));
  });

  app.delete("/api/testing/points/:id", (c) =>
    run(c, async () => {
      await testing.closePoint(c.req.param("id"));
      return ok(c);
    }),
  );

  app.put("/api/testing/breakpoints", async (c) => {
    const b = await objBody(c);
    return run(c, () => {
      testing.setBreakpoints(b.breakpoints);
      return ok(c);
    });
  });

  app.put("/api/testing/watches", async (c) => {
    const b = await objBody(c);
    return run(c, () => {
      testing.setWatches(b.watches);
      return ok(c);
    });
  });

  app.put("/api/testing/options", async (c) => {
    const b = await objBody(c);
    return run(c, () => {
      testing.setOptions(b);
      return ok(c);
    });
  });

  // Pause the next call (or the next reply) that arrives; {on: false} takes that back.
  app.post("/api/testing/step", async (c) => {
    const b = await objBody(c);
    return run(c, () => {
      testing.step(b.on !== false);
      return ok(c);
    });
  });

  app.post("/api/testing/calls/:id/release", async (c) => {
    const b = await objBody(c);
    return run(c, () => {
      testing.release(c.req.param("id"), b as unknown as ReleaseAction, by(c));
      return ok(c);
    });
  });

  app.post("/api/testing/release-all", (c) =>
    run(c, () => {
      testing.releaseAll(by(c));
      return ok(c);
    }),
  );

  app.post("/api/testing/calls/:id/resend", async (c) => {
    const b = await objBody(c);
    return run(c, () => c.json({ id: testing.resend(c.req.param("id"), b.request, by(c)) }));
  });

  app.delete("/api/testing/calls", (c) =>
    run(c, () => {
      testing.clearCalls();
      return ok(c);
    }),
  );
}
