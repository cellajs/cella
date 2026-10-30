import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '#/core/context';
import type { ExtensionType, ExtensionValueMetadata, GuardContext, SecurityRequirement, XMiddlewareHandler } from '#/core/openapi-extensions';
import type { ErrorCode } from '#/schemas/error-response-schemas';

type MiddlewareFunction<E extends Env = Env> = Parameters<typeof createMiddleware<E>>[0];

type XMiddlewareOptions = {
  /** The JS function name for the middleware (used as identifier in OpenAPI spec) */
  functionName: string;
  /** A configured OpenAPI extension type (e.g., 'x-guard', 'x-rate-limiter') */
  type: ExtensionType;
  /** The label the docs show (e.g. 'Shared organization'); `description` is the text behind it, in plain sentences. */
  name?: string;
  description?: string;
  /** The error statuses this middleware refuses a request with; every route that lists it documents them. */
  errors?: readonly ErrorCode[];
  /** Guards only: which OpenAPI security schemes the route accepts (`[]` for a public route). */
  security?: SecurityRequirement[];
  /** Guards only: the context this guard sets for the guards after it. */
  provides?: GuardContext[];
  /** Guards only: the context this guard reads; `createXRoute` refuses a route where no guard before it provides it. */
  requires?: GuardContext[];
};

/** Global store for extension value metadata: per extension type, by middleware function name. */
const extensionValueMetadata = new Map<ExtensionType, Map<string, ExtensionValueMetadata>>();

/** What every marked middleware documented, for the spec's `x-extensions`. */
export const getExtensionValueMetadata = () => extensionValueMetadata;

/** Sets `.name`, `.__extensionType`, `.__description`, `.__errors` and the guard metadata for OpenAPI introspection; for composed middlewares such as `every()`. */
export const setMiddlewareExtension = <E extends Env = Env>(middleware: MiddlewareHandler<E>, options: XMiddlewareOptions): XMiddlewareHandler<E> => {
  const { functionName, type, name, description, errors, security, provides, requires } = options;

  if (description) {
    const values = extensionValueMetadata.get(type) ?? new Map<string, ExtensionValueMetadata>();
    values.set(functionName, { name, description });
    extensionValueMetadata.set(type, values);
  }
  const extended = Object.assign(middleware, {
    __extensionType: type,
    __description: description,
    __errors: errors,
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
