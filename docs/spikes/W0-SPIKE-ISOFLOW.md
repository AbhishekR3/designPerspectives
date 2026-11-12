# W0-SPIKE-ISOFLOW — `isoflow` as an optional isometric renderer

Date: 2026-11-12 · Environment: Linux, 2 cores, Node v22.23.4, npm 10.9.9

## Question
Is the npm package `isoflow` (or a fork) licensed and maintained well enough to be an optional renderer plug-in, and what is the licence of its icon packs?

## Method
- `npm view isoflow name version license time.modified repository.url peerDependencies dependencies time --json`; same for `@isoflow/isopacks`, `fossflow`, `gsap`.
- `npm search isoflow --json`, `npm search fossflow --json`.
- Shallow clones of `markmanx/isoflow` (HEAD 339ff08, 2025-09-17) and `markmanx/isopacks` (HEAD ab71751, 2023-10-09) into `spikes/misc/repos/`; read `README.md`, `LICENSE`, `package.json`, `collections/*/LICENSE`.
- Nothing was installed or rendered.

## Findings
| # | Claim from the spec ([Training]) | Result | Evidence |
|---|---|---|---|
| 1 | `isoflow` is on npm under MIT | confirmed | npm 1.1.1, license MIT; repo `LICENSE` "MIT License, Copyright (c) 2025 Mark Mankarious". |
| 2 | It is maintained | contradicted | Last publish 1.1.1 on 2024-09-29 (previous 1.1.0 on 2024-06-08, 1.0.11 on 2023-11-15). Last repo commit 2025-09-17. |
| 3 | React peer range | confirmed | `peerDependencies`: `react >=17`, `react-dom >=17`; devDependencies use React `^18.2.0`. A third-party package `x-isoflow-react-19` (1.1.1-patch-6, MIT, 2025-07-11) exists. |
| 4 | A "Pro" edition exists | confirmed | README line 23: "Isoflow is an open-core project"; "offering **Isoflow Pro** with additional features for commercial use". |
| 5 | All bundled dependencies are permissively licensed | contradicted | `isoflow` depends on `gsap ^3.11.4`. `npm view gsap license` returns "Standard 'no charge' license: https://gsap.com/standard-license." — not an SPDX identifier and not on our allow-list. Other dependencies include MUI 5, `paper`, `react-quill`, `zod 3.22.2` (exact pin). |
| 6 | `@isoflow/isopacks` exists with a clear licence | contradicted | npm 0.0.10, license field "Varies", last modified 2023-10-09. Root `LICENSE`: "See individual folders ... for licence information." `collections/isoflow/LICENSE` is MIT text (Copyright 2023 Mark Mankarious). `collections/aws/LICENSE`, `azure`, `gcp`, `kubernetes` contain only a pointer to the vendor's icon website, no licence text. |
| 7 | Community forks exist | confirmed | `fossflow` 1.0.5, MIT, modified 2025-07-04, "forked from isoflow", same dependency list including `gsap`; also `@mythic-healthcare/fossflow` 1.1.0 (2025-12), `lit-isoflow` 1.1.0 (2026-07), `visoflow` 1.1.19 (2025-12), `isoatlas` 0.4.1 (2026-10), `@bud-fe/fossflow-icon` (license "Varies"). |

## Not verified
- The actual terms of the GSAP licence (URL not fetched) and whether any fork removed `gsap`.
- Terms of the AWS, Azure, GCP and Kubernetes icon sets (vendor pages not read).
- Differences between Isoflow Pro and the Community Edition (isoflow.io not read).
- Whether `isoflow` 1.1.1 runs under React 19 or inside Electron; nothing was rendered.
- The `fossflow` source repository (`stan-smith/fossflow-lib` could not be cloned anonymously).

## Recommendation
Evidence: `isoflow` itself is MIT, but it has had no npm release for 25 months, depends on `gsap` whose licence string is outside the project's allow-list, and its icon package declares licence "Varies" with only the `isoflow` collection carrying MIT text.
Interpretation: do not bundle `isoflow`, `fossflow` or `@isoflow/isopacks` in the distribution. It is usable at most as a user-installed, out-of-tree optional renderer plug-in that the user adds themselves, and only the `isoflow` icon collection should be referenced. If an isometric view is wanted in the core product, a renderer without the `gsap` dependency is needed; that is a separate decision.
