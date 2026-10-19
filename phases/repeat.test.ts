import { faker } from '@faker-js/faker';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider, LLMResponse, ToolCall } from '../llm/types.ts';
import type { ToolExecutor } from './act.ts';
import { runAgent } from './repeat.ts';

const buildToolCall = (): ToolCall => ({
  id: faker.string.uuid(),
  name: faker.lorem.word(),
  arguments: { path: faker.system.directoryPath() },
});

const toolResponse = (...toolCalls: ToolCall[]): LLMResponse => ({ content: null, toolCalls });

const answerResponse = (content: string | null = faker.lorem.sentence()): LLMResponse => ({
  content,
  toolCalls: [],
});

const buildLLM = (...responses: LLMResponse[]) => {
  const chat = vi.fn<LLMProvider['chat']>();

  for (const response of responses) {
    chat.mockResolvedValueOnce(response);
  }

  return { llm: { chat } satisfies LLMProvider, chat };
};

const textResult = (text: string, isError = false) => ({
  content: [{ type: 'text' as const, text }],
  isError,
});

const buildExecutor = (text = faker.lorem.sentence(), isError = false) => {
  const callTool = vi.fn<ToolExecutor['callTool']>(async () => textResult(text, isError));

  return { executor: { callTool } satisfies ToolExecutor, callTool };
};

describe('runAgent', () => {
  it('returns the answer immediately when the model uses no tools', async () => {
    // Arrange
    const prompt = faker.lorem.sentence();
    const answer = faker.lorem.sentence();
    const { llm } = buildLLM(answerResponse(answer));
    const { executor, callTool } = buildExecutor();

    // Act
    const result = await runAgent({ llm, executor, tools: [], prompt });

    // Assert
    expect(result).toEqual({
      answer,
      history: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: answer },
      ],
      iterations: 1,
      stopReason: 'answer',
    });
    expect(callTool).not.toHaveBeenCalled();
  });

  it('executes a tool call, feeds the result back and returns the final answer', async () => {
    // Arrange
    const prompt = faker.lorem.sentence();
    const toolCall = buildToolCall();
    const output = faker.lorem.paragraph();
    const answer = faker.lorem.sentence();
    const { llm, chat } = buildLLM(toolResponse(toolCall), answerResponse(answer));
    const { executor, callTool } = buildExecutor(output);

    // Act
    const result = await runAgent({ llm, executor, tools: [], prompt });

    // Assert
    expect(callTool).toHaveBeenCalledWith({ name: toolCall.name, arguments: toolCall.arguments });
    expect(result.history).toEqual([
      { role: 'user', content: prompt },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', toolCallId: toolCall.id, content: output, isError: false }],
      },
      { role: 'assistant', content: answer },
    ]);
    expect(result).toMatchObject({ answer, iterations: 2, stopReason: 'answer' });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('feeds tool errors back to the model and keeps going', async () => {
    // Arrange
    const toolCall = buildToolCall();
    const message = faker.lorem.sentence();
    const { llm } = buildLLM(toolResponse(toolCall), answerResponse());
    const { executor } = buildExecutor(message, true);

    // Act
    const result = await runAgent({ llm, executor, tools: [], prompt: faker.lorem.sentence() });

    // Assert
    expect(result.history[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', toolCallId: toolCall.id, content: message, isError: true }],
    });
    expect(result.stopReason).toBe('answer');
  });

  it('stops with max_iterations when the model keeps calling tools', async () => {
    // Arrange
    const maxIterations = 3;
    const { llm, chat } = buildLLM(
      ...Array.from({ length: maxIterations }, () => toolResponse(buildToolCall())),
    );
    const { executor } = buildExecutor();

    // Act
    const result = await runAgent({
      llm,
      executor,
      tools: [],
      prompt: faker.lorem.sentence(),
      maxIterations,
    });

    // Assert
    expect(result).toMatchObject({
      answer: null,
      iterations: maxIterations,
      stopReason: 'max_iterations',
    });
    expect(result.history).toHaveLength(1 + maxIterations * 2);
    expect(chat).toHaveBeenCalledTimes(maxIterations);
  });

  it('calls onStep once per tool iteration, but not for the final answer', async () => {
    // Arrange
    const [first, second] = [buildToolCall(), buildToolCall()] as [ToolCall, ToolCall];
    const { llm } = buildLLM(toolResponse(first), toolResponse(second), answerResponse());
    const { executor } = buildExecutor();
    const onStep = vi.fn();

    // Act
    await runAgent({ llm, executor, tools: [], prompt: faker.lorem.sentence(), onStep });

    // Assert
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep.mock.calls.map(([step]) => step.iteration)).toEqual([1, 2]);
    expect(onStep.mock.calls[1]?.[0].results).toEqual([
      expect.objectContaining({ toolCallId: second.id, name: second.name }),
    ]);
  });

  it('returns a null answer when the final reply is empty', async () => {
    // Arrange
    const { llm } = buildLLM(answerResponse(null));
    const { executor } = buildExecutor();

    // Act
    const result = await runAgent({ llm, executor, tools: [], prompt: faker.lorem.sentence() });

    // Assert
    expect(result).toMatchObject({ answer: null, stopReason: 'answer' });
  });

  it('propagates LLM failures', async () => {
    // Arrange
    const message = faker.lorem.sentence();
    const chat = vi.fn<LLMProvider['chat']>().mockRejectedValue(new Error(message));
    const { executor } = buildExecutor();

    // Act
    const act = runAgent({ llm: { chat }, executor, tools: [], prompt: faker.lorem.sentence() });

    // Assert
    await expect(act).rejects.toThrow(message);
  });

  it.each([0, -1, 1.5])('rejects an invalid maxIterations of %s', async (maxIterations) => {
    // Arrange
    const { llm } = buildLLM();
    const { executor } = buildExecutor();

    // Act
    const act = runAgent({ llm, executor, tools: [], prompt: faker.lorem.sentence(), maxIterations });

    // Assert
    await expect(act).rejects.toThrow(RangeError);
  });

  it.each([0, -1, 1.5])('rejects an invalid maxToolResultChars of %s', async (maxToolResultChars) => {
    // Arrange
    const { llm } = buildLLM();
    const { executor } = buildExecutor();

    // Act
    const act = runAgent({
      llm,
      executor,
      tools: [],
      prompt: faker.lorem.sentence(),
      maxToolResultChars,
    });

    // Assert
    await expect(act).rejects.toThrow(RangeError);
  });

  it('truncates large tool results in history while onStep still sees the full text', async () => {
    // Arrange
    const maxToolResultChars = 20;
    const toolCall = buildToolCall();
    const output = faker.string.alpha(100);
    const { llm } = buildLLM(toolResponse(toolCall), answerResponse());
    const { executor } = buildExecutor(output);
    const onStep = vi.fn();

    // Act
    const result = await runAgent({
      llm,
      executor,
      tools: [],
      prompt: faker.lorem.sentence(),
      maxToolResultChars,
      onStep,
    });

    // Assert
    expect(result.history[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolCallId: toolCall.id,
          content: `${output.slice(0, maxToolResultChars)}\n[truncated: showing 20 of 100 chars]`,
          isError: false,
        },
      ],
    });
    expect(onStep.mock.calls[0]?.[0].results[0].text).toBe(output);
  });
});
