/**
 * Writes tests/TESTS.csv: one row per test in tests/unit (Vitest) and tests/browser (Playwright), with what it
 * checks, the source files it covers and the command that runs it alone. Opens in Excel, Numbers or Google Sheets.
 *
 *   npm run test:list               write tests/TESTS.csv
 *   npm run test:list -- --check    exit 1 if tests/TESTS.csv is out of date (CI)
 *
 * The test titles are the "what it checks" column, so write them as plain sentences. Each test file must start
 * with a one-line comment (a doc comment) that says what the file covers; that is the "File purpose" column.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tests", "TESTS.csv");
const SUITES = [
  { dir: "tests/unit", suffix: ".test.ts", browser: false },
  { dir: "tests/browser", suffix: ".spec.ts", browser: true },
];
const COLUMNS = ["File", "Kind", "Area", "Group", "Test (what it checks)", "Runs when", "File purpose", "Source files covered", "Needs", "Run this test alone"] as const;

/** Calls that are not tests or groups even though they start with `test.` or `describe.`. */
const NOT_TESTS = new Set(["use", "beforeEach", "afterEach", "beforeAll", "afterAll", "step", "extend", "setTimeout", "slow", "configure", "info", "fixme", "fail"]);

/** Area by file name: a few prefixes share one area; otherwise the file name in words. */
function areaOf(stem: string): string {
  if (stem.startsWith("bmo")) return "BMO assistant";
  if (stem.startsWith("import")) return "Code import";
  if (stem.startsWith("cli-")) return `Command line: ${words(stem.slice(4))}`;
  if (stem === "api" || stem === "smoke") return "Owner checklist";
  const named: Record<string, string> = {
    auth: "Sign-in and roles",
    roles: "Sign-in and roles",
    ops: "Model edits",
    units: "Model units",
    hub: "Hub and shared catalog",
    spread: "Make room and Spread out",
    "redact-gaps": "BMO assistant",
    "workspace-io": "Model files",
    "history-work": "Linked work status",
    "diff-merge": "Diff and merge",
    "canvas-fixes": "Canvas",
    "move-multi": "Canvas",
    editing: "Canvas",
    "context-menu": "Canvas",
    features: "Stage A2 features",
    inspect: "Live UI inspector",
    inspector: "Live UI inspector",
  };
  if (named[stem]) return named[stem];
  return words(stem);
}
const words = (s: string) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function filePurpose(sf: ts.SourceFile, rel: string): string {
  const first = ts.getLeadingCommentRanges(sf.text, 0)?.[0];
  const text = first && sf.text.slice(first.pos, first.end);
  if (!text?.startsWith("/**")) throw new Error(`${rel} must start with a /** ... */ comment saying what the file covers.`);
  return text
    .replace(/^\/\*\*|\*\/$/g, "")
    .replace(/^\s*\* ?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The repo-relative source files a test file imports from src/ or ui/src/. */
function sourcesOf(sf: ts.SourceFile, file: string): string[] {
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith(".")) continue;
    const stem = path.resolve(path.dirname(file), spec).replace(/\.js$/, "");
    const hit = [stem, `${stem}.ts`, `${stem}.tsx`].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    const rel = hit && path.relative(ROOT, hit).split(path.sep).join("/");
    if (rel && (rel.startsWith("src/") || rel.startsWith("ui/src/"))) out.add(rel);
  }
  return [...out].sort();
}

/** `describe`, `it`, `test` and their modifiers (`test.describe`, `it.skipIf(x)`, `test.each(t)`). */
function testCall(node: ts.CallExpression): { kind: "group" | "test"; modifier: string | null; condition: string | null } | null {
  let callee: ts.Expression = node.expression;
  let condition: string | null = null;
  if (ts.isCallExpression(callee)) {
    condition = callee.arguments.map((a) => a.getText()).join(", ");
    callee = callee.expression;
  }
  const chain: string[] = [];
  while (ts.isPropertyAccessExpression(callee)) {
    chain.unshift(callee.name.text);
    callee = callee.expression;
  }
  if (!ts.isIdentifier(callee) || !["describe", "it", "test"].includes(callee.text)) return null;
  if (chain.some((c) => NOT_TESTS.has(c))) return null;
  const isGroup = callee.text === "describe" || chain.includes("describe");
  const modifier = chain.filter((c) => c !== "describe").pop() ?? null;
  return { kind: isGroup ? "group" : "test", modifier, condition };
}

function titleOf(arg: ts.Expression | undefined): string | null {
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) return arg.getText().slice(1, -1);
  return null;
}

function runsWhen(modifier: string | null, condition: string | null, inherited: string): string {
  const own =
    modifier === "skipIf"
      ? `skipped when ${condition}`
      : modifier === "runIf"
        ? `only when ${condition}`
        : modifier === "each"
          ? `once for each of ${condition}`
          : modifier === "skip"
            ? "skipped"
            : "";
  return [inherited, own].filter(Boolean).join("; ");
}

/** A regular expression that matches the title, safe inside single quotes in a shell. Placeholders filled in at run
 *  time (`%s`, `${name}`) match anything. */
const pattern = (title: string) =>
  title
    .split(/%[sdifjo]|\$\{[^}]*\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
    .replace(/'/g, ".");

/** Short text of a loop's list, for "repeated for each …". */
const short = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}...` : s).replace(/\s+/g, " ");

/** If `node` repeats what it contains (a for loop, `.forEach`), what it repeats over. */
function loopOver(node: ts.Node): string | null {
  if (ts.isForOfStatement(node) || ts.isForInStatement(node)) return short(node.expression.getText());
  if (ts.isForStatement(node)) return short(node.condition?.getText() ?? "a counter");
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ["forEach", "map"].includes(node.expression.name.text)) return short(node.expression.expression.getText());
  return null;
}

type Row = Record<(typeof COLUMNS)[number], string>;

function rowsOf(rel: string, browser: boolean): Row[] {
  const file = path.join(ROOT, rel);
  const text = fs.readFileSync(file, "utf-8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const purpose = filePurpose(sf, rel);
  const sources = sourcesOf(sf, file).join("; ");
  const stem = path.basename(rel).replace(/\.(test|spec)\.ts$/, "");
  const needsGit = /["'`]git["'`]|hasGit/.test(text);
  const rows: Row[] = [];
  const visit = (node: ts.Node, groups: string[], inherited: string) => {
    if (ts.isCallExpression(node)) {
      const call = testCall(node);
      const title = call && titleOf(node.arguments[0]);
      if (call && title !== null) {
        const when = runsWhen(call.modifier, call.condition, inherited);
        if (call.kind === "group") {
          for (const a of node.arguments.slice(1)) visit(a, [...groups, title], when);
          return;
        }
        const body = node.arguments[node.arguments.length - 1]?.getText() ?? "";
        const kind = browser ? "Browser" : /\bdp\(|cli\.ts|spawn(Sync)?\(/.test(body) || stem.startsWith("cli-") ? "CLI" : /["'`]\/api\//.test(body) ? "API" : "Unit";
        const needs = browser ? "Built UI (static/), Chromium" : [kind === "CLI" ? "tsx" : "", needsGit ? "git" : ""].filter(Boolean).join(", ") || "Nothing extra";
        const run = browser ? `npm run test:browser -- ${rel} -g '${pattern(title)}'` : `npm test -- ${rel} -t '${pattern(title)}'`;
        rows.push({
          File: rel,
          Kind: kind,
          Area: areaOf(stem),
          Group: groups.join(" > "),
          "Test (what it checks)": title,
          "Runs when": when || "always",
          "File purpose": purpose,
          "Source files covered": sources,
          Needs: needs,
          "Run this test alone": run,
        });
        return;
      }
    }
    const over = loopOver(node);
    const next = over ? [inherited, `repeated for each of ${over}`].filter(Boolean).join("; ") : inherited;
    ts.forEachChild(node, (n) => visit(n, groups, next));
  };
  visit(sf, [], "");
  return rows;
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function build(): { csv: string; counts: Record<string, number> } {
  const rows: Row[] = [];
  for (const s of SUITES) {
    const files = fs
      .readdirSync(path.join(ROOT, s.dir))
      .filter((f) => f.endsWith(s.suffix))
      .sort();
    for (const f of files) rows.push(...rowsOf(`${s.dir}/${f}`, s.browser));
  }
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.Kind] = (counts[r.Kind] ?? 0) + 1;
  const lines = [COLUMNS, ...rows.map((r) => COLUMNS.map((c) => r[c]))].map((cells) => cells.map(csvCell).join(","));
  // The byte order mark makes Excel read the file as UTF-8.
  return { csv: `\uFEFF${lines.join("\n")}\n`, counts };
}

const { csv, counts } = build();
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const summary = `${total} tests (${Object.entries(counts)
  .map(([k, n]) => `${n} ${k}`)
  .join(", ")})`;
if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf-8") : "";
  if (current !== csv) {
    console.error("tests/TESTS.csv is out of date. Run `npm run test:list` and commit the result.");
    process.exit(1);
  }
  console.log(`tests/TESTS.csv is up to date: ${summary}.`);
} else {
  fs.writeFileSync(OUT, csv);
  console.log(`Wrote tests/TESTS.csv: ${summary}.`);
}
