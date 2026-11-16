/** Request protection: cross-site requests, DNS rebinding, body size and type, hidden code paths,
 *  security headers, and error messages. */

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_BYTES } from "../src/core/codeFiles.js";
import { Project, staticDir } from "../src/core/project.js";
import { client, demoDir, ok, type Client } from "./helpers.js";

const HIDDEN = "Hidden files and folders (names starting with a dot) cannot be opened here.";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A raw request to the app (no JSON helper). */
async function raw(c: Client, url: string, init: RequestInit = {}) {
  const r = await c.app.request(url, init);
  const text = await r.text();
  return { status: r.status, headers: r.headers, text, json: () => JSON.parse(text) };
}

const jsonPost = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

describe("cross-site requests", () => {
  it("refuses a body that is not JSON", async () => {
    const c = client();
    const r = await raw(c, "/api/drafts", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ title: "Sneaky" }) });
    expect(r.status).toBe(415);
    const form = await raw(c, "/api/drafts", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "title=Sneaky" });
    expect(form.status).toBe(415);
    expect((await ok(c.get("/api/state"))).drafts).toEqual([]);
    // A charset parameter is fine, and so is a POST without a body.
    await ok(raw(c, "/api/drafts", jsonPost({ title: "Fine" }, { "Content-Type": "application/json; charset=utf-8" })));
    expect((await raw(c, "/api/undo", { method: "POST" })).status).toBe(200);
  });

  it("refuses another origin, accepts the same origin", async () => {
    const c = client();
    expect((await raw(c, "/api/drafts", jsonPost({ title: "A" }, { Origin: "http://evil.example" }))).status).toBe(403);
    expect((await raw(c, "/api/drafts", jsonPost({ title: "A" }, { Origin: "http://localhost:3000" }))).status).toBe(403);
    expect((await raw(c, "/api/drafts", jsonPost({ title: "A" }, { Origin: "null" }))).status).toBe(403);
    expect((await raw(c, "/api/undo", { method: "POST", headers: { Origin: "http://evil.example" } })).status).toBe(403);
    expect((await ok(c.get("/api/state"))).drafts).toEqual([]);
    await ok(raw(c, "/api/drafts", jsonPost({ title: "A" }, { Origin: "http://localhost" })));
    await ok(raw(c, "http://127.0.0.1:8765/api/drafts", jsonPost({ title: "B" }, { Origin: "http://127.0.0.1:8765" })));
    // Reads are not checked (the browser keeps another origin from reading the answer).
    await ok(raw(c, "/api/state", { headers: { Origin: "http://evil.example" } }));
  });

  it("refuses Sec-Fetch-Site: cross-site", async () => {
    const c = client();
    expect((await raw(c, "/api/drafts", jsonPost({ title: "A" }, { "Sec-Fetch-Site": "cross-site" }))).status).toBe(403);
    await ok(raw(c, "/api/drafts", jsonPost({ title: "A" }, { "Sec-Fetch-Site": "same-origin" })));
  });

  it("answers only to loopback host names unless the check is off", async () => {
    const dir = demoDir();
    const c = client(dir);
    expect((await raw(c, "http://evil.example/api/health")).status).toBe(403);
    expect((await raw(c, "http://evil.example:8765/")).status).toBe(403);
    expect((await raw(c, "/api/health", { headers: { Host: "evil.example:8765" } })).status).toBe(403);
    await ok(raw(c, "/api/health"));
    await ok(raw(c, "http://127.0.0.1:8765/api/health"));
    await ok(raw(c, "http://[::1]:8765/api/health"));
    await ok(raw(c, "/api/health", { headers: { Host: "localhost:8765" } }));
    await ok(raw(client(dir, { allowedHosts: null }), "http://evil.example/api/health"));
    await ok(raw(client(dir, { allowedHosts: ["arch.internal"] }), "http://arch.internal/api/health"));
    // A proxy in front that rewrites Host: the page's Origin is the added public name.
    const proxied = client(dir, { allowedHosts: ["localhost", "127.0.0.1", "[::1]", "dp.example.com"] });
    await ok(raw(proxied, "/api/drafts", jsonPost({ title: "Via proxy" }, { Origin: "https://dp.example.com" })));
    expect((await raw(proxied, "/api/drafts", jsonPost({ title: "Other" }, { Origin: "https://evil.example" }))).status).toBe(403);
  });

  it("refuses a body over 5 MB", async () => {
    const c = client();
    const r = await raw(c, "/api/drafts", jsonPost({ title: "Big", description: "x".repeat(5 * 1024 * 1024 + 10) }));
    expect(r.status).toBe(413);
    expect(r.json().detail).toMatch(/too large/);
  });
});

describe("hidden code paths", () => {
  function setup() {
    const dir = demoDir();
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".git", "config"), "[core]\n");
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
    fs.mkdirSync(path.join(dir, "a", ".hidden"), { recursive: true });
    fs.writeFileSync(path.join(dir, "a", ".hidden", "x.py"), "x = 1\n");
    return { dir, c: client(dir) };
  }
  const PATHS = [".git/config", ".env", "a/.hidden/x.py", "./a/../.env"];

  it("cannot be read or written in the main model", async () => {
    const { dir, c } = setup();
    for (const p of PATHS) {
      const g = await c.get("/api/code/file", { path: p });
      expect(g.status, p).toBe(422);
      expect(g.json().detail).toBe(HIDDEN);
      const w = await c.put("/api/code/file", { path: p, content: "pwned" });
      expect(w.status, p).toBe(422);
      expect(w.json().detail).toBe(HIDDEN);
    }
    expect(fs.readFileSync(path.join(dir, ".env"), "utf-8")).toBe("SECRET=1\n");
    expect(fs.readFileSync(path.join(dir, ".git", "config"), "utf-8")).toBe("[core]\n");
    expect((await c.get("/api/code/tree", { path: ".git" })).status).toBe(422);
    const tree = (await ok(c.get("/api/code/tree", { path: "" }))).entries.map((e: any) => e.name);
    expect(tree).not.toContain(".git");
    expect(tree).not.toContain(".env");
  });

  it("cannot be reached through a symlink", async () => {
    const { dir, c } = setup();
    try {
      fs.symlinkSync(path.join(dir, ".env"), path.join(dir, "env-link"));
    } catch {
      return; // no symlinks on this system
    }
    const r = await c.get("/api/code/file", { path: "env-link" });
    expect(r.status).toBe(422);
    expect(r.json().detail).toBe(HIDDEN);
  });

  it("cannot be read, planned, removed or reverted in a draft", async () => {
    const { dir, c } = setup();
    const { id } = await ok(c.post("/api/drafts", { title: "Hidden" }));
    const d = c.at(`draft:${id}`);
    for (const p of PATHS) {
      for (const r of [
        await d.get("/api/code/file", { path: p }),
        await d.put("/api/code/file", { path: p, content: "pwned" }),
        await d.post("/api/code/file", { path: p, content: "pwned" }),
        await d.delete(`/api/code/file?path=${encodeURIComponent(p)}`),
        await d.post("/api/code/revert", { path: p }),
      ]) {
        expect(r.status, p).toBe(422);
        expect(r.json().detail).toBe(HIDDEN);
      }
    }
    expect((await d.post("/api/code/file", { path: "a/.github/workflows/x.yml", content: "" })).status).toBe(422);
    expect((await d.get("/api/code/tree", { path: "a/.hidden" })).status).toBe(422);
    expect((await ok(c.get("/api/state"))).drafts[0].plannedFiles).toBe(0);

    // A hand-edited plan that names a hidden file is ignored, and applying never writes it.
    const draftDir = path.join(dir, "architecture", "drafts", id);
    fs.writeFileSync(path.join(draftDir, "code.json"), JSON.stringify({ files: { ".env": { change: "changed", base: null }, "a/.hidden/x.py": { change: "deleted", base: null } } }));
    fs.mkdirSync(path.join(draftDir, "code"), { recursive: true });
    fs.writeFileSync(path.join(draftDir, "code", ".env"), "pwned");
    expect((await ok(c.get("/api/state"))).drafts[0].plannedFiles).toBe(0);
    await ok(c.post(`/api/drafts/${id}/apply`, { code: true }));
    expect(fs.readFileSync(path.join(dir, ".env"), "utf-8")).toBe("SECRET=1\n");
    expect(fs.existsSync(path.join(dir, "a", ".hidden", "x.py"))).toBe(true);
  });

  it("mapped to a component just finds no files", async () => {
    const { c } = setup();
    await ok(c.patch("/api/elements/accounts-summary-controller", { codePaths: [".git", ".env", "a"] }));
    const d = await ok(c.get("/api/diagrams/code-accounts-summary-controller"));
    expect(d.nodes).toEqual([]);
    expect(d.code.missing).toEqual([".git", ".env"]);
  });
});

describe("code file size", () => {
  it("refuses to save a file too large to open again", async () => {
    const dir = demoDir();
    const c = client(dir);
    const rel = "sample_code/api/accounts.py";
    const before = fs.readFileSync(path.join(dir, rel), "utf-8");
    const big = "x".repeat(MAX_BYTES + 1);
    const r = await c.put("/api/code/file", { path: rel, content: big });
    expect(r.status).toBe(422);
    expect(r.json().detail).toMatch(/too large/);
    expect(fs.readFileSync(path.join(dir, rel), "utf-8")).toBe(before);
    const { id } = await ok(c.post("/api/drafts", { title: "Big" }));
    const d = c.at(`draft:${id}`);
    expect((await d.put("/api/code/file", { path: rel, content: big })).status).toBe(422);
    expect((await d.post("/api/code/file", { path: "sample_code/big.py", content: big })).status).toBe(422);
    await ok(d.put("/api/code/file", { path: rel, content: "x".repeat(MAX_BYTES) }));
  });
});

describe("responses", () => {
  it("carry security headers", async () => {
    const c = client();
    const pages = ["/api/health", "/api/nothing-here"];
    if (staticDir()) pages.push("/", "/some/route");
    for (const p of pages) {
      const r = await raw(c, p);
      const csp = r.headers.get("content-security-policy") ?? "";
      expect(csp, p).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self';");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(r.headers.get("x-frame-options")).toBe("DENY");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    }
    // Refusals carry them too.
    expect((await raw(c, "http://evil.example/")).headers.get("x-frame-options")).toBe("DENY");
  });

  it("answer a malformed static path with 400", async () => {
    if (!staticDir()) return;
    const c = client();
    expect((await raw(c, "/%E0%A4%A")).status).toBe(400);
    expect((await raw(c, "/assets/%")).status).toBe(400);
  });

  it("hide the details of unexpected errors", async () => {
    const c = client();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Project.prototype, "edit").mockImplementation(() => {
      throw new Error("secret detail /home/someone/project");
    });
    const r = await c.patch("/api/workspace", { name: "X" });
    expect(r.status).toBe(500);
    expect(r.json()).toEqual({ detail: "Internal error. See the server log." });
    expect(log).toHaveBeenCalled();
    expect(String(log.mock.calls[0]![0])).toContain("secret detail");
  });
});

describe("dp serve --host", () => {
  it("keeps the host check for loopback addresses and turns it off otherwise", async () => {
    const { allowedHostsFor } = await import("../src/cli.js");
    expect(allowedHostsFor("127.0.0.1")).toEqual(["localhost", "127.0.0.1", "[::1]"]);
    expect(allowedHostsFor("localhost")).toEqual(["localhost", "127.0.0.1", "[::1]"]);
    expect(allowedHostsFor("::1")).toEqual(["localhost", "127.0.0.1", "[::1]"]);
    expect(allowedHostsFor("127.0.0.2")).toEqual(["localhost", "127.0.0.1", "[::1]", "127.0.0.2"]);
    expect(allowedHostsFor("0.0.0.0")).toBeNull();
    expect(allowedHostsFor("192.168.1.5")).toBeNull();
  });
});
