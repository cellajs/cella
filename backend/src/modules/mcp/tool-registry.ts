import type { ServerTool } from '@tanstack/ai';
import type { AuthContext } from '#/core/context';

/** Shared server-side AI tool registry: apps add domain tools here, the template registers none. */
export function buildTools(_ctx: AuthContext): ServerTool[] {
  return [];
}
