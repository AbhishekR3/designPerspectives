#!/usr/bin/env node
/** `dp` command line. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Command, Option } from "commander";
import { diffModels, type Snapshot } from "./core/diff.js";
import { DiskCode, NO_CODE, type CodeSource } from "./core/codefs.js";
import { Drafts } from "./core/drafts.js";
import { GitCodes, GitError, GitModels } from "./core/git.js";
import { checkProject, diffMarkdown } from "./core/report.js";
import { AlreadyExists, ARCH_DIR, initProject, NotFound, Project, version, WORKSPACE_FILE } from "./core/store.js";
import { addUser, ensureGitignored, initUsers, needUsers, readUsers, removeUser, setPassword, usersPath, UsersError, type NewPassword } from "./core/users.js";
import { createApp, LOOPBACK_HOSTS } from "./server/app.js";

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

export function program(): Command {
  const p = new Command("dp")
    .description("designPerspectives: C4 architecture models with lenses.")
    .version(`designPerspectives ${version()}`, "--version", "Show the version and exit.")
    .showHelpAfterError();

  p.command("init")
    .description("Create architecture/workspace.json (an empty model by default).")
    .argument("[path]", "Project folder; the model goes in <path>/architecture/.", ".")
    .option("--demo", "Start with the sample model (and its sample code) instead of an empty one.")
    .option("--empty", "Start with an empty model (the default; accepted for compatibility).")
    .option("--name <name>", "Workspace name (empty model only).")
    .action((dir: string, o: { demo?: boolean; empty?: boolean; name?: string }) => {
      try {
        console.log(`Created ${initProject(dir, { demo: Boolean(o.demo) && !o.empty, name: o.name })}`);
      } catch (e) {
        if (e instanceof AlreadyExists) {
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
    .option("--host <host>", "Interface to bind. Keep the default unless you know you need another.", "127.0.0.1")
    .option(
      "--allow-host <name>",
      "Also answer requests addressed to this host name (a tunnel or proxy in front of the server). Repeat for more.",
      (v: string, all: string[]) => [...all, v],
      [] as string[],
    )
    .option("--no-open", "Do not open the browser.")
    .option("--demo", "If the folder has no model, create the sample model (with its sample code) instead of an empty one.")
    .option("--read-only", "Viewer role: browse only; every change is refused.")
    .option("--code-root <folder>", "Folder holding the source code that components point to (default: the project folder).")
    .option("--users <file>", "Users file for sign-in (default: <path>/.dp/users.json; sign-in is off without it).")
    .action((dir: string, o: { port: number; host: string; allowHost: string[]; open: boolean; demo?: boolean; readOnly?: boolean; codeRoot?: string; users?: string }) => {
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
      if (!fs.existsSync(path.join(dir, ARCH_DIR, WORKSPACE_FILE))) {
        const demo = Boolean(o.demo);
        const made = initProject(dir, { demo });
        console.log(demo ? `No model found; created the sample model in ${made}` : `No model found; created an empty model in ${made} (use --demo for the sample model)`);
      }
      const loopback = allowedHostsFor(o.host);
      const allowedHosts = loopback && [...loopback, ...o.allowHost.map((h) => h.trim().toLowerCase())];
      let app: ReturnType<typeof createApp>;
      try {
        app = createApp(dir, { codeRoot: o.codeRoot ?? null, readOnly: Boolean(o.readOnly), allowedHosts, usersFile: o.users ?? null });
      } catch (e) {
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
          users
            ? `Warning: listening on ${o.host}, so other machines can reach this server. Sign-in is on, but the connection is plain HTTP: put an HTTPS proxy in front of it.`
            : `Warning: listening on ${o.host}, so other machines can reach this server, and it has no login: anyone who can reach it can read and change the model and the code folder.`,
        );
      }
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
    .command("list")
    .description("List the users and their roles.")
    .argument("[path]", "Project folder.", ".")
    .addOption(fileOpt())
    .action((dir: string, o: { users?: string }) =>
      run(() => {
        const list = needUsers(fileOf(dir, o));
        if (!list.length) console.log("No users: nobody can sign in. Add one with `dp users add <name> --role architect`.");
        else table([["name", "role"], ...list.map((u) => [u.name, u.role])]);
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
