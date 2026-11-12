// FF3: the desktop window is hardened (context isolation, no Node in the page, sandbox, strict CSP).
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, secureWebPreferences } from "./window-options.js";

describe("FF3 hardened window", () => {
  it("isolates the page from Node and Electron", () => {
    const p = secureWebPreferences("/tmp/preload.cjs");
    expect(p.contextIsolation).toBe(true);
    expect(p.nodeIntegration).toBe(false);
    expect(p.nodeIntegrationInWorker).toBe(false);
    expect(p.sandbox).toBe(true);
    expect(p.webSecurity).toBe(true);
    expect(p.allowRunningInsecureContent).toBe(false);
    expect(p.webviewTag).toBe(false);
    expect(p.preload).toBe("/tmp/preload.cjs");
  });

  it("uses a strict content security policy", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-eval");
    expect(CONTENT_SECURITY_POLICY.match(/script-src[^;]*/)?.[0]).not.toContain("unsafe-inline");
  });
});
