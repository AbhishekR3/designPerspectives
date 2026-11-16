/**
 * Integration credentials (DEC-055): tokens dp itself will use to reach other services (a git host,
 * an issue tracker, an observability backend, an LLM). Never part of the model and never in git:
 *
 *   <hub or project>/.dp/credentials.json    mode 0600, in a hidden folder the code routes never open
 *                                            (DEC-031), and `.dp/` is added to .gitignore
 *
 * A value is write-only: the API lists names, providers, scopes, dates and a masked hint, never the
 * value; only code in the server reads it (`get`). When the environment variable DP_SECRET_KEY is set,
 * values are encrypted at rest with AES-256-GCM, with a key derived by scrypt from DP_SECRET_KEY and a
 * fresh salt per value; the credential's name and provider are bound in as associated data, so an
 * encrypted value cannot be moved to another entry. Without the variable, the file's permissions are
 * the only protection, and the UI says so. A value encrypted with another key shows as "locked".
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "./fsutil.js";
import { isObj } from "./json.js";
import { ModelError } from "./ops.js";
import { ensureGitignored } from "./users.js";
import { CREDENTIAL_PROVIDERS, type CredentialInfo, type CredentialList, type CredentialProvider } from "../shared/types.js";

export const CREDENTIALS_FILE = path.join(".dp", "credentials.json");
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const MAX_VALUE = 8192;
const MAX_ENTRIES = 200;

interface Sealed {
  alg: "aes-256-gcm";
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

interface Stored {
  name: string;
  provider: CredentialProvider;
  scopes: string[];
  note: string;
  created: string;
  updated: string;
  lastUsed: string | null;
  last4: string;
  value: string | Sealed;
}

const b64 = (b: Buffer) => b.toString("base64");
const aad = (name: string, provider: string) => Buffer.from(`${name}\0${provider}`, "utf-8");

function seal(secret: string, name: string, provider: string, value: string): Sealed {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad(name, provider));
  const data = Buffer.concat([c.update(value, "utf-8"), c.final()]);
  return { alg: "aes-256-gcm", salt: b64(salt), iv: b64(iv), tag: b64(c.getAuthTag()), data: b64(data) };
}

function open(secret: string | null, name: string, provider: string, s: Sealed): string | null {
  if (!secret) return null;
  try {
    const key = crypto.scryptSync(secret, Buffer.from(s.salt, "base64"), 32);
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(s.iv, "base64"));
    d.setAAD(aad(name, provider));
    d.setAuthTag(Buffer.from(s.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(s.data, "base64")), d.final()]).toString("utf-8");
  } catch {
    return null; // another key, or the entry was changed
  }
}

export class CredentialStore {
  readonly file: string;

  /** `root`: the hub or project folder. `secret`: DP_SECRET_KEY (default: from the environment). */
  constructor(
    readonly root: string,
    private readonly secret: string | null = process.env.DP_SECRET_KEY || null,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = path.join(path.resolve(root), CREDENTIALS_FILE);
  }

  private read(): Stored[] {
    let text: string;
    try {
      text = fs.readFileSync(this.file, "utf-8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const doc = JSON.parse(text) as unknown;
    if (!isObj(doc) || !Array.isArray(doc.credentials)) throw new ModelError(`${this.file} is not a credentials file.`);
    return doc.credentials as Stored[];
  }

  private write(list: Stored[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    atomicWrite(this.file, JSON.stringify({ version: 1, credentials: list }, null, 2) + "\n", 0o600);
    ensureGitignored(this.root);
  }

  private info(s: Stored): CredentialInfo {
    const encrypted = typeof s.value !== "string";
    return {
      name: s.name,
      provider: s.provider,
      scopes: s.scopes,
      note: s.note,
      created: s.created,
      updated: s.updated,
      lastUsed: s.lastUsed,
      hint: `••••${s.last4}`,
      encrypted,
      locked: encrypted && open(this.secret, s.name, s.provider, s.value as Sealed) === null,
    };
  }

  list(): CredentialList {
    return { credentials: this.read().map((s) => this.info(s)), encryptsNew: !!this.secret, file: CREDENTIALS_FILE.split(path.sep).join("/") };
  }

  private stored(value: string, name: string, provider: string): { value: string | Sealed; last4: string } {
    const v = value.trim();
    if (!v) throw new ModelError("A credential needs a value.");
    if (v.length > MAX_VALUE) throw new ModelError("That value is too long for a credential.");
    return { value: this.secret ? seal(this.secret, name, provider, v) : v, last4: v.length >= 12 ? v.slice(-4) : "" };
  }

  add(input: unknown): void {
    if (!isObj(input)) throw new ModelError("A credential must be a JSON object.");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!NAME_RE.test(name)) throw new ModelError("A credential name uses letters, digits, '.', '_' and '-' (up to 64), e.g. github-token.");
    const list = this.read();
    if (list.some((s) => s.name === name)) throw new ModelError(`There is already a credential "${name}". Rotate it to change its value.`);
    if (list.length >= MAX_ENTRIES) throw new ModelError("There are too many credentials.");
    const provider = this.provider(input.provider);
    const at = this.now().toISOString();
    list.push({ name, provider, scopes: scopes(input.scopes), note: note(input.note), created: at, updated: at, lastUsed: null, ...this.stored(String(input.value ?? ""), name, provider) });
    this.write(list);
  }

  /** A new value for an existing credential. */
  rotate(name: string, value: unknown): void {
    const list = this.read();
    const s = this.find(list, name);
    Object.assign(s, this.stored(typeof value === "string" ? value : "", s.name, s.provider), { updated: this.now().toISOString() });
    this.write(list);
  }

  /** Provider, scopes and note; a provider change re-seals the value (it is bound to the provider). */
  update(name: string, patch: unknown): void {
    if (!isObj(patch)) throw new ModelError("Send the fields to change as a JSON object.");
    const list = this.read();
    const s = this.find(list, name);
    if (patch.provider !== undefined) {
      const provider = this.provider(patch.provider);
      if (provider !== s.provider) {
        const plain = typeof s.value === "string" ? s.value : open(this.secret, s.name, s.provider, s.value);
        if (plain === null) throw new ModelError(`"${name}" is locked (encrypted with another DP_SECRET_KEY); rotate its value instead.`);
        s.provider = provider;
        s.value = this.secret ? seal(this.secret, s.name, provider, plain) : plain;
      }
    }
    if (patch.scopes !== undefined) s.scopes = scopes(patch.scopes);
    if (patch.note !== undefined) s.note = note(patch.note);
    s.updated = this.now().toISOString();
    this.write(list);
  }

  remove(name: string): void {
    const list = this.read();
    this.find(list, name);
    this.write(list.filter((s) => s.name !== name));
  }

  /** The value, for code in the server only (never sent to a client); marks it used. Null when locked. */
  get(name: string): string | null {
    const list = this.read();
    const s = list.find((x) => x.name === name);
    if (!s) return null;
    const v = typeof s.value === "string" ? s.value : open(this.secret, s.name, s.provider, s.value);
    if (v !== null) {
      s.lastUsed = this.now().toISOString();
      this.write(list);
    }
    return v;
  }

  /** The first usable credential for a provider (name and value), for code in the server only; marks it used. */
  byProvider(provider: CredentialProvider): { name: string; value: string } | null {
    for (const s of this.read()) {
      if (s.provider !== provider) continue;
      const v = this.get(s.name);
      if (v !== null) return { name: s.name, value: v };
    }
    return null;
  }

  private find(list: Stored[], name: string): Stored {
    const s = list.find((x) => x.name === name);
    if (!s) throw new ModelError(`No credential "${name}".`);
    return s;
  }

  private provider(v: unknown): CredentialProvider {
    const p = typeof v === "string" && v ? v : "other";
    if (!(CREDENTIAL_PROVIDERS as readonly string[]).includes(p)) throw new ModelError(`Provider must be one of: ${CREDENTIAL_PROVIDERS.join(", ")}.`);
    return p as CredentialProvider;
  }
}

function scopes(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : null;
  if (!list) throw new ModelError("Scopes must be a list.");
  return [...new Set(list.map((x) => String(x).trim()).filter(Boolean))].slice(0, 30);
}

const note = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 500) : "");
