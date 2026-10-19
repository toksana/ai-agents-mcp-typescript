import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createAnthropicProvider } from './anthropic.ts';
import type { Message, Tool } from './llm.ts';

const client = new Client({ name: 'file-explorer-agent', version: '1.0.0' });

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.ts'],
});

await client.connect(transport);

// PERCEIVE: discover what tools the MCP server offers
const { tools } = await client.listTools();
console.log(tools.map((tool) => tool.name));

const llmTools: Tool[] = tools.map(({ name, description, inputSchema }) => ({
  name,
  description: description ?? '',
  inputSchema: {
    type: 'object',
    properties: inputSchema.properties ?? {},
    required: inputSchema.required,
  },
}));

// DECIDE: ask the LLM what to do next
const llm = createAnthropicProvider();
const messages: Message[] = [
  { role: 'user', content: process.argv[2] ?? 'List the files in the current directory' },
];
const response = await llm.chat(messages, llmTools);

if (response.toolCalls.length > 0) {
  console.log(`LLM decided to use: ${response.toolCalls[0]?.name}`);
} else {
  console.log(response.content);
}

await client.close();
