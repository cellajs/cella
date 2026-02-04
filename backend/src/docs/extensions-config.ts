import type { MiddlewareHandler } from 'hono';
import type { MiddlewareArray } from '#/docs/types';
import { toMiddlewareArray } from '#/docs/utils';
import type { Env } from '#/lib/context';

export type { MiddlewareArray };

/** Extension metadata for OpenAPI extensions */
export type ExtensionMetadata = {
  /** Identifier for route property names, e.g., 'xGuard' */
  id: string;
  /** Translation key for i18n support */
  translationKey: string;
  /** Description of the extension's purpose */
  description: string;
  /** Whether this extension is required on every route */
  required: boolean;
};

/**
 * Registry of all custom OpenAPI extensions, keyed by extension type.
 * Add new extensions here to have them automatically exposed in the OpenAPI spec.
 *
 * This configuration can be customized per app.
 */
export const extensionRegistryMap = {
  'x-guard': {
    id: 'xGuard',
    translationKey: 'common:docs.guard',
    description: 'Authorization middleware applied to the endpoint',
    required: true,
  },
  'x-rate-limiter': {
    id: 'xRateLimiter',
    translationKey: 'common:docs.rate_limiter',
    description: 'Rate limiting rules applied to the endpoint',
    required: false,
  },
  'x-cache': {
    id: 'xCache',
    translationKey: 'common:docs.cache',
    description: 'Caching strategy applied to the endpoint',
    required: false,
  },
} as const satisfies Record<string, ExtensionMetadata>;

/** Derive ExtensionType from the registry keys */
export type ExtensionType = keyof typeof extensionRegistryMap;

/**
 * Route options for extension middleware.
 * When adding a new extension to extensionRegistryMap, add its prop here too.
 */
export type XMiddlewareOptions = {
  /** Guard middleware (required) - authentication/authorization */
  xGuard: MiddlewareArray;
  /** Rate limiter middleware (optional) */
  xRateLimiter?: MiddlewareArray;
  /** Cache middleware (optional) */
  xCache?: MiddlewareArray;
};

/** Extension property IDs derived from XMiddlewareOptions */
export type ExtensionPropId = keyof XMiddlewareOptions;

/**
 * Collects extension middleware from a config object in registry order.
 */
export const collectExtensionMiddleware = (config: Record<string, unknown>): MiddlewareHandler<Env>[] =>
  Object.values(extensionRegistryMap).flatMap(({ id }) => toMiddlewareArray(config[id] as MiddlewareArray));

/** Get all extension prop IDs from registry (e.g., ['xGuard', 'xRateLimiter']) */
export const getExtensionPropIds = (): string[] => Object.values(extensionRegistryMap).map(({ id }) => id);
