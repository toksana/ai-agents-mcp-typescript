import type { ContentBlock, LLMResponse, Message, ToolResultBlock } from '../llm/types.ts';
import type { ToolResult } from './act.ts';

export const toAssistantMessage = ({ content, toolCalls }: LLMResponse): Message => {
  if (toolCalls.length === 0) {
    return { role: 'assistant', content: content ?? '' };
  }

  const blocks: ContentBlock[] = [
    ...(content === null ? [] : [{ type: 'text' as const, text: content }]),
    ...toolCalls.map(({ id, name, arguments: args }) => ({
      type: 'tool_use' as const,
      id,
      name,
      arguments: args,
    })),
  ];

  return { role: 'assistant', content: blocks };
};

const toToolResultBlock = ({ toolCallId, text, isError }: ToolResult): ToolResultBlock => ({
  type: 'tool_result',
  toolCallId,
  content: text,
  isError,
});

export const toToolResultsMessage = (results: ToolResult[]): Message => ({
  role: 'user',
  content: results.map(toToolResultBlock),
});

export const observe = (
  messages: Message[],
  response: LLMResponse,
  results: ToolResult[],
): Message[] => [
  ...messages,
  toAssistantMessage(response),
  ...(results.length === 0 ? [] : [toToolResultsMessage(results)]),
];
