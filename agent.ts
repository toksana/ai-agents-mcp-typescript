import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createAnthropicProvider } from './llm/anthropic.ts';
import type { Message } from './llm/types.ts';
import { executeToolCalls } from './phases/act.ts';
import { decide } from './phases/decide.ts';
import { observe } from './phases/observe.ts';
import { perceive } from './phases/perceive.ts';

const client = new Client({ name: 'file-explorer-agent', version: '1.0.0' });

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.ts'],
});

await client.connect(transport);

// PERCEIVE: discover what tools the MCP server offers
const tools = await perceive(client);
console.log(tools.map((tool) => tool.name));

// DECIDE: ask the LLM what to do next
const llm = createAnthropicProvider();
const messages: Message[] = [
  { role: 'user', content: process.argv[2] ?? 'List the files in the current directory' },
];
const response = await decide(llm, messages, tools);

if (response.toolCalls.length === 0) {
  console.log(response.content);
} else {
  console.log(`LLM decided to use: ${response.toolCalls.map(({ name }) => name).join(', ')}`);

  // ACT: execute the chosen tools on the MCP server
  const results = await executeToolCalls(client, response.toolCalls);

  for (const { name, text, isError } of results) {
    console.log(`${isError ? 'ERROR' : 'OK'} ${name}:\n${text}`);
  }

  // OBSERVE: record the assistant turn and the tool results for the next iteration
  const history = observe(messages, response, results);
  console.log(JSON.stringify(history.slice(messages.length), null, 2));
}

await client.close();
