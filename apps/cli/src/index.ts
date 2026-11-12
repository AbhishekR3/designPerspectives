import { parseArgs } from "node:util";
import { cmdExport, cmdFormat, cmdInit, cmdValidate, cmdVersion, type Io } from "./commands.js";

export * from "./commands.js";

const USAGE = `Usage: dp <command> [options]

Commands:
  init [dir] [--name <name>]                 Scaffold an architecture/ folder
  validate [dir] [--json]                    Validate the model and sidecars (exit 1 on errors)
  format [dir] [--check]                     Rewrite files in canonical form (--check: report only)
  export [dir] --format <fmt> [--out <dir>] [--view <id>]...
                                             Export (formats depend on installed plug-ins)
  version                                    Print versions and plug-ins
`;

const consoleIo: Io = { out: (l) => console.log(l), err: (l) => console.error(l) };

export async function main(argv: string[], io: Io = consoleIo): Promise<number> {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      name: { type: "string" },
      json: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      format: { type: "string" },
      out: { type: "string" },
      view: { type: "string", multiple: true },
    },
  });
  const dir = positionals[0] ?? ".";
  switch (command) {
    case "init":
      return cmdInit(dir, values.name, io);
    case "validate":
      return cmdValidate(dir, values.json ?? false, io);
    case "format":
      return cmdFormat(dir, values.check ?? false, io);
    case "export":
      if (!values.format) return usage(io, "export needs --format");
      return cmdExport(dir, values.format, values.out, values.view, io);
    case "version":
    case "--version":
      return cmdVersion(io);
    default:
      return usage(io, command ? `Unknown command "${command}"` : undefined);
  }
}

function usage(io: Io, problem?: string): number {
  if (problem) io.err(problem);
  io.out(USAGE);
  return problem ? 2 : 0;
}
