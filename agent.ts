import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'file-explorer-agent', version: '1.0.0' });

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.ts'],
});

await client.connect(transport);

const { tools } = await client.listTools();
console.log(tools.map((tool) => tool.name));

await client.close();
