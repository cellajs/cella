import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '#/core/context';
import type { ExtensionType, GuardContext, SecurityRequirement, XMiddlewareHandler } from '#/core/openapi-extensions';

export type { ExtensionType, GuardContext, XMiddlewareHandler };

type MiddlewareFunction<E extends Env = Env> = Parameters<typeof createMiddleware<E>>[0];

export type XMiddlewareOptions = {
  /** The JS function name for the middleware (used as identifier in OpenAPI spec) */
  functionName: string;
  /** A configured OpenAPI extension type (e.g., 'x-guard', 'x-rate-limiter') */
  type: ExtensionType;
  /** Short human-readable label (e.g., 'relatable', 'tenant') */
  name?: string;
  description?: string;
  /** Guards only: which OpenAPI security schemes the route accepts (`[]` for a public route). */
  security?: SecurityRequirement[];
  /** Guards only: the context this guard sets for the guards after it. */
  provides?: GuardContext[];
  /** Guards only: the context this guard reads; `createXRoute` refuses a route where no guard before it provides it. */
  requires?: GuardContext[];
};

/** Global store for extension value metadata, keyed by "extensionType:functionName" */
const extensionValueMetadata = new Map<string, { name?: string; description: string }>();

export const getExtensionValueMetadata = () => extensionValueMetadata;

/** Sets `.name`, `.__extensionType`, `.__description` and the guard metadata for OpenAPI introspection; for composed middlewares such as `every()`. */
export const setMiddlewareExtension = <E extends Env = Env>(middleware: MiddlewareHandler<E>, options: XMiddlewareOptions): XMiddlewareHandler<E> => {
  const { functionName, type, name, description, security, provides, requires } = options;

  if (description) {
    extensionValueMetadata.set(`${type}:${functionName}`, { name, description });
  }
  const extended = Object.assign(middleware, {
    __extensionType: type,
    __description: description,
    __security: security,
    __provides: provides,
    __requires: requires,
  });
  // name requires Object.defineProperty since function.name is read-only in JS.
  Object.defineProperty(extended, 'name', { value: functionName, writable: false });
  return extended;
};

/** Creates a middleware from `fn` and marks it with {@link setMiddlewareExtension}. */
export const xMiddleware = <E extends Env = Env>(options: XMiddlewareOptions, fn: MiddlewareFunction<E>): XMiddlewareHandler<E> =>
  setMiddlewareExtension(createMiddleware<E>(fn), options);
