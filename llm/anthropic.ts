import type {
  ContentBlock,
  LLMProvider,
  LLMResponse,
  Message,
  Tool,
  ToolCall,
} from './types.ts';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-5-5';
const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

type AnthropicRequestBlock = AnthropicContentBlock | AnthropicToolResultBlock;

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
}

const toAnthropicTools = (tools: Tool[]) =>
  tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    input_schema: inputSchema,
  }));

const toLLMResponse = (blocks: AnthropicContentBlock[]): LLMResponse => {
  const text = blocks
    .filter((block): block is AnthropicTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const toolCalls = blocks
    .filter((block): block is AnthropicToolUseBlock => block.type === 'tool_use')
    .map((block): ToolCall => ({ id: block.id, name: block.name, arguments: block.input }));

  return { content: text === '' ? null : text, toolCalls };
};

const toAnthropicBlock = (block: ContentBlock): AnthropicRequestBlock => {
  switch (block.type) {
    case 'text':
      return block;
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.arguments };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.toolCallId,
        content: block.content,
        is_error: block.isError,
      };
  }
};

const toAnthropicMessage = ({ role, content }: Message) => ({
  role,
  content: typeof content === 'string' ? content : content.map(toAnthropicBlock),
});

const toText = (content: Message['content']): string =>
  typeof content === 'string'
    ? content
    : content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');

const splitSystemMessages = (messages: Message[]) => ({
  system: messages
    .filter((message) => message.role === 'system')
    .map((message) => toText(message.content))
    .join('\n\n'),
  conversation: messages.filter((message) => message.role !== 'system').map(toAnthropicMessage),
});

export const createAnthropicProvider = ({
  apiKey,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
}: AnthropicProviderOptions = {}): LLMProvider => {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (key === undefined || key === '') {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const chat: LLMProvider['chat'] = async (messages, tools = []) => {
    const { system, conversation } = splitSystemMessages(messages);

    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: conversation,
        ...(system !== '' && { system }),
        ...(tools.length > 0 && { tools: toAnthropicTools(tools) }),
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as AnthropicMessagesResponse;

    return toLLMResponse(data.content);
  };

  return { chat };
};
