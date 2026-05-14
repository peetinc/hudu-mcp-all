#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import { buildTools } from './swagger.js';
import { callTool } from './hudu-client.js';
import type { SwaggerSpec, ToolDef } from './types.js';

function locateSwagger(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.HUDU_SWAGGER_PATH,
    resolve(process.cwd(), 'swagger.json'),
    resolve(here, '..', 'swagger.json'),
    resolve(here, 'swagger.json'),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      readFileSync(p, 'utf8');
      return p;
    } catch {
      // not found, continue
    }
  }
  throw new Error(`Could not locate swagger.json. Tried: ${candidates.join(', ')}`);
}

async function main(): Promise<void> {
  const config = loadConfig();

  const swaggerPath = locateSwagger();
  const spec = JSON.parse(readFileSync(swaggerPath, 'utf8')) as SwaggerSpec;
  const allTools = buildTools(spec);
  const tools = allTools.filter((t) => !config.disabledOperations.has(t.name));
  const toolMap = new Map<string, ToolDef>(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: 'hudu-mcp-all', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolMap.get(req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      };
    }
    try {
      const result = await callTool(tool, req.params.arguments, config);
      const payload = {
        status: result.status,
        ok: result.ok,
        contentType: result.contentType,
        body: result.body,
      };
      return {
        isError: !result.ok,
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[hudu-mcp-all] loaded ${tools.length} tools from ${swaggerPath}\n` +
      `[hudu-mcp-all] base: ${config.baseUrl}\n` +
      `[hudu-mcp-all] readonly=${config.readonly} disabled=${config.disabledOperations.size}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[hudu-mcp-all] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
