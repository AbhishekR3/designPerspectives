/** Test fixtures: a demo project in a temporary folder, and an HTTP client for the app (no network). */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect } from "vitest";
import { readWorkspace, type Workspace } from "../src/core/workspace.js";
import { initProject } from "../src/core/store.js";
import { createApp, type AppOptions } from "../src/server/app.js";

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

export function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "dp-test-"));
  made.push(d);
  return d;
}

export function demoDir(): string {
  const d = tmpDir();
  initProject(d, { demo: true });
  return d;
}

export function demoWs(dir = demoDir()): Workspace {
  return readWorkspace(path.join(dir, "architecture", "workspace.json"));
}

export interface Res {
  status: number;
  headers: Headers;
  text: string;
  json: () => any;
}

export class Client {
  readonly app;
  constructor(dir: string, opts: AppOptions = {}) {
    this.app = createApp(dir, opts);
  }

  async req(method: string, url: string, body?: unknown, query?: Record<string, string>): Promise<Res> {
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { "Content-Type": "application/json" };
    }
    const r = await this.app.request(url + qs, init);
    const text = await r.text();
    return { status: r.status, headers: r.headers, text, json: () => JSON.parse(text) };
  }

  get = (url: string, query?: Record<string, string>) => this.req("GET", url, undefined, query);
  post = (url: string, body?: unknown) => this.req("POST", url, body);
  put = (url: string, body?: unknown) => this.req("PUT", url, body);
  patch = (url: string, body?: unknown) => this.req("PATCH", url, body);
  delete = (url: string) => this.req("DELETE", url);
}

export function client(dir = demoDir(), opts: AppOptions = {}): Client {
  return new Client(dir, opts);
}

/** Assert 200 and return the JSON body. */
export async function ok(p: Promise<Res>): Promise<any> {
  const r = await p;
  expect(r.status, r.text).toBe(200);
  return r.json();
}

export async function element(c: Client, id: string): Promise<any> {
  return (await ok(c.get("/api/state"))).elements.find((e: any) => e.id === id);
}
