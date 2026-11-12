# W0-SPIKE-FIXTURES — public repositories to pin as test fixtures

Date: 2026-11-12 · Environment: Linux 6.18.44 x86_64, Node v22.23.4, git 2.43.0

## Question
Whether each proposed public fixture repository exists, which commit to pin, its licence, languages, deployment/interface artefacts present, and checkout size. Informs the fixture manifest used by integration tests.

Fixtures are cloned by script at test time at the pinned commit and are never vendored into this repository; only the manifest (name, URL, SHA, metadata) is committed.

## Method
- `git ls-remote --symref https://github.com/<owner>/<repo> HEAD` for default branch and HEAD SHA.
- `spikes/fixtures/probe.sh <owner/repo> <workdir>`: `git clone --depth 1` into a temp directory outside the repo, `git rev-parse HEAD`, `git ls-files` (extension histogram, file-name patterns for compose / Dockerfile / Kubernetes directories / `kustomization.yaml` / `Chart.yaml` / `.tf` / `.proto` / `openapi*`/`swagger*` / `pnpm-workspace.yaml` / `turbo.json`), `grep` for `kind: Deployment|StatefulSet|Service` in YAML, first lines of the licence file, `du -sm` of the work tree excluding `.git`, then deletes the clone. A full-blob depth-1 clone was used instead of a blob-less one because work-tree size cannot be measured without blobs; largest clone was 236 MB (rejected candidate), all selected ones ≤ 35 MB including `.git`.
- SHAs from `ls-remote` and from the clone matched for every repository. Observed 2026-11-12.
- Languages are inferred from file-extension counts, not from a language-detection tool.

## Findings
| # | Claim from the spec ([Training]) | Result (confirmed / contradicted / not verified) | Evidence (command output, file path in the package, or URL + exact quoted text) |
|---|---|---|---|
| 1 | GoogleCloudPlatform/microservices-demo exists; polyglot; k8s, Helm, Terraform, protobuf | confirmed | `main` @ `c7cb6d5bfd6ea3aed768634ebbcb98cb7a523712` (2026-10-27). `LICENSE`: Apache License 2.0. 364 files, 14 MB. `.go`=29 `.py`=13 `.cs`=9, 2 `package.json`, 1 `build.gradle`. Dockerfiles 13; `kubernetes-manifests/`, `kustomize/` (21 `kustomization.yaml`), 39 YAML files with workload/service kinds; `helm-chart/Chart.yaml`; 8 `.tf`; 8 `.proto`. |
| 2 | microservices-demo has docker-compose | contradicted | 0 compose files at HEAD. |
| 3 | open-telemetry/opentelemetry-demo exists; polyglot; compose; protobuf | confirmed | `main` @ `7a07d9fcfd5bd40b94b1cd6b925027595e263e6b` (2026-11-10). Apache-2.0. 628 files, 12 MB. `.ts`=92 `.tsx`=49 `.py`=23 `.ex/.exs`=37 `.go`=15 `.cs`=13 `.js`=10, 3 Gradle files. 7 compose files (`compose.yaml`, `compose.full.yaml`, ...); 30 Dockerfiles; 2 `.proto` (`pb/`). |
| 4 | opentelemetry-demo has Kubernetes / Helm files in the repo | contradicted | 0 `kubernetes/`/`k8s/` paths, 0 `Chart.yaml`, 0 YAML with `kind: Deployment` at HEAD. |
| 5 | dotnet/eShop exists; .NET | confirmed | `main` @ `913acea66708a59595351174cee9b29f37179d29` (2026-10-15). `LICENSE`: MIT, ".NET Foundation and Contributors". 1145 files, 22 MB. `.cs`=547, 28 `.csproj`, `.razor`=40; 2 `.proto`; `aspire.config.json` at root. |
| 6 | eShop has docker-compose / Dockerfiles / Kubernetes | contradicted | 0 compose, 0 Dockerfile, 0 k8s, 0 Helm, 0 Terraform, 0 OpenAPI files at HEAD; topology is defined in code (.NET Aspire). |
| 7 | spring-projects/spring-petclinic exists; Java monolith | confirmed | `main` @ `500158f732419217507c7656904b8e6aa1bcc0d6` (2026-09-29). `LICENSE.txt`: Apache-2.0. 132 files, 2 MB. `.java`=50; `pom.xml` + `build.gradle`; `docker-compose.yml`; `k8s/` (2 manifests); 1 Dockerfile-named file. |
| 8 | spring-petclinic/spring-petclinic-microservices exists; Java microservices; compose | confirmed | `main` @ `e8b747ab522721076cacb5cf688eb8a54ba8c5c9` (2026-10-23). Apache-2.0. 200 files, 4 MB. `.java`=64 `.js`=20; 9 `pom.xml`; 8 service modules at root; `docker-compose.yml`; 3 Dockerfiles. 0 k8s/Helm/Terraform/proto/OpenAPI. |
| 9 | fastapi/full-stack-fastapi-template exists; Python + TypeScript; compose | confirmed | `master` @ `aabb90126964a164e02aff39e7c385bb0598236d` (2026-11-03). MIT (Sebastián Ramírez). 252 files, 3 MB. `.tsx`=70 `.ts`=39 `.py`=43; `compose.yml`, `compose.override.yml`, `compose.deploy.yml`; 2 Dockerfiles. Root has `bun.lock` and `uv.lock`. |
| 10 | full-stack-fastapi-template ships an OpenAPI file | contradicted | 0 files matching `openapi*`/`swagger*` `.json/.yaml` at HEAD (spec is generated at runtime by FastAPI). |
| 11 | terraform-aws-modules/terraform-aws-vpc exists; Terraform | confirmed | `master` @ `b3abd6df2ecf052451a361ed55b8f06f8742a795` (2026-09-18). Apache-2.0. 111 files, 2 MB. `.tf`=77 (root module, `modules/`, `examples/`, `wrappers/`). |
| 12 | TS pnpm/turborepo candidate A: t3-oss/create-t3-turbo | confirmed | `main` @ `8f945b7bb3bfb3ca8358d48b1ff0214079bc11ee` (2025-12-11). MIT. 141 files, 2 MB. `pnpm-workspace.yaml` + `turbo.json`; 14 `package.json` under `apps/`, `packages/`, `tooling/`. |
| 13 | TS pnpm/turborepo candidate B: trpc/trpc | confirmed | `main` @ `8eff9ff0ddf4be4a682bf205fb66b00a26901075` (2026-11-10). MIT. 1944 files, 16 MB. `pnpm-workspace.yaml` + `turbo.json`; 60 `package.json` (`packages/`, `examples/`, `www/`); `.ts`=988 `.tsx`=341; 2 compose files and 12 `openapi*` files (under examples/packages). |
| 14 | A larger product monorepo (openstatusHQ/openstatus) is suitable | contradicted (rejected) | `main` @ `d06f8a1`. `LICENSE`: GNU AGPL v3. 4992 files, 147 MB work tree + 89 MB `.git`. pnpm + turbo, 49 `package.json`, 33 `.proto`, 1 Helm chart. Rejected for size and copyleft licence; listed only as a possible optional fixture. |

Candidate reasons (interpretation): A (create-t3-turbo) is a small application monorepo with separate apps and shared packages, which exercises workspace-dependency edges between deployable apps and libraries; its last commit is 11 months old, so the pin is stable but the stack may age. B (trpc) is an actively maintained library monorepo with 60 packages and examples, which exercises scale and package-graph extraction but contains few deployable containers. Proposal: use A as the default TypeScript fixture (tier small) and B as the large-tier one.

### Proposed manifest
`sizeMB` is the depth-1 work tree without `.git`. `tier` rule used here: `large` if more than 300 tracked files, otherwise `small`.

```json
[
  { "name": "microservices-demo", "url": "https://github.com/GoogleCloudPlatform/microservices-demo", "commit": "c7cb6d5bfd6ea3aed768634ebbcb98cb7a523712", "licence": "Apache-2.0", "languages": ["Go", "Python", "C#", "JavaScript", "Java"], "features": ["dockerfile", "kubernetes", "kustomize", "helm", "terraform", "protobuf"], "sizeMB": 14, "tier": "large" },
  { "name": "opentelemetry-demo", "url": "https://github.com/open-telemetry/opentelemetry-demo", "commit": "7a07d9fcfd5bd40b94b1cd6b925027595e263e6b", "licence": "Apache-2.0", "languages": ["TypeScript", "Python", "Elixir", "Go", "C#", "JavaScript"], "features": ["docker-compose", "dockerfile", "protobuf"], "sizeMB": 12, "tier": "large" },
  { "name": "eshop", "url": "https://github.com/dotnet/eShop", "commit": "913acea66708a59595351174cee9b29f37179d29", "licence": "MIT", "languages": ["C#"], "features": ["dotnet-aspire", "protobuf"], "sizeMB": 22, "tier": "large" },
  { "name": "spring-petclinic", "url": "https://github.com/spring-projects/spring-petclinic", "commit": "500158f732419217507c7656904b8e6aa1bcc0d6", "licence": "Apache-2.0", "languages": ["Java"], "features": ["docker-compose", "dockerfile", "kubernetes", "maven", "gradle"], "sizeMB": 2, "tier": "small" },
  { "name": "spring-petclinic-microservices", "url": "https://github.com/spring-petclinic/spring-petclinic-microservices", "commit": "e8b747ab522721076cacb5cf688eb8a54ba8c5c9", "licence": "Apache-2.0", "languages": ["Java", "JavaScript"], "features": ["docker-compose", "dockerfile", "maven-multi-module"], "sizeMB": 4, "tier": "small" },
  { "name": "full-stack-fastapi-template", "url": "https://github.com/fastapi/full-stack-fastapi-template", "commit": "aabb90126964a164e02aff39e7c385bb0598236d", "licence": "MIT", "languages": ["TypeScript", "Python"], "features": ["docker-compose", "dockerfile"], "sizeMB": 3, "tier": "small" },
  { "name": "create-t3-turbo", "url": "https://github.com/t3-oss/create-t3-turbo", "commit": "8f945b7bb3bfb3ca8358d48b1ff0214079bc11ee", "licence": "MIT", "languages": ["TypeScript"], "features": ["pnpm-workspace", "turborepo"], "sizeMB": 2, "tier": "small" },
  { "name": "trpc", "url": "https://github.com/trpc/trpc", "commit": "8eff9ff0ddf4be4a682bf205fb66b00a26901075", "licence": "MIT", "languages": ["TypeScript"], "features": ["pnpm-workspace", "turborepo", "docker-compose", "openapi"], "sizeMB": 16, "tier": "large" },
  { "name": "terraform-aws-vpc", "url": "https://github.com/terraform-aws-modules/terraform-aws-vpc", "commit": "b3abd6df2ecf052451a361ed55b8f06f8742a795", "licence": "Apache-2.0", "languages": ["HCL"], "features": ["terraform"], "sizeMB": 2, "tier": "small" }
]
```

## Not verified
- Licence identification is from the first lines of each licence file only; per-file headers, `NOTICE` files and third-party assets (fonts, images) were not reviewed.
- `JavaScript` and `Java` for microservices-demo are inferred from 2 `package.json` and 1 `build.gradle`; they were outside the top-14 extension counts. No language-detection tool was run.
- Full-history clone size, and whether `git fetch --depth 1 <sha>` of a non-tip pinned commit is permitted for each repository once HEAD moves (GitHub normally allows fetching reachable SHAs; not tested).
- Whether any fixture builds or runs; only static file listings were inspected.
- Content of the `openapi*` files in trpc (file names only) and whether the 2 `.proto` files in eShop/opentelemetry-demo cover all gRPC services.
- No fixture has both a Helm chart and an OpenAPI document; no committed fixture has a stand-alone OpenAPI contract for an application service.

## Recommendation
Evidence: all eight named repositories exist with permissive licences (Apache-2.0 or MIT), every depth-1 work tree is ≤ 22 MB, and the artefact matrix above shows compose in 5, Kubernetes in 2, Helm in 1, Terraform in 2, protobuf in 3, OpenAPI files in 1 (trpc only). Three assumptions do not hold at the pinned commits: eShop has no compose/Dockerfile/Kubernetes files (Aspire app host in C#), opentelemetry-demo has no Kubernetes/Helm manifests in-repo, and full-stack-fastapi-template has no committed OpenAPI file and uses bun rather than pnpm. Interpretation: adopt the manifest above with the pinned SHAs; fetch with a script that does `git init` + `git fetch --depth 1 origin <sha>` into a cache directory ignored by git, and verifies `git rev-parse HEAD` equals the manifest SHA; do not rely on eShop for container-topology extraction from deployment files unless an Aspire extractor is in scope; use microservices-demo as the Kubernetes/Helm/Terraform/protobuf fixture and opentelemetry-demo as the compose fixture; add a small hand-written OpenAPI fixture inside the test suite (or accept trpc's example specs) because the public fixtures do not cover that extractor; keep AGPL repositories out of the default manifest.
