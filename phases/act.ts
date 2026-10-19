import type { CallToolResult } from '@modelcontextprotocol/client';
import type { ToolCall } from '../llm/types.ts';

export interface ToolResult {
  toolCallId: string;
  name: string;
  text: string;
  isError: boolean;
}

export interface ToolExecutor {
  callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<CallToolResult>;
}

const joinText = (content: CallToolResult['content']): string =>
  content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');

export const executeToolCall = async (
  executor: ToolExecutor,
  { id: toolCallId, name, arguments: args }: ToolCall,
): Promise<ToolResult> => {
  try {
    const result = await executor.callTool({ name, arguments: args });

    return {
      toolCallId,
      name,
      text: joinText(result.content),
      isError: result.isError ?? false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error calling tool';

    return { toolCallId, name, text: message, isError: true };
  }
};

export const executeToolCalls = async (
  executor: ToolExecutor,
  toolCalls: ToolCall[],
): Promise<ToolResult[]> => {
  const results: ToolResult[] = [];

  for (const toolCall of toolCalls) {
    results.push(await executeToolCall(executor, toolCall));
  }

  return results;
};
