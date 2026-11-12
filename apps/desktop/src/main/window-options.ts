/**
 * Hardened BrowserWindow configuration (fitness function FF3; verified in W0-SPIKE-SHELL).
 * Kept free of runtime Electron imports so a plain Vitest test can check it.
 */
import type { WebPreferences } from "electron";

/** Strict CSP, delivered both as a response header and as a `<meta>` tag in index.html. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function secureWebPreferences(preloadPath?: string): WebPreferences {
  return {
    ...(preloadPath ? { preload: preloadPath } : {}),
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    spellcheck: false,
  };
}
