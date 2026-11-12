// W0-SPIKE-MCP: spawns server.mjs over stdio, lists tools, calls one.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('./server.mjs', import.meta.url).pathname] });
const client = new Client({ name: 'dp-spike-client', version: '0.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
console.log('tools:', JSON.stringify(tools));
assert.equal(tools.length, 1);
assert.equal(tools[0].name, 'echo_element');
assert.deepEqual(tools[0].inputSchema.required, ['id']);
const res = await client.callTool({ name: 'echo_element', arguments: { id: 'c1', depth: 2 } });
console.log('call:', JSON.stringify(res));
assert.equal(res.content[0].text, 'element:c1:2');
const bad = await client.callTool({ name: 'echo_element', arguments: { depth: 'x' } }).catch((e) => ({ thrown: String(e.message).slice(0, 120) }));
console.log('invalid-args:', JSON.stringify(bad).slice(0, 300));
console.log('negotiated protocol:', transport.protocolVersion ?? client.getServerVersion?.());
await client.close();
console.log('OK');
