import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ExtensionType, XMiddlewareHandler } from '#/docs/types';
import type { Env } from '#/lib/context';

export type { ExtensionType, XMiddlewareHandler };

type MiddlewareFunction<E extends Env = Env> = Parameters<typeof createMiddleware<E>>[0];

/** Options for xMiddleware and setMiddlewareExtension */
export type XMiddlewareOptions = {
  /** The JS function name for the middleware (used as identifier in OpenAPI spec) */
  functionName: string;
  /** A configured OpenAPI extension type (e.g., 'x-guard', 'x-rate-limiter') */
  type: ExtensionType;
  /** Short human-readable label (e.g., 'relatable', 'tenant') */
  name?: string;
  /** Description for OpenAPI documentation */
  description?: string;
};

/** Global store for extension value metadata, keyed by "extensionType:functionName" */
const extensionValueMetadata = new Map<string, { name?: string; description: string }>();

/** Get all collected extension value metadata */
export const getExtensionValueMetadata = () => extensionValueMetadata;

/**
 * Creates a named middleware for Hono with proper function naming and OpenAPI extension type.
 * This ensures the middleware's `.name`, `.__extensionType`, and `.__description` properties are set for OpenAPI introspection.
 *
 * @param options - Configuration for the middleware identity and documentation.
 * @param fn - The middleware handler function.
 * @returns A named MiddlewareHandler with extension type and description.
 */
export const xMiddleware = <E extends Env = Env>(
  options: XMiddlewareOptions,
  fn: MiddlewareFunction<E>,
): XMiddlewareHandler<E> => {
  const { functionName, type, name, description } = options;

  // Store metadata in global map for later collection
  if (description) {
    extensionValueMetadata.set(`${type}:${functionName}`, { name, description });
  }
  // Object.assign creates intersection type that TypeScript understands
  const middleware = Object.assign(createMiddleware<E>(fn), {
    __extensionType: type,
    __description: description,
  });
  // name requires Object.defineProperty since function.name is read-only in JS
  Object.defineProperty(middleware, 'name', { value: functionName, writable: false });
  return middleware;
};

/**
 * Sets the extension type on an existing middleware (for composed middlewares like `every()`).
 *
 * @param middleware - The middleware to extend.
 * @param options - Configuration for the middleware identity and documentation.
 * @returns The middleware with extension properties set.
 */
export const setMiddlewareExtension = <E extends Env = Env>(
  middleware: MiddlewareHandler<E>,
  options: XMiddlewareOptions,
): XMiddlewareHandler<E> => {
  const { functionName, type, name, description } = options;

  // Store metadata in global map for later collection
  if (description) {
    extensionValueMetadata.set(`${type}:${functionName}`, { name, description });
  }
  // Object.assign creates intersection type that TypeScript understands
  const extended = Object.assign(middleware, {
    __extensionType: type,
    __description: description,
  });
  // name requires Object.defineProperty since function.name is read-only in JS
  Object.defineProperty(extended, 'name', { value: functionName, writable: false });
  return extended;
};
