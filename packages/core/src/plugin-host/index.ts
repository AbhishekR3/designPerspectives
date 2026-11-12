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

function problemsForPort(m: PluginModule, p: PortName): string[] {
  if (!(PORT_NAMES as readonly string[]).includes(p)) return [`unknown port "${p}"`];
  const getter = PROVIDED[p];
  const missing = getter !== undefined && (getter(m) ?? []).length === 0;
  return missing ? [`declares ${p} but exports none`] : [];
}

function portProblems(m: PluginModule): string[] {
  const problems: string[] = [];
  for (const p of m.manifest.provides) problems.push(...problemsForPort(m, p));
  return problems;
}

type ManifestCheck = (man: PluginManifest) => string | undefined;

const MANIFEST_CHECKS: ManifestCheck[] = [
  (man) => (satisfies(CONTRACTS_VERSION, man.contracts) ? undefined : `implements contracts ${man.contracts}, host provides ${CONTRACTS_VERSION}`),
  (man) =>
    man.isolation === "worker" && man.provides.some((p) => p !== "Job") ? `isolation "worker" is only supported for Job plug-ins in this version` : undefined,
];

function manifestProblems(m: PluginModule): string[] {
  if (!m.manifest?.id) return ["manifest.id is missing"];
  const checks = MANIFEST_CHECKS.map((c) => c(m.manifest)).filter((x): x is string => x !== undefined);
  return [...portProblems(m), ...checks];
}

const idOf = (m: PluginModule): string => m.manifest?.id ?? "(unknown)";

export class PluginHost {
  private readonly plugins = new Map<string, RegisteredPlugin>();
  private readonly modelPorts = new Map<string, ModelPort>();
  private readonly exporters = new Map<string, Exporter>();
  private readonly jobs = new Map<string, { handler: JobHandler; plugin: RegisteredPlugin }>();
  private readonly diags: Diagnostic[] = [];

  /** Registers a plug-in. Returns false (and records a diagnostic) when the manifest or contract version is rejected. */
  register(module: PluginModule, modulePath?: string): boolean {
    const id = idOf(module);
    const problems = [...manifestProblems(module), ...this.duplicateProblems(id)];
    if (problems.length) return this.reject(id, problems);
    const reg: RegisteredPlugin = { manifest: module.manifest, ...(modulePath ? { modulePath } : {}) };
    this.plugins.set(id, reg);
    this.addAll(module, reg);
    return true;
  }

  private duplicateProblems(id: string): string[] {
    return this.plugins.has(id) ? ["already registered"] : [];
  }

  private reject(id: string, problems: string[]): false {
    this.diags.push(...problems.map((message) => ({ severity: "error" as const, code: "plugin/rejected", subject: id, message: `Plug-in ${id}: ${message}` })));
    return false;
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
    const ports = m.modelPorts ?? [];
    const exporters = m.exporters ?? [];
    const jobs = m.jobs ?? [];
    ports.forEach((p) => this.addUnique(this.modelPorts, p.id, p, "ModelPort", reg));
    exporters.forEach((e) => this.addUnique(this.exporters, e.format, e, "Exporter", reg));
    jobs.forEach((j) => this.addUnique(this.jobs, j.type, { handler: j, plugin: reg }, "Job", reg));
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
