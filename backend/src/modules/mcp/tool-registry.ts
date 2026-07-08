import { type ServerTool, toolDefinition } from '@tanstack/ai';
import { z } from 'zod';
import type { AuthContext } from '#/core/context';
import { env } from '#/env';

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
 *
 * The one exception is the `whoami` demo tool, gated behind `AUTH_SERVER_ENABLED`:
 * it exists only so the MCP + OAuth experiment (Experiment 0 in MCP_PLAN.md) has
 * something real to call end-to-end. The template default stays empty.
 */
export function buildTools(ctx: AuthContext): ServerTool[] {
  if (!env.AUTH_SERVER_ENABLED) return [];

  // Demo tool: proves an audience-bound token maps to a real, tenant-scoped
  // identity. Returns the workspace the caller's token is scoped to.
  const whoami = toolDefinition({
    name: 'whoami',
    description: 'Return the user id and workspace (tenant/organization) the current MCP access token is scoped to.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      userId: z.string(),
      organizationId: z.string(),
      tenantId: z.string(),
    }),
  }).server(() => ({
    userId: ctx.var.userId,
    organizationId: ctx.var.organizationId,
    tenantId: ctx.var.tenantId,
  }));

  return [whoami];
}
