import type { LLMProvider, LLMResponse, Message, Tool } from '../llm/types.ts';
import { executeToolCalls } from './act.ts';
import type { ToolExecutor, ToolResult } from './act.ts';
import { decide } from './decide.ts';
import { DEFAULT_MAX_TOOL_RESULT_CHARS, observe } from './observe.ts';

const DEFAULT_MAX_ITERATIONS = 10;

export type StopReason = 'answer' | 'max_iterations';

export interface AgentStep {
  iteration: number;
  response: LLMResponse;
  results: ToolResult[];
}

export interface RunAgentOptions {
  llm: LLMProvider;
  executor: ToolExecutor;
  tools: Tool[];
  prompt: string;
  maxIterations?: number;
  maxToolResultChars?: number;
  onStep?: (step: AgentStep) => void;
}

export interface AgentResult {
  answer: string | null;
  history: Message[];
  iterations: number;
  stopReason: StopReason;
}

export const runAgent = async ({
  llm,
  executor,
  tools,
  prompt,
  maxIterations = DEFAULT_MAX_ITERATIONS,
  maxToolResultChars = DEFAULT_MAX_TOOL_RESULT_CHARS,
  onStep,
}: RunAgentOptions): Promise<AgentResult> => {
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError(`maxIterations must be an integer >= 1, got ${maxIterations}`);
  }
  if (!Number.isInteger(maxToolResultChars) || maxToolResultChars < 1) {
    throw new RangeError(
      `maxToolResultChars must be an integer >= 1, got ${maxToolResultChars}`,
    );
  }

  let history: Message[] = [{ role: 'user', content: prompt }];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // DECIDE
    const response = await decide(llm, history, tools);

    if (response.toolCalls.length === 0) {
      return {
        answer: response.content,
        history: observe(history, response, []),
        iterations: iteration,
        stopReason: 'answer',
      };
    }

    // ACT
    const results = await executeToolCalls(executor, response.toolCalls);

    // OBSERVE
    history = observe(history, response, results, maxToolResultChars);
    onStep?.({ iteration, response, results });
  }

  return { answer: null, history, iterations: maxIterations, stopReason: 'max_iterations' };
};
