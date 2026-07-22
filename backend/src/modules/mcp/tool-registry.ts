import type { ServerTool } from '@tanstack/ai';
import type { AuthContext } from '#/core/context';

/**
 * Builds the shared server-side AI tool registry.
 * Forks add domain tools here so MCP clients and internal model runners expose the same
 * capabilities; the template registers none.
 */
export function buildTools(_ctx: AuthContext): ServerTool[] {
  return [];
}
