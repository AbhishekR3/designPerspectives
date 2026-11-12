# W0-SPIKE-SCIP — SCIP indexers and a JS/TS reader for `.scip` files

Date: 2026-11-12 · Environment: Linux, 2 cores, Node v22.23.4, npm 10.9.9

## Question
Do the SCIP indexers named in the spec exist, under which licence, how recent are they, and how are they installed? Is there an npm package that reads `.scip` files? Informs the choice of the first "tier 2 precision" plug-in example.

## Method
- `npm view <pkg> name version license time.modified repository.url engines --json` for `@sourcegraph/scip-typescript`, `@sourcegraph/scip-python`, `@sourcegraph/scip`, `@sourcegraph/scip-bindings`, `@scip-code/scip`.
- `git clone --depth 1 --filter=blob:none` of `sourcegraph/{scip,scip-typescript,scip-python,scip-java,scip-go,scip-dotnet}` and `scip-code/scip` into `spikes/misc/repos/`; read `LICENSE`, `README.md`, `docs/getting-started.md`, `bindings/typescript/package.json`.
- `git ls-remote --tags --refs --sort=-v:refname`, then `git fetch --depth 1 origin tag <tag>` and `git log -1 --format=%cI <tag>` for the tag date.
- No indexer was installed or run.

## Findings
| # | Claim from the spec ([Training]) | Result | Evidence |
|---|---|---|---|
| 1 | `@sourcegraph/scip-typescript` exists on npm, Apache-2.0 | confirmed | npm: version 0.6.2, license Apache-2.0, modified 2026-11-10; repo `LICENSE` is Apache 2.0; tag `v0.6.2`. Install: README line 11 `npm install -g @sourcegraph/scip-typescript`. |
| 2 | scip-typescript runs on any current Node | contradicted (narrower) | npm `engines.node` is `>=22.23.4` (also in repo `package.json` line 32). Node 20 is excluded. |
| 3 | `@sourcegraph/scip-python` exists on npm | confirmed | npm: version 0.6.8, license MIT, modified 2026-10-22; repo `LICENSE.txt` starts "MIT License / Pyright"; tag `v0.6.8`. Install: `npm install -g @sourcegraph/scip-python`. README states it calls `pip` to discover package versions. |
| 4 | scip-java exists, Apache-2.0 | confirmed | Repo `LICENSE` Apache 2.0; latest tag `v0.14.1` dated 2026-11-05; HEAD d6ff007 2026-11-11. Install (docs/getting-started.md): Docker image `ghcr.io/scip-code/scip-java:latest`, or Coursier `coursier launch org.scip-code:scip-java:<version>`. Not on npm. |
| 5 | scip-go exists, Apache-2.0 | confirmed | Repo `LICENSE` Apache 2.0; tag `v0.2.9` dated 2026-10-22. Install (README line 11): `go install github.com/scip-code/scip-go/cmd/scip-go@latest`. |
| 6 | scip-dotnet exists, Apache-2.0 | confirmed | Repo `LICENSE` Apache 2.0 + `NOTICE`; tag `v0.2.16` dated 2026-10-21. Install (readme.md): `docker run ... sourcegraph/scip-dotnet:latest` or `dotnet tool install --global scip-dotnet` (requires .NET 8.0). |
| 7 | Schema repo is `sourcegraph/scip` | contradicted (name) | `sourcegraph/scip` and `scip-code/scip` both clone to the same HEAD be1d9f7 (2026-11-10). The README, the TS binding's `repository.url`, the scip-go module path and the scip-java Maven/GHCR coordinates all use the `scip-code` organisation. Schema file: `scip.proto` at repo root; Apache 2.0; latest tag `v0.10.0` dated 2026-09-03. |
| 8 | A JS/TS reader for `.scip` is on npm under `@sourcegraph/...` | contradicted (name) | `@sourcegraph/scip` and `@sourcegraph/scip-bindings` return E404. `@scip-code/scip` 0.10.0, Apache-2.0, modified 2026-09-03 exists; source is `bindings/typescript/` ("Generated TypeScript definitions"), ESM only (`"type": "module"`), single dependency `@bufbuild/protobuf ^2.11.0`. |

## Not verified
- Whether `github.com/sourcegraph/<repo>` URLs are HTTP redirects to `scip-code` (curl to github.com returned 403 through the proxy; only identical commit hashes were observed for `scip`).
- Maven Central, NuGet and GHCR/Docker Hub artefacts (registries not queried); dates above are Git tag dates.
- That `@scip-code/scip` decodes a real index end to end: no index was produced or parsed.
- Indexer runtime behaviour, speed and output size on any project.

## Recommendation
Evidence: scip-typescript and scip-python are the only two indexers installable from npm; scip-typescript and the reader `@scip-code/scip` are Apache-2.0 (on the allow-list), released within the last 70 days, and the reader has one runtime dependency. scip-typescript requires Node >= 22.23.4. The other three indexers need a JVM/Coursier, a Go toolchain, or .NET 8 / Docker.
Interpretation: use TypeScript as the first tier 2 example, with `@scip-code/scip` as the reader and scip-typescript invoked as an external process (not bundled), because it adds no second toolchain. Record `scip-code` as the canonical GitHub organisation in the spec. A follow-up spike should index one fixture and decode it before the wave that depends on it.
