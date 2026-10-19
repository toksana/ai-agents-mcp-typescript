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

export const DEFAULT_MAX_TOOL_RESULT_CHARS = 20_000;

export const truncateText = (text: string, maxChars: number): string =>
  text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars)}\n[truncated: showing ${maxChars} of ${text.length} chars]`;

const toToolResultBlock = (
  { toolCallId, text, isError }: ToolResult,
  maxChars: number,
): ToolResultBlock => ({
  type: 'tool_result',
  toolCallId,
  content: truncateText(text, maxChars),
  isError,
});

export const toToolResultsMessage = (
  results: ToolResult[],
  maxToolResultChars = DEFAULT_MAX_TOOL_RESULT_CHARS,
): Message => ({
  role: 'user',
  content: results.map((result) => toToolResultBlock(result, maxToolResultChars)),
});

export const observe = (
  messages: Message[],
  response: LLMResponse,
  results: ToolResult[],
  maxToolResultChars = DEFAULT_MAX_TOOL_RESULT_CHARS,
): Message[] => [
  ...messages,
  toAssistantMessage(response),
  ...(results.length === 0 ? [] : [toToolResultsMessage(results, maxToolResultChars)]),
];
