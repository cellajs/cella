import { z } from '@hono/zod-openapi';
import type { RouteTool } from '#/core/tool-registry';

/** A tool as `tools/list` returns it. */
export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: RouteTool['annotations'];
  /** Beyond the MCP schema: the scope a token needs, so a client can ask for it up front. */
  _meta: { scope: string; approvalRequired: boolean };
}

/**
 * JSON Schema for `tools/list`, the input side of the route's schemas (query strings stay strings, as the route
 * reads them); unknown keys are refused so a model cannot smuggle fields past the operation.
 */
function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  if (json.type === 'object' && json.additionalProperties === undefined) json.additionalProperties = false;
  return json;
}

export function describeMcpTools(tools: readonly RouteTool[]): McpToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: toInputSchema(tool.inputSchema),
    annotations: tool.annotations,
    _meta: { scope: tool.scope, approvalRequired: tool.approvalRequired },
  }));
}
