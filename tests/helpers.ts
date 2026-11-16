/** Test fixtures: a demo project in a temporary folder, and an HTTP client for the app (no network). */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect } from "vitest";
import { readWorkspace, type Workspace } from "../src/core/workspace.js";
import { initProject } from "../src/core/project.js";
import { hashPassword, usersPath, writeUsers, type UserEntry } from "../src/core/users.js";
import type { Role } from "../src/shared/types.js";
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

/** A copy of the demo project. The shipped sample draft is left out (tests make their own drafts); `withSampleDraft` keeps it. */
export function demoDir(opts: { withSampleDraft?: boolean } = {}): string {
  const d = tmpDir();
  initProject(d, { demo: true });
  if (!opts.withSampleDraft) fs.rmSync(path.join(d, "architecture", "drafts"), { recursive: true, force: true });
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
  readonly app: ReturnType<typeof createApp>;
  constructor(
    dir: string,
    opts: AppOptions = {},
    app?: ReturnType<typeof createApp>,
    readonly headers: Record<string, string> = {},
  ) {
    this.app = app ?? createApp(dir, opts);
  }

  /** The same server, with requests on another model version (X-DP-Model / X-DP-Compare); keeps the sign-in. */
  at(model: string, compare?: string): Client {
    const h: Record<string, string> = { "X-DP-Model": model };
    if (compare) h["X-DP-Compare"] = compare;
    if (this.headers.Cookie) h.Cookie = this.headers.Cookie;
    return new Client("", {}, this.app, h);
  }

  /** The same server, signed in as `name` (password: `testPassword(name)` unless given). */
  async as(name: string, password = testPassword(name)): Promise<Client> {
    const r = await this.post("/api/login", { name, password });
    expect(r.status, r.text).toBe(200);
    const m = /(dp_session(?:_\d+)?)=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
    expect(m?.[2]).toBeTruthy();
    return new Client("", {}, this.app, { ...this.headers, Cookie: `${m![1]}=${m![2]}` });
  }

  async req(method: string, url: string, body?: unknown, query?: Record<string, string>): Promise<Res> {
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const headers: Record<string, string> = { ...this.headers };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
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

/** Cheap hashing for tests (the parameters are stored in each hash, so the server accepts them). */
export const TEST_HASH = { N: 1024, r: 8, p: 1 };
export const testPassword = (name: string) => `${name.toLowerCase()}-password`;

export interface TestUser {
  name: string;
  role: Role;
  password?: string;
}
/** architect, engineer and viewer, each with `testPassword(name)`. */
export const ROLE_USERS: TestUser[] = [
  { name: "architect", role: "architect" },
  { name: "engineer", role: "engineer" },
  { name: "viewer", role: "viewer" },
];

/** Write `<dir>/.dp/users.json` (or `file`). */
export function writeTestUsers(dir: string, users: TestUser[] = ROLE_USERS, file = usersPath(dir)): string {
  const entries: UserEntry[] = users.map((u) => ({ name: u.name, role: u.role, password: hashPassword(u.password ?? testPassword(u.name), TEST_HASH) }));
  writeUsers(file, entries);
  return file;
}

/** `users`: turn sign-in on with these users (true: architect, engineer and viewer) before the app starts. */
export function client(dir = demoDir(), opts: AppOptions & { users?: true | TestUser[] } = {}): Client {
  const { users, ...rest } = opts;
  if (users) writeTestUsers(dir, users === true ? ROLE_USERS : users);
  return new Client(dir, rest);
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
