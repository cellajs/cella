import type { MiddlewareHandler } from 'hono';
import type { ExtensionMetadata, ExtensionType } from '#/docs/extensions-config';
import type { Env } from '#/lib/context';

// Re-export types from extensions-config
export type { ExtensionMetadata, ExtensionType };

/** Middleware that can be a single handler or array of handlers */
export type MiddlewareArray<E extends Env = Env> = MiddlewareHandler<E> | readonly MiddlewareHandler<E>[];

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

/** Extension registry entry with optional values */
export type ExtensionRegistryEntry = {
  key: string;
  id: string;
  description: string;
  values?: Record<string, ExtensionValueMetadata>;
};
