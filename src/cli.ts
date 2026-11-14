#!/usr/bin/env node
/** `dp` command line. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Command, Option } from "commander";
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

  p.command("validate")
    .description("Check the model files; exit code 1 if there are problems.")
    .argument("[path]", "Project folder containing architecture/.", ".")
    .action((dir: string) => {
      let project: Project;
      try {
        project = new Project(dir);
      } catch (e) {
        if (e instanceof NotFound) {
          console.error(e.message);
          process.exit(2);
        }
        console.error(`Could not read the model: ${(e as Error).message}`);
        process.exit(1);
      }
      if (project.loadErrors.length) {
        for (const e of project.loadErrors) console.log(`- ${e}`);
        process.exit(1);
      }
      console.log("OK");
    });

  return p;
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const p = program();
  if (process.argv.length <= 2) p.help();
  p.parse();
}
