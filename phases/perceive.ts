import type { ListToolsResult } from '@modelcontextprotocol/client';
import type { Tool } from '../llm/types.ts';

export interface ToolLister {
  listTools(): Promise<Pick<ListToolsResult, 'tools'>>;
}

type McpTool = ListToolsResult['tools'][number];

const toLLMTool = ({ name, description, inputSchema }: McpTool): Tool => ({
  name,
  description: description ?? '',
  inputSchema: {
    type: 'object',
    properties: inputSchema.properties ?? {},
    required: inputSchema.required,
  },
});

export const perceive = async (lister: ToolLister): Promise<Tool[]> => {
  const { tools } = await lister.listTools();

  return tools.map(toLLMTool);
};
