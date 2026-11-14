#!/usr/bin/env node
/** `dp` command line. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Command, Option } from "commander";
import { diffModels, type Snapshot } from "./core/diff.js";
import { GitError, GitModels } from "./core/git.js";
import { checkProject, diffMarkdown } from "./core/report.js";
import { AlreadyExists, ARCH_DIR, initProject, NotFound, Project, version, WORKSPACE_FILE } from "./core/store.js";
import { createApp } from "./server/app.js";

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    /* no browser available: the URL is printed anyway */
  }
}

export function program(): Command {
  const p = new Command("dp")
    .description("designPerspectives: C4 architecture models with lenses.")
    .version(`designPerspectives ${version()}`, "--version", "Show the version and exit.")
    .showHelpAfterError();

  p.command("init")
    .description("Create architecture/workspace.json (demo model by default).")
    .argument("[path]", "Project folder; the model goes in <path>/architecture/.", ".")
    .option("--empty", "Start with an empty model instead of the demo.")
    .option("--name <name>", "Workspace name (empty model only).")
    .action((dir: string, o: { empty?: boolean; name?: string }) => {
      try {
        console.log(`Created ${initProject(dir, { demo: !o.empty, name: o.name })}`);
      } catch (e) {
        if (e instanceof AlreadyExists) {
          console.error(`Not overwriting: ${e.message}`);
          process.exit(1);
        }
        throw e;
      }
    });

  p.command("serve")
    .description("Serve the model in the browser. Creates the demo model first if the folder has none.")
    .argument("[path]", "Project folder containing architecture/.", ".")
    .addOption(new Option("--port <port>", "Port to listen on.").default(8765).argParser((v) => parseInt(v, 10)))
    .option("--host <host>", "Interface to bind. Keep the default unless you know you need another.", "127.0.0.1")
    .option("--no-open", "Do not open the browser.")
    .option("--read-only", "Viewer role: browse only; every change is refused.")
    .option("--code-root <folder>", "Folder holding the source code that components point to (default: the project folder).")
    .action((dir: string, o: { port: number; host: string; open: boolean; readOnly?: boolean; codeRoot?: string }) => {
      if (!fs.existsSync(path.join(dir, ARCH_DIR, WORKSPACE_FILE))) {
        console.log(`No model found; created the demo model in ${initProject(dir, { demo: true })}`);
      }
      const app = createApp(dir, { codeRoot: o.codeRoot ?? null, readOnly: Boolean(o.readOnly) });
      const url = `http://${o.host}:${o.port}/`;
      const server = serve({ fetch: app.fetch, port: o.port, hostname: o.host }, () => {
        console.log(`designPerspectives: ${url}  (Ctrl+C to stop)`);
        if (o.open) setTimeout(() => openBrowser(url), 500);
      });
      server.on("error", (e: NodeJS.ErrnoException) => {
        console.error(e.code === "EADDRINUSE" ? `Port ${o.port} is already in use. Try --port <another>.` : e.message);
        process.exit(1);
      });
      const stop = () => server.close(() => process.exit(0));
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    });

  p.command("check")
    .alias("validate")
    .description("Check the model, its drafts and its code mapping. Exit code: 0 OK, 1 problems, 2 no model.")
    .argument("[path]", "Project folder containing architecture/.", ".")
    .option("--code-root <folder>", "Folder holding the source code that components point to (default: the project folder).")
    .option("--strict", "Also fail on warnings (code paths that do not exist).")
    .action((dir: string, o: { codeRoot?: string; strict?: boolean }) => {
      const project = openProject(dir, o.codeRoot);
      const { errors, warnings } = checkProject(project);
      for (const e of errors) console.log(`- ${e}`);
      for (const w of warnings) console.log(`! ${w}`);
      if (errors.length || (o.strict && warnings.length)) process.exit(1);
      console.log(warnings.length ? `OK (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : "OK");
    });

  p.command("diff")
    .description("What changed in the model since a git ref (branch, tag or commit), as Markdown or JSON.")
    .argument("[path]", "Project folder containing architecture/.", ".")
    .requiredOption("--base <ref>", "The version to compare with, e.g. origin/main.")
    .option("--head <ref>", "Compare with this ref instead of the files on disk.")
    .addOption(new Option("--format <format>", "Output format.").choices(["md", "json"]).default("md"))
    .option("--out <file>", "Write the report to a file instead of printing it.")
    .option("--exit-code", "Exit with 1 when the model changed (like git diff --exit-code).")
    .action((dir: string, o: { base: string; head?: string; format: "md" | "json"; out?: string; exitCode?: boolean }) => {
      const project = openProject(dir);
      const gitModels = new GitModels(project.dir);
      let before: Snapshot;
      let after: Snapshot = project;
      let baseLabel: string;
      let headLabel = "the files on disk";
      try {
        const b = gitModels.at(o.base);
        before = b;
        baseLabel = `\`${o.base}\` (${b.sha.slice(0, 7)})${b.present ? "" : ", which has no model"}`;
        if (o.head) {
          const h = gitModels.at(o.head);
          after = h;
          headLabel = `\`${o.head}\` (${h.sha.slice(0, 7)})`;
        }
      } catch (e) {
        if (e instanceof GitError || e instanceof NotFound) {
          console.error(e.message);
          process.exit(2);
        }
        throw e;
      }
      const cs = diffModels(before, after, o.base);
      const text = o.format === "json" ? JSON.stringify(cs, null, 2) + "\n" : diffMarkdown(cs, before, after, baseLabel, headLabel);
      if (o.out) fs.writeFileSync(o.out, text, "utf-8");
      else process.stdout.write(text);
      const s = cs.summary;
      if (o.exitCode && s.added + s.changed + s.removed > 0) process.exit(1);
    });

  return p;
}

/** Open the model in `dir`, or exit: 2 if there is none, 1 if it cannot be read. */
function openProject(dir: string, codeRoot?: string): Project {
  try {
    return new Project(dir, codeRoot ?? null);
  } catch (e) {
    if (e instanceof NotFound) {
      console.error(e.message);
      process.exit(2);
    }
    console.error(`Could not read the model: ${(e as Error).message}`);
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const p = program();
  if (process.argv.length <= 2) p.help();
  p.parse();
}
