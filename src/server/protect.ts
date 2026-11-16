/** Request protection: security headers, Host check (DNS rebinding), cross-site and cross-origin
 *  checks, body size limit and JSON-only bodies. Who may change what is decided in auth.ts. */

import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";

/** The names a browser uses for a server bound to a loopback address. */
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Largest request body the API accepts. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Content-Security-Policy for the built UI (no inline scripts; React sets inline styles). */
const CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "blob:"],
  fontSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'", "blob:"],
  // The live UI inspector frames the inspected app through its proxy on a local port (uiProxy.ts).
  frameSrc: ["http://127.0.0.1:*"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};

/** "host[:port]" as a URL with `protocol` would normalise it (lower case, default port dropped), or null. */
function normHost(host: string, protocol = "http:"): URL | null {
  try {
    return new URL(`${protocol}//${host}`);
  } catch {
    return null;
  }
}

/** The Host the request was sent to (the header; the request URL when there is none, as in tests). */
const requestHost = (c: Context): string => c.req.header("host") ?? new URL(c.req.url).host;

function isJsonType(ct: string | undefined): boolean {
  return (ct ?? "").split(";")[0]!.trim().toLowerCase() === "application/json";
}

/** Install the protection middleware, in order, on `app`. */
export function installProtection(app: Hono, opts: { allowedHosts?: string[] | null }): void {
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: CSP,
      xFrameOptions: "DENY",
      referrerPolicy: "no-referrer",
      strictTransportSecurity: false, // plain HTTP on a local port
    }),
  );

  // DNS rebinding: a page on evil.example whose name resolves to 127.0.0.1 sends Host: evil.example.
  const allowedHosts = opts.allowedHosts === undefined ? LOOPBACK_HOSTS : opts.allowedHosts;
  const hostSet = allowedHosts ? new Set(allowedHosts.map((h) => h.toLowerCase())) : null;
  // Names the user added (--allow-host): a proxy in front may rewrite Host, so the page's Origin
  // carries the public name while Host is the local one.
  const extraHosts = new Set([...(hostSet ?? [])].filter((h) => !LOOPBACK_HOSTS.includes(h) && !/^127\./.test(h)));
  if (hostSet) {
    app.use("*", async (c, next) => {
      const name = normHost(requestHost(c))?.hostname;
      if (!name || !hostSet.has(name)) return c.json({ detail: "This server only answers requests addressed to localhost." }, 403);
      await next();
    });
  }

  // Cross-site requests: another site's page must not change the model or the code folder.
  app.use("/api/*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      if (c.req.header("sec-fetch-site")?.toLowerCase() === "cross-site") {
        return c.json({ detail: "Cross-site requests are not allowed." }, 403);
      }
      const origin = c.req.header("origin");
      if (origin !== undefined) {
        // Same origin: the page's host:port is the one this request was sent to ("null" never is).
        let o: URL | null = null;
        try {
          o = new URL(origin);
        } catch {
          /* "null" or garbage */
        }
        const sameOrigin = o !== null && (o.protocol === "http:" || o.protocol === "https:") && (o.host === normHost(requestHost(c), o.protocol)?.host || extraHosts.has(o.hostname));
        if (!sameOrigin) return c.json({ detail: "Cross-origin requests are not allowed." }, 403);
      }
    }
    await next();
  });

  app.use("/api/*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ detail: "The request body is too large (over 5 MB)." }, 413) }));

  // A request body must be JSON. A web page can send a text/plain POST without asking first; it
  // cannot send application/json to another origin without a preflight, which this server refuses.
  app.use("/api/*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && c.req.raw.body) {
      const text = await c.req.text(); // cached: handlers read it again
      if (text.length && !isJsonType(c.req.header("content-type"))) {
        return c.json({ detail: "The request body must be JSON (Content-Type: application/json)." }, 415);
      }
    }
    await next();
  });
}
