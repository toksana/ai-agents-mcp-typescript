import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import type { LLMResponse, Message, ToolCall } from '../llm/types.ts';
import type { ToolResult } from './act.ts';
import {
  DEFAULT_MAX_TOOL_RESULT_CHARS,
  observe,
  toAssistantMessage,
  toToolResultsMessage,
  truncateText,
} from './observe.ts';

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

describe('truncateText', () => {
  it('returns text under the limit unchanged', () => {
    // Arrange
    const text = faker.string.alpha(10);

    // Act
    const result = truncateText(text, 11);

    // Assert
    expect(result).toBe(text);
  });

  it('returns text exactly at the limit unchanged', () => {
    // Arrange
    const text = faker.string.alpha(10);

    // Act
    const result = truncateText(text, 10);

    // Assert
    expect(result).toBe(text);
  });

  it('keeps the head and appends a marker with the shown and total counts', () => {
    // Arrange
    const text = faker.string.alpha(25);

    // Act
    const result = truncateText(text, 10);

    // Assert
    expect(result).toBe(`${text.slice(0, 10)}\n[truncated: showing 10 of 25 chars]`);
  });
});

describe('toToolResultsMessage truncation', () => {
  it('truncates long content and preserves id and error flag', () => {
    // Arrange
    const toolCall = buildToolCall();
    const text = faker.string.alpha(50);
    const result: ToolResult = { toolCallId: toolCall.id, name: toolCall.name, text, isError: true };

    // Act
    const message = toToolResultsMessage([result], 20);

    // Assert
    expect(message).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolCallId: toolCall.id,
          content: truncateText(text, 20),
          isError: true,
        },
      ],
    });
  });

  it('applies the default limit when none is given', () => {
    // Arrange
    const toolCall = buildToolCall();
    const text = faker.string.alpha(DEFAULT_MAX_TOOL_RESULT_CHARS + 5);
    const result: ToolResult = { toolCallId: toolCall.id, name: toolCall.name, text, isError: false };

    // Act
    const message = toToolResultsMessage([result]);

    // Assert
    expect(message).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolCallId: toolCall.id,
          content: truncateText(text, DEFAULT_MAX_TOOL_RESULT_CHARS),
          isError: false,
        },
      ],
    });
  });
});

describe('observe', () => {
  it('passes the limit through to the tool results', () => {
    // Arrange
    const toolCall = buildToolCall();
    const response: LLMResponse = { content: null, toolCalls: [toolCall] };
    const results: ToolResult[] = [
      { toolCallId: toolCall.id, name: toolCall.name, text: faker.string.alpha(40), isError: false },
    ];

    // Act
    const updated = observe([], response, results, 15);

    // Assert
    expect(updated[1]).toEqual(toToolResultsMessage(results, 15));
  });

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
