/** Stage S4: the deterministic scan, the known-services list, the readiness analysis and the intake (no model, no network). */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DiskCode } from "../src/core/codeFiles.js";
import { ModelError } from "../src/core/ops.js";
import { analyse, canFinalize, readState, snapshotModel, writeAnalysis, writeState, type ModelSnapshot } from "../src/import/analysis.js";
import { defaultIntake, parseIntake, readIntake, writeIntake, type Intake } from "../src/import/intake.js";
import { KNOWN_SERVICES, matchService } from "../src/import/knownServices.js";
import { compileGlob, globMatches, readCompose, readEvidence, scanRepo, writeEvidence, type Evidence } from "../src/import/scan.js";
import { demoDir, demoWs, tmpDir } from "./helpers.js";

/** A temporary code folder with the given files. */
function repo(files: Record<string, string>): string {
  const dir = tmpDir();
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

const scan = (dir: string, patch: (i: Intake) => void = () => {}): Evidence => {
  const intake = defaultIntake();
  patch(intake);
  return scanRepo(new DiskCode(dir), intake);
};
const ids = (ev: Evidence, level?: string): string[] => ev.facts.filter((f) => !level || f.level === level).map((f) => f.id);

describe("known services", () => {
  it("is sorted, has about 50 entries and matches by ecosystem", () => {
    expect(KNOWN_SERVICES.length).toBeGreaterThanOrEqual(40);
    const names = KNOWN_SERVICES.map((s) => s.system);
    expect(names).toEqual([...names].sort());
    expect(matchService("npm", "stripe")?.system).toBe("Stripe");
    expect(matchService("npm", "@sentry/node")?.system).toBe("Sentry");
    expect(matchService("npm", "express")).toBeNull();
    expect(matchService("pypi", "Sentry_SDK")?.system).toBe("Sentry");
    expect(matchService("go", "github.com/stripe/stripe-go/v76")?.system).toBe("Stripe");
    expect(matchService("image", "docker.io/library/postgres:16")?.system).toBe("PostgreSQL");
    expect(matchService("image", "quay.io/minio/minio@sha256:abc")?.system).toBe("MinIO");
    expect(matchService("image", "mypostgres:1")).toBeNull();
    expect(matchService("host", "api.stripe.com")?.system).toBe("Stripe");
    expect(matchService("host", "notstripe.com")).toBeNull();
  });
  it("looks at the intake's entries first", () => {
    const extra = [{ match: { npm: ["stripe"] }, system: "Our payment gateway", category: "payments" }];
    expect(matchService("npm", "stripe", extra)?.system).toBe("Our payment gateway");
    expect(matchService("npm", "twilio", extra)?.system).toBe("Twilio");
  });
});

describe("globs", () => {
  it("supports *, ** and ?", () => {
    const m = (p: string, rel: string) => globMatches(compileGlob(p), rel);
    expect(m("secrets", "a/b/secrets/x.txt")).toBe(true);
    expect(m("*.pem", "keys/a.pem")).toBe(true);
    expect(m("src/**/gen", "src/a/b/gen")).toBe(true);
    expect(m("src/*.ts", "src/a/b.ts")).toBe(false);
    expect(m("src/*.ts", "src/b.ts")).toBe(true);
    expect(m("data/**", "data")).toBe(true);
    expect(m("a?.py", "ab.py")).toBe(true);
    expect(m("a?.py", "abc.py")).toBe(false);
  });
});

describe("scan: manifests", () => {
  it("reads package.json, pyproject.toml, requirements and go.mod", () => {
    const dir = repo({
      "package.json": JSON.stringify(
        { name: "shop", main: "index.js", scripts: { start: "node index.js" }, dependencies: { stripe: "1", express: "4" }, devDependencies: { "@sentry/node": "1" } },
        null,
        2,
      ),
      "svc/pyproject.toml": [
        "[project]",
        'name = "svc"',
        "dependencies = [",
        '  "openai>=1",',
        '  "requests[socks]",',
        "]",
        "[project.optional-dependencies]",
        'dev = ["sentry-sdk"]',
        "[project.scripts]",
        'svc-run = "svc.main:run"',
        "[tool.poetry.dependencies]",
        'python = "^3.11"',
        'twilio = "^8"',
      ].join("\n"),
      "svc/requirements-dev.txt": "# tools\n-r base.txt\nstripe==5.0 # pin\nrequests\n",
      "go/go.mod": "module x\n\nrequire (\n\tgithub.com/stripe/stripe-go/v76 v76.1.0 // indirect\n\tgithub.com/gin-gonic/gin v1\n)\n",
    });
    const ev = scan(dir);
    expect(ids(ev, "c1")).toEqual([
      "service-dependency:go/go.mod:github.com/stripe/stripe-go/v76",
      "service-dependency:package.json:stripe",
      "service-dependency:package.json:@sentry/node",
      "service-dependency:svc/pyproject.toml:openai",
      "service-dependency:svc/pyproject.toml:sentry-sdk",
      "service-dependency:svc/pyproject.toml:twilio",
      "service-dependency:svc/requirements-dev.txt:stripe",
    ]);
    expect(ev.facts.find((f) => f.name === "stripe" && f.path === "package.json")).toMatchObject({ system: "Stripe", line: 8 });
    expect(ids(ev, "c2")).toEqual(["package-entry:package.json:shop", "python-script:svc/pyproject.toml:svc-run"]);
    expect(ev.facts.find((f) => f.kind === "package-entry")?.detail).toBe("main=index.js; scripts.start");
  });
  it("lists a package.json that is not JSON and dynamic dependencies as not parsed", () => {
    const ev = scan(repo({ "package.json": "{ nope", "pyproject.toml": '[project]\ndynamic = ["dependencies", "version"]\n' }));
    expect(ev.notParsed.map((n) => n.path)).toEqual([".github/CODEOWNERS", "package.json", "pyproject.toml"]);
  });
});

describe("scan: containers", () => {
  const compose = [
    "services:",
    "  api:",
    "    build: ./api",
    "    ports:",
    '      - "8080:80"',
    "    depends_on: [db, queue]",
    "    environment:",
    "      - DB_URL=postgres://app:pw@db:5432/app",
    "      - STRIPE_API_URL=https://api.stripe.com/v1",
    "      LEGACY: yes",
    "  db:",
    "    image: postgres:16",
    "  queue:",
    "    image: rabbitmq:3",
    "  web:",
    "    image: nginx",
  ].join("\n");
  it("reads compose, Dockerfile, Kubernetes and serverless files", () => {
    const dir = repo({
      "docker-compose.yml": compose.replace("      LEGACY: yes\n", ""),
      "api/Dockerfile": "FROM node:20 AS build\nFROM node:20-slim\nEXPOSE 3000 9229\n",
      "k8s/app.yaml":
        "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: worker\n  labels:\n    name: no\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: svc\n---\napiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: nightly\n",
      "fn/serverless.yml": "service: x\nfunctions:\n  hello:\n    handler: h.hello\n  bye:\n    handler: h.bye\n",
      "api/main.py": "x = 1\n",
    });
    const ev = scan(dir);
    expect(ids(ev, "c2")).toEqual([
      "compose-service:docker-compose.yml:api",
      "compose-service:docker-compose.yml:web",
      "datastore:docker-compose.yml:db",
      "dockerfile:api/Dockerfile:api",
      "k8s-workload:k8s/app.yaml:worker",
      "k8s-workload:k8s/app.yaml:nightly",
      "queue:docker-compose.yml:queue",
      "serverless-function:fn/serverless.yml:hello",
      "serverless-function:fn/serverless.yml:bye",
    ]);
    const f = (id: string) => ev.facts.find((x) => x.id === id)!;
    expect(f("dockerfile:api/Dockerfile:api").detail).toBe("from=node:20-slim; expose=3000,9229");
    expect(f("compose-service:docker-compose.yml:api").detail).toBe("build=./api; ports=8080:80; depends_on=db,queue");
    expect(f("datastore:docker-compose.yml:db")).toMatchObject({ system: "PostgreSQL", detail: "image=postgres:16" });
    expect(f("queue:docker-compose.yml:queue").system).toBe("RabbitMQ");
    expect(f("k8s-workload:k8s/app.yaml:nightly")).toMatchObject({ detail: "kind=CronJob", line: 14 });
    // compose environment: names and the host of a URL, never values
    expect(ids(ev, "c1")).toEqual(["env-var:docker-compose.yml:DB_URL", "env-var:docker-compose.yml:STRIPE_API_URL", "service-host:docker-compose.yml:api.stripe.com"]);
  });
  it("lists an unparseable compose file as not parsed and reads no service from it", () => {
    for (const [label, text] of [
      ["tabs", "services:\n\tapi:\n\t\timage: x\n"],
      ["no services", "version: '3'\nvolumes:\n  a: {}\n"],
      ["anchors", "x-base: &base\n  image: a\nservices:\n  api:\n    <<: *base\n"],
    ] as const) {
      const ev = scan(repo({ "compose.yaml": text }));
      expect(ids(ev, "c2"), label).toEqual([]);
      expect(ev.notParsed.find((n) => n.path === "compose.yaml")?.reason, label).toMatch(/^compose file not parsed: /);
    }
    expect(readCompose("services:\n  a:\n    image: x\n").services.map((s) => s.name)).toEqual(["a"]);
  });
  it("finds components under a container root and the import edges between them", () => {
    const dir = repo({
      "api/Dockerfile": "FROM python:3.12\n",
      "api/orders/__init__.py": "",
      "api/orders/service.py": "from api.billing import charge\n",
      "api/billing/__init__.py": "",
      "api/billing/charge.py": "x = 1\n",
      "api/tiny/one.py": "x = 1\n",
      "api/orders/deep/er/a.py": "x = 1\nfrom api.billing import charge\n",
      "api/orders/deep/er/b.py": "x = 1\n",
    });
    const ev = scan(dir);
    expect(ids(ev, "c3")).toEqual(["component-dir:api/billing:api/billing", "component-dir:api/orders:api/orders"]);
    // service.py and deep/er/a.py each import the package and the module: four file imports
    expect(ev.imports).toEqual([["api/orders", "api/billing", 4]]);
    // with the accepted containers' paths passed in, they replace the roots the scan found
    const own = scanRepo(new DiskCode(dir), defaultIntake(), { containerRoots: ["api/orders"] });
    expect(ids(own, "c3")).toEqual(["component-dir:api/orders/deep/er:api/orders/deep/er"]);
  });
});

describe("scan: C1 evidence", () => {
  it("keeps variable names and hosts of samples, webhook routes and owners, never values", () => {
    const dir = repo({
      "config.example.env":
        "# sample\nSTRIPE_API_KEY=sk-live-ABCDEF123456\nexport DB_PASSWORD=hunter2-planted\nWEBHOOK_URL=https://user:pw-planted@hooks.acme.io/in?token=tok-planted\nSENTRY_DSN=https://abc@o1.ingest.sentry.io/1\nPLAIN=1\n",
      "env.sample": "OPENAI_API_KEY=sk-proj-planted\nBASE=http://localhost:3000\n",
      "docs/CODEOWNERS": "# owners\n*  @acme/platform  dev@acme.io\n/api/ @acme/api\n",
      "src/routes.ts": "app.post('/webhooks/stripe?secret=planted-secret', h);\nconst s = 'STRIPE_WEBHOOK_SECRET';\nrouter.get(`/internal/webhook-retry`);\n",
      "compose.yml": "services:\n  a:\n    image: x\n    environment:\n      API_KEY: sk-live-compose-planted\n",
    });
    const ev = scan(dir);
    const names = (kind: string) => ev.facts.filter((f) => f.kind === kind).map((f) => `${f.path}:${f.name}`);
    expect(names("env-var")).toEqual([
      "compose.yml:API_KEY",
      "config.example.env:STRIPE_API_KEY",
      "config.example.env:DB_PASSWORD",
      "config.example.env:WEBHOOK_URL",
      "config.example.env:SENTRY_DSN",
      "config.example.env:PLAIN",
      "env.sample:OPENAI_API_KEY",
      "env.sample:BASE",
    ]);
    expect(names("service-host")).toEqual(["config.example.env:o1.ingest.sentry.io"]);
    expect(ev.facts.find((f) => f.name === "o1.ingest.sentry.io")?.system).toBe("Sentry");
    expect(names("external-host")).toEqual(["config.example.env:hooks.acme.io"]);
    expect(names("webhook-route")).toEqual(["src/routes.ts:/webhooks/stripe", "src/routes.ts:/internal/webhook-retry"]);
    expect(names("codeowner")).toEqual(["docs/CODEOWNERS:@acme/platform", "docs/CODEOWNERS:dev@acme.io", "docs/CODEOWNERS:@acme/api"]);
    expect(ev.facts.find((f) => f.name === "DB_PASSWORD")?.detail).toBe("secret-like name, value not kept");
    expect(ev.notParsed.find((n) => n.path === ".github/CODEOWNERS")?.reason).toMatch(/hidden path/);
    const text = JSON.stringify(ev);
    for (const secret of ["sk-live", "hunter2", "pw-planted", "tok-planted", "sk-proj", "planted-secret", "compose-planted", "abc@"]) expect(text).not.toContain(secret);
    // and what is written to disk
    writeEvidence(dir, ev);
    const disk = fs.readFileSync(path.join(dir, "architecture", "import", "evidence.json"), "utf-8");
    for (const secret of ["sk-live", "hunter2", "pw-planted", "tok-planted", "sk-proj"]) expect(disk).not.toContain(secret);
    expect(readEvidence(dir)).toEqual(ev);
  });
});

describe("scan: caps and confinement", () => {
  it("records every cap it hits", () => {
    const files: Record<string, string> = { "a/b/c/d/deep.py": "x\n", "big.py": "x = 1\n" + "#".repeat(2000), "bin.py": "x\u0000y", "logo.png": "not really" };
    for (let i = 0; i < 6; i++) files[`many/f${i}.py`] = "x = 1\n";
    const ev = scan(repo(files), (i) => {
      i.settings.maxFiles = 8;
      i.settings.maxDepth = 3;
      i.settings.maxFileBytes = 1000;
    });
    expect(ev.limits.map((l) => l.kind)).toEqual(["file-too-large", "max-depth", "max-files"]);
    expect(ev.limits.find((l) => l.kind === "max-depth")?.path).toBe("a/b/c/d");
    expect(ev.limits.find((l) => l.kind === "file-too-large")?.path).toBe("big.py");
    expect(ev.files.total).toBe(8);
    expect(ev.files.binary).toBe(2);
    expect(ids(ev, "c4")).toContain("source-file:big.py:big.py");
    expect(ids(ev, "c4")).not.toContain("source-file:bin.py:bin.py");
  });
  it("does not follow a link that leaves the code folder, and never reads hidden paths", () => {
    const outside = repo({ "package.json": JSON.stringify({ dependencies: { stripe: "1" } }), "secret.py": "x = 1\n" });
    const dir = repo({
      "ok/main.py": "x = 1\n",
      ".hidden/package.json": JSON.stringify({ dependencies: { twilio: "1" } }),
      ".env.example": "HIDDEN_VAR=1\n",
      ".github/CODEOWNERS": "* @hidden/team\n",
    });
    fs.symlinkSync(outside, path.join(dir, "linked"));
    fs.symlinkSync(path.join(outside, "secret.py"), path.join(dir, "link.py"));
    const ev = scan(dir);
    expect(ids(ev)).toEqual(["source-file:ok/main.py:main.py"]);
    expect(ev.notParsed.map((n) => n.path)).toEqual([".github/CODEOWNERS", "link.py", "linked"]);
    expect(JSON.stringify(ev)).not.toMatch(/stripe|twilio|HIDDEN_VAR|hidden\/team/);
  });
  it("skips build folders, the intake's exclude and mustNotOpen globs, and narrows to include", () => {
    const dir = repo({
      "src/a.py": "x\n",
      "src/gen/g.py": "x\n",
      "src/keep.py": "x\n",
      "node_modules/x/i.py": "x\n",
      "architecture/workspace.json": "{}",
      "vendor/v.py": "x\n",
      "secrets/key.py": "x\n",
      "other/o.py": "x\n",
      "package.json": JSON.stringify({ dependencies: { stripe: "1" } }),
    });
    const ev = scan(dir, (i) => {
      i.scope.exclude = ["src/gen"];
      i.mustNotOpen = ["secrets", "package.json"];
    });
    expect(ids(ev, "c4")).toEqual(["source-file:other/o.py:o.py", "source-file:src/a.py:a.py", "source-file:src/keep.py:keep.py"]);
    expect(ev.facts.some((f) => f.name === "stripe")).toBe(false);
    expect(ev.files.skipped).toEqual([
      { path: "architecture", reason: "ignored folder" },
      { path: "node_modules", reason: "ignored folder" },
      { path: "package.json", reason: "mustNotOpen" },
      { path: "secrets", reason: "mustNotOpen" },
      { path: "src/gen", reason: "scope.exclude" },
      { path: "vendor", reason: "ignored folder" },
    ]);
    const only = scan(dir, (i) => {
      i.scope.include = ["src"];
    });
    expect(ids(only, "c4")).toEqual(["source-file:src/a.py:a.py", "source-file:src/gen/g.py:g.py", "source-file:src/keep.py:keep.py"]);
  });
  it("counts languages whose imports are not read", () => {
    const ev = scan(repo({ "A.java": "class A {}\n", "b.go": "package b\n", "c.py": "x\n", "README.md": "# hi\n" }));
    expect(ev.files.notAnalysable).toEqual({ go: 1, java: 1 });
    expect(ev.files.byLanguage).toEqual({ go: 1, java: 1, markdown: 1, python: 1 });
    expect(ev.files.sizes).toEqual([["README.md", 5]]);
  });
});

describe("scan: determinism", () => {
  const files = {
    "package.json": JSON.stringify({ name: "p", main: "i.js", dependencies: { stripe: "1" } }),
    "p/a.ts": "import { b } from './b';\n",
    "p/b.ts": "export const b = 1;\n",
    "p/sub/c.ts": "import '../a';\n",
    "p/sub/d.ts": "x\n",
    "config.example.env": "A=https://api.openai.com\n",
    "compose.yml": "services:\n  db:\n    image: redis\n",
  };
  it("gives byte-identical evidence for the same tree, twice and in another folder", () => {
    const a = repo(files);
    const b = repo(files);
    const first = scan(a);
    expect(scan(a)).toEqual(first);
    writeEvidence(a, first);
    writeEvidence(a, first);
    writeEvidence(b, scan(b));
    const read = (d: string) => fs.readFileSync(path.join(d, "architecture", "import", "evidence.json"), "utf-8");
    expect(read(a)).toBe(read(b));
    expect(read(a)).not.toMatch(/\/(tmp|var|private)\//);
    expect(read(a)).toMatch(/\n$/);
  });
  it("scans demo/sample_code to a stable result", () => {
    const ev = scanRepo(new DiskCode(path.resolve("demo/sample_code")), defaultIntake());
    expect(ids(ev, "c3")).toEqual([
      "component-dir:api:api",
      "component-dir:notifications:notifications",
      "component-dir:payments:payments",
      "component-dir:pipeline:pipeline",
      "component-dir:statements:statements",
    ]);
    expect(ev.facts.filter((f) => f.level === "c4").length).toBe(36);
    expect(ev.files).toMatchObject({ total: 36, byLanguage: { python: 13, typescript: 23 }, notAnalysable: {}, binary: 0 });
    expect(ev.facts.find((f) => f.id === "component-dir:api:api")?.detail).toBe("8 source files; no container found, code root used");
    expect(ev.limits).toEqual([]);
    expect(ids(ev, "c4")).toMatchInlineSnapshot(`
      [
        "source-file:api/__init__.py:__init__.py",
        "source-file:api/accounts.py:accounts.py",
        "source-file:api/email_sender.py:email_sender.py",
        "source-file:api/mainframe_facade.py:mainframe_facade.py",
        "source-file:api/reset_password.py:reset_password.py",
        "source-file:api/security.py:security.py",
        "source-file:api/sign_in.py:sign_in.py",
        "source-file:api/store.py:store.py",
        "source-file:notifications/channels.ts:channels.ts",
        "source-file:notifications/listener.ts:listener.ts",
        "source-file:notifications/router.ts:router.ts",
        "source-file:notifications/templates.ts:templates.ts",
        "source-file:payments/controller.ts:controller.ts",
        "source-file:payments/fraud-client.ts:fraud-client.ts",
        "source-file:payments/mainframe.ts:mainframe.ts",
        "source-file:payments/orchestrator.ts:orchestrator.ts",
        "source-file:payments/publisher.ts:publisher.ts",
        "source-file:payments/session.ts:session.ts",
        "source-file:payments/types.ts:types.ts",
        "source-file:payments/validator.ts:validator.ts",
        "source-file:pipeline/__init__.py:__init__.py",
        "source-file:pipeline/consume.py:consume.py",
        "source-file:pipeline/dag.py:dag.py",
        "source-file:pipeline/load_warehouse.py:load_warehouse.py",
        "source-file:pipeline/mask_pii.py:mask_pii.py",
        "source-file:statements/apply_fees.ts:apply_fees.ts",
        "source-file:statements/balances.ts:balances.ts",
        "source-file:statements/convert_currency.ts:convert_currency.ts",
        "source-file:statements/encrypt.ts:encrypt.ts",
        "source-file:statements/enrich.ts:enrich.ts",
        "source-file:statements/fetch_batch.ts:fetch_batch.ts",
        "source-file:statements/parse_records.ts:parse_records.ts",
        "source-file:statements/render_pdf.ts:render_pdf.ts",
        "source-file:statements/types.ts:types.ts",
        "source-file:statements/upload.ts:upload.ts",
        "source-file:statements/validate.ts:validate.ts",
      ]
    `);
  });
});

// ------------------------------------------------------------------ analysis

const fact = (kind: string, level: "c1" | "c2" | "c3" | "c4", name: string, p: string, extra: object = {}) => ({ id: `${kind}:${p}:${name}`, level, kind, name, path: p, ...extra });

function crafted(): Evidence {
  const c4 = ["api/a.py", "api/b.py", "web/x.ts", "web/y.ts", "misc/z.py"].map((p) => fact("source-file", "c4", path.basename(p), p, { detail: "400 bytes; python" }));
  return {
    schemaVersion: 1,
    codeRoot: ".",
    facts: [
      fact("service-dependency", "c1", "stripe", "package.json", { system: "Stripe" }),
      fact("service-host", "c1", "api.stripe.com", "config.example.env", { system: "Stripe" }),
      fact("service-dependency", "c1", "twilio", "package.json", { system: "Twilio" }),
      fact("external-host", "c1", "hooks.acme.io", "config.example.env"),
      fact("dockerfile", "c2", "api", "api/Dockerfile"),
      fact("compose-service", "c2", "api", "compose.yml"),
      fact("datastore", "c2", "db", "compose.yml", { system: "PostgreSQL" }),
      fact("component-dir", "c3", "api", "api"),
      fact("component-dir", "c3", "web", "web"),
      ...c4,
    ],
    files: {
      total: 5,
      byLanguage: { python: 3, typescript: 2 },
      notAnalysable: {},
      binary: 0,
      skipped: [],
      sizes: [
        ["package.json", 400],
        ["config.example.env", 200],
        ["api/Dockerfile", 100],
        ["compose.yml", 300],
      ],
    },
    imports: [],
    notParsed: [],
    limits: [],
  };
}

function el(id: string, name: string, kind: ModelSnapshot["elements"][number]["kind"], extra: Partial<ModelSnapshot["elements"][number]> = {}) {
  return { id, name, kind, parent: null, external: false, description: "", technology: "", codePaths: [], ...extra };
}

describe("analysis", () => {
  const intake = (patch: (i: Intake) => void = () => {}) => {
    const i = defaultIntake();
    patch(i);
    return i;
  };
  const state = (over: object = {}) => ({ ignore: [], levels: { c1: false, c2: false, c3: false, c4: false }, ...over });

  it("counts candidates, decided and left per level, with tokens, passes and minutes", () => {
    const model: ModelSnapshot = {
      elements: [
        el("stripe", "Stripe", "softwareSystem", { description: "Payments" }),
        el("shop", "Shop", "softwareSystem"),
        el("api", "API", "container", { codePaths: ["api"], description: "d", technology: "Python" }),
        el("orders", "Orders", "component", { codePaths: ["api/a.py"], parent: "api" }),
      ],
      relationships: [
        { id: "shop--stripe", source: "shop", target: "stripe", description: "Uses" },
        { id: "api--orders", source: "api", target: "orders", description: "Calls" },
      ],
    };
    const a = analyse(
      crafted(),
      model,
      intake((i) => (i.settings.passBudgetTokens = 1000)),
      state({ ignore: ["c1:host:hooks.acme.io"] }),
    );
    const [c1, c2, c3, c4] = a.levels;
    expect(c1).toMatchObject({ candidates: 3, accepted: 1, ignored: 1, decided: 2, undecided: 1, needDescription: 1, needLabel: 1, left: 3, percent: 40, effortItems: 3, state: "in progress" });
    expect(c1!.items.map((c) => [c.id, c.status, c.matchedBy])).toEqual([
      ["c1:system:Stripe", "accepted", "stripe"],
      ["c1:system:Twilio", "left", undefined],
      ["c1:host:hooks.acme.io", "ignored", undefined],
    ]);
    expect(c1!.bytes).toBe(600); // package.json + config.example.env
    expect(c1!.tokens).toBe(150);
    // api (Dockerfile + compose service merge into one candidate) and db
    expect(c2).toMatchObject({ candidates: 2, decided: 1, undecided: 1, left: 1, state: "in progress", bytes: 400, tokens: 100, passes: 1 });
    expect(c2!.items.map((c) => [c.id, c.kind, c.status])).toEqual([
      ["c2:api", "compose-service", "accepted"],
      ["c2:db", "datastore", "left"],
    ]);
    expect(c3).toMatchObject({ candidates: 2, decided: 1, undecided: 1, bytes: 1600, tokens: 400 });
    expect(c4).toMatchObject({ candidates: 5, accepted: 2, decided: 2, undecided: 3, left: 3, effortItems: 0, unmappedTotal: 3, unmapped: ["misc/z.py", "web/x.ts", "web/y.ts"] });
    // totals: C1 to C3, plus five intake questions (all empty)
    expect(a.totals).toMatchObject({
      candidates: 7 + 5,
      decided: 4,
      left: 3 + 1 + 2 + 5,
      effortItems: 3 + 1 + 2 + 5,
      intakeUnanswered: ["system.name", "system.purpose", "audience", "ownership", "runtime"],
      unmappedFiles: 3,
    });
    expect(a.totals.percent).toBe(Math.round((100 * 4) / (4 + 11)));
    expect(a.totals.reviewMinutes).toBe(Math.round(((11 * 20) / 60) * 10) / 10);
  });

  it("applies the recommendation rules and their thresholds", () => {
    const model: ModelSnapshot = { elements: [], relationships: [] };
    const rule = (a: ReturnType<typeof analyse>, name: RegExp) => a.recommendation.rules.find((r) => name.test(r.rule))!;
    const small = analyse(crafted(), model, intake(), state());
    expect(small.recommendation.mode).toBe("one-go");
    expect(small.recommendation.rules.every((r) => !r.fired)).toBe(true);
    expect(small.recommendation.rules.length).toBe(5);

    const files = analyse(
      crafted(),
      model,
      intake((i) => (i.settings.stepByStep.files = 4)),
      state(),
    );
    expect(files.recommendation.mode).toBe("step-by-step");
    expect(rule(files, /source files/)).toMatchObject({ fired: true, value: 5, threshold: 4 });
    const boxes = analyse(
      crafted(),
      model,
      intake((i) => (i.settings.stepByStep.containers = 1)),
      state(),
    );
    expect(rule(boxes, /container/)).toMatchObject({ fired: true, value: 2, threshold: 1 });
    const repos = analyse(
      crafted(),
      model,
      intake((i) => (i.scope.otherRepos = ["billing"])),
      state(),
    );
    expect(rule(repos, /repositories/)).toMatchObject({ fired: true, value: 1, threshold: 0 });
    expect(repos.cannotSee.join("\n")).toMatch(/billing/);
    const passes = analyse(
      crafted(),
      model,
      intake((i) => (i.settings.passBudgetTokens = 1000)),
      state(),
    );
    expect(rule(passes, /passes/)).toMatchObject({ fired: false, value: 1 });
    const many = analyse(
      crafted(),
      model,
      intake((i) => ((i.settings.passBudgetTokens = 1000), (i.settings.stepByStep.passes = 0))),
      state(),
    );
    expect(rule(many, /passes/).fired).toBe(true);
    const java = crafted();
    java.files.notAnalysable = { java: 3 };
    const j = analyse(java, model, intake(), state());
    expect(j.recommendation.mode).toBe("step-by-step");
    expect(j.levels[2]!.percentIsCeiling).toBe(true);
    expect(j.cannotSee[0]).toMatch(/3 java file/);
  });

  it("derives level states from the depth and the final flags", () => {
    const model: ModelSnapshot = { elements: [], relationships: [] };
    const a = analyse(
      crafted(),
      model,
      intake((i) => (i.depth = "c2")),
      state({ levels: { c1: true, c2: false, c3: true, c4: false } }),
    );
    expect(a.levels.map((l) => l.state)).toEqual(["final", "not started", "stopped here", "stopped here"]);
    expect(a.levels[2]!.inScope).toBe(false);
    expect(a.totals.candidates).toBe(3 + 2 + 5);
    expect(a.broken).toEqual(["c3 is final but 3 c1 candidate(s) are undecided", "c3 is final but c2 is not"]);
  });

  it("lists what keeps a level from being final", () => {
    const model: ModelSnapshot = {
      elements: [el("shop", "Shop", "softwareSystem"), el("api", "API", "container", { description: "d" })],
      relationships: [{ id: "shop--api", source: "shop", target: "api", description: "uses" }],
    };
    const a = analyse(crafted(), model, intake(), state());
    const out = canFinalize("c2", a, model, ["Two elements share the ID x."], 2);
    expect(out).toEqual([
      `${a.levels[1]!.undecided} candidate(s) are not decided`,
      "dp check shows 1 error(s): Two elements share the ID x.",
      "1 object(s) have no technology: API",
      '1 relationship(s) have no label or only "uses": shop--api',
      "2 low-confidence item(s) are waiting for a decision",
    ]);
    expect(canFinalize("c4", a, model, []).length).toBe(1);
    const clean: ModelSnapshot = { elements: [el("a", "A", "softwareSystem", { description: "x" })], relationships: [] };
    const none: Evidence = { ...crafted(), facts: [] };
    expect(canFinalize("c1", analyse(none, clean, intake(), state()), clean, [])).toEqual([]);
  });

  it("reads the model of the demo workspace", () => {
    const snap = snapshotModel(demoWs());
    expect(snap.elements.length).toBeGreaterThan(5);
    expect(snap.elements.some((e) => e.kind === "component" && e.codePaths.length > 0)).toBe(true);
    // the code root of a project is the project folder, so the demo's code paths start with sample_code/
    const dir = demoDir();
    const a = analyse(scanRepo(new DiskCode(dir), defaultIntake()), snap, defaultIntake(), state());
    expect(a.levels[2]!.items.map((c) => c.id)).toEqual(["c3:sample_code/api", "c3:sample_code/notifications", "c3:sample_code/payments", "c3:sample_code/pipeline", "c3:sample_code/statements"]);
    expect(a.levels[2]!.accepted).toBeGreaterThan(0);
    expect(a.levels[3]).toMatchObject({ candidates: 36 });
    expect(a.levels[3]!.accepted).toBeGreaterThan(0);
    expect(a.levels[3]!.accepted + a.levels[3]!.undecided).toBe(36);
  });

  it("stores the state and the analysis deterministically", () => {
    const dir = tmpDir();
    expect(readState(dir)).toEqual({ ignore: [], levels: { c1: false, c2: false, c3: false, c4: false } });
    writeState(dir, { ignore: ["vendor/**", "b", "b", "c1:host:x"], levels: { c1: true, c2: false, c3: false, c4: false } });
    expect(readState(dir)).toEqual({ ignore: ["b", "c1:host:x", "vendor/**"], levels: { c1: true, c2: false, c3: false, c4: false } });
    expect(() => writeState(dir, { ignore: ["../x"], levels: { c1: false, c2: false, c3: false, c4: false } })).toThrow(ModelError);
    fs.writeFileSync(path.join(dir, "architecture", "import", "levels.json"), '{"c1": "yes"}');
    expect(() => readState(dir)).toThrow(/c1 must be true or false/);
    const a = analyse(crafted(), { elements: [], relationships: [] }, defaultIntake(), readState(tmpDir()));
    const d1 = tmpDir();
    const d2 = tmpDir();
    writeAnalysis(d1, a);
    writeAnalysis(d2, analyse(crafted(), { elements: [], relationships: [] }, defaultIntake(), readState(tmpDir())));
    const read = (d: string) => fs.readFileSync(path.join(d, "architecture", "import", "analysis.json"), "utf-8");
    expect(read(d1)).toBe(read(d2));
  });
});

// ------------------------------------------------------------------ intake

describe("intake", () => {
  it("has defaults and an absent file is valid", () => {
    const dir = tmpDir();
    const { intake, errors } = readIntake(dir);
    expect(errors).toEqual([]);
    expect(intake).toEqual(defaultIntake());
    expect(intake.depth).toBe("c4");
    expect(intake.settings).toMatchObject({
      maxFiles: 20000,
      maxFileBytes: 524288,
      maxDepth: 25,
      componentDepth: 2,
      componentMinFiles: 2,
      secondsPerItem: 20,
      stepByStep: { files: 300, containers: 5, passes: 2 },
    });
  });
  it("writes atomically in a stable key order and reads it back", () => {
    const dir = tmpDir();
    const written = writeIntake(dir, {
      depth: "c2",
      system: { purpose: "Sells things", name: " Shop " },
      glossary: [{ term: "PSP", means: "payment provider" }],
      mustNotOpen: ["secrets/**"],
      services: [{ system: "Gateway", category: "payments", match: { npm: ["gw"] } }],
      settings: { maxFiles: 50 },
    });
    expect(written.system.name).toBe("Shop");
    const text = fs.readFileSync(path.join(dir, "architecture", "import", "intake.json"), "utf-8");
    expect(Object.keys(JSON.parse(text))).toEqual(["schemaVersion", "system", "audience", "scope", "depth", "ownership", "runtime", "glossary", "mustNotOpen", "services", "settings"]);
    expect(Object.keys(JSON.parse(text).system)).toEqual(["name", "purpose"]);
    expect(readIntake(dir)).toEqual({ intake: written, errors: [] });
    expect(fs.readdirSync(path.join(dir, "architecture", "import"))).toEqual(["intake.json"]);
  });
  it("rejects unknown keys and bad values with field paths", () => {
    const bad = parseIntake({
      colour: "red",
      system: { name: 3, extra: 1 },
      depth: "c5",
      scope: { include: ["ok", "", "../x", "/abs"], exclude: "no" },
      glossary: [{ term: "a" }],
      services: [{ system: "X", category: "c", match: { npm: [], cargo: ["x"] } }],
      settings: { maxFiles: 0, secondsPerItem: 1.5, stepByStep: { files: "many", extra: 1 } },
      mustNotOpen: [3],
    });
    expect(bad.errors.map((e) => `${e.path}: ${e.message}`)).toEqual([
      "colour: unknown field",
      "system.extra: unknown field",
      "system.name: must be text",
      "scope.include[1]: must be a non-empty glob",
      'scope.include[2]: must not contain ".."',
      "scope.include[3]: must be relative to the code root",
      "scope.exclude: must be a list",
      "depth: must be one of c1, c2, c3, c4",
      "glossary[0].means: is required",
      "mustNotOpen[0]: must be a non-empty glob",
      "services[0].match.cargo: unknown field",
      "services[0].match: needs at least one name to match",
      "settings.maxFiles: must be between 1 and 1000000",
      "settings.secondsPerItem: must be a whole number",
      "settings.stepByStep.extra: unknown field",
      "settings.stepByStep.files: must be a whole number",
    ]);
    expect(parseIntake([]).errors).toEqual([{ path: "", message: "must be an object" }]);
    expect(() => writeIntake(tmpDir(), { depth: "c9" })).toThrow(/depth must be one of/);
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, "architecture", "import"), { recursive: true });
    fs.writeFileSync(path.join(dir, "architecture", "import", "intake.json"), "{ not json");
    expect(readIntake(dir).errors[0]!.message).toMatch(/not valid JSON/);
  });
});
