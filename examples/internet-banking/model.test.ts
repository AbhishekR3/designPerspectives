import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SIDECAR_SCHEMAS, relationshipIdOf, type SidecarPattern } from "@designperspectives/contracts";
import { validateModel } from "@designperspectives/core";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { internetBankingModel } from "./model.js";

const ARCH = join(dirname(fileURLToPath(import.meta.url)), "architecture");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** Minimal glob for the patterns in SIDECAR_SCHEMAS: `**` spans folders, `*` stays within one. */
function patternFor(file: string): SidecarPattern | undefined {
  return (Object.keys(SIDECAR_SCHEMAS) as SidecarPattern[]).find((p) => {
    const re = p
      .replace(/[.]/g, "\\.")
      .replace(/\*\*\//g, "\u0000")
      .replace(/\*/g, "[^/]*")
      .replace(/\u0000/g, "(?:.*/)?");
    return new RegExp(`^${re}$`).test(file);
  });
}

function frontMatter(text: string): unknown {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error("missing front matter");
  return parse(m[1] ?? "");
}

describe("Internet Banking demo workspace", () => {
  it("validates with no errors and no warnings", () => {
    const problems = validateModel(internetBankingModel()).filter((d) => d.severity === "error" || d.severity === "warning");
    expect(problems).toEqual([]);
  });

  it("has the expected shape", () => {
    const model = internetBankingModel();
    expect(model.views.map((v) => v.type).sort()).toEqual(
      ["component", "container", "context", "deployment", "deployment", "dynamic", "landscape"],
    );
    expect(model.elements.filter((e) => e.tags?.includes("external")).map((e) => e.id).sort()).toEqual(["corebanking", "ses"]);
  });

  const files = filesUnder(ARCH).map((f) => relative(ARCH, f).split("\\").join("/")).sort();

  it.each(files)("%s parses with its schema", (file) => {
    const pattern = patternFor(file);
    expect(pattern, `no schema for ${file}`).toBeDefined();
    const text = readFileSync(join(ARCH, file), "utf8");
    expect(text.endsWith("\n") && !text.endsWith("\n\n") && !text.includes("\r")).toBe(true);
    const data = file.endsWith(".md") ? frontMatter(text) : parse(text);
    const result = SIDECAR_SCHEMAS[pattern!].safeParse(data);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("sidecars refer to elements and relationships of the model", () => {
    const model = internetBankingModel();
    const elementIds = new Set(model.elements.map((e) => e.id));
    const relIds = new Set(model.relationships.map(relationshipIdOf));
    for (const file of files.filter((f) => f.startsWith("sidecars/elements/"))) {
      expect(elementIds.has((parse(readFileSync(join(ARCH, file), "utf8")) as { id: string }).id)).toBe(true);
    }
    const rels = parse(readFileSync(join(ARCH, "sidecars/relationships.yaml"), "utf8")) as { id: string }[];
    for (const r of rels) expect(relIds.has(r.id), r.id).toBe(true);
  });
});
