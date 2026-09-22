import { onBackendModuleRegister } from '#/lib/module';
import type { ToolBinding } from '#/modules/mcp/define-tool';

const tools: ToolBinding[] = [];

// Modules declare `tools` next to their routes; the registry is the union in registration order.
onBackendModuleRegister((module) => {
  for (const tool of module.tools ?? []) {
    if (tools.some((existing) => existing.name === tool.name))
      throw new Error(`[MCP] Tool ${tool.name} is registered twice`);
    tools.push(tool);
  }
});

/** Every tool any module registered; scope is enforced at call time so a client can discover what to step up to. */
export function getTools(): readonly ToolBinding[] {
  return tools;
}
