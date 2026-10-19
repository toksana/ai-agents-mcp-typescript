import { faker } from '@faker-js/faker';
import { describe, expect, it, vi } from 'vitest';
import { executeToolCall, executeToolCalls } from './act.ts';
import type { ToolExecutor } from './act.ts';
import type { ToolCall } from './llm.ts';

const buildToolCall = (): ToolCall => ({
  name: faker.lorem.word(),
  arguments: { path: faker.system.directoryPath() },
});

const textBlock = (text: string) => ({ type: 'text' as const, text });

const imageBlock = () => ({
  type: 'image' as const,
  data: faker.string.alphanumeric(8),
  mimeType: 'image/png',
});

const buildExecutor = (callTool: ToolExecutor['callTool']): ToolExecutor => ({ callTool });

describe('executeToolCall', () => {
  it('passes the tool name and arguments to callTool', async () => {
    // Arrange
    const toolCall = buildToolCall();
    const callTool = vi.fn(async () => ({ content: [] }));

    // Act
    await executeToolCall(buildExecutor(callTool), toolCall);

    // Assert
    expect(callTool).toHaveBeenCalledWith({ name: toolCall.name, arguments: toolCall.arguments });
  });

  it('joins text blocks and ignores non-text blocks', async () => {
    // Arrange
    const toolCall = buildToolCall();
    const first = faker.lorem.sentence();
    const second = faker.lorem.sentence();
    const executor = buildExecutor(async () => ({
      content: [textBlock(first), imageBlock(), textBlock(second)],
    }));

    // Act
    const result = await executeToolCall(executor, toolCall);

    // Assert
    expect(result).toEqual({ name: toolCall.name, text: `${first}\n${second}`, isError: false });
  });

  it('propagates isError from a tool-level failure', async () => {
    // Arrange
    const toolCall = buildToolCall();
    const message = faker.lorem.sentence();
    const executor = buildExecutor(async () => ({ content: [textBlock(message)], isError: true }));

    // Act
    const result = await executeToolCall(executor, toolCall);

    // Assert
    expect(result).toEqual({ name: toolCall.name, text: message, isError: true });
  });

  it('converts a thrown Error into an error result', async () => {
    // Arrange
    const toolCall = buildToolCall();
    const message = faker.lorem.sentence();
    const executor = buildExecutor(async () => {
      throw new Error(message);
    });

    // Act
    const result = await executeToolCall(executor, toolCall);

    // Assert
    expect(result).toEqual({ name: toolCall.name, text: message, isError: true });
  });

  it('converts a non-Error throw into a generic error result', async () => {
    // Arrange
    const toolCall = buildToolCall();
    const executor = buildExecutor(async () => {
      throw faker.lorem.word();
    });

    // Act
    const result = await executeToolCall(executor, toolCall);

    // Assert
    expect(result).toEqual({
      name: toolCall.name,
      text: 'Unknown error calling tool',
      isError: true,
    });
  });
});

describe('executeToolCalls', () => {
  it('returns an empty array when there are no tool calls', async () => {
    // Arrange
    const callTool = vi.fn(async () => ({ content: [] }));

    // Act
    const results = await executeToolCalls(buildExecutor(callTool), []);

    // Assert
    expect(results).toEqual([]);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('executes calls sequentially and returns results in order', async () => {
    // Arrange
    const toolCalls = [buildToolCall(), buildToolCall(), buildToolCall()];
    const order: string[] = [];
    const executor = buildExecutor(async ({ name }) => {
      order.push(`start:${name}`);
      await Promise.resolve();
      order.push(`end:${name}`);

      return { content: [textBlock(name)] };
    });

    // Act
    const results = await executeToolCalls(executor, toolCalls);

    // Assert
    expect(results.map((result) => result.name)).toEqual(toolCalls.map(({ name }) => name));
    expect(order).toEqual(toolCalls.flatMap(({ name }) => [`start:${name}`, `end:${name}`]));
  });

  it('keeps executing later calls after one fails', async () => {
    // Arrange
    const [failing, succeeding] = [buildToolCall(), buildToolCall()] as [ToolCall, ToolCall];
    const executor = buildExecutor(async ({ name }) => {
      if (name === failing.name) {
        throw new Error(faker.lorem.sentence());
      }

      return { content: [textBlock('ok')] };
    });

    // Act
    const results = await executeToolCalls(executor, [failing, succeeding]);

    // Assert
    expect(results.map((result) => result.isError)).toEqual([true, false]);
  });
});
