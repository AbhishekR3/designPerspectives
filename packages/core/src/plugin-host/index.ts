/**
 * Plug-in Host (spec file 01 §5.3–5.4, ADR-0005): registry + contract version checks + isolation option.
 * The core never imports a plug-in package; applications (CLI, desktop host) load plug-ins and register them here.
 */
import type { Diagnostic, Exporter, JobHandler, ModelPort, PluginManifest, PluginModule, PortName } from "@designperspectives/contracts";
import { CONTRACTS_VERSION, PORT_NAMES, satisfies, sortDiagnostics } from "@designperspectives/contracts";

export interface RegisteredPlugin {
  manifest: PluginManifest;
  /** Absolute module path, when the plug-in came from a file (needed to run its jobs in a worker). */
  modulePath?: string;
}

const PROVIDED: Partial<Record<PortName, (m: PluginModule) => unknown[] | undefined>> = {
  ModelPort: (m) => m.modelPorts,
  Exporter: (m) => m.exporters,
  Job: (m) => m.jobs,
};

function portProblems(m: PluginModule): string[] {
  const problems: string[] = [];
  for (const p of m.manifest.provides) {
    if (!(PORT_NAMES as readonly string[]).includes(p)) problems.push(`unknown port "${p}"`);
    const getter = PROVIDED[p];
    if (getter && !getter(m)?.length) problems.push(`declares ${p} but exports none`);
  }
  return problems;
}

function manifestProblems(m: PluginModule): string[] {
  const man = m.manifest;
  if (!man?.id) return ["manifest.id is missing"];
  const problems = portProblems(m);
  if (!satisfies(CONTRACTS_VERSION, man.contracts)) problems.push(`implements contracts ${man.contracts}, host provides ${CONTRACTS_VERSION}`);
  if (man.isolation === "worker" && man.provides.some((p) => p !== "Job")) problems.push(`isolation "worker" is only supported for Job plug-ins in this version`);
  return problems;
}

export class PluginHost {
  private readonly plugins = new Map<string, RegisteredPlugin>();
  private readonly modelPorts = new Map<string, ModelPort>();
  private readonly exporters = new Map<string, Exporter>();
  private readonly jobs = new Map<string, { handler: JobHandler; plugin: RegisteredPlugin }>();
  private readonly diags: Diagnostic[] = [];

  /** Registers a plug-in. Returns false (and records a diagnostic) when the manifest or contract version is rejected. */
  register(module: PluginModule, modulePath?: string): boolean {
    const problems = manifestProblems(module);
    const id = module.manifest?.id ?? "(unknown)";
    if (this.plugins.has(id)) problems.push("already registered");
    if (problems.length) {
      this.diags.push(...problems.map((message) => ({ severity: "error" as const, code: "plugin/rejected", subject: id, message: `Plug-in ${id}: ${message}` })));
      return false;
    }
    const reg: RegisteredPlugin = { manifest: module.manifest, ...(modulePath ? { modulePath } : {}) };
    this.plugins.set(id, reg);
    this.addAll(module, reg);
    return true;
  }

  /** Loads a plug-in module by specifier (package name or absolute path) and registers its default export. */
  async load(specifier: string): Promise<boolean> {
    try {
      const mod = (await import(specifier)) as { default?: PluginModule };
      if (!mod.default) throw new Error("module has no default export");
      return this.register(mod.default, specifier.startsWith("/") ? specifier : undefined);
    } catch (err) {
      this.diags.push({ severity: "error", code: "plugin/load-failed", subject: specifier, message: `Could not load plug-in ${specifier}: ${String(err)}` });
      return false;
    }
  }

  private addAll(m: PluginModule, reg: RegisteredPlugin): void {
    for (const p of m.modelPorts ?? []) this.addUnique(this.modelPorts, p.id, p, "ModelPort", reg);
    for (const e of m.exporters ?? []) this.addUnique(this.exporters, e.format, e, "Exporter", reg);
    for (const j of m.jobs ?? []) {
      if (this.jobs.has(j.type)) this.conflict("Job", j.type, reg);
      else this.jobs.set(j.type, { handler: j, plugin: reg });
    }
  }

  private addUnique<T>(map: Map<string, T>, key: string, value: T, port: string, reg: RegisteredPlugin): void {
    if (map.has(key)) this.conflict(port, key, reg);
    else map.set(key, value);
  }

  private conflict(port: string, key: string, reg: RegisteredPlugin): void {
    this.diags.push({ severity: "warning", code: "plugin/conflict", subject: reg.manifest.id, message: `${port} "${key}" is already provided by another plug-in; ${reg.manifest.id}'s copy is ignored.` });
  }

  list(): RegisteredPlugin[] {
    return [...this.plugins.values()].sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : 1));
  }

  modelPort(id: string): ModelPort | undefined {
    return this.modelPorts.get(id);
  }

  exporter(format: string): Exporter | undefined {
    return this.exporters.get(format);
  }

  exportFormats(): string[] {
    return [...this.exporters.keys()].sort();
  }

  job(type: string): { handler: JobHandler; plugin: RegisteredPlugin } | undefined {
    return this.jobs.get(type);
  }

  diagnostics(): Diagnostic[] {
    return sortDiagnostics(this.diags);
  }
}
