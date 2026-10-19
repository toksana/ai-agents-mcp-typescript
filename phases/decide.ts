import type { LLMProvider, LLMResponse, Message, Tool } from '../llm/types.ts';

export const decide = (llm: LLMProvider, messages: Message[], tools: Tool[]): Promise<LLMResponse> =>
  llm.chat(messages, tools);
