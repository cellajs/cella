import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ExtensionType, XMiddlewareHandler } from '#/docs/types';
import type { Env } from '#/lib/context';

export type { ExtensionType, XMiddlewareHandler };

type MiddlewareFunction<E extends Env = Env> = Parameters<typeof createMiddleware<E>>[0];

/** Global store for extension value descriptions, keyed by "extensionType:name" */
const extensionValueDescriptions = new Map<string, string>();

/** Get all collected extension value descriptions */
export const getExtensionValueDescriptions = () => extensionValueDescriptions;

/**
 * Creates a named middleware for Hono with proper function naming and OpenAPI extension type.
 * This ensures the middleware's `.name`, `.__extensionType`, and `.__description` properties are set for OpenAPI introspection.
 *
 * @param name - The name to assign to the middleware function.
 * @param extensionType - A configured OpenAPI extension type.
 * @param fn - The middleware handler function.
 * @param description - Optional description for OpenAPI documentation.
 * @returns A named MiddlewareHandler with extension type and description.
 */
export const xMiddleware = <E extends Env = Env>(
  name: string,
  extensionType: ExtensionType,
  fn: MiddlewareFunction<E>,
  description?: string,
): XMiddlewareHandler<E> => {
  // Store description in global map for later collection
  if (description) {
    extensionValueDescriptions.set(`${extensionType}:${name}`, description);
  }
  // Object.assign creates intersection type that TypeScript understands
  const middleware = Object.assign(createMiddleware<E>(fn), {
    __extensionType: extensionType,
    __description: description,
  });
  // name requires Object.defineProperty since function.name is read-only in JS
  Object.defineProperty(middleware, 'name', { value: name, writable: false });
  return middleware;
};

/**
 * Sets the extension type on an existing middleware (for composed middlewares like `every()`).
 *
 * @param middleware - The middleware to extend.
 * @param name - The name to assign.
 * @param extensionType - The OpenAPI extension type.
 * @param description - Optional description for OpenAPI documentation.
 * @returns The middleware with extension properties set.
 */
export const setMiddlewareExtension = <E extends Env = Env>(
  middleware: MiddlewareHandler<E>,
  name: string,
  extensionType: ExtensionType,
  description?: string,
): XMiddlewareHandler<E> => {
  // Store description in global map for later collection
  if (description) {
    extensionValueDescriptions.set(`${extensionType}:${name}`, description);
  }
  // Object.assign creates intersection type that TypeScript understands
  const extended = Object.assign(middleware, {
    __extensionType: extensionType,
    __description: description,
  });
  // name requires Object.defineProperty since function.name is read-only in JS
  Object.defineProperty(extended, 'name', { value: name, writable: false });
  return extended;
};
