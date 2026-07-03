import type { ServerTool } from '@tanstack/ai';
import type { AuthContext } from '#/core/context';

/**
 * Build the set of server-side tools the AI assistant can call.
 *
 * The Cella template ships with no tools by default. Forks register their own
 * domain tools here (e.g. searching/reading their product entities) using
 * `toolDefinition(...).server(...)` from `@tanstack/ai`.
 *
 * This registry is the single source of truth for tools: the MCP server exposes
 * it to external clients, and a fork's own server-side model runner (e.g. an
 * `agent` product) can reuse the same tools. Declare a capability once, expose
 * it everywhere.
 */
export function buildTools(_ctx: AuthContext): ServerTool[] {
  return [];
}
