import { z } from '@hono/zod-openapi';
import { type EntityScope, scopes } from 'shared';
import type { OrgContext } from '#/core/context';
import type { ToolRoute, XToolSpec } from '#/core/openapi-extensions';
import { createServerStx, createServerStxFor } from '#/core/stx/create-server-stx';

/** A route exposed to MCP clients: named and documented by the route, run through its operation in-process. */
export interface RouteTool {
  name: string;
  description: string;
  /** The entity scope a token must carry (`<entity>:read` for GET routes, `<entity>:write` otherwise). */
  scope: EntityScope;
  /** MCP tool annotations, derived from the HTTP method. */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
  approvalRequired: boolean;
  /** What the model sees: the route's request parts merged, sync transaction left out. */
  inputSchema: z.ZodType;
  /** Validates against the route's own schemas, rebuilds the sync transaction, and calls the route's `execute`. */
  run: (ctx: OrgContext, args: unknown) => Promise<unknown>;
}

/** A route's tool metadata as the registry stores it: the typed `execute` of any route fits the `never` input. */
export type RegisteredTool = XToolSpec & { execute: (ctx: OrgContext, input: never) => Promise<unknown> };

const tools: RouteTool[] = [];

/** Route parameters the MCP endpoint already resolved; never model input. */
const routeParams = ['tenantId', 'organizationId'];

const anyObject = (schema: unknown): schema is z.ZodObject<z.ZodRawShape> => schema instanceof z.ZodObject;

/**
 * The sync transaction (`stx`) is trusted server metadata, never model input: it is left out of the schema the model
 * sees and rebuilt with `createServerStx()` before the route's own schema validates the body.
 */
function withoutStx(schema: z.ZodType): { model: z.ZodType; restore: (value: unknown) => unknown } {
  if (anyObject(schema) && 'stx' in schema.shape) {
    // Rebuilt from the shape (`.omit()` refuses refined objects); the route's own schema still validates the call.
    const { stx: _stx, ...shape } = schema.shape;
    return {
      model: z.object(shape),
      restore: (value) => {
        const record = value as Record<string, unknown>;
        const ops = record.ops;
        const stx =
          ops && typeof ops === 'object' ? createServerStxFor(ops as Record<string, unknown>) : createServerStx();
        return { ...record, stx };
      },
    };
  }
  if (schema instanceof z.ZodArray) {
    const inner = withoutStx(schema.element as z.ZodType);
    if (inner.model !== schema.element) {
      return { model: z.array(inner.model), restore: (value) => (value as unknown[]).map(inner.restore) };
    }
  }
  return { model: schema, restore: (value) => value };
}

/** Called by `createXRoute` for every route carrying an enabled `x-tool`; the mcp module reads the result. */
export function registerRouteTool(route: ToolRoute, meta: RegisteredTool): void {
  if (tools.some((tool) => tool.name === route.operationId))
    throw new Error(`[MCP] Tool ${route.operationId} is registered twice`);

  const paramsSchema = route.request?.params;
  const params = anyObject(paramsSchema)
    ? paramsSchema.omit(
        Object.fromEntries(routeParams.filter((key) => key in paramsSchema.shape).map((key) => [key, true])),
      )
    : z.object({});
  const querySchema = route.request?.query;
  const query = anyObject(querySchema) ? querySchema : z.object({});
  const media = route.request?.body?.content?.['application/json'];
  const jsonBody = media && 'schema' in media ? media.schema : undefined;
  const body = jsonBody instanceof z.ZodType ? jsonBody : undefined;
  const modelBody = body ? withoutStx(body) : undefined;
  const bodyIsObject = anyObject(modelBody?.model);
  // A non-object body (a batch of items) nests under one key so it cannot collide with params or query.
  const bodyKey = modelBody && !bodyIsObject ? (modelBody.model instanceof z.ZodArray ? 'items' : 'body') : undefined;

  const inputSchema = z.object({
    ...params.shape,
    ...query.shape,
    ...(bodyIsObject && anyObject(modelBody?.model) ? modelBody.model.shape : {}),
    ...(bodyKey && modelBody ? { [bodyKey]: modelBody.model } : {}),
  });
  const paramKeys = Object.keys(params.shape);
  const queryKeys = Object.keys(query.shape);
  const method = route.method.toLowerCase();
  const isRead = method === 'get';

  tools.push({
    name: route.operationId,
    description: meta.description,
    scope: scopes.required(meta.entity, isRead ? 'read' : 'update'),
    annotations: { readOnlyHint: isRead, destructiveHint: method === 'delete', idempotentHint: method !== 'post' },
    approvalRequired: meta.approvalRequired,
    inputSchema,
    run: async (ctx, args) => {
      const record = (args ?? {}) as Record<string, unknown>;
      const pick = (keys: string[]) =>
        Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]));
      const rest = Object.fromEntries(
        Object.entries(record).filter(([key]) => !paramKeys.includes(key) && !queryKeys.includes(key)),
      );
      // Each part validates against the route's own schema, so a tool call obeys the same contract as a request.
      const rawBody = modelBody ? (bodyKey ? rest[bodyKey] : rest) : undefined;
      const input = {
        params: params.parse(pick(paramKeys)),
        query: query.parse(pick(queryKeys)),
        body: body && modelBody ? body.parse(modelBody.restore(rawBody)) : undefined,
      };
      return meta.execute(ctx, input as never);
    },
  });
}

/** Every tool any route registered; scope is enforced at call time so a client can discover what to step up to. */
export function getRouteTools(): readonly RouteTool[] {
  return tools;
}
