import { z } from 'zod';
import type { ToolBinding } from '#/modules/mcp/define-tool';

/** A tool as `tools/list` returns it. */
export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolBinding['annotations'];
  /** Beyond the MCP schema: the scope a token needs, so a client can ask for it up front. */
  _meta: { scope: string; approvalRequired: boolean };
}

/** JSON Schema for `tools/list`; unknown keys are refused so an LLM cannot smuggle fields past the operation. */
function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  if (json.type === 'object' && json.additionalProperties === undefined) json.additionalProperties = false;
  return json;
}

export function describeMcpTools(tools: readonly ToolBinding[]): McpToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: toInputSchema(tool.inputSchema),
    annotations: tool.annotations,
    _meta: { scope: tool.scope, approvalRequired: tool.approvalRequired },
  }));
}
