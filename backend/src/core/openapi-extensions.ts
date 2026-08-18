import type { MiddlewareHandler } from 'hono';
import type { appConfig } from 'shared';
import type { Env } from '#/core/context';

/** Services that can gate a route, derived from appConfig.services. */
export type ServiceGate = keyof typeof appConfig.services;

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
    description: 'Tool registration metadata for AI and MCP integrations',
    required: false,
    kind: 'metadata',
  },
  'x-service': {
    id: 'x-service',
    description: 'Service gating the endpoint; route returns 404 when the service is disabled',
    required: false,
    kind: 'metadata',
  },
} as const satisfies Record<string, ExtensionMetadata>;

export type ExtensionType = keyof typeof extensionMap;

export type XMiddlewareHandler<E extends Env = Env> = MiddlewareHandler<E> & {
  __extensionType: ExtensionType;
  __description?: string;
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

export type XToolMetadata = {
  /** Whether this route is exposed as a tool */
  enabled: boolean;
  /** LLM-friendly description of what this tool does */
  description: string;
  /** Whether user approval is required before execution (write tools) */
  approvalRequired: boolean;
  category: string;
};

/** When adding an extension to `extensionMap`, add its prop here too. */
export type XMiddlewareOptions = {
  xGuard: MiddlewareArray;
  xRateLimiter?: MiddlewareArray;
  xCache?: MiddlewareArray;
  'x-tool'?: XToolMetadata;
  /** Route 404s when the service is disabled. */
  'x-service'?: ServiceGate;
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
