import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { ComputedView, Diagnostic } from "@designperspectives/contracts";
import { CONTRACTS_VERSION, formatDiagnostic, hasErrors } from "@designperspectives/contracts";
import { ARCHITECTURE_DIR, ModelStore, PluginHost, type LoadedWorkspace } from "@designperspectives/core";
import { BUILTIN_PLUGINS } from "./builtins.js";
import { scaffold } from "./scaffold.js";

export const CLI_VERSION = "0.1.0";

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

export function createHost(): PluginHost {
  const host = new PluginHost();
  for (const p of BUILTIN_PLUGINS) host.register(p);
  return host;
}

function store(host: PluginHost): ModelStore {
  const port = host.modelPort("likec4");
  if (!port) throw new Error("No ModelPort plug-in registered");
  return new ModelStore(port);
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

function report(diags: readonly Diagnostic[], io: Io, json: boolean): void {
  if (json) {
    io.out(JSON.stringify({ diagnostics: diags }, null, 2));
    return;
  }
  for (const d of diags) (d.severity === "error" ? io.err : io.out)(formatDiagnostic(d));
  const count = (s: string) => diags.filter((d) => d.severity === s).length;
  io.out(`${count("error")} error(s), ${count("warning")} warning(s), ${count("info")} info(s)`);
}

export async function cmdVersion(io: Io): Promise<number> {
  const host = createHost();
  io.out(`dp ${CLI_VERSION} (contracts ${CONTRACTS_VERSION}, node ${process.versions.node})`);
  for (const p of host.list()) io.out(`  plug-in ${p.manifest.id}@${p.manifest.version} provides ${p.manifest.provides.join(", ")}`);
  return 0;
}

export async function cmdInit(dir: string, name: string | undefined, io: Io): Promise<number> {
  const root = resolve(dir);
  if (await exists(join(root, ARCHITECTURE_DIR))) {
    io.err(`${join(root, ARCHITECTURE_DIR)} already exists; nothing written.`);
    return 1;
  }
  const s = store(createHost());
  const { written } = await s.save(root, [], scaffold(name ?? basename(root)));
  io.out(`Created ${ARCHITECTURE_DIR}/ in ${root}:`);
  for (const p of written) io.out(`  ${p}`);
  return 0;
}

async function loadOrFail(dir: string, io: Io): Promise<{ ws: LoadedWorkspace; store: ModelStore; host: PluginHost } | number> {
  const root = resolve(dir);
  if (!(await exists(join(root, ARCHITECTURE_DIR)))) {
    io.err(`No ${ARCHITECTURE_DIR}/ folder in ${root}. Run \`dp init\` first.`);
    return 2;
  }
  const host = createHost();
  const s = store(host);
  return { ws: await s.load(root), store: s, host };
}

export async function cmdValidate(dir: string, json: boolean, io: Io): Promise<number> {
  const r = await loadOrFail(dir, io);
  if (typeof r === "number") return r;
  report(r.ws.diagnostics, io, json);
  return hasErrors(r.ws.diagnostics) ? 1 : 0;
}

/** Rewrites the workspace in canonical form (useful after hand edits). Reports what changed. */
export async function cmdFormat(dir: string, check: boolean, io: Io): Promise<number> {
  const r = await loadOrFail(dir, io);
  if (typeof r === "number") return r;
  if (hasErrors(r.ws.diagnostics)) {
    report(r.ws.diagnostics, io, false);
    return 1;
  }
  const plan = r.store.plan(r.ws.files, r.ws);
  const changed = [...plan.write.map((f) => f.path), ...plan.remove.map((p) => `${p} (removed)`)];
  if (check) {
    for (const p of changed) io.out(`not canonical: ${p}`);
    return changed.length ? 1 : 0;
  }
  await r.store.save(resolve(dir), r.ws.files, r.ws);
  io.out(changed.length ? `Formatted ${changed.length} file(s).` : "Already canonical.");
  return 0;
}

export async function cmdExport(dir: string, format: string, outDir: string | undefined, viewIds: string[] | undefined, io: Io): Promise<number> {
  const r = await loadOrFail(dir, io);
  if (typeof r === "number") return r;
  const exporter = r.host.exporter(format);
  if (!exporter) {
    io.err(`Unknown export format "${format}". Available: ${r.host.exportFormats().join(", ")}`);
    return 2;
  }
  if (hasErrors(r.ws.diagnostics)) {
    report(r.ws.diagnostics, io, false);
    return 1;
  }
  const model = r.ws.model;
  const ids = viewIds?.length ? viewIds : model.views.map((v) => v.id);
  const port = r.host.modelPort("likec4")!;
  const views: ComputedView[] = [];
  if (exporter.needsLayout) for (const id of ids) views.push(await port.layoutView(model, id));
  const name = r.ws.sidecars.settings?.name ?? basename(resolve(dir));
  const files = exporter.export({ model, views, workspaceName: name }, viewIds?.length ? { viewIds } : {});
  const target = resolve(outDir ?? join(dir, "dp-export"));
  for (const f of files) {
    const p = join(target, f.path);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, f.content, "utf8");
    io.out(`wrote ${p}`);
  }
  return 0;
}
