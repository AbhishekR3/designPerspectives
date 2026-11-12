// Bundles the desktop app with esbuild into out/{main,preload,renderer}.
//  main     ESM, platform node; electron and the workspace packages stay external (core resolves its worker
//           modules via import.meta.url, the LikeC4 adapter loads WASM/files at runtime).
//  preload  one CommonJS file; its only require is `electron` (sandboxed preloads cannot load modules).
//  renderer browser bundle of React + @xyflow/react + CSS; contracts is narrowed to the pure model module.
import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_SECURITY_POLICY } from "./src/main/window-options.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const require = createRequire(import.meta.url);
const contractsDist = join(dirname(require.resolve("@designperspectives/contracts")));

/** Maps a bare import to a file. */
const alias = (name, file) => ({
  name: `alias:${name}`,
  setup(b) {
    b.onResolve({ filter: new RegExp(`^${name.replace(/[/.]/g, "\\$&")}$`) }, () => ({ path: file }));
  },
});

await rm(out, { recursive: true, force: true });

const common = { bundle: true, sourcemap: true, logLevel: "warning", absWorkingDir: here, target: "es2023" };

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/main/main.ts"],
    outfile: "out/main/main.js",
    platform: "node",
    format: "esm",
    external: ["electron", "@designperspectives/core", "@designperspectives/plugin-model-likec4", "@designperspectives/contracts"],
    // The sample model (fallback workspace) is bundled from its own module: the `testing` entry also
    // pulls in the Vitest contract suites.
    plugins: [alias("@designperspectives/contracts/testing", join(contractsDist, "testing", "sample-model.js"))],
  }),
  build({
    ...common,
    entryPoints: ["src/preload/preload.ts"],
    outfile: "out/preload/preload.cjs",
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: ["src/renderer/main.tsx"],
    outfile: "out/renderer/renderer.js",
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    // FF12: the renderer may use only the pure model functions of contracts (kindLabel, keyForView);
    // any other runtime import from contracts fails the build here.
    plugins: [alias("@designperspectives/contracts", join(contractsDist, "model.js"))],
  }),
]);

const html = await readFile(join(here, "src/renderer/index.html"), "utf8");
await mkdir(join(out, "renderer"), { recursive: true });
await writeFile(join(out, "renderer/index.html"), html.replace("%CONTENT_SECURITY_POLICY%", CONTENT_SECURITY_POLICY));

const preload = await readFile(join(out, "preload/preload.cjs"), "utf8");
const requires = [...preload.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]);
if (requires.some((r) => r !== "electron")) throw new Error(`preload requires more than electron: ${requires.join(", ")}`);
console.log("built out/main, out/preload, out/renderer");
