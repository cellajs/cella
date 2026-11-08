import type { MiddlewareHandler } from 'hono';
import type { AccessScope, AccessScopedEntityType, ConfigSwitch, EntityActionType } from 'shared';
import type { Env } from '#/core/context';
import type { RateLimitPolicy } from '#/middlewares/rate-limiter/types';
import type { ErrorCode } from '#/schemas/error-response-schemas';

type MiddlewareArray<E extends Env = Env> = readonly MiddlewareHandler<E>[];

type ExtensionMetadata = {
  /** Identifier for route property names, e.g., 'xGuard' */
  id: string;
  description: string;
  /** Required on every route. */
  required: boolean;
  /** Whether this extension is middleware (collected into handler chain) or metadata (passed through to OpenAPI spec) */
  kind: 'middleware' | 'metadata';
};

/** Add new extensions here to expose them in the OpenAPI spec. In the order they apply to a request. */
const extensionMap = {
  'x-enabled-by': {
    id: 'xEnabledBy',
    description:
      'Config switch the endpoint belongs to: a service, a feature flag, a sign-in method or an OAuth provider; refused before the guards while it is off',
    required: false,
    kind: 'metadata',
  },
  'x-guard': { id: 'xGuard', description: 'Authorization middleware applied to the endpoint', required: true, kind: 'middleware' },
  'x-rate-limiter': { id: 'xRateLimiter', description: 'Rate limiting rules applied to the endpoint', required: false, kind: 'middleware' },
  'x-tool': { id: 'xTool', description: 'MCP tool registration metadata', required: false, kind: 'metadata' },
} as const satisfies Record<string, ExtensionMetadata>;

export type ExtensionType = keyof typeof extensionMap;

/** One OpenAPI security requirement alternative, e.g. `{ cookieAuth: [] }`. */
export type SecurityRequirement = Record<string, string[]>;

/** Request context one guard sets for the guards after it: who acts, a signed-in user's session (`userGuard` only), the tenant. */
export type GuardContext = 'actor' | 'session' | 'tenant';

/** A middleware marked by `setMiddlewareExtension`: its extension type, the statuses it refuses with and, for a guard, what it accepts, sets and reads. */
export type XMiddlewareHandler<E extends Env = Env> = MiddlewareHandler<E> & {
  __extensionType: ExtensionType;
  __description?: string;
  __errors?: readonly ErrorCode[];
  __security?: SecurityRequirement[];
  __provides?: GuardContext[];
  __requires?: GuardContext[];
  __limiters?: XMiddlewareHandler[];
};

/** The extension types whose values are middleware: `x-guard` and `x-rate-limiter`. */
type MiddlewareExtensionType = { [K in ExtensionType]: (typeof extensionMap)[K]['kind'] extends 'middleware' ? K : never }[ExtensionType];

type SpecificationExtensions = Record<MiddlewareExtensionType, string[]>;

/** What one extension value (a limiter, a guard) documents: its label, its text and, for a limiter, its budget. */
export type ExtensionValueMetadata = { name?: string; description: string; policy?: RateLimitPolicy };

type ExtensionEntry = { key: string; id: string; description: string; values?: Record<string, ExtensionValueMetadata> };

/** A route opts in as an MCP tool by carrying this; the input schema derives from the route's `request`. */
export type XTool = {
  /** What the tool does, written for a model */
  description: string;
  /** A hint in `_meta`; the standard annotations follow from the method. */
  approvalRequired: boolean;
  /** The entity the route acts on: with the method it names the scope a token needs (`<entity>:read` | `:write`). */
  entity: AccessScopedEntityType;
};

/** The action an MCP tool performs: a GET route reads, any other writes. With the tool's entity it names the scope. */
export const toolAction = (method: string): EntityActionType => (method.toUpperCase() === 'GET' ? 'read' : 'update');

/**
 * When adding an extension to `extensionMap`, add its prop here and to the props `createXRoute` takes out of the route
 * config. `xScope` is the one prop without an `x-*` key.
 */
export type XRouteProps = {
  /**
   * The scope a scoped API key or access token needs on a route whose guards accept one; it fills that route's
   * security requirements. An MCP tool route leaves it out: its scope follows from `xTool`, as the MCP server enforces it.
   */
  xScope?: AccessScope;
  /** The config switch the route belongs to; `createXRoute` refuses the route while it is off, before its guards. */
  xEnabledBy?: ConfigSwitch;
  xGuard: MiddlewareArray;
  xRateLimiter?: MiddlewareArray;
  xTool?: XTool;
};

export type ExtensionPropId = keyof XRouteProps;

/** The middleware a route's extension props hold (`xGuard`, `xRateLimiter`), in the order they apply. */
export const collectExtensionMiddleware = (config: XRouteProps): MiddlewareHandler<Env>[] =>
  Object.values(extensionMap)
    .filter((extension) => extension.kind === 'middleware')
    .flatMap(({ id }) => config[id] ?? []);

/** The metadata extensions a route declares, under their spec keys (`xTool` as `x-tool`, `xEnabledBy` as `x-enabled-by`). */
export const createMetadataExtensions = (config: XRouteProps): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(extensionMap)
      .filter(([, { id, kind }]) => kind === 'metadata' && config[id] !== undefined)
      .map(([key, { id }]) => [key, config[id]]),
  );

/** A route's `x-guard` and `x-rate-limiter` lists: `getValue` names the route's middleware of each type. */
export function createSpecificationExtensions(getValue: (key: MiddlewareExtensionType) => string[]): SpecificationExtensions {
  const keys = (Object.keys(extensionMap) as ExtensionType[]).filter(
    (key): key is MiddlewareExtensionType => extensionMap[key].kind === 'middleware',
  );
  return Object.fromEntries(keys.map((key) => [key, getValue(key)])) as SpecificationExtensions;
}

/**
 * The spec's `x-extensions`: each extension with the values its middleware documented.
 * @param valueMetadata - Per extension type, keyed by middleware function name.
 */
export function buildExtensionEntries(valueMetadata: ReadonlyMap<string, ReadonlyMap<string, ExtensionValueMetadata>>): ExtensionEntry[] {
  return Object.entries(extensionMap).map(([key, metadata]) => {
    const values = Object.fromEntries(valueMetadata.get(key) ?? []);
    return { key, ...metadata, ...(Object.keys(values).length > 0 ? { values } : {}) };
  });
}
