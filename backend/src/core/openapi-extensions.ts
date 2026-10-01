import type { MiddlewareHandler } from 'hono';
import type { AccessScopedEntityType } from 'shared';
import type { Env } from '#/core/context';

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

/** A route opts in as an MCP tool by carrying this; the input schema derives from the route's `request`. */
export type XTool = {
  /** What the tool does, written for a model */
  description: string;
  /** Whether the client asks its user before running the tool */
  approvalRequired: boolean;
  /** The entity the route acts on: with the method it names the scope a token needs (`<entity>:read` | `:write`). */
  entity: AccessScopedEntityType;
};

/** When adding an extension to `extensionMap`, add its prop here too. */
export type XMiddlewareOptions = {
  xGuard: MiddlewareArray;
  xRateLimiter?: MiddlewareArray;
  xCache?: MiddlewareArray;
  /** Exposes the route as an MCP tool. */
  xTool?: XTool;
};

export type ExtensionPropId = keyof XMiddlewareOptions;

export const collectExtensionMiddleware = (config: Record<string, unknown>): MiddlewareHandler<Env>[] =>
  Object.values(extensionMap)
    .filter(({ kind }) => kind === 'middleware')
    .flatMap(({ id }) => (config[id] as MiddlewareHandler<Env>[]) ?? []);

/** The route prop ids of every extension (e.g. `['xGuard', 'xRateLimiter', 'xCache', 'xTool']`), kept out of the spec. */
export const getExtensionPropIds = (): string[] => Object.values(extensionMap).map(({ id }) => id);

/** The metadata extensions a route declares, under their spec keys (`xTool` as `x-tool`). */
export const createMetadataExtensions = (config: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(extensionMap)
      .filter(([, { id, kind }]) => kind === 'metadata' && config[id] !== undefined)
      .map(([key, { id }]) => [key, config[id]]),
  );

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
