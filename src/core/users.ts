/**
 * Users for the optional sign-in (Stage P4).
 *
 *   <project>/.dp/users.json   { "users": [ { "name", "role", "password" } ] }   (mode 0600, never committed)
 *
 * Sign-in is on only when this file exists. `password` is a scrypt hash in one string:
 * `scrypt$<N>$<r>$<p>$<salt>$<hash>` (salt and hash in base64url). The cost parameters are part
 * of the string, so they can be raised later without breaking stored passwords.
 * The file lives in a dot folder, so the code routes never read or write it (DEC-031).
 * The `dp users` commands read, change and rewrite the whole file without a lock: do not run two at once.
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Role } from "../shared/types.js";
import { atomicWrite } from "./fsutil.js";

export const USERS_DIR = ".dp";
export const USERS_FILE = "users.json";
export const ROLES: readonly Role[] = ["architect", "engineer", "viewer"];
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 1024;
const NAME_RE = /^[A-Za-z0-9._-]{1,40}$/;

/** A problem with the users file or a users command; the message is shown as it is. */
export class UsersError extends Error {}

export interface UserEntry {
  name: string;
  /** The role everywhere, unless `projects` says otherwise. */
  role: Role;
  /** The scrypt hash string (see the file header). */
  password: string;
  /** In a hub: a different role in some projects, by project ID (DEC-056); "none": no access at all (DEC-059). */
  projects?: Record<string, ProjectRole>;
}

/** A role in one hub project: one of the roles, or "none" (the project is hidden and refused). */
export type ProjectRole = Role | "none";
export const NO_ACCESS = "none";

const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** The user's role in a hub project (their role everywhere unless the users file gives another). */
export const roleIn = (u: Pick<UserEntry, "role" | "projects">, project: string | null): ProjectRole => (project && u.projects?.[project]) || u.role;

/** `<project>/.dp/users.json`. */
export function usersPath(root: string): string {
  return path.join(path.resolve(root), USERS_DIR, USERS_FILE);
}

// ---------------------------------------------------------------- hashing

/** Default cost: N=2^15, r=8 (32 MB of memory, tens of milliseconds per check). */
export const SCRYPT_DEFAULTS = { N: 1 << 15, r: 8, p: 1 };
const SALT_BYTES = 16;
const KEY_BYTES = 32;

interface Parsed {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

const B64URL = /^[A-Za-z0-9_-]+$/;
/** Largest scrypt memory a stored hash may ask for (128·N·r bytes), and the most parallel lanes:
 *  a users file cannot make one sign-in check take gigabytes or minutes. */
export const MAX_SCRYPT_MEM = 128 * 1024 * 1024;
export const MAX_SCRYPT_P = 4;

function parseHash(s: string): Parsed | null {
  const parts = s.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map((x) => (/^\d{1,8}$/.test(x!) ? Number(x) : NaN)) as [number, number, number];
  if (!(N >= 2 && (N & (N - 1)) === 0) || !(r >= 1) || !(p >= 1 && p <= MAX_SCRYPT_P) || 128 * N * r > MAX_SCRYPT_MEM) return null;
  if (!B64URL.test(parts[4]!) || !B64URL.test(parts[5]!)) return null;
  const salt = Buffer.from(parts[4]!, "base64url");
  const hash = Buffer.from(parts[5]!, "base64url");
  if (salt.length < 8 || hash.length < 16 || hash.length > 64) return null;
  return { N, r, p, salt, hash };
}

/** `maxmem` covers the largest accepted cost plus scrypt's small overhead. */
const scryptOpts = (q: { N: number; r: number; p: number }) => ({ N: q.N, r: q.r, p: q.p, maxmem: MAX_SCRYPT_MEM + 1024 * 1024 });

/** A new hash string for `password` (a fresh random salt each time). */
export function hashPassword(password: string, params: { N: number; r: number; p: number } = SCRYPT_DEFAULTS): string {
  if (!parseHash(["scrypt", params.N, params.r, params.p, "AAAAAAAAAAA", "AAAAAAAAAAAAAAAAAAAAAA"].join("$"))) throw new UsersError("These scrypt parameters are outside the accepted range.");
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.scryptSync(password.normalize("NFC"), salt, KEY_BYTES, scryptOpts(params));
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

const scryptAsync = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;

/** True if `password` matches `stored`. Never throws: a malformed hash is a mismatch. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const q = parseHash(stored);
  if (!q) return false;
  try {
    const got = await scryptAsync(password.normalize("NFC"), q.salt, q.hash.length, scryptOpts(q));
    return crypto.timingSafeEqual(got, q.hash);
  } catch {
    return false;
  }
}

let dummy: string | null = null;
/** A hash to check against when the name is unknown, so the answer takes as long as for a known name. */
export function dummyHash(): string {
  return (dummy ??= hashPassword(crypto.randomBytes(12).toString("base64url")));
}

// ---------------------------------------------------------------- generated passwords

/** No 0/o, 1/l/i: easy to read out and type. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Four groups of four (about 79 bits), e.g. `k7mp-x3qa-...`. */
export function generatePassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return groups.join("-");
}

// ---------------------------------------------------------------- the file

export function checkName(name: string): string {
  if (!NAME_RE.test(name)) throw new UsersError(`"${name}" is not a valid user name: use 1 to 40 letters, digits, dots, dashes or underscores.`);
  return name;
}

export function checkRole(role: string): Role {
  if (!(ROLES as readonly string[]).includes(role)) throw new UsersError(`"${role}" is not a role. Roles: ${ROLES.join(", ")}.`);
  return role as Role;
}

export function checkPassword(password: string): string {
  if (password.length < MIN_PASSWORD) throw new UsersError(`A password needs at least ${MIN_PASSWORD} characters.`);
  if (password.length > MAX_PASSWORD) throw new UsersError(`A password can have at most ${MAX_PASSWORD} characters.`);
  return password;
}

/** The users in a users file's text; UsersError (saying what is wrong and where) if it is not valid. */
export function parseUsers(text: string, file = USERS_FILE): UserEntry[] {
  const bad = (why: string) => new UsersError(`${file} is not valid: ${why}`);
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw bad(`it is not JSON (${(e as Error).message}).`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || !Array.isArray((doc as { users?: unknown }).users)) {
    throw bad('expected an object with a "users" list.');
  }
  const seen = new Set<string>();
  return (doc as { users: unknown[] }).users.map((u, i) => {
    const at = `user ${i + 1}`;
    if (!u || typeof u !== "object" || Array.isArray(u)) throw bad(`${at} is not an object.`);
    const { name, role, password, projects } = u as Record<string, unknown>;
    if (typeof name !== "string" || !NAME_RE.test(name)) throw bad(`${at} has no valid "name" (1 to 40 letters, digits, dots, dashes or underscores).`);
    if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) throw bad(`"${name}" has no valid "role" (${ROLES.join(", ")}).`);
    if (typeof password !== "string" || !parseHash(password)) throw bad(`"${name}" has no valid "password" hash (create users with \`dp users\`).`);
    if (seen.has(name.toLowerCase())) throw bad(`the name "${name}" is used twice (names are compared without case).`);
    seen.add(name.toLowerCase());
    const entry: UserEntry = { name, role: role as Role, password };
    if (projects !== undefined) {
      if (!projects || typeof projects !== "object" || Array.isArray(projects)) throw bad(`"${name}" has "projects" that is not an object of project ID → role.`);
      const map: Record<string, ProjectRole> = {};
      for (const [id, r] of Object.entries(projects as Record<string, unknown>)) {
        if (!PROJECT_ID_RE.test(id)) throw bad(`"${name}" has a role for "${id}", which is not a project ID.`);
        if (typeof r !== "string" || !(r === NO_ACCESS || (ROLES as readonly string[]).includes(r)))
          throw bad(`"${name}" has no valid role for project "${id}" (${ROLES.join(", ")} or ${NO_ACCESS}).`);
        map[id] = r as ProjectRole;
      }
      if (Object.keys(map).length) entry.projects = map;
    }
    return entry;
  });
}

/** The users in `file`, or null when it does not exist. */
export function readUsers(file: string): UserEntry[] | null {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new UsersError(`${file} cannot be read: ${(e as Error).message}`);
  }
  return parseUsers(text, file);
}

/** Write the file atomically, readable by its owner only. */
export function writeUsers(file: string, users: UserEntry[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const doc = { users: users.map((u) => ({ name: u.name, role: u.role, password: u.password, ...(u.projects && Object.keys(u.projects).length ? { projects: u.projects } : {}) })) };
  atomicWrite(file, JSON.stringify(doc, null, 2) + "\n", 0o600);
}

const findUser = (users: UserEntry[], name: string) => users.findIndex((u) => u.name.toLowerCase() === name.toLowerCase());

/** One user whose password was set, with the password in clear (to print once). */
export interface NewPassword {
  name: string;
  role: Role;
  password: string;
}

export type HashParams = { N: number; r: number; p: number };

/** Create the file with the users architect, engineer and viewer, each with a random password. */
export function initUsers(file: string, params?: HashParams): NewPassword[] {
  if (fs.existsSync(file)) throw new UsersError(`${file} already exists. Use \`dp users add\` or \`dp users passwd\`.`);
  const made = ROLES.map((role) => ({ name: role, role, password: generatePassword() }));
  writeUsers(
    file,
    made.map((m) => ({ name: m.name, role: m.role, password: hashPassword(m.password, params) })),
  );
  return made;
}

/** Add a user. `password`: null generates one. The first user of a new file must be an architect. */
export function addUser(file: string, name: string, role: string, password: string | null, params?: HashParams): NewPassword {
  checkName(name);
  const r = checkRole(role);
  const users = readUsers(file);
  if (users === null && r !== "architect") throw new UsersError("The first user must be an architect (or run `dp users init`).");
  const list = users ?? [];
  if (findUser(list, name) >= 0) throw new UsersError(`A user named "${list[findUser(list, name)]!.name}" already exists.`);
  const pw = password === null ? generatePassword() : checkPassword(password);
  writeUsers(file, [...list, { name, role: r, password: hashPassword(pw, params) }]);
  return { name, role: r, password: pw };
}

/** Set a new password. `password`: null generates one. Signs that user out on a running server. */
export function setPassword(file: string, name: string, password: string | null, params?: HashParams): NewPassword {
  const users = needUsers(file);
  const i = findUser(users, name);
  if (i < 0) throw new UsersError(`No user named "${name}".`);
  const pw = password === null ? generatePassword() : checkPassword(password);
  users[i] = { ...users[i]!, password: hashPassword(pw, params) };
  writeUsers(file, users);
  return { name: users[i]!.name, role: users[i]!.role, password: pw };
}

/** Remove a user; the last architect cannot be removed. */
export function removeUser(file: string, name: string): UserEntry {
  const users = needUsers(file);
  const i = findUser(users, name);
  if (i < 0) throw new UsersError(`No user named "${name}".`);
  const u = users[i]!;
  if (u.role === "architect" && users.filter((x) => x.role === "architect").length === 1) {
    throw new UsersError(`"${u.name}" is the last architect and cannot be removed. Add another architect first.`);
  }
  users.splice(i, 1);
  writeUsers(file, users);
  return u;
}

/**
 * Set a user's role everywhere (`project` null; signs them out, as the role is part of their session), or
 * in one hub project (takes effect on their next request). `role` "default" removes a project's own role.
 */
export function setRole(file: string, name: string, role: string, project: string | null = null): UserEntry {
  const users = needUsers(file);
  const i = findUser(users, name);
  if (i < 0) throw new UsersError(`No user named "${name}".`);
  const u = { ...users[i]! };
  if (project === null) {
    const r = checkRole(role);
    if (u.role === "architect" && r !== "architect" && users.filter((x) => x.role === "architect").length === 1) {
      throw new UsersError(`"${u.name}" is the last architect. Make someone else an architect first.`);
    }
    u.role = r;
  } else {
    if (!PROJECT_ID_RE.test(project)) throw new UsersError(`"${project}" is not a project ID.`);
    const map = { ...(u.projects ?? {}) };
    if (role === "default") delete map[project];
    else map[project] = role === NO_ACCESS ? NO_ACCESS : checkRole(role);
    u.projects = Object.keys(map).length ? map : undefined;
    if (!u.projects) delete u.projects;
  }
  users[i] = u;
  writeUsers(file, users);
  return u;
}

export function needUsers(file: string): UserEntry[] {
  const users = readUsers(file);
  if (users === null) throw new UsersError(`There is no users file at ${file}. Run \`dp users init\` to create one.`);
  return users;
}

// ---------------------------------------------------------------- .gitignore

const IGNORES_DP = /^\/?\.dp(\/|\/\*\*?)?$/;

/**
 * Make sure git does not pick up `<root>/.dp/`: append `.dp/` to `<root>/.gitignore` unless a line
 * already ignores it. The file is created only when `root` is in a git work tree.
 * Returns what was done: "present", "added", "created" or "none" (no .gitignore and no git work tree).
 */
export function ensureGitignored(root: string): "present" | "added" | "created" | "none" {
  const gi = path.join(path.resolve(root), ".gitignore");
  if (fs.existsSync(gi)) {
    const text = fs.readFileSync(gi, "utf-8");
    if (text.split(/\r?\n/).some((l) => IGNORES_DP.test(l.trim()))) return "present";
    fs.writeFileSync(gi, `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}.dp/\n`, "utf-8");
    return "added";
  }
  if (!inGitWorkTree(root)) return "none";
  fs.writeFileSync(gi, ".dp/\n", "utf-8");
  return "created";
}

function inGitWorkTree(dir: string): boolean {
  try {
    return execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }).trim() === "true";
  } catch {
    return false;
  }
}
