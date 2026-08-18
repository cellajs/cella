import { convertSchemaToJsonSchema, type JSONSchema, type ServerTool } from '@tanstack/ai';
import type { AuthContext } from '#/core/context';
import { buildTools } from '#/modules/mcp/tool-registry';

/** A server tool as the MCP layer sees it: the element type of the `buildTools` registry. */
export type ExecutableTool = ServerTool;

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

const emptyObjectSchema = (): JSONSchema => ({ type: 'object', properties: {}, required: [] });

/** Convert a tool's (Standard Schema or JSON Schema) input to JSON Schema for `tools/list`. */
function toInputSchema(schema: unknown): JSONSchema {
  const json = schema
    ? convertSchemaToJsonSchema(schema as Parameters<typeof convertSchemaToJsonSchema>[0])
    : undefined;
  const result = json ?? emptyObjectSchema();
  if (result.type === 'object' && result.additionalProperties === undefined) result.additionalProperties = false;
  return result;
}

export function getMcpTools(ctx: AuthContext): ExecutableTool[] {
  return buildTools(ctx);
}

export function describeMcpTools(tools: ExecutableTool[]): McpToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: toInputSchema(tool.inputSchema),
  }));
}
