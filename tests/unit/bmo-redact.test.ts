/** Stage S7: what BMO may read and what is hidden before anything is sent (src/assistant/redact.ts, codeExcerpts.ts). */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DiskCode } from "../../src/core/codeFiles.js";
import { defaultIntake, type Intake } from "../../src/import/intake.js";
import { scanRepo, type Evidence } from "../../src/import/scan.js";
import { buildDigest } from "../../src/assistant/codeExcerpts.js";
import { writeHandoff } from "../../src/assistant/handoffBackend.js";
import { modelText } from "../../src/assistant/modelText.js";
import { deniedName, redactText, redactValue, selectFiles } from "../../src/assistant/redact.js";
import { preview, TASKS, type TaskContext } from "../../src/assistant/tasks.js";
import { emptySidecar } from "../../src/core/designPerspectivesFile.js";
import { emptyWorkspace } from "../../src/core/workspace.js";
import { MASK } from "../../src/shared/secretFields.js";
import { tmpDir } from "./helpers.js";

/** A temporary folder with the given files. */
function repo(files: Record<string, string>, dir = tmpDir()): string {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

/** Every planted secret value; none may appear in anything BMO is given. */
const SECRETS = [
  "Sup3rS3cretPw!",
  "sk_live_4eC39HqLyjWDarjtT1zdp7dc",
  "hunter2-Secret!",
  "plainpassword99",
  "multi-line-secret-value-XYZ",
  "abcd1234efgh5678",
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC",
  "CorrectHorse42",
  "AKIAIOSFODNN7EXAMPLE",
  "q8Zr3LmN7vKp2XwT9bYc4HdJ6sFg1QaE5uVo",
  "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  "DENIED-FILE-CONTENT",
  "MUST-NOT-OPEN-CONTENT",
];

/** A small repository with secrets planted in the usual forms, and files that must never be opened. */
const SECRET_REPO: Record<string, string> = {
  "config.example.env": "DATABASE_PASSWORD=Sup3rS3cretPw!\nSTRIPE_SECRET_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\nPAYMENTS_URL=https://api.stripe.com/v1\nLOG_LEVEL=debug\n",
  "docker-compose.yml": [
    "services:",
    "  api:",
    "    build: ./api",
    "    environment:",
    "      DB_PASSWORD: hunter2-Secret!",
    "      GITHUB_TOKEN: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "  db:",
    "    image: postgres:16",
    "",
  ].join("\n"),
  "deploy/api.yaml": [
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    "  name: api",
    "spec:",
    "  template:",
    "    spec:",
    "      containers:",
    "        - name: api",
    "          env:",
    "            - name: DB_PASSWORD",
    "              value: plainpassword99",
    "auth:",
    "  client_secret: |",
    "    multi-line-secret-value-XYZ",
    "  issuer: bank",
    "",
  ].join("\n"),
  "web/package.json": JSON.stringify({ name: "web", main: "index.ts", config: { apiKey: "abcd1234efgh5678", region: "eu" } }),
  "web/index.ts": 'const client = "q8Zr3LmN7vKp2XwT9bYc4HdJ6sFg1QaE5uVo";\nexport const region = "eu";\nconst password = process.env.DB_PASSWORD;\n',
  "api/Dockerfile": "FROM python:3.12\nEXPOSE 8000\n",
  "api/main.py": [
    'KEY = """',
    "-----BEGIN PRIVATE KEY-----",
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC",
    "-----END PRIVATE KEY-----",
    '"""',
    'DATABASE_URL = "postgres://admin:CorrectHorse42@db.example.com:5432/app"',
    'AWS_ACCESS = "AKIAIOSFODNN7EXAMPLE"',
    "def main():",
    '    print("payments api")',
    "",
  ].join("\n"),
  "secrets.yaml": "apiVersion: v1\nkind: Secret\nmetadata:\n  name: DENIED-FILE-CONTENT\n",
  "keys/server.pem": "DENIED-FILE-CONTENT\n",
  id_rsa: "DENIED-FILE-CONTENT\n",
  "prod.env": "DENIED-FILE-CONTENT=1\n",
  "credentials.json": '{"x": "DENIED-FILE-CONTENT"}',
  "private/main.py": "MUST-NOT-OPEN-CONTENT = 1\n",
};

const intakeWith = (patch: (i: Intake) => void = () => {}): Intake => {
  const i = defaultIntake();
  patch(i);
  return i;
};

/** Evidence of the repo, plus facts naming the files that must not be opened (as a stale or hand-edited evidence file could). */
function evidenceOf(dir: string): Evidence {
  const ev = scanRepo(new DiskCode(dir), intakeWith());
  for (const p of ["secrets.yaml", "keys/server.pem", "id_rsa", "prod.env", "credentials.json", "private/main.py"]) {
    ev.facts.push({ id: `dockerfile:${p}:x`, level: "c2", kind: "dockerfile", name: "x", path: p });
  }
  return ev;
}

describe("redactText", () => {
  it("hides secret values in env, YAML, JSON, PEM, URL, AWS-key and random-token forms", () => {
    for (const [rel, text] of Object.entries(SECRET_REPO)) {
      if (text.includes("DENIED") || text.includes("MUST-NOT")) continue;
      const r = redactText(text);
      for (const s of SECRETS) expect(r.text, `${rel} still holds ${s}`).not.toContain(s);
    }
    const env = redactText(SECRET_REPO["config.example.env"]!);
    expect(env.count).toBe(2);
    expect(env.text).toContain("PAYMENTS_URL=https://api.stripe.com/v1");
    expect(env.text).toContain(`DATABASE_PASSWORD=${MASK}`);
  });

  it("keeps names, placeholders, type names and environment references", () => {
    const t = ["password: ${DB_PASSWORD}", "token: string;", "api_key: <your key>", "const password = process.env.DB_PASSWORD", 'secret = os.environ["APP_SECRET"]', "LOG_LEVEL=debug"].join("\n");
    const r = redactText(t);
    expect(r.text).toBe(t);
    expect(r.count).toBe(0);
  });

  it("hides URL credentials but keeps the host", () => {
    expect(redactText("see https://bob:pa55w0rd@example.com/x").text).toBe(`see https://${MASK}@example.com/x`);
  });

  it("hides an unterminated PEM block to the end", () => {
    const r = redactText("a\n-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n");
    expect(r.text).toBe(`a\n${MASK}`);
  });

  it("redacts every string of a JSON value and keeps its shape", () => {
    expect(redactValue({ a: ["token=abc123def456"], n: 3, nested: { x: "plain" } })).toEqual({ a: [`token=${MASK}`], n: 3, nested: { x: "plain" } });
  });
});

describe("selectFiles", () => {
  it("refuses deny-listed names, must-not-open, excluded, ignored and hidden paths", () => {
    const dir = repo({ ...SECRET_REPO, "gen/out.ts": "x", "legacy/a.ts": "y" });
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=1");
    const gate = selectFiles(
      new DiskCode(dir),
      intakeWith((i) => {
        i.mustNotOpen = ["private/**"];
        i.scope.exclude = ["gen"];
      }),
      ["legacy/**", "c1:system:Stripe"],
    );
    for (const p of ["secrets.yaml", "keys/server.pem", "id_rsa", "prod.env", "credentials.json"]) expect(gate.refused(p), p).toMatch(/never sent|environment file/);
    expect(gate.refused("private/main.py")).toMatch(/must-not-open/);
    expect(gate.refused("gen/out.ts")).toMatch(/excluded/);
    expect(gate.refused("legacy/a.ts")).toMatch(/ignore list/);
    expect(gate.refused(".env")).toMatch(/hidden/);
    expect(gate.refused("../outside.txt")).toMatch(/outside/);
    expect(gate.refused("config.example.env")).toBeNull();
    expect(gate.mustNotOpen).toEqual(["private/**", "gen", "legacy/**"]);
    const r = gate.read("api/main.py");
    expect("text" in r && r.redactions).toBeGreaterThan(0);
  });

  it("names: samples pass, real environment files and key files do not", () => {
    expect(deniedName("config.example.env")).toBeNull();
    expect(deniedName("env.sample")).toBeNull();
    expect(deniedName("src/env.ts")).toBeNull();
    expect(deniedName("prod.env")).not.toBeNull();
    expect(deniedName("app/npmrc")).not.toBeNull();
    expect(deniedName("ID_RSA.pub")).not.toBeNull();
    expect(deniedName("certs/client.p12")).not.toBeNull();
  });
});

describe("the digest and prompts never carry a secret or a refused file", () => {
  const ctxFor = (variant: "direct" | "handoff"): TaskContext => ({ model: { workspace: emptyWorkspace("Bank"), sidecar: emptySidecar() }, code: null, variant });

  it("digest: refused files are left out with the reason, secrets are masked", () => {
    const dir = repo(SECRET_REPO);
    const intake = intakeWith((i) => (i.mustNotOpen = ["private/**"]));
    for (const level of ["c1", "c2"] as const) {
      const d = buildDigest(evidenceOf(dir), new DiskCode(dir), intake, { level, budgetTokens: 50_000 });
      for (const s of SECRETS) expect(d.text, `${level}: ${s}`).not.toContain(s);
      const sent = d.attachments.map((a) => a.path);
      for (const p of ["secrets.yaml", "keys/server.pem", "id_rsa", "prod.env", "credentials.json", "private/main.py"]) expect(sent).not.toContain(p);
      if (level === "c2") {
        expect(sent).toEqual(expect.arrayContaining(["api/main.py", "web/package.json", "docker-compose.yml", "deploy/api.yaml", "web/index.ts"]));
        expect(d.leftOut.map((l) => l.path)).toEqual(expect.arrayContaining(["secrets.yaml", "id_rsa", "private/main.py"]));
        expect(d.leftOut.find((l) => l.path === "private/main.py")!.reason).toMatch(/must-not-open/);
        expect(d.attachments.find((a) => a.path === "api/main.py")!.redactions).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("import-level prompt and handoff files hold no secret", () => {
    const dir = repo(SECRET_REPO);
    const intake = intakeWith((i) => {
      i.mustNotOpen = ["private/**"];
      i.system.purpose = "Payments; admin password: Sup3rS3cretPw!";
    });
    const digest = buildDigest(evidenceOf(dir), new DiskCode(dir), intake, { level: "c2", budgetTokens: 50_000 });
    const inputs = { level: "c2" as const, digest, intake, feedback: [{ id: "api", text: "the token=abcd1234efgh5678 is old" }], modelSummary: modelText(emptyWorkspace("Bank"), null) };
    for (const variant of ["direct", "handoff"] as const) {
      const p = preview(TASKS["import-level"], inputs, ctxFor(variant));
      for (const s of SECRETS) {
        expect(p.system, s).not.toContain(s);
        expect(p.user, `${variant}: ${s}`).not.toContain(s);
      }
      if (variant === "handoff") {
        writeHandoff(dir, TASKS["import-level"], p);
        const hdir = path.join(dir, "architecture", "import", "handoff");
        for (const f of fs.readdirSync(hdir)) {
          const text = fs.readFileSync(path.join(hdir, f), "utf-8");
          for (const s of SECRETS) expect(text, `${f}: ${s}`).not.toContain(s);
        }
      }
    }
  });
});
