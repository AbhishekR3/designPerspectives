/** Security review: redaction gaps (every form below is masked), what is deliberately kept, and the time limits (no pattern is quadratic). */

import { describe, expect, it } from "vitest";
import { deniedName, redactText } from "../src/bmo/redact.js";
import { secretLike } from "../src/shared/mask.js";

/** [form, text, the secret value that must not survive]. */
const MASKED: [string, string, string][] = [
  ["URL password with a slash", "DATABASE_URL=postgres://app:ab/cd+ef@db.internal:5432/app", "ab/cd+ef"],
  ["URL password with an at sign", "url: 'postgres://app:p@ssw0rd@db:5432/x'", "ssw0rd"],
  ["scheme-less DSN", "const dsn = 'app:Sup3rS3cret@tcp(db:3306)/x'", "Sup3rS3cret"],
  ["Go mysql DSN", 'db, _ := sql.Open("mysql", "root:Sup3rS3cret!@tcp(127.0.0.1:3306)/app")', "Sup3rS3cret"],
  ["PRIVATE_KEY", "PRIVATE_KEY=hunter2hunter2", "hunter2hunter2"],
  ["ENCRYPTION_KEY", "ENCRYPTION_KEY: Zk9Lq2Wm", "Zk9Lq2Wm"],
  ["a signing key in hex", "JWT_SIGNING_KEY=0123456789abcdef0123456789abcdef0123456789abcdef", "0123456789abcdef0123456789abcdef"],
  ["an API key name in camel case", 'const stripeKey = "abcd1234efgh"', "abcd1234efgh"],
  ["apiKey", 'cfg.apiKey = "abcd1234efgh"', "abcd1234efgh"],
  ["passphrase", "passphrase = 'correct horse battery staple'", "correct horse"],
  ["pwd", "PWD=Tr0ub4dor&3", "Tr0ub4dor"],
  ["credentials", "credentials: admin:admin123", "admin123"],
  ["credential", 'credential = "Hunter22xx"', "Hunter22xx"],
  ["private", "private = Zk9Lq2WmXx", "Zk9Lq2WmXx"],
  ["XML element", "<password>hunter2hunter2</password>", "hunter2hunter2"],
  ["XML element named ApiKey", "<ApiKey>abcd1234efgh</ApiKey>", "abcd1234efgh"],
  [".NET add key/value", '<add key="ApiKey" value="abcd1234efgh"/>', "abcd1234efgh"],
  ["XML name/value", '<setting name="DbPassword" value="abcd1234efgh"></setting>', "abcd1234efgh"],
  ["XML attribute value next to a secret name", '<param id="signing_key" other="x" value=\'abcd1234efgh\'/>', "abcd1234efgh"],
  ["setRequestProperty", 'conn.setRequestProperty("X-Api-Key", "abcd1234efgh");', "abcd1234efgh"],
  ["header index", 'req.headers["x-api-key"] = "s3cr3tvalue99";', "s3cr3tvalue99"],
  ["put", 'config.put("password", "hunter22");', "hunter22"],
  ["Kubernetes Secret data", "apiVersion: v1\nkind: Secret\nmetadata:\n  name: db\ndata:\n  password: cGFzc3dvcmQxMjM=\n  username: YWRtaW4=\n", "YWRtaW4="],
  ["Kubernetes Secret stringData", "kind: Secret\nstringData:\n  db-pw: hunter22hunter\n  other: plainvalue77\n", "plainvalue77"],
  ["Kubernetes Secret in a multi-document file", "kind: ConfigMap\ndata:\n  color: blue\n---\nkind: Secret\ndata:\n  a: Zm9vYmFyMTIz\n", "Zm9vYmFyMTIz"],
  ["npmrc _auth", "//registry.npmjs.org/:_auth=dXNlcjpwYXNz", "dXNlcjpwYXNz"],
  ["npmrc _authToken", "//registry.npmjs.org/:_authToken=abcd1234efgh5678", "abcd1234efgh5678"],
  ["psql --password=", "psql --password=hunter22", "hunter22"],
  ["a flag with a space", "mysql --password hunter22 app", "hunter22"],
  ["docker -e", "docker run -e POSTGRES_PASSWORD=hunter22 postgres", "hunter22"],
  ["mysql -p", "mysql -u root -pHunter22 app", "Hunter22"],
  ["SQL PASSWORD", "CREATE USER app WITH PASSWORD 'hunter22';", "hunter22"],
  ["SQL IDENTIFIED BY", "CREATE USER app IDENTIFIED BY 'Hunter22xx';", "Hunter22xx"],
  ["Slack webhook", "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX", "B00000000"],
  ["Discord webhook", "curl https://discord.com/api/webhooks/123456789012/abcdefghijklmnop-qrstuv", "abcdefghijklmnop"],
  ["TOML multi-line", '[database]\npassword = """\nhunter2\nsecondline77\n"""', "secondline77"],
  ["YAML quoted multi-line", 'password: "first line\n  secondline77\n  third"', "secondline77"],
  ["YAML plain continuation", "password: firstpart88\n  secondline77\nnext: 1", "secondline77"],
  ["a long hex assigned to a constant", 'const HMAC = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";', "9f86d081884c7d659a2feaa0c55ad015"],
  ["a long hex next to a secret name", 'sign(secretValue, "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08")', "9f86d081884c7d659a2feaa0c55ad015"],
];

describe("redactText: forms that used to get through", () => {
  for (const [form, text, secret] of MASKED) {
    it(`masks: ${form}`, () => {
      const r = redactText(text);
      expect(r.failed).toBeUndefined();
      expect(r.text, form).not.toContain(secret);
      expect(r.count, form).toBeGreaterThan(0);
    });
  }

  it("keeps the other values of a Secret document's neighbours and the structure", () => {
    const r = redactText("kind: ConfigMap\ndata:\n  color: blue\n---\nkind: Secret\ndata:\n  a: Zm9vYmFyMTIz\n");
    expect(r.text).toContain("color: blue");
    expect(r.text).toContain("kind: Secret");
    expect(r.text).toContain("a:");
  });

  it("keeps the host and the host-side of a URL with credentials", () => {
    expect(redactText("postgres://app:ab/cd+ef@db.internal:5432/app").text).toContain("db.internal:5432/app");
    expect(redactText("postgres://app:p@ssw0rd@db:5432/x").text).toContain("@db:5432/x");
    expect(redactText("app:Sup3rS3cret@tcp(db:3306)/x").text).toContain("tcp(db:3306)/x");
  });
});

describe("redactText: what is deliberately kept", () => {
  const KEPT = [
    "password: ${DB_PASSWORD}",
    "token: string;",
    "api_key: <your key>",
    "const password = process.env.DB_PASSWORD",
    'secret = os.environ["APP_SECRET"]',
    "LOG_LEVEL=debug",
    "PRIMARY_KEY = 'id'",
    "FOREIGN_KEY: user_id",
    "PARTITION_KEY=tenant",
    "sort_key = created_at",
    "cache_key = f(user)",
    "KEY_ID=us-east-1-primary",
    "keyboard = qwerty",
    "monkey = banana",
    "turkey: sandwich",
    "key: value",
    "- key: color\n  value: blue",
    'const config = { key: "color", private: true }',
    "https://example.com/docs/page",
    "mailto:someone@example.com",
    "https://example.com/users/a@b.example/profile",
    '<add key="Color" value="blue"/>',
    "<name>Ledger Service</name>",
    "kind: ConfigMap\ndata:\n  color: blue",
    "git commit 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b",
    '"sha": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"',
    "checksum = 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    'SELECT "password" FROM users',
    "CREATE USER app IDENTIFIED BY ${DB_PASSWORD};",
    "mysql -u root -h db app",
    "ls -p src",
  ];
  for (const text of KEPT) {
    it(`keeps: ${text.replace(/\n/g, " / ")}`, () => {
      const r = redactText(text);
      expect(r.text).toBe(text);
      expect(r.count).toBe(0);
    });
  }
});

describe("secretLike (used on import files and BMO answers)", () => {
  it("catches the same names as redactText and not the non-secrets", () => {
    for (const s of ["PRIVATE_KEY=hunter2hunter2", "ENCRYPTION_KEY: Zk9Lq2Wm", "passphrase = 'Correct-horse-9'", "PWD=Tr0ub4dor&3"]) expect(secretLike(s), s).not.toBeNull();
    for (const s of ["PRIMARY_KEY = 'id'", "FOREIGN_KEY: user_id", "key: value", "monkey = banana"]) expect(secretLike(s), s).toBeNull();
  });
});

describe("the deny-list", () => {
  it("refuses config files that hold connection strings and state", () => {
    for (const f of [
      "web.config",
      "src/Web.Config",
      "appsettings.json",
      "appsettings.Production.json",
      "prod.tfvars",
      "vault.kdbx",
      "terraform.tfstate",
      "terraform.tfstate.backup",
      "a/b/secrets.auto.tfvars",
    ]) {
      expect(deniedName(f), f).not.toBeNull();
    }
    for (const f of ["src/config.ts", "package.json", "docs/settings.md", "appsettings-notes.txt"]) expect(deniedName(f), f).toBeNull();
  });
});

describe("no pattern is quadratic", () => {
  const N = 1_000_000;
  const inputs: [string, string][] = [
    ["spaces after a key", "password" + " ".repeat(N)],
    ["one long run", "a".repeat(N)],
    ["a key then spaces, repeated", ("token:" + " ".repeat(100)).repeat(Math.floor(N / 106))],
    ["BEGIN repeated", "-----BEGIN X-----".repeat(Math.floor(N / 17))],
    ["BEGIN and END pairs", "-----BEGIN X-----\nabc\n-----END X-----\n".repeat(Math.floor(N / 38))],
    ["URL-like", ("ab://" + "x".repeat(50)).repeat(Math.floor(N / 55))],
    ["URL with many at signs", "https://" + "a@".repeat(N / 2)],
    ["URL with many slashes then no at sign", "https://u:p" + "/a".repeat(N / 2)],
    ["list entries", "- name: password\n".repeat(Math.floor(N / 17))],
    ["quotes", '"' + "\\a".repeat(N / 2)],
    ["equals chain", "a=".repeat(N / 2)],
    ["dotted keys", "a.".repeat(N / 2) + "=1"],
    ["block scalars", "password: |\n".repeat(Math.floor(N / 12))],
    ["modifiers", "export const const const const ".repeat(Math.floor(N / 31))],
    ["bearer", ("Bearer " + "a".repeat(11) + " ").repeat(Math.floor(N / 19))],
    ["open tags", "<a ".repeat(N / 3)],
    ["one long open tag", "<add key=" + '"k" '.repeat(N / 4)],
    ["tags with attributes", '<add key="password" value="x" '.repeat(Math.floor(N / 30))],
    ["element text", "<a>".repeat(N / 3)],
    ["quoted call keys", '("password", '.repeat(Math.floor(N / 14))],
    ["index forms", '["password"] = '.repeat(Math.floor(N / 15))],
    ["triple quotes", 'password = """\n'.repeat(Math.floor(N / 15))],
    ["SQL", "IDENTIFIED BY ".repeat(Math.floor(N / 14))],
    ["DSN", "a:b@".repeat(N / 4)],
    ["DSN with tcp", "a:" + "b@".repeat(N / 2) + "tcp("],
    ["mysql flags", "mysql -p".repeat(N / 8)],
    ["hex runs", "k = " + "0123456789abcdef".repeat(N / 16)],
    ["webhooks", "https://hooks.slack.com/services/".repeat(Math.floor(N / 34))],
    ["lines", "k: v\n".repeat(N / 5)],
    ["CRs", "\r".repeat(N)],
    ["kubernetes docs", "---\nkind: Secret\ndata:\n  a: b\n".repeat(Math.floor(N / 32))],
  ];
  for (const [name, text] of inputs) {
    it(`${name} is handled in well under 500 ms`, () => {
      const t = Date.now();
      redactText(text);
      expect(Date.now() - t).toBeLessThan(500);
    });
  }
  it("secretLike on hostile input is fast too", () => {
    for (const text of ["a=".repeat(N / 2), "a.".repeat(N / 2), "k: " + "x".repeat(N), "-----BEGIN ".repeat(N / 11)]) {
      const t = Date.now();
      secretLike(text);
      expect(Date.now() - t).toBeLessThan(500);
    }
  });
});
