# W0-SPIKE-TREESITTER — web-tree-sitter (WASM) vs native tree-sitter bindings

Date: 2026-11-12 · Environment: Linux x64 (sandbox container, root, 2 cores / 7 GB, shared with other running agents), Node v22.23.4, npm 10.9.9; Electron 45.3.0 (Node 24.22.2) from `spikes/shell`

## Question
For tier-1 structural extraction (imports and top-level declarations) in TypeScript, TSX, JavaScript, Python, Java, Go and C#, should Wave 3 use `web-tree-sitter` (WASM) or the native `tree-sitter` Node binding? The parser must run in Electron utility processes and in a plain Node CLI on macOS, Windows and Linux.

## Method
All commands run in `spikes/treesitter/`.

- Metadata: `npm view <pkg> version license dist.unpackedSize`, `npm view <pkg> "time[<version>]"`, `npm view <pkg> repository.url`.
- Install: `npm install --ignore-scripts --legacy-peer-deps web-tree-sitter@0.27.2 tree-sitter-wasms@0.1.13 @vscode/tree-sitter-wasm@0.3.1 tree-sitter@0.25.1 tree-sitter-typescript tree-sitter-javascript tree-sitter-python tree-sitter-java tree-sitter-go tree-sitter-c-sharp` (2 s, 13 packages). The same command without `--legacy-peer-deps` failed (finding 6).
- Shipped files: `ls node_modules/<pkg>/prebuilds`, `find node_modules/<pkg> -name '*.wasm'`, `nm -D --undefined-only <file>.node`, `file <file>.node`, `cmp` between `.wasm` files.
- Prototype: `bench.mjs` (queries are in the file), sample sources in `samples/` (35–40 lines each), synthetic files generated in memory (about 5,000 lines each). Runs: `node bench.mjs --json > run1.json`, again to `run2.json`, and `xvfb-run -a ../shell/node_modules/electron/dist/electron electron-main.cjs --no-sandbox --json` (output in `run-electron.json`), which executes `bench.mjs` inside `utilityProcess.fork`.
- Timing method: per language, one parser instance, 7 parses of the synthetic file; "first" is parse 1, "median" is the median of parses 2–7. Query time is the median of 3 runs of `query.captures(root)` on the parsed synthetic tree.

## Findings
| # | Claim from the spec ([Training]) | Result (confirmed / contradicted / not verified) | Evidence (command output, file path in the package, or URL + exact quoted text) |
|---|---|---|---|
| 1 | `web-tree-sitter` is current and permissively licensed | confirmed | `web-tree-sitter@0.27.2`, MIT, published 2026-11-07. Ships `web-tree-sitter.wasm` (210,688 bytes), ESM and CJS entry points and `.d.ts` types (`package.json` `exports`). No install script, no native code. |
| 2 | The `tree-sitter-<lang>` npm packages ship a prebuilt `.wasm` | confirmed for all seven grammars | Files present in the installed tarballs: `tree-sitter-typescript@0.23.2` → `tree-sitter-typescript.wasm` (1.41 MB), `tree-sitter-tsx.wasm` (1.45 MB); `tree-sitter-javascript@0.25.0` (0.41 MB); `tree-sitter-python@0.25.0` (0.46 MB); `tree-sitter-java@0.23.5` (0.41 MB); `tree-sitter-go@0.25.0` (0.22 MB); `tree-sitter-c-sharp@0.23.5` → `tree-sitter-c_sharp.wasm` (5.35 MB). All MIT. Runtime plus seven grammars total 9.5 MB. Publish dates: typescript 2024-11-11, java 2024-12-21, go 2025-08-29, javascript 2025-09-01, python 2025-09-11, c-sharp 2026-04-14. |
| 3 | `tree-sitter-wasms` is a usable aggregate source | contradicted for `web-tree-sitter@0.27.2` | `tree-sitter-wasms@0.1.13`, Unlicense, published 2025-10-07, 36 grammars. `Language.load()` threw for all seven languages inside `getDylinkMetadata` (`web-tree-sitter.js:1966`). Its files carry a custom section named `dylink`; the grammar packages' own files carry `dylink.0`. Its `devDependencies` pin `tree-sitter-cli ^0.20.8` and grammar versions `^0.20.x`. |
| 4 | `@vscode/tree-sitter-wasm` is a usable aggregate source | confirmed | `@vscode/tree-sitter-wasm@0.3.1`, MIT, published 2026-04-07; contains all seven grammars plus its own `tree-sitter.js` / `tree-sitter.wasm` runtime. All seven loaded in `web-tree-sitter@0.27.2` and produced the same tree and capture hashes as the grammar packages' own files. Six files are byte-identical to the grammar packages' files (`cmp`); the C# file differs in size (5.10 MB vs 5.35 MB). Its README describes it as build scripts for the files "used by VS Code". |
| 5 | Native `tree-sitter` installs on Node 22 with a prebuilt, no compile | confirmed (Linux x64) | `tree-sitter@0.25.1`, MIT, published 2026-07-28. `scripts.install = node-gyp-build`; running it took 0.3 s and created no `build/` directory. `require('tree-sitter')` loaded on Node 22.23.4 after an `--ignore-scripts` install. `prebuilds/` contains `darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-arm64`, `win32-x64` for the core and for all six grammar packages. `file` reports `prebuilds/darwin-arm64/tree-sitter.node` as `Mach-O 64-bit arm64 bundle`. No musl prebuild directory is present. |
| 6 | Native core and grammar packages install together without conflict | contradicted | Plain `npm install` failed with `ERESOLVE`: `tree-sitter-java@0.23.5` declares `peerOptional tree-sitter@"^0.21.1"` and `tree-sitter-typescript@0.23.2` declares `^0.21.0`, while javascript, python, go and c-sharp declare `^0.25.0`. Installing with `--legacy-peer-deps` worked, and the java and typescript grammars loaded and parsed correctly under `tree-sitter@0.25.1`. |
| 7 | Native grammars load the same way in all cases | contradicted for C# | `require('tree-sitter-c-sharp')` from Node 22 failed with `ERR_REQUIRE_ASYNC_MODULE` (ESM graph with top-level await); `await import()` worked, with deprecation warning `DEP0151` about the package's `main` field. The other five packages loaded with `require`. |
| 8 | Native bindings load in Electron without a rebuild | confirmed (Linux x64) | `nm`: `tree-sitter.node` has 64 undefined `napi_*` symbols and 0 `v8::` symbols; grammar `.node` files 29 and 0. In the Electron 45.3.0 utility process (`process.type: "utility"`, Node 24.22.2, `modules` 150) the native core loaded and all seven grammars parsed. |
| 9 | WASM parses one sample per language and a query extracts imports and top-level declarations | confirmed | No sample tree had errors (`hasError: false`). Captures (imports / declarations): TypeScript 4 / 8 (`Element, ElementMap, Level, DEFAULT_LEVEL, counter, nextId, Workspace, load`); TSX 3 / 6; JavaScript 3 / 8; Python 7 / 6; Java 5 / 5; Go 4 / 7; C# 5 / 7 (`Example.Sample, Level, IDescribable, Element, Point, Workspace, Changed`). The JavaScript query counts `const legacy = require(...)` as a declaration, not an import; CommonJS imports need a separate pattern. Grammar ABI versions reported by `web-tree-sitter`: 14 (typescript, tsx, java) and 15 (javascript, python, go, c-sharp); both loaded. |
| 10 | Parse time for a ~5,000-line file is acceptable in WASM | confirmed (Linux x64; timings are noisy, see note) | See timing table below. WASM median 14–62 ms per 5,000-line file across languages and runs; first parse up to 151 ms; `Language.load` 1–110 ms per grammar; query 7–42 ms. |
| 11 | Native is materially faster than WASM | not confirmed at this size | Native median 16–71 ms. Per-language native/WASM ratio ranged from about 0.6 to 1.3 across three runs, with the ordering flipping between runs for TypeScript, JavaScript and Go. The machine was shared with other agents; the differences are within run-to-run variation. |
| 12 | Parse output is deterministic | confirmed | Two fresh parsers in one process gave identical S-expression and capture hashes for every language (`sameAcrossTwoParsers: true`). A digest over all non-timing output was `bbd0d49cb9721117` in `run1.json`, in `run2.json` (separate processes), and in the Electron utility-process run on Node 24. WASM and native produced identical S-expression and capture hashes for every sample and every synthetic file. |

Timing detail (ms, synthetic file per language; "W" = web-tree-sitter with the grammar package's own `.wasm`, "N" = native):

| Language | Lines / bytes | Nodes | W median run1 / run2 / Electron | N median run1 / run2 / Electron | W first (run1) | W query (run1) |
|---|---|---|---|---|---|---|
| TypeScript | 5,001 / 200,645 | 100,015 | 56.4 / 59.1 / 45.2 | 71.2 / 52.6 / 59.5 | 150.6 | 42.3 |
| TSX | 5,005 / 170,169 | 90,639 | 41.9 / 48.5 / 47.8 | 39.9 / 40.6 / 38.9 | 44.8 | 24.4 |
| JavaScript | 5,005 / 164,720 | 88,975 | 48.4 / 39.1 / 47.2 | 34.6 / 42.0 / 50.1 | 54.0 | 18.6 |
| Python | 5,009 / 104,518 | 46,642 | 28.3 / 29.2 / 30.9 | 25.2 / 19.3 / 30.1 | 33.4 | 8.7 |
| Java | 5,007 / 170,109 | 76,455 | 62.1 / 39.5 / 46.8 | 38.4 / 30.4 / 34.2 | 62.5 | 25.4 |
| Go | 5,004 / 72,775 | 36,771 | 20.4 / 14.2 / 13.7 | 16.7 / 17.2 / 16.6 | 21.1 | 8.3 |
| C# | 5,009 / 163,110 | 64,309 | 49.5 / 39.0 / 62.1 | 43.4 / 35.2 / 49.5 | 118.3 | 16.0 |

Note: the synthetic files repeat one small unit with renamed identifiers, so they are less varied than real code.

## Not verified
- Anything on macOS arm64: no parse was run there. For native, only the presence and file type of the `darwin-arm64` prebuilds was checked. WASM files are platform-independent by format, but that was not exercised on macOS.
- Windows, and Linux with musl (no musl native prebuild directory exists; WASM not tested there).
- Loading `.wasm` files from inside a packaged `asar`, and loading native `.node` prebuilds from a packaged, signed macOS app.
- Real repositories: files larger than 5,000 lines, files with syntax errors, whole-repo throughput, memory use, and parallel parsing across several utility processes.
- Incremental re-parse (`tree.edit`) performance.
- Whether `tree-sitter-typescript@0.23.2` (November 2024) and `tree-sitter-java@0.23.5` (December 2024) handle syntax added to those languages since their release.
- Whether queries written against these grammar versions are stable across grammar upgrades (node type names can change).
- Maintenance status of the packages beyond publish dates; no repository activity was inspected.
- A pnpm install (the spike used `npm` in an isolated directory); how pnpm reports the peer-range conflict in finding 6.

## Recommendation
Evidence: `web-tree-sitter@0.27.2` loaded the `.wasm` shipped inside each official grammar package for all seven languages, extracted imports and top-level declarations, parsed 5,000-line files in 14–62 ms (median) on this machine, and gave output identical to the native binding and identical across two Node 22 runs and one Electron utility-process run. The native binding also worked on Linux x64 in both runtimes from prebuilds, but it needed `--legacy-peer-deps`, and the C# grammar needed `import()` instead of `require`. Native was not consistently faster in these measurements. `tree-sitter-wasms` did not load. Interpretation: use WASM. It needs one runtime file plus one `.wasm` per language (9.5 MB in total), the same files on every platform and in both runtimes, with no per-platform binaries to unpack or sign, and no peer-range override. Take the `.wasm` files from the official `tree-sitter-<lang>` packages at pinned versions; `@vscode/tree-sitter-wasm` is a working fallback; do not use `tree-sitter-wasms` with this runtime version. The trade-off: initialisation is asynchronous (`Parser.init()` and `Language.load()`, up to about 110 ms per grammar here), trees and parsers must be freed explicitly (`tree.delete()`), and the measurements here do not show whether native would lead at whole-repository scale. If Wave 3 profiling on real repositories shows parsing dominates, native remains available behind the same extraction interface, because both produced identical trees for the same grammar versions. Before committing, run `node bench.mjs` on the macOS arm64 machine and once inside a packaged app.
