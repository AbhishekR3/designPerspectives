# W0-SPIKE-MCP — `@modelcontextprotocol/sdk`: version, transports, tool registration

Date: 2026-11-12 · Environment: Linux, 2 cores, Node v22.23.4, npm 10.9.9

## Question
Which version and licence does the MCP TypeScript SDK have, which server transports ship, what is the minimum Node version, and what does tool registration with an input schema look like? Informs the MCP-server wave.

## Method
- `npm view @modelcontextprotocol/sdk name version license time.modified engines peerDependencies dist-tags --json`; same for `@modelcontextprotocol/{server,client,core}`.
- `npm i --ignore-scripts @modelcontextprotocol/sdk zod` in `spikes/misc/mcp/` (sdk@1.32.2, zod@4.6.7; 95 packages, 5 s).
- Read `dist/esm/server/{mcp,sse,stdio,streamableHttp,webStandardStreamableHttp}.d.ts`, `dist/esm/types.d.ts`, `README.md`.
- Prototype: `spikes/misc/mcp/server.mjs` (17 lines, stdio server, one tool) and `spikes/misc/mcp/client-test.mjs` (spawns the server over stdio, lists tools, calls the tool, sends invalid arguments). Run: `node client-test.mjs` -> `OK`, exit 0.

## Findings
| # | Claim from the spec ([Training]) | Result | Evidence |
|---|---|---|---|
| 1 | Package and licence | confirmed | `@modelcontextprotocol/sdk` 1.32.2, MIT, modified 2026-10-23, dist-tag `latest` = 1.32.2. |
| 2 | Minimum Node | confirmed | `engines.node >=18`. |
| 3 | zod is required | confirmed | Peer `zod ^3.25 \|\| ^4.0` (not optional); `@cfworker/json-schema` is an optional peer. The SDK's own dependencies include `express`, `hono`, `@hono/node-server`, `cors`, `ajv`, `jose`, `zod-to-json-schema`. |
| 4 | Server transports: stdio and streamable HTTP | confirmed | Shipped modules: `server/stdio.js` (`StdioServerTransport`), `server/streamableHttp.js` (`StreamableHTTPServerTransport`), `server/webStandardStreamableHttp.js` (`WebStandardStreamableHTTPServerTransport`), plus `inMemory.js`. |
| 5 | SSE server transport is current | contradicted (deprecated, still shipped) | `server/sse.d.ts` line 35: `@deprecated SSEServerTransport is deprecated. Use StreamableHTTPServerTransport instead.` README line 72: "HTTP + SSE for backwards compatibility only." |
| 6 | Tools are registered with `server.tool(name, schema, cb)` | contradicted (deprecated) | `server/mcp.d.ts`: every `tool(...)` overload is tagged `@deprecated Use registerTool instead.` Current signature: `registerTool(name, { title?, description?, inputSchema?, outputSchema?, annotations?, _meta? }, cb)`, where `inputSchema` is a Zod raw shape or a schema object. `resource(...)` and `prompt(...)` are likewise deprecated in favour of `registerResource` / `registerPrompt`. |
| 7 | Input schema is published as JSON Schema and validated | confirmed by test | `listTools()` returned `inputSchema` `{"type":"object","properties":{"id":{"type":"string"},"depth":{"type":"integer",...}},"required":["id"],"$schema":"http://json-schema.org/draft-07/schema#"}`. Calling with invalid arguments returned `isError: true` with "MCP error -32602: Input validation error" (a result, not a thrown exception). Valid call returned `{"content":[{"type":"text","text":"element:c1:2"}]}`. |
| 8 | Protocol revision | confirmed (value read) | `types.d.ts`: `LATEST_PROTOCOL_VERSION = "2025-11-25"`. |
| 9 | `@modelcontextprotocol/sdk` is the only SDK package | contradicted | npm also has `@modelcontextprotocol/server`, `/client`, `/core` at 2.4.0, licence Apache-2.0, modified 2026-10-23, `engines.node >=20`, dependency `zod ^4.2.0`. The `latest` tag of `@modelcontextprotocol/sdk` remains 1.32.2. |

## Not verified
- Streamable HTTP transport at runtime (only stdio was exercised).
- The API of the 2.x split packages, their relationship to the 1.x SDK, and any migration or support timeline (not installed, docs not read).
- Interoperability with real MCP hosts (only the SDK's own client was used).
- Behaviour with Zod 3 (test used zod 4.6.7).
- `outputSchema` / structured tool results.

## Recommendation
Evidence: SDK 1.32.2 is MIT, runs on Node >= 18, installs in seconds, and a 17-line stdio server with `registerTool` plus a Zod raw-shape `inputSchema` passed a list/call/invalid-argument round trip. SSE and the `tool()` overloads are marked deprecated. A separately named 2.x package family exists under Apache-2.0 with Node >= 20.
Interpretation: implement the MCP server with `McpServer.registerTool`, stdio as the default transport and streamable HTTP as the optional second; do not implement SSE. Keep MCP wiring behind one adapter module so a move to `@modelcontextprotocol/server` 2.x is contained; decide between 1.x and 2.x in a short follow-up before the MCP wave starts. Both licences are on the allow-list. Note that the SDK pulls in `express` and `hono` as dependencies, which affects bundle size for the Electron build.
