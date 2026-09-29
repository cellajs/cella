import type { RouteConfig, z } from '@hono/zod-openapi';
import type { Context, MiddlewareHandler } from 'hono';
import type { AccessScopedEntityType, appConfig } from 'shared';
import type { BaseAuthStrategies, BaseOAuthProviders } from 'shared/config-builder';
import type { Env, OrgContext } from '#/core/context';

/** Services that can gate a route, derived from appConfig.services. */
export type ServiceGate = keyof typeof appConfig.services;

/**
 * The sign-in method an auth route belongs to: a strategy, or `{ oauth: provider }` for one OAuth provider. A route whose
 * strategy depends on the request (a token's type) names it per request. `null` keeps a route reachable while its
 * strategy is switched off, for cleanup such as deleting a factor.
 */
export type StrategyGate =
  | BaseAuthStrategies
  | { oauth: BaseOAuthProviders }
  | null
  | ((ctx: Context<Env>) => BaseAuthStrategies | null);

export type MiddlewareArray<E extends Env = Env> = readonly MiddlewareHandler<E>[];

export type ExtensionMetadata = {
  /** Identifier for route property names, e.g., 'xGuard' */
  id: string;
  description: string;
  /** Required on every route. */
  required: boolean;
  /** Whether this extension is middleware (collected into handler chain) or metadata (passed through to OpenAPI spec) */
  kind: 'middleware' | 'metadata';
};

/** Add new extensions here to expose them in the OpenAPI spec. */
export const extensionMap = {
  'x-guard': {
    id: 'xGuard',
    description: 'Authorization middleware applied to the endpoint',
    required: true,
    kind: 'middleware',
  },
  'x-rate-limiter': {
    id: 'xRateLimiter',
    description: 'Rate limiting rules applied to the endpoint',
    required: false,
    kind: 'middleware',
  },
  'x-cache': {
    id: 'xCache',
    description: 'Caching strategy applied to the endpoint',
    required: false,
    kind: 'middleware',
  },
  'x-tool': {
    id: 'xTool',
    description: 'MCP tool registration metadata',
    required: false,
    kind: 'metadata',
  },
  'x-service': {
    id: 'x-service',
    description: 'Service gating the endpoint; route returns 404 when the service is disabled',
    required: false,
    kind: 'metadata',
  },
  'x-strategy': {
    id: 'x-strategy',
    description: 'Sign-in method the endpoint belongs to; refused while that method is switched off',
    required: false,
    kind: 'metadata',
  },
} as const satisfies Record<string, ExtensionMetadata>;

export type ExtensionType = keyof typeof extensionMap;

/** One OpenAPI security requirement alternative, e.g. `{ cookieAuth: [] }`. */
export type SecurityRequirement = Record<string, string[]>;

export type XMiddlewareHandler<E extends Env = Env> = MiddlewareHandler<E> & {
  __extensionType: ExtensionType;
  __description?: string;
  /** For guards: the security schemes the route accepts, emitted per operation; `[]` means public. */
  __security?: SecurityRequirement[];
};

export type SpecificationExtensions = Record<ExtensionType, string[]>;

/** Value metadata for individual extension values (e.g., each limiter or guard) */
export type ExtensionValueMetadata = {
  name?: string;
  description: string;
};

export type ExtensionEntry = {
  key: string;
  id: string;
  description: string;
  values?: Record<string, ExtensionValueMetadata>;
};

/** The route fields a tool is derived from. */
export type ToolRoute = { operationId: string; method: string; request?: RouteConfig['request'] };

type InferSchema<S> = S extends z.ZodType ? z.infer<S> : Record<string, never>;
type JsonBodySchema<Req> = Req extends { body: { content: { 'application/json': { schema: infer S } } } } ? S : never;

/**
 * What a tool's `execute` receives: the route's request parts, each validated by the route's own schema, with
 * `tenantId` / `organizationId` resolved by the MCP endpoint and the sync transaction rebuilt server-side.
 */
export type ToolInput<Req> = {
  params: Omit<InferSchema<Req extends { params: infer P } ? P : never>, 'tenantId' | 'organizationId'>;
  query: InferSchema<Req extends { query: infer Q } ? Q : never>;
  body: [JsonBodySchema<Req>] extends [never] ? undefined : InferSchema<JsonBodySchema<Req>>;
};

/** What the OpenAPI spec shows under `x-tool`; `execute` never leaves the process. */
export type XToolSpec = {
  /** Whether this route is exposed as an MCP tool */
  enabled: boolean;
  /** LLM-friendly description of what this tool does */
  description: string;
  /** Whether user approval is required before execution (write MCP tools) */
  approvalRequired: boolean;
  category: string;
  /** The entity the route acts on: with the method it names the scope a token needs (`<entity>:read` | `:write`). */
  entity: AccessScopedEntityType;
};

/** A route opts in as an MCP tool by carrying this; the input schema derives from the route's `request`. */
export type XToolMetadata<Req = RouteConfig['request']> = XToolSpec & {
  /** The route's operation, called in-process with the MCP request's context and the validated request parts. */
  execute: (ctx: OrgContext, input: ToolInput<Req>) => Promise<unknown>;
};

/** When adding an extension to `extensionMap`, add its prop here too. */
export type XMiddlewareOptions<Req = RouteConfig['request']> = {
  xGuard: MiddlewareArray;
  xRateLimiter?: MiddlewareArray;
  xCache?: MiddlewareArray;
  'x-tool'?: XToolMetadata<Req>;
  /** Route 404s when the service is disabled. */
  'x-service'?: ServiceGate;
  /** Route is refused while its sign-in method is switched off in `appConfig`. */
  'x-strategy'?: StrategyGate;
};

export type ExtensionPropId = keyof XMiddlewareOptions;

export const collectExtensionMiddleware = (config: Record<string, unknown>): MiddlewareHandler<Env>[] =>
  Object.values(extensionMap)
    .filter(({ kind }) => kind === 'middleware')
    .flatMap(({ id }) => (config[id] as MiddlewareHandler<Env>[]) ?? []);

/** Get middleware extension prop IDs from the map (e.g., ['xGuard', 'xRateLimiter']). Metadata extensions use raw keys and are not stripped. */
export const getExtensionPropIds = (): string[] =>
  Object.values(extensionMap)
    .filter(({ kind }) => kind === 'middleware')
    .map(({ id }) => id);

export function createSpecificationExtensions(getValue: (key: ExtensionType) => string[]): SpecificationExtensions {
  const keys = (Object.keys(extensionMap) as ExtensionType[]).filter((key) => extensionMap[key].kind === 'middleware');
  return Object.fromEntries(keys.map((key) => [key, getValue(key)])) as SpecificationExtensions;
}

/** @param valueMetadata - keyed by `"extensionType:functionName"`. */
export function buildExtensionEntries(
  valueMetadata: Map<string, { name?: string; description: string }>,
): ExtensionEntry[] {
  return Object.entries(extensionMap).map(([key, metadata]) => {
    const values: Record<string, ExtensionValueMetadata> = {};
    for (const [mapKey, meta] of valueMetadata) {
      const [extType, functionName] = mapKey.split(':');
      if (extType === key && functionName) {
        values[functionName] = { ...(meta.name ? { name: meta.name } : {}), description: meta.description };
      }
    }

    return {
      key,
      ...metadata,
      ...(Object.keys(values).length > 0 ? { values } : {}),
    };
  });
}
