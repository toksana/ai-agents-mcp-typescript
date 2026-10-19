import { faker } from '@faker-js/faker';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider, LLMResponse, Message, Tool } from '../llm/types.ts';
import { decide } from './decide.ts';

describe('decide', () => {
  it('passes messages and tools to the LLM and returns its response', async () => {
    // Arrange
    const messages: Message[] = [{ role: 'user', content: faker.lorem.sentence() }];
    const tools: Tool[] = [
      {
        name: faker.lorem.word(),
        description: faker.lorem.sentence(),
        inputSchema: { type: 'object', properties: {} },
      },
    ];
    const expected: LLMResponse = { content: faker.lorem.sentence(), toolCalls: [] };
    const chat = vi.fn(async () => expected);
    const llm: LLMProvider = { chat };

    // Act
    const response = await decide(llm, messages, tools);

    // Assert
    expect(chat).toHaveBeenCalledWith(messages, tools);
    expect(response).toEqual(expected);
  });
});
