import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod/v4';

serveStdio(() => {
  const server = new McpServer({
    name: 'file-server',
    version: '1.0.0',
  });

  server.registerTool(
    'list_files',
    {
      description: 'List files and directories in a given path',
      inputSchema: z.object({
        path: z.string().describe('Directory path to list'),
      }),
    },
    async ({ path: dirPath }) => {
      try {
        const absolutePath = path.resolve(dirPath);
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });

        const lines = entries.map((entry) => {
          const icon = entry.isDirectory() ? '📁' : '📄';
          return `${icon} ${entry.name}`;
        });

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'read_files',
    {
      description: 'Read the contents of a text file',
      inputSchema: z.object({
        path: z.string().describe('Path to the file to read'),
      }),
    },
    async ({ path: filePath }) => {
      try {
        const absolutePath = path.resolve(filePath);
        const content = await fs.readFile(absolutePath, 'utf-8');

        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: Could not read file "${filePath}". ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
          isError: true,
        };
      }
    },
  );

  return server;
});
