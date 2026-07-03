import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai';
import type { AuthContext } from '#/core/context';
import { buildTools } from '#/modules/mcp/tool-registry';

/**
 * A server tool reduced to the fields the MCP layer needs. Cella's tool registry
 * (`buildTools`) is the single source of truth: tools declared there are exposed
 * to both the in-app model runner and external MCP clients.
 */
export interface ExecutableTool {
  name: string;
  description: string;
  inputSchema?: unknown;
  execute?: (args: unknown, context?: unknown) => unknown;
}

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

/** Resolve the workspace-scoped tool set for the current request. */
export function getMcpTools(ctx: AuthContext): ExecutableTool[] {
  return buildTools(ctx) as unknown as ExecutableTool[];
}

/** Describe tools for an MCP `tools/list` response. */
export function describeMcpTools(tools: ExecutableTool[]): McpToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: toInputSchema(tool.inputSchema),
  }));
}
