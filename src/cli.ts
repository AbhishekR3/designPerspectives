#!/usr/bin/env node
/** `dp` command line. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Command, Option } from "commander";
import { diffModels, type Snapshot } from "./core/diff.js";
import { DiskCode, NO_CODE, type CodeSource } from "./core/codeFiles.js";
import { Drafts } from "./core/drafts.js";
import { GitCodes, GitError, GitModels, gitUserName } from "./core/git.js";
import { checkProject, diffMarkdown } from "./core/report.js";
import { AlreadyExists, ARCH_DIR, DEMO_DIR, initProject, NotFound, Project, version, WORKSPACE_FILE } from "./core/project.js";
import { readDemoHistory, writeDemoHistory } from "./demo/demoHistory.js";
import { DEMO_APP_PORT, startDemoApp } from "./demo/demoApp.js";
import { addUser, setRole, ensureGitignored, initUsers, needUsers, readUsers, removeUser, setPassword, usersPath, UsersError, type NewPassword } from "./core/users.js";
import { createApp, LOOPBACK_HOSTS } from "./server/app.js";
import { CredentialStore } from "./core/credentials.js";
import { ModelError } from "./core/ops.js";
import { CREDENTIAL_PROVIDERS } from "./shared/types.js";
import { writeImportHandoff } from "./bmo/importTasks.js";
import { readState, snapshotModel } from "./import/analysis.js";
import { checkImport, missingContainers } from "./import/checks.js";
import { ImportRejected, importToDraft } from "./import/importer.js";
import { analysisTable, evidenceSummary, firstOpenLevel, scanProject } from "./import/overview.js";
import { lowConfidence, readReview } from "./import/review.js";
import { readEvidence } from "./import/scan.js";
import { IMPORT_SCHEMA, MAX_FILE_BYTES, parseImportFile } from "./import/schema.js";
import type { HandoffOffer } from "./shared/types.js";
import { checkHubFolder, copyDemoHub, createHubApp, HUB_FILE, HubError, initHub } from "./server/hub.js";

/** Give a new demo folder its made-up git history (skipped inside an existing repository, or without git). */
function demoHistory(dir: string): void {
  const history = readDemoHistory(DEMO_DIR);
  if (!history) return;
  try {
    const n = writeDemoHistory(dir, history);
    if (n) console.log(`Wrote a made-up git history for the demo (${n} commits), so backtracking has recent changes to show.`);
    else console.log("The demo folder is inside a git repository (or git is missing): no demo history was written.");
  } catch (e) {
    console.error(`Could not write the demo history: ${(e as Error).message}`);
  }
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    /* no browser available: the URL is printed anyway */
  }
}

/** The Host-header names to accept when binding `host`: loopback names for a loopback address,
 *  null (any name) otherwise, since other machines reach the server under names we cannot know. */
export function allowedHostsFor(host: string): string[] | null {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  if (h === "0:0:0:0:0:0:0:1" || /^::ffff:127(?:\.\d{1,3}){3}$/.test(h)) return LOOPBACK_HOSTS;
  if (h === "localhost" || h === "::1" || /^127(?:\.\d{1,3}){3}$/.test(h)) {
    const name = h.includes(":") ? `[${h}]` : h;
    return LOOPBACK_HOSTS.includes(name) ? LOOPBACK_HOSTS : [...LOOPBACK_HOSTS, name];
  }
  return null;
}

/**
 * Why `dp serve` refuses to listen on `host`, or null when it may. A server other machines can reach
 * (any host that is not loopback: 127.0.0.0/8, ::1, localhost) needs protection: a users file with at
 * least one user (sign-in), --read-only, or --insecure to say the open server is meant.
 */
export function exposureProblem(host: string, o: { users: number; readOnly: boolean; insecure: boolean }): string | null {
  if (allowedHostsFor(host) !== null || o.users > 0 || o.readOnly || o.insecure) return null;
  return (
    `--host ${host} lets other machines reach this server, and it has no sign-in, so anyone who can reach it could change the model and the code folder. ` +
    "Do one of these: add users with `dp users init` (sign-in), add --read-only (nobody can change anything), " +
    "or add --insecure (you accept that anyone who can reach it can change everything)."
  );
}

export function program(): Command {
  const p = new Command("dp")
    .description("designPerspectives: C4 architecture models with lenses.")
    .version(`designPerspectives ${version()}`, "--version", "Show the version and exit.")
    .showHelpAfterError();

  p.command("init")
    .description("Create architecture/workspace.json (an empty model by default).")
    .argument("[path]", "Project folder; the model goes in <path>/architecture/.", ".")
    .option("--demo", "Start with the sample model (with its sample code and a made-up git history) instead of an empty one.")
    .option("--empty", "Start with an empty model (the default; accepted for compatibility).")
    .option("--name <name>", "Workspace name (empty model only), or the hub's name with --hub.")
    .option("--hub", "Create a hub instead: <path>/hub.json and an empty shared catalog (--demo: the demo hub, two projects sharing a database).")
    .action((dir: string, o: { demo?: boolean; empty?: boolean; name?: string; hub?: boolean }) => {
      try {
        const demo = Boolean(o.demo) && !o.empty;
        if (o.hub) {
          console.log(`Created ${initHub(dir, { name: o.name, demo, copyDemo: copyDemoHub })}`);
          return;
        }
        console.log(`Created ${initProject(dir, { demo, name: o.name })}`);
        if (demo) demoHistory(dir);
      } catch (e) {
        if (e instanceof AlreadyExists || e instanceof HubError) {
          console.error(`Not overwriting: ${e.message}`);
          process.exit(1);
        }
        throw e;
      }
    });

  p.command("serve")
    .description("Serve the model in the browser. Creates an empty model first if the folder has none (--demo: the sample model).")
    .argument("[path]", "Project folder containing architecture/.", ".")
    .addOption(new Option("--port <port>", "Port to listen on.").default(8765).argParser((v) => parseInt(v, 10)))
    .option(
      "--host <host>",
      "Interface to bind. Keep the default unless you know you need another. Any other than this machine (127.x, ::1, localhost) needs sign-in (dp users init), --read-only or --insecure.",
      "127.0.0.1",
    )
    .option(
      "--allow-host <name>",
      "Also answer requests addressed to this host name (a tunnel or proxy in front of the server). Repeat for more.",
      (v: string, all: string[]) => [...all, v],
      [] as string[],
    )
    .option("--allow-ui-host <name>", "Let the live UI inspector open apps on this host (default: this machine only). Repeat for more.", (v: string, all: string[]) => [...all, v], [] as string[])
    .option("--traces <folder>", "Folder of OpenTelemetry trace files (OTLP JSON) for the live UI inspector (default: <path>/traces).")
    .option("--no-open", "Do not open the browser.")
    .option("--demo", "If the folder has no model, create the sample model (with its sample code and a made-up git history); also run the demo bank web app on 127.0.0.1:4200.")
    .option("--read-only", "Viewer role: browse only; every change is refused.")
    .option("--code-root <folder>", "Folder holding the source code that components point to (default: the project folder).")
    .option("--users <file>", "Users file for sign-in (default: <path>/.dp/users.json; sign-in is off without it).")
    .option("--hub", "<path> is a hub of projects (hub.json); creates one if missing (--demo: the demo hub). Each project's code folder is its own folder.")
    .option("--insecure", "With --host on another interface: start even without sign-in or --read-only (anyone who can reach the server can change everything).")
    .action(
      (
        dir: string,
        o: {
          port: number;
          host: string;
          allowHost: string[];
          allowUiHost: string[];
          traces?: string;
          open: boolean;
          demo?: boolean;
          readOnly?: boolean;
          codeRoot?: string;
          users?: string;
          hub?: boolean;
          insecure?: boolean;
        },
      ) => {
        const usersFile = path.resolve(o.users ?? usersPath(dir));
        let users: ReturnType<typeof readUsers>;
        try {
          // A users file that is given but missing, or not valid, stops the server: never run without the login it asks for.
          if (o.users && !fs.existsSync(usersFile)) throw new UsersError(`There is no users file at ${usersFile}.`);
          users = readUsers(usersFile);
        } catch (e) {
          if (!(e instanceof UsersError)) throw e;
          console.error(`Cannot start: ${e.message}`);
          process.exit(1);
        }
        // Checked before anything is created: a refused start leaves the folder as it was.
        const exposed = exposureProblem(o.host, { users: users?.length ?? 0, readOnly: Boolean(o.readOnly), insecure: Boolean(o.insecure) });
        if (exposed) {
          console.error(`Cannot start: ${exposed}`);
          process.exit(1);
        }
        if (o.hub && !fs.existsSync(path.join(dir, HUB_FILE))) {
          console.log(`No hub found; created ${initHub(dir, { demo: Boolean(o.demo), copyDemo: copyDemoHub })}`);
        } else if (!o.hub && !fs.existsSync(path.join(dir, ARCH_DIR, WORKSPACE_FILE))) {
          const demo = Boolean(o.demo);
          const made = initProject(dir, { demo });
          console.log(demo ? `No model found; created the sample model in ${made}` : `No model found; created an empty model in ${made} (use --demo for the sample model)`);
          if (demo) demoHistory(dir);
        }
        const loopback = allowedHostsFor(o.host);
        const allowedHosts = loopback && [...loopback, ...o.allowHost.map((h) => h.trim().toLowerCase())];
        let app: ReturnType<typeof createApp>;
        try {
          const opts = {
            codeRoot: o.codeRoot ?? null,
            readOnly: Boolean(o.readOnly),
            allowedHosts,
            usersFile: o.users ?? null,
            uiAllowHosts: o.allowUiHost.map((h) => h.trim().toLowerCase()),
            tracesDir: o.traces ?? null,
          };
          if (o.hub && (o.codeRoot || o.traces)) console.error("In a hub, each project's code and traces folders are its own folder: --code-root and --traces are ignored.");
          app = o.hub ? createHubApp(dir, opts).app : createApp(dir, opts);
        } catch (e) {
          if (e instanceof HubError) {
            console.error(`Cannot start: ${e.message}`);
            process.exit(1);
          }
          if (e instanceof UsersError) {
            console.error(`Cannot start: ${e.message}`);
            process.exit(1);
          }
          throw e;
        }
        if (users) console.log(`Login is on (${users.length} user${users.length === 1 ? "" : "s"})`);
        else console.log("Login is off (no .dp/users.json; run `dp users init` to add users)");
        if (allowedHosts === null) {
          console.error(
            users?.length
              ? `Warning: listening on ${o.host}, so other machines can reach this server. Sign-in is on, but the connection is plain HTTP: put an HTTPS proxy in front of it.`
              : o.readOnly
                ? `Warning: listening on ${o.host}, so other machines can reach this server, and it has no login: anyone who can reach it can read the model and the code folder (--read-only: nobody can change them).`
                : `Warning: listening on ${o.host}, so other machines can reach this server, and it has no login: anyone who can reach it can read and change the model and the code folder.`,
          );
        }
        const url = `http://${o.host}:${o.port}/`;
        const server = serve({ fetch: app.fetch, port: o.port, hostname: o.host }, () => {
          console.log(`designPerspectives: ${url}  (Ctrl+C to stop)`);
          if (o.open) setTimeout(() => openBrowser(url), 500);
        });
        if (o.demo && !o.hub) {
          // The demo bank web app, for the live UI inspector (the demo model points at this address).
          startDemoApp({ root: dir, webDir: path.join(DEMO_DIR, "web-app"), tracesDir: o.traces })
            .then((d) => console.log(`Demo web app: ${d.url}  (open it from the Single-Page Application: Inspect live UI; traces go to ${d.tracesFile})`))
            .catch((e: NodeJS.ErrnoException) =>
              console.error(
                e.code === "EADDRINUSE"
                  ? `The demo web app could not start: port ${DEMO_APP_PORT} is in use. The rest of dp works; the live UI inspector needs the app.`
                  : `The demo web app could not start: ${e.message}`,
              ),
            );
        }
        server.on("error", (e: NodeJS.ErrnoException) => {
          console.error(e.code === "EADDRINUSE" ? `Port ${o.port} is already in use. Try --port <another>.` : e.message);
          process.exit(1);
        });
        const stop = () => server.close(() => process.exit(0));
        process.on("SIGINT", stop);
        process.on("SIGTERM", stop);
      },
    );

  const cred = p.command("credentials").description("Integration credentials for dp itself, in <folder>/.dp/credentials.json (never in git). Set DP_SECRET_KEY to encrypt them.");
  const store = (folder: string) => new CredentialStore(folder);
  const fail = (e: unknown) => {
    if (e instanceof ModelError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  };
  cred
    .command("list")
    .description("List credentials (names, providers, scopes; never values).")
    .argument("[folder]", "Project or hub folder.", ".")
    .action((folder: string) => {
      const l = store(folder).list();
      if (!l.credentials.length) console.log("No credentials.");
      for (const c of l.credentials)
        console.log(`  ${c.name.padEnd(24)} ${c.provider.padEnd(14)} ${c.hint}${c.locked ? "  (locked: another DP_SECRET_KEY)" : ""}${c.scopes.length ? `  [${c.scopes.join(", ")}]` : ""}`);
      if (!l.encryptsNew) console.log("Values are not encrypted at rest (set DP_SECRET_KEY to encrypt new and rotated ones).");
    });
  cred
    .command("add")
    .description("Add a credential; the value is read from standard input (so it stays out of your shell history).")
    .argument("<name>", "e.g. github-token")
    .argument("[folder]", "Project or hub folder.", ".")
    .option("--provider <provider>", `One of: ${CREDENTIAL_PROVIDERS.join(", ")}.`, "other")
    .option("--scopes <list>", "Comma-separated scopes, for your reference.")
    .option("--note <text>", "What it is for.")
    .action((name: string, folder: string, o: { provider: string; scopes?: string; note?: string }) => {
      try {
        store(folder).add({ name, provider: o.provider, scopes: o.scopes ?? [], note: o.note ?? "", value: fs.readFileSync(0, "utf-8") });
        console.log(`Added ${name}.`);
      } catch (e) {
        fail(e);
      }
    });
  cred
    .command("rotate")
    .description("Give a credential a new value, read from standard input.")
    .argument("<name>")
    .argument("[folder]", "Project or hub folder.", ".")
    .action((name: string, folder: string) => {
      try {
        store(folder).rotate(name, fs.readFileSync(0, "utf-8"));
        console.log(`Rotated ${name}.`);
      } catch (e) {
        fail(e);
      }
    });
  cred
    .command("remove")
    .description("Remove a credential.")
    .argument("<name>")
    .argument("[folder]", "Project or hub folder.", ".")
    .action((name: string, folder: string) => {
      try {
        store(folder).remove(name);
        console.log(`Removed ${name}.`);
      } catch (e) {
        fail(e);
      }
    });

  p.command("check")
    .alias("validate")
    .description("Check the model, its drafts and its code mapping. Exit code: 0 OK, 1 problems, 2 no model.")
    .argument("[path]", "Project folder containing architecture/.", ".")
    .option("--code-root <folder>", "Folder holding the source code that components point to (default: the project folder).")
    .option("--strict", "Also fail on warnings (code paths that do not exist).")
    .option("--hub", "<path> is a hub: check every project and the shared catalog.")
    .action((dir: string, o: { codeRoot?: string; strict?: boolean; hub?: boolean }) => {
      const { errors, warnings } = o.hub ? checkHubFolder(dir) : checkProject(openProject(dir, o.codeRoot));
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
    .option("--no-code", "Leave out the code files behind mapped objects.")
    .option("--code-root <folder>", "Folder holding the source code (default: the project folder).")
    .action((dir: string, o: { base: string; head?: string; format: "md" | "json"; out?: string; exitCode?: boolean; code?: boolean; codeRoot?: string }) => {
      const project = openProject(dir, o.codeRoot);
      const gitModels = new GitModels(project.dir);
      const gitCodes = new GitCodes(project.codeRoot);
      let beforeCode: CodeSource;
      let afterCode: CodeSource = new DiskCode(project.codeRoot);
      let before: Snapshot;
      let after: Snapshot = project;
      let baseLabel: string;
      let headLabel = "the files on disk";
      try {
        const b = gitModels.at(o.base);
        before = b;
        beforeCode = codeAt(gitCodes, o.base);
        baseLabel = `\`${o.base}\` (${b.sha.slice(0, 7)})${b.present ? "" : ", which has no model"}`;
        if (o.head) {
          const h = gitModels.at(o.head);
          after = h;
          afterCode = codeAt(gitCodes, o.head);
          headLabel = `\`${o.head}\` (${h.sha.slice(0, 7)})`;
        }
      } catch (e) {
        if (e instanceof GitError || e instanceof NotFound) {
          console.error(e.message);
          process.exit(2);
        }
        throw e;
      }
      const cs = diffModels(before, after, o.base, o.code === false ? undefined : { before: beforeCode, after: afterCode });
      const text = o.format === "json" ? JSON.stringify(cs, null, 2) + "\n" : diffMarkdown(cs, before, after, baseLabel, headLabel);
      if (o.out) fs.writeFileSync(o.out, text, "utf-8");
      else process.stdout.write(text);
      const s = cs.summary;
      if (o.exitCode && s.added + s.changed + s.removed + s.code > 0) process.exit(1);
    });

  p.command("plan")
    .description("The coding plan of a draft: what to build, connect, change or remove. With --check, how much of it the code already does.")
    .argument("<draft>", "Draft ID (the folder name under architecture/drafts/).")
    .argument("[path]", "Project folder containing architecture/.", ".")
    .option("--check", "Check progress against the code folder (or --against). Exit code 1 while steps are open.")
    .option("--against <ref>", "Check against a git branch, tag or commit instead of the code folder.")
    .option("--code-root <folder>", "Folder holding the source code (default: the project folder).")
    .addOption(new Option("--format <format>", "Output format.").choices(["md", "json"]).default("md"))
    .option("--out <file>", "Write the plan to a file instead of printing it.")
    .action((id: string, dir: string, o: { check?: boolean; against?: string; codeRoot?: string; format: "md" | "json"; out?: string }) => {
      const project = openProject(dir, o.codeRoot);
      const drafts = new Drafts(project);
      if (!drafts.list().some((d) => d.id === id)) {
        const ids = drafts.list().map((d) => d.id);
        console.error(`No draft "${id}".${ids.length ? ` Drafts: ${ids.join(", ")}` : " There are no drafts."}`);
        process.exit(2);
      }
      let target = null;
      try {
        if (o.against) target = new GitCodes(project.codeRoot).at(o.against);
        else if (o.check) target = new DiskCode(project.codeRoot);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(2);
      }
      if (target && !target.hasRoot) {
        // Without code to read, every automatic step would be "unchecked" and the run would pass.
        console.error(o.against ? `Cannot check against "${o.against}": the code folder is not in a git repository that has it.` : "Cannot check: there is no code folder.");
        process.exit(2);
      }
      const plan = drafts.plan(id, target);
      const text = o.format === "json" ? JSON.stringify(plan, null, 2) + "\n" : plan.markdown;
      if (o.out) fs.writeFileSync(o.out, text, "utf-8");
      else process.stdout.write(text);
      if ((o.check || o.against) && plan.summary.open > 0) process.exit(1);
    });

  p.command("scan")
    .description(
      "Scan the code for what a C4 model needs (dependencies, Dockerfiles, compose, folders, imports). No network and no model. Writes architecture/import/evidence.json and analysis.json. Exit code: 0 OK, 1 problem, 2 no model.",
    )
    .argument("[path]", "Project folder containing architecture/.", ".")
    .option("--code-root <folder>", "Folder holding the source code to scan (default: the project folder).")
    .option(
      "--plan",
      "Also print the readiness analysis as a table: per level the candidates, decided, left and state; the totals; the recommendation and which rules fired; what the scan cannot see.",
    )
    .option("--prompt", "Also write the handoff files for one level (architecture/import/handoff/) and print where they are and the line to give your coding agent.")
    .addOption(new Option("--level <level>", "With --prompt: the level (default: the first of c1 to c3 that is not final).").choices(["c1", "c2", "c3"]))
    .option("--container <id>", "With --prompt --level c3: the ID of the container whose components are proposed.")
    .option("--json", "Print the scan summary, the analysis and the handoff as JSON instead of text.")
    .action((dir: string, o: { codeRoot?: string; plan?: boolean; prompt?: boolean; level?: "c1" | "c2" | "c3"; container?: string; json?: boolean }) => {
      if ((o.level || o.container) && !o.prompt) {
        console.error("--level and --container only work with --prompt.");
        process.exit(1);
      }
      const project = openProject(dir, o.codeRoot);
      const drafts = new Drafts(project);
      const code = new DiskCode(project.codeRoot);
      try {
        const { evidence, analysis } = scanProject(project, drafts, code);
        const summary = evidenceSummary(evidence);
        let offer: Omit<HandoffOffer, "prompt"> | null = null;
        if (o.prompt) {
          const level = o.level ?? firstOpenLevel(project);
          if (!level) throw new ModelError("C1 to C3 are all final: there is nothing left to ask BMO about. Reopen a level first.");
          const { prompt: _prompt, ...rest } = writeImportHandoff(project, drafts, code, { task: "import-level", level, ...(o.container ? { container: o.container } : {}) });
          offer = rest;
        }
        if (o.json) {
          console.log(JSON.stringify({ evidence: summary, analysis, handoff: offer }, null, 2));
          return;
        }
        const f = summary.files;
        console.log(
          `Scanned ${f.total} files (${
            Object.entries(f.byLanguage)
              .map(([k, n]) => `${k} ${n}`)
              .join(", ") || "no source files"
          }).`,
        );
        console.log(`Found: C1 ${summary.facts.c1}, C2 ${summary.facts.c2}, C3 ${summary.facts.c3} facts, ${summary.facts.c4} source files, ${summary.imports} folder imports.`);
        for (const l of summary.limits) console.log(`! Scan limit: ${l.detail}${l.path ? ` (${l.path})` : ""}`);
        for (const n of summary.notParsed) console.log(`! Not parsed: ${n.path}: ${n.reason}`);
        console.log(`Wrote ${path.join(ARCH_DIR, "import", "evidence.json")} and analysis.json.`);
        if (o.plan) process.stdout.write(`\n${analysisTable(analysis)}`);
        if (offer) {
          console.log(`\nWrote the ${offer.task} prompt (${offer.promptVersion}, about ${offer.estTokens} tokens) to ${offer.folder}/:`);
          for (const name of offer.files) console.log(`  ${name}`);
          console.log(`\nGive your coding agent this line:\n  ${offer.instruction}`);
          console.log("Then load result.json with dp serve (Import page), or check it by hand: dp import --check <result.json>.");
        }
      } catch (e) {
        if (e instanceof ModelError) {
          console.error(e.message);
          process.exit(1);
        }
        throw e;
      }
    });

  p.command("import")
    .description(
      "Bring an import file (JSON) into the model as a draft. Nothing reaches the main model until its items are accepted and the draft is applied. Exit code: 0 OK, 1 problems, 2 no model.",
    )
    .argument("[file]", "The import file (see --schema for its format).")
    .argument("[path]", "Project folder containing architecture/.", ".")
    .option("--check", "Only check the file: print errors and warnings, create nothing. Exit code 1 when there are errors.")
    .option("--title <title>", "The draft's title (default: Import C2, or the level of the file).")
    .option("--schema", "Print the JSON Schema of the import file and exit.")
    .option("--code-root <folder>", "Folder holding the source code that the file's code paths point to (default: the project folder).")
    .action((file: string | undefined, dir: string, o: { check?: boolean; title?: string; schema?: boolean; codeRoot?: string }) => {
      if (o.schema) {
        console.log(JSON.stringify(IMPORT_SCHEMA, null, 2));
        return;
      }
      if (!file) {
        console.error("Give the import file, or --schema to print its format.");
        process.exit(1);
      }
      let text: string;
      try {
        if (fs.statSync(file).size > MAX_FILE_BYTES) {
          console.error(`${file} is over ${MAX_FILE_BYTES} bytes, the most an import file may have.`);
          process.exit(1);
        }
        text = fs.readFileSync(file, "utf-8");
      } catch (e) {
        if (e instanceof Error && "code" in e) {
          console.error(`Cannot read ${file}: ${e.message}`);
          process.exit(1);
        }
        throw e;
      }
      const project = openProject(dir, o.codeRoot);
      const code = new DiskCode(project.codeRoot);
      const { file: parsed, errors: parseErrors } = parseImportFile(text);
      const show = (list: { pointer: string; message: string }[], mark: string) => {
        for (const e of list) console.log(`${mark} ${e.pointer ? `${e.pointer}: ` : ""}${e.message}`);
      };
      if (!parsed) {
        show(parseErrors, "-");
        process.exit(1);
      }
      const evidence = readEvidence(project.root);
      const existing = snapshotModel(project.workspace)
        .elements.filter((e) => e.kind === "container")
        .map((e) => ({ id: e.id, name: e.name, codePaths: e.codePaths }));
      const extra = evidence ? missingContainers(parsed, evidence, { ignore: readState(project.root).ignore, existing }) : [];
      if (o.check) {
        const check = checkImport(parsed, project, code);
        show(check.errors, "-");
        show([...check.warnings, ...extra], "!");
        if (check.errors.length) process.exit(1);
        console.log(check.warnings.length + extra.length ? `OK (${check.warnings.length + extra.length} warning${check.warnings.length + extra.length === 1 ? "" : "s"})` : "OK");
        return;
      }
      const drafts = new Drafts(project, gitUserName(project.dir));
      const taken = new Set(drafts.list().map((d) => d.title));
      const base = o.title ?? `Import ${parsed.level === "all" ? "(all levels)" : parsed.level.toUpperCase()}`;
      let title = base;
      for (let n = 2; !o.title && taken.has(title); n++) title = `${base} (${n})`;
      try {
        const r = importToDraft(drafts, parsed, { title, code });
        const rp = r.report;
        console.log(`Created draft "${title}" (${r.draftId}).`);
        console.log(
          `  created ${rp.created.length}, updated ${rp.updated.length}, kept your edit ${rp.kept.filter((k) => k.reason === "your-edit").length}, kept the model's value ${rp.kept.filter((k) => k.reason !== "your-edit").length}, not in this import ${rp.notInImport.length}, unchanged ${rp.unchanged}`,
        );
        const review = readReview(project.dir, r.draftId);
        const low = review ? lowConfidence(review).length : 0;
        console.log(`  ${low} item${low === 1 ? "" : "s"} need${low === 1 ? "s" : ""} an explicit accept (nothing cites evidence the tool can check).`);
        show([...r.warnings, ...extra], "!");
        console.log("Review and accept the items in dp serve (open the draft), then apply it.");
      } catch (e) {
        if (e instanceof ImportRejected) {
          console.log(e.message);
          show(e.errors, "-");
          show(e.warnings, "!");
          process.exit(1);
        }
        if (e instanceof ModelError) {
          console.error(e.message);
          process.exit(1);
        }
        throw e;
      }
    });

  usersCommands(p);

  return p;
}

/** `dp users ...`: the users file for sign-in. */
function usersCommands(p: Command): void {
  const users = p.command("users").description("Manage who can sign in (the users file, <path>/.dp/users.json). Sign-in is off while the file does not exist.");
  const fileOpt = () => new Option("--users <file>", "Users file (default: <path>/.dp/users.json).");
  const fileOf = (dir: string, o: { users?: string }) => path.resolve(o.users ?? usersPath(dir));
  /** Run a users command: UsersError is printed and exits with 1. */
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if (e instanceof UsersError) {
        console.error(e.message);
        process.exit(1);
      }
      throw e;
    }
  };
  const stdinPassword = (o: { passwordStdin?: boolean }): string | null => {
    if (!o.passwordStdin) return null;
    const line = fs.readFileSync(0, "utf-8").split(/\r?\n/)[0] ?? "";
    if (!line) throw new UsersError("No password on standard input.");
    return line;
  };
  const table = (rows: string[][]) => {
    const w = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
    for (const r of rows)
      console.log(
        "  " +
          r
            .map((x, i) => x.padEnd(w[i]!))
            .join("  ")
            .trimEnd(),
      );
  };
  const printPasswords = (made: NewPassword[]) => {
    table([["name", "role", "password"], ...made.map((m) => [m.name, m.role, m.password])]);
    console.log(made.length === 1 ? "The password is shown only this once." : "The passwords are shown only this once.");
  };
  /** After the default users file is created: keep it out of git. */
  const afterCreate = (dir: string, o: { users?: string }) => {
    if (!o.users) {
      const done = ensureGitignored(dir);
      if (done === "added") console.log("Added .dp/ to .gitignore.");
      if (done === "created") console.log("Created .gitignore with .dp/.");
    }
  };
  const reminder = (file: string) => console.log(`Reminder: never commit ${file}: it holds the password hashes.`);

  users
    .command("init")
    .description("Create the users file with the users architect, engineer and viewer, each with a random password.")
    .argument("[path]", "Project folder.", ".")
    .addOption(fileOpt())
    .action((dir: string, o: { users?: string }) =>
      run(() => {
        const file = fileOf(dir, o);
        const made = initUsers(file);
        console.log(`Created ${file} with ${made.length} users. Sign-in is on from the next request.`);
        printPasswords(made);
        afterCreate(dir, o);
        reminder(file);
      }),
    );

  users
    .command("add")
    .description("Add a user with a random password (or one read from standard input).")
    .argument("<name>", "User name: 1 to 40 letters, digits, dots, dashes or underscores.")
    .argument("[path]", "Project folder.", ".")
    .addOption(new Option("--role <role>", "architect, engineer or viewer.").choices(["architect", "engineer", "viewer"]).makeOptionMandatory())
    .option("--password-stdin", "Read the password from the first line of standard input instead of generating one.")
    .addOption(fileOpt())
    .action((name: string, dir: string, o: { role: string; passwordStdin?: boolean; users?: string }) =>
      run(() => {
        const file = fileOf(dir, o);
        const existed = fs.existsSync(file);
        const made = addUser(file, name, o.role, stdinPassword(o));
        console.log(`Added ${made.name} (${made.role}) to ${file}.`);
        if (!o.passwordStdin) printPasswords([made]);
        if (!existed) afterCreate(dir, o);
        reminder(file);
      }),
    );

  users
    .command("passwd")
    .description("Set a new password for a user (random, or read from standard input). Signs that user out.")
    .argument("<name>", "User name.")
    .argument("[path]", "Project folder.", ".")
    .option("--password-stdin", "Read the password from the first line of standard input instead of generating one.")
    .addOption(fileOpt())
    .action((name: string, dir: string, o: { passwordStdin?: boolean; users?: string }) =>
      run(() => {
        const made = setPassword(fileOf(dir, o), name, stdinPassword(o));
        console.log(`New password set for ${made.name}.`);
        if (!o.passwordStdin) printPasswords([made]);
      }),
    );

  users
    .command("remove")
    .description("Remove a user (not the last architect). Signs that user out.")
    .argument("<name>", "User name.")
    .argument("[path]", "Project folder.", ".")
    .addOption(fileOpt())
    .action((name: string, dir: string, o: { users?: string }) =>
      run(() => {
        const gone = removeUser(fileOf(dir, o), name);
        console.log(`Removed ${gone.name} (${gone.role}).`);
      }),
    );

  users
    .command("role")
    .description("Set a user's role everywhere, or (with --project, in a hub) in one project; role \"default\" with --project removes that project's own role.")
    .argument("<name>", "User name.")
    .argument("<role>", "architect, engineer or viewer; with --project also none (no access: the project is hidden) or default.")
    .argument("[path]", "Project or hub folder.", ".")
    .option("--project <id>", "A hub project's ID: the role applies there only.")
    .addOption(fileOpt())
    .action((name: string, role: string, dir: string, o: { project?: string; users?: string }) =>
      run(() => {
        const u = setRole(fileOf(dir, o), name, role, o.project ?? null);
        console.log(o.project ? `${u.name} is ${u.projects?.[o.project] ?? `${u.role} (their role everywhere)`} in ${o.project}.` : `${u.name} is now ${u.role}. They are signed out.`);
      }),
    );

  users
    .command("list")
    .description("List the users and their roles.")
    .argument("[path]", "Project folder.", ".")
    .addOption(fileOpt())
    .action((dir: string, o: { users?: string }) =>
      run(() => {
        const list = needUsers(fileOf(dir, o));
        if (!list.length) console.log("No users: nobody can sign in. Add one with `dp users add <name> --role architect`.");
        else if (!list.some((u) => u.projects)) table([["name", "role"], ...list.map((u) => [u.name, u.role])]);
        else
          table([
            ["name", "role", "in projects"],
            ...list.map((u) => [
              u.name,
              u.role,
              Object.entries(u.projects ?? {})
                .map(([p, r]) => `${p}: ${r}`)
                .join(", "),
            ]),
          ]);
      }),
    );
}

/** The code at a ref, or none when the code folder is not in that repository / has no such ref. */
function codeAt(codes: GitCodes, ref: string): CodeSource {
  try {
    return codes.at(ref);
  } catch {
    return NO_CODE;
  }
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
