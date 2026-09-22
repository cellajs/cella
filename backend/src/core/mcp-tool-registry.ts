import { z } from '@hono/zod-openapi';
import { type EntityActionType, type EntityScope, type ScopedEntityType, scopes } from 'shared';
import type { OrgContext } from '#/core/context';
import type { ToolInput, ToolRoute, XToolMetadata } from '#/core/openapi-extensions';
import { createServerStx, createServerStxStamping } from '#/core/stx/create-server-stx';

/** A route exposed to MCP clients: named and documented by the route, run through its operation in-process. */
export interface McpTool {
  name: string;
  description: string;
  /** What the route acts on and how; the scope a token must carry follows from it (`<entity>:read` | `:write`). */
  entity: ScopedEntityType;
  action: EntityActionType;
  scope: EntityScope;
  /** MCP tool annotations, derived from the HTTP method. */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
  approvalRequired: boolean;
  /** What the model sees: the route's request parts merged, sync transaction left out. */
  inputSchema: z.ZodType;
  /** Validates against the route's own schemas, rebuilds the sync transaction, and calls the route's `execute`. */
  run: (ctx: OrgContext, args: unknown) => Promise<unknown>;
}

const tools: McpTool[] = [];

/** Route parameters the MCP endpoint already resolved; never model input. */
const routeParams = ['tenantId', 'organizationId'];

const anyObject = (schema: unknown): schema is z.ZodObject<z.ZodRawShape> => schema instanceof z.ZodObject;

/**
 * The sync transaction (`stx`) is trusted server metadata, never model input: `modelSchema` leaves it out of what the
 * model sees, `withServerStx` puts a server-built one back before the route's own schema validates the body.
 */
function splitStx(schema: z.ZodType): { modelSchema: z.ZodType; withServerStx: (value: unknown) => unknown } {
  if (anyObject(schema) && 'stx' in schema.shape) {
    // Rebuilt from the shape (`.omit()` refuses refined objects); the route's own schema still validates the call.
    const { stx: _stx, ...shape } = schema.shape;
    return {
      modelSchema: z.object(shape),
      withServerStx: (value) => {
        const record = value as Record<string, unknown>;
        const ops = record.ops;
        const stx =
          ops && typeof ops === 'object' ? createServerStxStamping(ops as Record<string, unknown>) : createServerStx();
        return { ...record, stx };
      },
    };
  }
  if (schema instanceof z.ZodArray) {
    const inner = splitStx(schema.element as z.ZodType);
    if (inner.modelSchema !== schema.element) {
      return {
        modelSchema: z.array(inner.modelSchema),
        withServerStx: (value) => (value as unknown[]).map(inner.withServerStx),
      };
    }
  }
  return { modelSchema: schema, withServerStx: (value) => value };
}

/** Called by `createXRoute` for every route carrying an enabled `x-tool`; the mcp module reads the result. */
export function registerMcpTool<Req extends ToolRoute['request']>(
  route: ToolRoute & { request?: Req },
  meta: XToolMetadata<Req>,
): void {
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
  const modelBody = body ? splitStx(body) : undefined;
  const bodyIsObject = anyObject(modelBody?.modelSchema);
  // A non-object body (a batch of items) nests under one key so it cannot collide with params or query.
  const bodyKey =
    modelBody && !bodyIsObject ? (modelBody.modelSchema instanceof z.ZodArray ? 'items' : 'body') : undefined;

  const inputSchema = z.object({
    ...params.shape,
    ...query.shape,
    ...(bodyIsObject && anyObject(modelBody?.modelSchema) ? modelBody.modelSchema.shape : {}),
    ...(bodyKey && modelBody ? { [bodyKey]: modelBody.modelSchema } : {}),
  });
  const paramKeys = Object.keys(params.shape);
  const queryKeys = Object.keys(query.shape);
  const method = route.method.toLowerCase();
  const isRead = method === 'get';
  const action: EntityActionType = isRead ? 'read' : 'update';

  tools.push({
    name: route.operationId,
    description: meta.description,
    entity: meta.entity,
    action,
    scope: scopes.required(meta.entity, action),
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
        body: body && modelBody ? body.parse(modelBody.withServerStx(rawBody)) : undefined,
      };
      // The parts were validated by the route's own schemas, which is what `ToolInput<Req>` describes.
      return meta.execute(ctx, input as unknown as ToolInput<Req>);
    },
  });
}

/** Every tool any route registered; scope is enforced at call time so a client can discover what to step up to. */
export function getMcpTools(): readonly McpTool[] {
  return tools;
}
