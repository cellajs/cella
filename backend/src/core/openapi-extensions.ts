import type { MiddlewareHandler } from 'hono';
import type { AccessScope, AccessScopedEntityType, ConfigSwitch, EntityActionType } from 'shared';
import type { Env } from '#/core/context';

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
    description: 'Config switch the endpoint belongs to: a service, a sign-in method or an OAuth provider; refused before the guards while it is off',
    required: false,
    kind: 'metadata',
  },
  'x-guard': { id: 'xGuard', description: 'Authorization middleware applied to the endpoint', required: true, kind: 'middleware' },
  'x-rate-limiter': { id: 'xRateLimiter', description: 'Rate limiting rules applied to the endpoint', required: false, kind: 'middleware' },
  'x-cache': { id: 'xCache', description: 'Caching strategy applied to the endpoint', required: false, kind: 'middleware' },
  'x-tool': { id: 'xTool', description: 'MCP tool registration metadata', required: false, kind: 'metadata' },
} as const satisfies Record<string, ExtensionMetadata>;

export type ExtensionType = keyof typeof extensionMap;

/** One OpenAPI security requirement alternative, e.g. `{ cookieAuth: [] }`. */
export type SecurityRequirement = Record<string, string[]>;

/** Request context one guard sets for the guards after it: who acts, a signed-in user's session (`userGuard` only), the tenant. */
export type GuardContext = 'actor' | 'session' | 'tenant';

/** A middleware marked by `setMiddlewareExtension`: its extension type and, for a guard, what it accepts, sets and reads. */
export type XMiddlewareHandler<E extends Env = Env> = MiddlewareHandler<E> & {
  __extensionType: ExtensionType;
  __description?: string;
  /** For guards: the security schemes the route accepts, emitted per operation; `[]` means public. */
  __security?: SecurityRequirement[];
  /** For guards: the context this guard sets. */
  __provides?: GuardContext[];
  /** For guards: the context this guard reads, which a guard before it on the route must provide. */
  __requires?: GuardContext[];
};

type SpecificationExtensions = Record<ExtensionType, string[]>;

/** Value metadata for individual extension values (e.g., each limiter or guard) */
export type ExtensionValueMetadata = { name?: string; description: string };

type ExtensionEntry = { key: string; id: string; description: string; values?: Record<string, ExtensionValueMetadata> };

/** A route opts in as an MCP tool by carrying this; the input schema derives from the route's `request`. */
export type XTool = {
  /** What the tool does, written for a model */
  description: string;
  /** Whether the client asks its user before running the tool */
  approvalRequired: boolean;
  /** The entity the route acts on: with the method it names the scope a token needs (`<entity>:read` | `:write`). */
  entity: AccessScopedEntityType;
};

/** The action an MCP tool performs: a GET route reads, any other writes. With the tool's entity it names the scope. */
export const toolAction = (method: string): EntityActionType => (method.toUpperCase() === 'GET' ? 'read' : 'update');

/** When adding an extension to `extensionMap`, add its prop here too. `xScope` is the one prop without an `x-*` key. */
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
  xCache?: MiddlewareArray;
  /** Exposes the route as an MCP tool. */
  xTool?: XTool;
};

export type ExtensionPropId = keyof XRouteProps;

/** The middleware a route's extension props hold (`xGuard`, `xRateLimiter`, `xCache`), in the order they apply. */
export const collectExtensionMiddleware = (config: Record<string, unknown>): MiddlewareHandler<Env>[] =>
  Object.values(extensionMap)
    .filter(({ kind }) => kind === 'middleware')
    .flatMap(({ id }) => (config[id] as MiddlewareHandler<Env>[]) ?? []);

/** Every prop of `XRouteProps`: the extension ids (`xGuard`, `xRateLimiter`, `xCache`, `xTool`, `xEnabledBy`) and `xScope`, kept out of the spec. */
export const extensionPropIds: readonly string[] = [...Object.values(extensionMap).map(({ id }) => id), 'xScope'];

/** The metadata extensions a route declares, under their spec keys (`xTool` as `x-tool`, `xEnabledBy` as `x-enabled-by`). */
export const createMetadataExtensions = (config: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(extensionMap)
      .filter(([, { id, kind }]) => kind === 'metadata' && config[id] !== undefined)
      .map(([key, { id }]) => [key, config[id]]),
  );

/** A route's `x-guard`, `x-rate-limiter` and `x-cache` lists: `getValue` names the route's middleware of each type. */
export function createSpecificationExtensions(getValue: (key: ExtensionType) => string[]): SpecificationExtensions {
  const keys = (Object.keys(extensionMap) as ExtensionType[]).filter((key) => extensionMap[key].kind === 'middleware');
  return Object.fromEntries(keys.map((key) => [key, getValue(key)])) as SpecificationExtensions;
}

/**
 * The spec's `x-extensions`: each extension with the values its middleware documented.
 * @param valueMetadata - Per extension type, keyed by middleware function name.
 */
export function buildExtensionEntries(valueMetadata: ReadonlyMap<string, ReadonlyMap<string, ExtensionValueMetadata>>): ExtensionEntry[] {
  return Object.entries(extensionMap).map(([key, metadata]) => {
    const values: Record<string, ExtensionValueMetadata> = {};
    for (const [functionName, meta] of valueMetadata.get(key) ?? []) {
      values[functionName] = { ...(meta.name ? { name: meta.name } : {}), description: meta.description };
    }

    return { key, ...metadata, ...(Object.keys(values).length > 0 ? { values } : {}) };
  });
}
