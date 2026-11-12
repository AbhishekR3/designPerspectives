// W0-SPIKE-MCP: minimal stdio server with one tool (input schema via zod raw shape).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'dp-spike', version: '0.0.0' });
server.registerTool(
  'echo_element',
  {
    title: 'Echo element',
    description: 'Returns the element id it was given',
    inputSchema: { id: z.string(), depth: z.number().int().optional() },
  },
  async ({ id, depth }) => ({ content: [{ type: 'text', text: `element:${id}:${depth ?? 0}` }] }),
);
await server.connect(new StdioServerTransport());
