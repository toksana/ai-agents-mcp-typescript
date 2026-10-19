import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import type { LLMResponse, Message, ToolCall } from '../llm/types.ts';
import type { ToolResult } from './act.ts';
import { observe, toAssistantMessage, toToolResultsMessage } from './observe.ts';

const buildToolCall = (): ToolCall => ({
  id: faker.string.uuid(),
  name: faker.lorem.word(),
  arguments: { path: faker.system.directoryPath() },
});

const buildResult = ({ id, name }: ToolCall, isError = false): ToolResult => ({
  toolCallId: id,
  name,
  text: faker.lorem.paragraph(),
  isError,
});

const buildUserMessage = (): Message => ({ role: 'user', content: faker.lorem.sentence() });

describe('toAssistantMessage', () => {
  it('keeps the text and tool_use blocks of a mixed turn in order', () => {
    // Arrange
    const text = faker.lorem.sentence();
    const toolCall = buildToolCall();
    const response: LLMResponse = { content: text, toolCalls: [toolCall] };

    // Act
    const message = toAssistantMessage(response);

    // Assert
    expect(message).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text },
        { type: 'tool_use', id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments },
      ],
    });
  });

  it('omits the text block when the model returned only tool calls', () => {
    // Arrange
    const toolCall = buildToolCall();
    const response: LLMResponse = { content: null, toolCalls: [toolCall] };

    // Act
    const message = toAssistantMessage(response);

    // Assert
    expect(message).toEqual({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments },
      ],
    });
  });

  it('returns plain text when there are no tool calls', () => {
    // Arrange
    const text = faker.lorem.sentence();

    // Act
    const message = toAssistantMessage({ content: text, toolCalls: [] });

    // Assert
    expect(message).toEqual({ role: 'assistant', content: text });
  });
});

describe('toToolResultsMessage', () => {
  it('maps each result to a tool_result block in a user message, preserving order', () => {
    // Arrange
    const [first, second] = [buildToolCall(), buildToolCall()] as [ToolCall, ToolCall];
    const results = [buildResult(first), buildResult(second, true)];

    // Act
    const message = toToolResultsMessage(results);

    // Assert
    expect(message).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolCallId: first.id,
          content: results[0]?.text,
          isError: false,
        },
        {
          type: 'tool_result',
          toolCallId: second.id,
          content: results[1]?.text,
          isError: true,
        },
      ],
    });
  });
});

describe('observe', () => {
  it('appends the assistant turn and the tool results to the history', () => {
    // Arrange
    const history = [buildUserMessage()];
    const toolCall = buildToolCall();
    const response: LLMResponse = { content: null, toolCalls: [toolCall] };
    const results = [buildResult(toolCall)];

    // Act
    const updated = observe(history, response, results);

    // Assert
    expect(updated).toEqual([
      history[0],
      toAssistantMessage(response),
      toToolResultsMessage(results),
    ]);
  });

  it('does not mutate the original history', () => {
    // Arrange
    const history = [buildUserMessage()];
    const snapshot = [...history];
    const toolCall = buildToolCall();

    // Act
    const updated = observe(
      history,
      { content: null, toolCalls: [toolCall] },
      [buildResult(toolCall)],
    );

    // Assert
    expect(history).toEqual(snapshot);
    expect(updated).not.toBe(history);
  });

  it('adds only the assistant message when there are no results', () => {
    // Arrange
    const history = [buildUserMessage()];
    const response: LLMResponse = { content: faker.lorem.sentence(), toolCalls: [] };

    // Act
    const updated = observe(history, response, []);

    // Assert
    expect(updated).toEqual([history[0], toAssistantMessage(response)]);
  });
});
