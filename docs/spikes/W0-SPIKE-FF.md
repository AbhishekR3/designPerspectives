# W0-SPIKE-FF — Fitness-function target tools and licence checkers

Date: 2026-11-12 · Environment: Linux, 2 cores, Node v22.23.4, npm 10.9.9, pnpm 10.28.0

## Question
Do the architecture-test tools the spec targets exist, under which licence, and are they maintained? Which licence checker can our own CI use? Informs the fitness-function export wave and the CI licence gate.

## Method
- `npm view <pkg> name version license time.modified repository.url engines --json` for `dependency-cruiser`, `tsarch`, `license-checker-rseidelsohn`, `license-checker`.
- For GitHub-only tools: `git clone --depth 1 --filter=blob:none` into `spikes/misc/repos/`, read `LICENSE`, `git log -1 --format=%cI` (HEAD date), `git ls-remote --tags --refs --sort=-v:refname`, and `git fetch --depth 1 origin tag <tag>` for the tag date.
- `pnpm licenses list --help`. No tool was executed against a codebase.

## Findings
| # | Claim from the spec ([Training]) | Result | Evidence |
|---|---|---|---|
| 1 | dependency-cruiser: npm, MIT, maintained | confirmed | npm 18.7.2, MIT, modified 2026-11-02, `engines.node` `^22\|\|^24\|\|>=26`. |
| 2 | tsarch: npm, MIT, maintained | confirmed (exists, MIT) / contradicted (maintenance) | npm 5.4.1, MIT, repo `ts-arch/ts-arch`; last registry modification 2024-12-23 (about 23 months ago). |
| 3 | ArchUnit (TNG/ArchUnit): Apache-2.0, maintained | confirmed | `LICENSE` Apache 2.0; tag `v1.5.1` dated 2026-09-25; HEAD fdacc4d 2026-11-10. |
| 4 | NetArchTest (BenMorris/NetArchTest): MIT, maintained | confirmed (MIT) / contradicted (maintenance) | `LICENSE` "MIT License, Copyright (c) 2018 Ben Morris"; latest tag `v1.3.2` dated 2021-05-18; HEAD a761f63 dated 2023-07-03. |
| 5 | ArchUnitNET (TNG/ArchUnitNET): Apache-2.0, maintained | confirmed | `LICENSE` Apache 2.0; tag `0.13.5` dated 2026-10-24 (= HEAD f439e0d). |
| 6 | PyTestArch (zyskarch/pytestarch): Apache-2.0 | confirmed | `LICENSE` Apache 2.0; tag `v5.1.1` dated 2026-11-08. |
| 7 | import-linter (seddonym/import-linter): BSD | confirmed | `LICENSE` "BSD 2-Clause License, Copyright (c) 2019, David Seddon"; tag `v2.16` dated 2026-11-06; HEAD 2026-11-10. |
| 8 | go-arch-lint (fe3dback/go-arch-lint): MIT | confirmed | `LICENSE` MIT (2022); tag `v1.19.1` dated 2026-10-29 (= HEAD a34dbfc). |
| 9 | `license-checker-rseidelsohn` usable in our CI | confirmed (exists) / contradicted on Node 22 | npm 5.0.1, BSD-3-Clause, modified 2026-07-15, `engines` `node >=24`, `npm >=11`. This machine has Node 22.23.4 / npm 10.9.9. The 4.x line (4.4.2) declares `node >=18`, `npm >=8`. Original `license-checker` 25.0.1 was last modified 2022-06-19. |
| 10 | `pnpm licenses list` is built in | confirmed | pnpm 10.28.0 help: "Check the licenses of the installed packages", options `--json`, `--long`, `--dev`. It lists licences; the help text shows no allow/deny option. |

## Not verified
- Latest versions on Maven Central, NuGet and PyPI (registries not queried; Git tags used instead).
- Rule-format compatibility of our planned exports with any of these tools (nothing was run).
- Output shape of `pnpm licenses list --json` and its behaviour on packages with non-SPDX licence strings (e.g. "Varies").

## Recommendation
Evidence-based table (primary = most recent release and commit among candidates):

| Language | Primary tool | Fallback |
|---|---|---|
| TypeScript / JavaScript | dependency-cruiser (MIT, 2026-11) | tsarch (MIT, last publish 2024-12) |
| Java / Kotlin (JVM) | ArchUnit (Apache-2.0, 2026-09) | none identified in this spike |
| C# / .NET | ArchUnitNET (Apache-2.0, 2026-10) | NetArchTest (MIT, last tag 2021-05, last commit 2023-07) |
| Python | import-linter (BSD-2-Clause, 2026-11) | PyTestArch (Apache-2.0, 2026-11) |
| Go | go-arch-lint (MIT, 2026-10) | none identified in this spike |

Interpretation: for .NET the spec should name ArchUnitNET first and treat NetArchTest as legacy. For our own CI, `pnpm licenses list --json` plus a small allow-list script needs no extra dependency and works on Node 22; `license-checker-rseidelsohn@5` requires Node 24 and npm 11, so it is only an option if CI moves to Node 24 (or 4.x is pinned). All listed tools are external targets and are not bundled, so their licences constrain nothing in our distribution.
