import type { z } from '@hono/zod-openapi';
import { type EntityScope, type EntityType, scopes } from 'shared';
import type { OrgContext } from '#/core/context';
import type { XToolMetadata } from '#/core/openapi-extensions';

/** The route fields a tool binding reads; `x-tool` is stripped from the route type but present at runtime. */
type ToolRoute = { operationId: string; method: string; summary?: string; 'x-tool'?: XToolMetadata };

/**
 * An operation exposed to MCP clients: the route names and documents it, the binding types its input and runs it.
 * The registry holds the `never` form; `execute` is called with the schema's parsed output.
 */
export interface ToolBinding<TInput = never> {
  name: string;
  description: string;
  /** The entity scope a token must carry (`<entity>:read` for GET routes, `<entity>:write` otherwise). */
  scope: EntityScope;
  /** MCP tool annotations, derived from the HTTP method. */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
  approvalRequired: boolean;
  inputSchema: z.ZodType;
  execute: (ctx: OrgContext, input: TInput) => Promise<unknown>;
}

/**
 * Binds a route carrying `x-tool` to an in-process execution. Only routes that opt in become tools ("every operation
 * is a tool" would be the exploit); the description an LLM reads comes from `x-tool`, the name from `operationId`.
 */
export function defineTool<TInput>(
  route: ToolRoute,
  binding: { entity: EntityType; inputSchema: z.ZodType<TInput>; execute: ToolBinding<TInput>['execute'] },
): ToolBinding<TInput> {
  const meta = route['x-tool'];
  if (!meta?.enabled) throw new Error(`[MCP] Route ${route.operationId} carries no enabled x-tool metadata`);
  const method = route.method.toLowerCase();
  const isRead = method === 'get';
  return {
    name: route.operationId,
    description: meta.description,
    scope: scopes.required(binding.entity, isRead ? 'read' : 'update'),
    annotations: { readOnlyHint: isRead, destructiveHint: method === 'delete', idempotentHint: method !== 'post' },
    approvalRequired: meta.approvalRequired,
    inputSchema: binding.inputSchema,
    execute: binding.execute,
  };
}
