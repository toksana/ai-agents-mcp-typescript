import { faker } from '@faker-js/faker';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicProvider } from './anthropic.ts';
import type { Message, Tool } from './types.ts';

const mockFetch = (body: unknown, init: ResponseInit = { status: 200 }) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), init));
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
};

const buildTool = (): Tool => ({
  name: faker.lorem.word(),
  description: faker.lorem.sentence(),
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
});

describe('createAnthropicProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('throws when no API key is available', () => {
    // Arrange
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    // Act
    const act = () => createAnthropicProvider();

    // Assert
    expect(act).toThrow('ANTHROPIC_API_KEY is not set');
  });

  it('falls back to ANTHROPIC_API_KEY from the environment', async () => {
    // Arrange
    const apiKey = faker.string.alphanumeric(24);
    vi.stubEnv('ANTHROPIC_API_KEY', apiKey);
    const fetchMock = mockFetch({ content: [] });
    const llm = createAnthropicProvider();

    // Act
    await llm.chat([{ role: 'user', content: faker.lorem.sentence() }]);

    // Assert
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual(expect.objectContaining({ 'x-api-key': apiKey }));
  });

  it('sends system messages as a top-level field and maps tools to input_schema', async () => {
    // Arrange
    const apiKey = faker.string.alphanumeric(24);
    const model = faker.lorem.word();
    const tool = buildTool();
    const messages: Message[] = [
      { role: 'system', content: faker.lorem.sentence() },
      { role: 'user', content: faker.lorem.sentence() },
    ];
    const fetchMock = mockFetch({ content: [] });
    const llm = createAnthropicProvider({ apiKey, model, maxTokens: 256 });

    // Act
    await llm.chat(messages, [tool]);

    // Assert
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model,
      max_tokens: 256,
      system: messages[0]?.content,
      messages: [messages[1]],
      tools: [
        {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        },
      ],
    });
  });

  it('omits system and tools when none are provided', async () => {
    // Arrange
    const fetchMock = mockFetch({ content: [] });
    const llm = createAnthropicProvider({ apiKey: faker.string.alphanumeric(24) });

    // Act
    await llm.chat([{ role: 'user', content: faker.lorem.sentence() }]);

    // Assert
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('system');
    expect(body).not.toHaveProperty('tools');
  });

  it('returns text content and no tool calls for a text-only reply', async () => {
    // Arrange
    const text = faker.lorem.sentence();
    mockFetch({ content: [{ type: 'text', text }] });
    const llm = createAnthropicProvider({ apiKey: faker.string.alphanumeric(24) });

    // Act
    const result = await llm.chat([{ role: 'user', content: faker.lorem.sentence() }]);

    // Assert
    expect(result).toEqual({ content: text, toolCalls: [] });
  });

  it('returns tool calls and null content for a tool_use reply', async () => {
    // Arrange
    const name = faker.lorem.word();
    const input = { path: faker.system.directoryPath() };
    mockFetch({ content: [{ type: 'tool_use', id: faker.string.uuid(), name, input }] });
    const llm = createAnthropicProvider({ apiKey: faker.string.alphanumeric(24) });

    // Act
    const result = await llm.chat([{ role: 'user', content: faker.lorem.sentence() }]);

    // Assert
    expect(result).toEqual({ content: null, toolCalls: [{ name, arguments: input }] });
  });

  it('throws with status and body when the API responds with an error', async () => {
    // Arrange
    mockFetch({ error: 'invalid x-api-key' }, { status: 401 });
    const llm = createAnthropicProvider({ apiKey: faker.string.alphanumeric(24) });

    // Act
    const act = llm.chat([{ role: 'user', content: faker.lorem.sentence() }]);

    // Assert
    await expect(act).rejects.toThrow('Anthropic API error 401: {"error":"invalid x-api-key"}');
  });
});
