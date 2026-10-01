import { type OpenAPIHono, type RouteConfig, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { type AccessScope, type AccessScopedEntityType, accessScopes, type EntityActionType } from 'shared';
import type { Env } from '#/core/context';
import type { XToolSpec } from '#/core/openapi-extensions';
import { createServerStx, createServerStxStamping } from '#/core/stx/create-server-stx';

/** A tool as `tools/list` returns it. */
export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
  /** Beyond the MCP schema: the scope a token needs, so a client can ask for it up front. */
  _meta: { scope: string; approvalRequired: boolean };
}

/** What a tool call answers: the route's JSON body, or the type and message of the error it answered with. */
export type McpToolOutcome = { ok: true; output: unknown } | { ok: false; type: string; message: string };

/** A route exposed to MCP clients: named and described by the route, run by the route's own handler. */
export interface McpTool {
  name: string;
  /** What the route acts on and how; the scope a token must carry follows from it (`<entity>:read` | `:write`). */
  entity: AccessScopedEntityType;
  action: EntityActionType;
  scope: AccessScope;
  descriptor: McpToolDescriptor;
  /**
   * Validates the arguments against the route's own schemas (a `ZodError` refuses them), rebuilds the sync
   * transaction, and sends the request through the app as the caller, so the route's guards, limiters and cache apply.
   */
  call: (ctx: Context<Env>, args: unknown) => Promise<McpToolOutcome>;
}

/** Route parameters the MCP endpoint already resolved; never model input. */
const routeParams = ['tenantId', 'organizationId'];

/** Request headers a tool call carries over from the MCP request: the caller's token and the client address. */
const forwardedHeaders = ['authorization', 'x-forwarded-for'];

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
        const ops = record?.ops;
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
        withServerStx: (value) => (Array.isArray(value) ? value.map(inner.withServerStx) : value),
      };
    }
  }
  return { modelSchema: schema, withServerStx: (value) => value };
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

/** The route's answer as a tool outcome; a server error reaches the model without its internals, in every mode. */
async function toOutcome(response: Response): Promise<McpToolOutcome> {
  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return { ok: true, output: payload };
  const error = (payload ?? {}) as { type?: string; message?: string };
  if (response.status >= 500)
    return { ok: false, type: error.type ?? 'server_error', message: 'Internal server error' };
  return { ok: false, type: error.type ?? 'error', message: error.message ?? response.statusText };
}

function buildTool(app: OpenAPIHono<Env>, route: RouteConfig, spec: XToolSpec): McpTool {
  const name = route.operationId;
  if (!name) throw new Error(`[MCP] The tool route ${route.method} ${route.path} has no operationId`);

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
  const method = route.method.toUpperCase();
  const isRead = method === 'GET';
  const action: EntityActionType = isRead ? 'read' : 'update';
  const scope = accessScopes.required(spec.entity, action);

  return {
    name,
    entity: spec.entity,
    action,
    scope,
    descriptor: {
      name,
      description: spec.description,
      inputSchema: toInputSchema(inputSchema),
      annotations: { readOnlyHint: isRead, destructiveHint: method === 'DELETE', idempotentHint: method !== 'POST' },
      _meta: { scope, approvalRequired: spec.approvalRequired },
    },
    call: async (ctx, args) => {
      const record = (args ?? {}) as Record<string, unknown>;
      const pick = (keys: string[]) =>
        Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]));
      const rest = Object.fromEntries(
        Object.entries(record).filter(([key]) => !paramKeys.includes(key) && !queryKeys.includes(key)),
      );
      const rawParams = pick(paramKeys);
      const rawQuery = pick(queryKeys);
      const rawBody = modelBody ? modelBody.withServerStx(bodyKey ? rest[bodyKey] : rest) : undefined;

      // Each part validates against the route's own schema before the request is sent, so the model gets every issue.
      params.parse(rawParams);
      query.parse(rawQuery);
      if (body) body.parse(rawBody);

      // The route parses the raw values again, as it parses any client's.
      const values: Record<string, unknown> = {
        ...rawParams,
        tenantId: ctx.var.tenantId,
        organizationId: ctx.var.organizationId,
      };
      const path = route.path.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(String(values[key] ?? '')));
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(rawQuery)) {
        if (value === undefined || value === null) continue;
        for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item));
      }
      const url = new URL(search.size ? `${path}?${search}` : path, ctx.req.url);

      const headers = new Headers({ 'content-type': 'application/json' });
      for (const header of forwardedHeaders) {
        const value = ctx.req.header(header);
        if (value) headers.set(header, value);
      }

      const request = new Request(url, {
        method,
        headers,
        body: rawBody === undefined ? undefined : JSON.stringify(rawBody),
      });
      return toOutcome(await app.fetch(request, ctx.env));
    },
  };
}

/**
 * One tool per route carrying `x-tool`, read from the app's OpenAPI registry, where every mounted route has its full
 * path, operationId and request schemas. Calls go through `app`, so pass the app the routes are mounted on.
 */
export function buildMcpTools(app: OpenAPIHono<Env>): McpTool[] {
  const tools: McpTool[] = [];
  for (const definition of app.openAPIRegistry.definitions) {
    if (definition.type !== 'route') continue;
    const route = definition.route as RouteConfig & { 'x-tool'?: XToolSpec };
    const spec = route['x-tool'];
    if (!spec?.enabled) continue;
    const tool = buildTool(app, route, spec);
    if (tools.some((existing) => existing.name === tool.name))
      throw new Error(`[MCP] Tool ${tool.name} is registered twice`);
    tools.push(tool);
  }
  return tools;
}

let appTools: Promise<readonly McpTool[]> | undefined;

/**
 * The tools of every module route, built once from the app the module routes are mounted on. Imported on first use:
 * `#/routes` imports every module, this one included. The MCP worker mounts them there without serving them.
 */
export function getMcpTools(): Promise<readonly McpTool[]> {
  appTools ??= import('#/routes')
    .then(({ baseApp }) => buildMcpTools(baseApp))
    .catch((error) => {
      appTools = undefined;
      throw error;
    });
  return appTools;
}
