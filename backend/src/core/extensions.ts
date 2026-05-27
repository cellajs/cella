import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';

/** Middleware that can be a single handler or array of handlers */
export type MiddlewareArray<E extends Env = Env> = readonly MiddlewareHandler<E>[];

/** Extension metadata for OpenAPI extensions */
export type ExtensionMetadata = {
  /** Identifier for route property names, e.g., 'xGuard' */
  id: string;
  /** Description of the extension's purpose */
  description: string;
  /** Whether this extension is required on every route */
  required: boolean;
  /** Whether this extension is middleware (collected into handler chain) or metadata (passed through to OpenAPI spec) */
  kind: 'middleware' | 'metadata';
};

/**
 * Static map of all custom OpenAPI extensions, keyed by extension type.
 * Add new extensions here to have them automatically exposed in the OpenAPI spec.
 */
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
} as const satisfies Record<string, ExtensionMetadata>;

/** Derive ExtensionType from the extension map keys */
export type ExtensionType = keyof typeof extensionMap;

/** Extends MiddlewareHandler with extensionType and description for OpenAPI introspection */
export type XMiddlewareHandler<E extends Env = Env> = MiddlewareHandler<E> & {
  __extensionType: ExtensionType;
  __description?: string;
};

/** SpecificationExtensions type for middleware values */
export type SpecificationExtensions = Record<ExtensionType, string[]>;

/** Value metadata for individual extension values (e.g., each limiter or guard) */
export type ExtensionValueMetadata = {
  name?: string;
  description: string;
};

/** Extension entry with optional values */
export type ExtensionEntry = {
  key: string;
  id: string;
  description: string;
  values?: Record<string, ExtensionValueMetadata>;
};

/** Metadata for AI/MCP tool exposure on a route */
export type XToolMetadata = {
  /** Whether this route is exposed as a tool */
  enabled: boolean;
  /** LLM-friendly description of what this tool does */
  description: string;
  /** Whether user approval is required before execution (write tools) */
  approvalRequired: boolean;
  /** Grouping category for tool organization */
  category: string;
};

/**
 * Route options for extension middleware.
 * When adding a new extension to extensionMap, add its prop here too.
 */
export type XMiddlewareOptions = {
  /** Guard middleware (required) - authentication/authorization */
  xGuard: MiddlewareArray;
  /** Rate limiter middleware (optional) */
  xRateLimiter?: MiddlewareArray;
  /** Cache middleware (optional) */
  xCache?: MiddlewareArray;
  /** Tool metadata (optional) - AI/MCP tool registration */
  'x-tool'?: XToolMetadata;
};

/** Extension property IDs derived from XMiddlewareOptions */
export type ExtensionPropId = keyof XMiddlewareOptions;

/**
 * Collects extension middleware from a config object in extension map order.
 */
export const collectExtensionMiddleware = (config: Record<string, unknown>): MiddlewareHandler<Env>[] =>
  Object.values(extensionMap)
    .filter(({ kind }) => kind === 'middleware')
    .flatMap(({ id }) => (config[id] as MiddlewareHandler<Env>[]) ?? []);

/** Get middleware extension prop IDs from the map (e.g., ['xGuard', 'xRateLimiter']). Metadata extensions use raw keys and are not stripped. */
export const getExtensionPropIds = (): string[] =>
  Object.values(extensionMap)
    .filter(({ kind }) => kind === 'middleware')
    .map(({ id }) => id);

/**
 * Creates a SpecificationExtensions object by invoking the provided getter function for each extension type.
 *
 * @param getValue - Function that takes an ExtensionType and returns an array of strings.
 * @returns SpecificationExtensions object with values populated from the getter function.
 */
export function createSpecificationExtensions(getValue: (key: ExtensionType) => string[]): SpecificationExtensions {
  const keys = (Object.keys(extensionMap) as ExtensionType[]).filter((key) => extensionMap[key].kind === 'middleware');
  return Object.fromEntries(keys.map((key) => [key, getValue(key)])) as SpecificationExtensions;
}

/**
 * Builds extension entries with values populated from the collected metadata.
 *
 * @param valueMetadata - Map of "extensionType:functionName" to metadata objects.
 * @returns Array of ExtensionEntry with values populated.
 */
export function buildExtensionEntries(
  valueMetadata: Map<string, { name?: string; description: string }>,
): ExtensionEntry[] {
  return Object.entries(extensionMap).map(([key, metadata]) => {
    // Collect values for this extension type
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
