import { z } from '@hono/zod-openapi';
import type { McpTool } from '#/core/mcp-tool-registry';

/** A tool as `tools/list` returns it. */
export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: McpTool['annotations'];
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

/** Tools are fixed after boot, so each descriptor is derived once. */
const descriptors = new WeakMap<McpTool, McpToolDescriptor>();

export function describeMcpTools(tools: readonly McpTool[]): McpToolDescriptor[] {
  return tools.map((tool) => {
    let descriptor = descriptors.get(tool);
    if (!descriptor) {
      descriptor = {
        name: tool.name,
        description: tool.description,
        inputSchema: toInputSchema(tool.inputSchema),
        annotations: tool.annotations,
        _meta: { scope: tool.scope, approvalRequired: tool.approvalRequired },
      };
      descriptors.set(tool, descriptor);
    }
    return descriptor;
  });
}
