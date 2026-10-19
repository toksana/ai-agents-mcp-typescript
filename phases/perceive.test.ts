import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { perceive } from './perceive.ts';
import type { ToolLister } from './perceive.ts';

const buildLister = (tools: Awaited<ReturnType<ToolLister['listTools']>>['tools']): ToolLister => ({
  listTools: async () => ({ tools }),
});

describe('perceive', () => {
  it('maps MCP tools to LLM tools', async () => {
    // Arrange
    const name = faker.lorem.word();
    const description = faker.lorem.sentence();
    const properties = { path: { type: 'string' } };
    const lister = buildLister([
      { name, description, inputSchema: { type: 'object', properties, required: ['path'] } },
    ]);

    // Act
    const tools = await perceive(lister);

    // Assert
    expect(tools).toEqual([
      { name, description, inputSchema: { type: 'object', properties, required: ['path'] } },
    ]);
  });

  it('defaults a missing description and properties', async () => {
    // Arrange
    const name = faker.lorem.word();
    const lister = buildLister([{ name, inputSchema: { type: 'object' } }]);

    // Act
    const tools = await perceive(lister);

    // Assert
    expect(tools).toEqual([
      { name, description: '', inputSchema: { type: 'object', properties: {}, required: undefined } },
    ]);
  });

  it('returns an empty array when the server offers no tools', async () => {
    // Arrange
    const lister = buildLister([]);

    // Act
    const tools = await perceive(lister);

    // Assert
    expect(tools).toEqual([]);
  });
});
