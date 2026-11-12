import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ModelStore } from "@designperspectives/core";
import { LikeC4ModelPort } from "@designperspectives/plugin-model-likec4";
import { main, type Io } from "./index.js";

const DEMO = resolve(import.meta.dirname, "../../../examples/internet-banking");

function capture(): Io & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return { lines, errors, out: (l) => lines.push(l), err: (l) => errors.push(l) };
}

describe("dp CLI", () => {
  it("dp init && dp validate succeeds on a fresh folder (Wave 0 acceptance)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dp-init-"));
    expect(await main(["init", dir, "--name", "Fresh"], capture())).toBe(0);
    const io = capture();
    expect(await main(["validate", dir], io)).toBe(0);
    expect(io.lines.at(-1)).toBe("0 error(s), 0 warning(s), 0 info(s)");
  });

  it("dp init refuses to overwrite an existing architecture folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dp-init-"));
    await main(["init", dir], capture());
    expect(await main(["init", dir], capture())).toBe(1);
  });

  it("invalid files produce precise file:line errors and exit code 1", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dp-bad-"));
    await main(["init", dir], capture());
    await mkdir(join(dir, "architecture/sidecars/elements"), { recursive: true });
    await writeFile(join(dir, "architecture/sidecars/elements/x.yaml"), "id: x\nstatus: maybe\n");
    const views = join(dir, "architecture/model/views.c4");
    await writeFile(views, (await readFile(views, "utf8")) + "views {{\n");
    const io = capture();
    expect(await main(["validate", dir], io)).toBe(1);
    expect(io.errors.some((l) => /^sidecars\/elements\/x\.yaml:2:\d+ error sidecar\/schema/.test(l))).toBe(true);
    expect(io.errors.some((l) => /^model\/views\.c4:\d+:\d+ error likec4\/syntax/.test(l))).toBe(true);
  });

  it("dp validate --json prints machine-readable diagnostics", async () => {
    const io = capture();
    expect(await main(["validate", DEMO, "--json"], io)).toBe(0);
    expect(JSON.parse(io.lines.join("\n")).diagnostics).toEqual([]);
  });

  it("unknown commands and formats exit with code 2", async () => {
    expect(await main(["frobnicate"], capture())).toBe(2);
    expect(await main(["export", DEMO, "--format", "nope"], capture())).toBe(2);
  });
});

describe("FF6 round trip on the demo workspace", () => {
  it("load → save without edits produces zero diff in architecture/", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dp-ff6-"));
    await cp(join(DEMO, "architecture"), join(dir, "architecture"), { recursive: true });
    const store = new ModelStore(new LikeC4ModelPort());
    const ws = await store.load(dir);
    expect(ws.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    expect(store.plan(ws.files, ws)).toEqual({ write: [], remove: [] });
    const result = await store.save(dir, ws.files, ws);
    expect(result).toEqual({ written: [], removed: [] });
  });

  it("an element rename updates every reference and still round-trips", async () => {
    const store = new ModelStore(new LikeC4ModelPort());
    const ws = await store.load(DEMO);
    const { state, diagnostics } = store.renameElement(ws, "ibs.api", "ibs.backend");
    expect(diagnostics).toEqual([]);
    const files = store.print(state);
    expect(files.map((f) => f.content).join("\n")).not.toMatch(/\bibs\.api\b/);
    const reloaded = await store.loadFiles(files);
    expect(reloaded.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    expect(store.plan(files, reloaded)).toEqual({ write: [], remove: [] });
  });
});
