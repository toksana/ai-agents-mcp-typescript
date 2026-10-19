import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createAnthropicProvider } from './llm/anthropic.ts';
import { perceive } from './phases/perceive.ts';
import { runAgent } from './phases/repeat.ts';
import type { AgentStep } from './phases/repeat.ts';

const logStep = ({ iteration, response, results }: AgentStep) => {
  console.log(`\n[step ${iteration}] LLM chose: ${response.toolCalls.map(({ name }) => name).join(', ')}`);

  for (const { name, text, isError } of results) {
    console.log(`${isError ? 'ERROR' : 'OK'} ${name}:\n${text}`);
  }
};

const client = new Client({ name: 'file-explorer-agent', version: '1.0.0' });

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.ts'],
});

await client.connect(transport);

try {
  // PERCEIVE: discover what tools the MCP server offers
  const tools = await perceive(client);
  console.log(tools.map((tool) => tool.name));

  // DECIDE -> ACT -> OBSERVE -> REPEAT until the model answers
  const { answer, iterations, stopReason } = await runAgent({
    llm: createAnthropicProvider(),
    executor: client,
    tools,
    prompt: process.argv[2] ?? 'List the files in the current directory',
    onStep: logStep,
  });

  console.log(
    stopReason === 'answer'
      ? `\n${answer}`
      : `\nStopped after ${iterations} iterations without a final answer.`,
  );
} finally {
  await client.close();
}
