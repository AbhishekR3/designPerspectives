/** The built browser UI: static files, and index.html for every other path. */

import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { staticDir } from "../../core/project.js";

export function registerUi(app: Hono): void {
  const ui = staticDir();
  if (ui) {
    app.get("/*", (c) => {
      let rel: string;
      try {
        rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
      } catch {
        return c.json({ detail: "Bad path." }, 400);
      }
      const f = path.resolve(ui, rel);
      const insideUi = f.startsWith(path.resolve(ui) + path.sep);
      if (rel && insideUi && fs.existsSync(f) && fs.statSync(f).isFile()) {
        const headers: Record<string, string> = { "Content-Type": contentType(f) };
        // Asset names contain a content hash, so they can be cached for good.
        if (rel.startsWith("assets/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
        return c.body(fs.readFileSync(f), 200, headers);
      }
      // The page must not be cached: after an upgrade it names new asset files, and a cached
      // copy would keep loading the old UI.
      return c.body(fs.readFileSync(path.join(ui, "index.html")), 200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
    });
  } else {
    app.get("/", (c) => c.json({ detail: "The browser UI is not built. Run `npm ci && npm run build` in ui/." }));
  }
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function contentType(f: string): string {
  return TYPES[path.extname(f).toLowerCase()] ?? "application/octet-stream";
}
