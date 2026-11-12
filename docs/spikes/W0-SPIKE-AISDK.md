# W0-SPIKE-AISDK — Vercel AI SDK (`ai`): version, providers, structured output, mocks

Date: 2026-11-12 · Environment: Linux, 2 cores, Node v22.23.4, npm 10.9.9

## Question
Which major version and licence does `ai` have now, which provider packages exist (including Ollama), how is schema-constrained output requested, and is a mock model shipped for replay tests? Documentation and type review only; informs the LLM-adapter wave.

## Method
- `npm view <pkg> name version license time.modified repository.url engines peerDependencies --json` for `ai`, `@ai-sdk/{anthropic,openai,google,amazon-bedrock,azure,openai-compatible,ollama}`, `ollama-ai-provider`, `ollama-ai-provider-v2`, `ai-sdk-ollama`.
- `npm i --ignore-scripts ai zod` in `spikes/misc/aisdk/` (ai@7.0.170, zod@4.6.7); read `node_modules/ai/dist/index.d.ts`, `node_modules/ai/dist/test/index.d.ts`, `node_modules/@ai-sdk/provider-utils/dist/index.d.ts`.
- No model, provider or mock was invoked. No code was executed against the SDK.

## Findings
| # | Claim from the spec ([Training]) | Result | Evidence |
|---|---|---|---|
| 1 | `ai` current major and licence | confirmed: major 7, Apache-2.0 | npm `ai` 7.0.170, Apache-2.0, modified 2026-11-11, `engines.node >=22`, peer `zod ^3.25.76 \|\| ^4.1.8`. Any spec text assuming v4/v5/v6 or an MIT licence is out of date. |
| 2 | Provider packages exist | confirmed | All Apache-2.0, `node >=22`, same zod peer: `@ai-sdk/anthropic` 4.0.102, `@ai-sdk/openai` 4.0.115, `@ai-sdk/google` 4.0.118, `@ai-sdk/amazon-bedrock` 5.0.139, `@ai-sdk/azure` 4.0.123, `@ai-sdk/openai-compatible` 3.0.90. |
| 3 | An official Ollama provider `@ai-sdk/ollama` exists | contradicted | `npm view @ai-sdk/ollama` returns E404. |
| 4 | Community Ollama providers | confirmed | `ollama-ai-provider-v2` 4.1.0, Apache-2.0, 2026-10-22, peer `ai ^7.0.0`, `zod ^4.0.16`. `ai-sdk-ollama` 4.6.3, MIT, 2026-11-05, peer `ai ^7.0.137`. `ollama-ai-provider` 1.2.0, Apache-2.0, last modified 2025-01-17, peer `zod ^3.0.0` (no `ai` 7 peer declared). |
| 5 | Structured output is requested with `generateObject({ schema })` | contradicted (deprecated) | `index.d.ts` line 9014: `@deprecated Use generateText with an output setting instead.` on `generateObject`; `streamObject` is declared in the same style. Both are still exported in 7.0.170. |
| 6 | Current structured-output shape | confirmed from types | `generateText` / `streamText` options have `output?: OUTPUT` ("Optional specification for parsing structured outputs"). Namespace export `Output` provides `object`, `array`, `choice`, `json`, `text`. `Output.object(options)` takes `{ schema, name?, description? }`. The result exposes `output` ("The generated output according to the `output` specification"); `streamText` adds `elementStream` for `Output.array()`. |
| 7 | Zod and JSON Schema are both accepted | confirmed from types | `FlexibleSchema = Schema \| LazySchema \| StandardSchema \| $ZodType` (provider-utils line 879); `ai` exports `jsonSchema`, `zodSchema`, `asSchema`. Types import both `zod/v3` and `zod/v4/core`. |
| 8 | A mock provider is shipped under `ai/test` | confirmed | `package.json` exports `./test`. `dist/test/index.d.ts` declares `MockLanguageModelV4` (and `V3`), `MockProviderV4`, `MockEmbeddingModelV4`, `mockValues`, `simulateReadableStream`, `convertArrayToAsyncIterable`. `MockLanguageModelV4` constructor accepts `doGenerate` as a function, one `LanguageModelV4GenerateResult`, or an array of results, and records `doGenerateCalls` / `doStreamCalls`. Spec version string is "v4". |

## Not verified
- Local model quality (no local model available).
- Actual provider calls for any provider, including whether each provider honours `output` with native JSON-schema mode or a tool-call fallback.
- Runtime behaviour of `Output.object` with `MockLanguageModelV4` (types read only; nothing executed).
- Ollama through `@ai-sdk/openai-compatible` against Ollama's OpenAI-style endpoint.
- Maintenance quality of the two community Ollama packages beyond registry dates.
- Removal schedule for `generateObject`.

## Recommendation
Evidence: `ai` is at major 7 under Apache-2.0 and requires Node >= 22; `generateObject` carries a deprecation tag pointing to `generateText` with `output`; `ai/test` ships `MockLanguageModelV4` that accepts a list of canned results; no `@ai-sdk/ollama` package exists.
Interpretation: write the adapter against `generateText({ model, output: Output.object({ schema }) })` and read `result.output`; do not introduce `generateObject`. Build replay tests on `MockLanguageModelV4` with recorded `LanguageModelV4GenerateResult` arrays, behind our own port so a later language-model spec bump (v4 to v5) touches one file. For Ollama, treat the provider as a user-selected optional dependency; shortlist `ollama-ai-provider-v2` (Apache-2.0) and `ai-sdk-ollama` (MIT), and test `@ai-sdk/openai-compatible` first because it is maintained in the same repository as `ai`.
