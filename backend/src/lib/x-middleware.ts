import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '#/lib/context';

export type ExtensionType = 'x-guard' | 'x-rate-limiter';

type MiddlewareFunction<E extends Env = Env> = Parameters<typeof createMiddleware<E>>[0];

/** Extends MiddlewareHandler with extensionType for OpenAPI introspection */
export type XMiddlewareHandler<E extends Env = Env> = MiddlewareHandler<E> & {
  __extensionType: ExtensionType;
};

/**
 * Creates a named middleware for Hono with proper function naming and OpenAPI extension type.
 * This ensures the middleware's `.name` and `.__extensionType` properties are set for OpenAPI introspection.
 *
 * @param name - The name to assign to the middleware function.
 * @param extensionType - The OpenAPI extension type ('x-guard' or 'x-rate-limiter').
 * @param fn - The middleware handler function.
 * @returns A named MiddlewareHandler with extension type.
 */
export const xMiddleware = <E extends Env = Env>(
  name: string,
  extensionType: ExtensionType,
  fn: MiddlewareFunction<E>,
): XMiddlewareHandler<E> => {
  const middleware = createMiddleware<E>(fn) as XMiddlewareHandler<E>;
  Object.defineProperty(middleware, 'name', { value: name, writable: false });
  Object.defineProperty(middleware, '__extensionType', { value: extensionType, writable: false });
  return middleware;
};

/**
 * Sets the extension type on an existing middleware (for composed middlewares like `every()`).
 *
 * @param middleware - The middleware to extend.
 * @param name - The name to assign.
 * @param extensionType - The OpenAPI extension type.
 * @returns The middleware with extension properties set.
 */
export const setMiddlewareExtension = <E extends Env = Env>(
  middleware: MiddlewareHandler<E>,
  name: string,
  extensionType: ExtensionType,
): XMiddlewareHandler<E> => {
  Object.defineProperty(middleware, 'name', { value: name, writable: false });
  Object.defineProperty(middleware, '__extensionType', { value: extensionType, writable: false });
  return middleware as XMiddlewareHandler<E>;
};
