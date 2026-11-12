/** File-system access for the `architecture/` folder. The only module in core that touches the disk for the model. */
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { SourceFile } from "@designperspectives/contracts";

export const ARCHITECTURE_DIR = "architecture";

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile()) out.push(p);
  }
}

const toPosix = (p: string): string => p.split(sep).join("/");

/** Reads every text file below `<root>/architecture`, paths relative to that folder, CRLF kept as found. */
export async function readArchitectureFiles(root: string): Promise<SourceFile[]> {
  const base = join(root, ARCHITECTURE_DIR);
  const paths: string[] = [];
  await walk(base, paths);
  const files = await Promise.all(
    paths
      .filter((p) => !toPosix(relative(base, p)).startsWith("sidecars/secure/"))
      .map(async (p) => ({ path: toPosix(relative(base, p)), content: await readFile(p, "utf8") })),
  );
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Writes each file via a temporary file + rename so a crash never leaves a half-written file. */
export async function writeArchitectureFiles(root: string, files: readonly SourceFile[]): Promise<void> {
  const base = join(root, ARCHITECTURE_DIR);
  for (const f of files) {
    const target = join(base, f.path);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.dp-tmp`;
    await writeFile(tmp, f.content, "utf8");
    await rename(tmp, target);
  }
}

export async function removeArchitectureFiles(root: string, paths: readonly string[]): Promise<void> {
  const base = join(root, ARCHITECTURE_DIR);
  for (const p of paths) await rm(join(base, p), { force: true });
}
