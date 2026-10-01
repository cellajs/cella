import { createRoute, type z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import {
  collectExtensionMiddleware,
  createMetadataExtensions,
  createSpecificationExtensions,
  type ExtensionPropId,
  getExtensionPropIds,
  type XMiddlewareHandler,
  type XMiddlewareOptions,
} from '#/core/openapi-extensions';
import { errorResponseRefs } from '#/schemas/error-response-schemas';

/**
 * A route that answers 302 is a browser navigation: whatever refuses the request, a gate, a limiter or the handler,
 * answers with a redirect to the error page (`appErrorHandler`). Set before anything can refuse; a handler may point
 * it elsewhere.
 */
const errorPageMiddleware: MiddlewareHandler<Env> = async (ctx, next) => {
  ctx.set('errorPagePath', '/auth/error');
  await next();
};

type RouteOptions = Parameters<typeof createRoute>[0] & XMiddlewareOptions & { operationId: string };

/** The route `createXRoute` returns: its own responses plus the error `$ref`s every route answers with. */
type Route<P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }> = ReturnType<
  typeof createRoute<P, Omit<R, ExtensionPropId> & { responses: typeof errorResponseRefs }>
>;

/**
 * Wraps `createRoute` with extension middleware (xGuard, xRateLimiter), documented in OpenAPI as `x-*` properties.
 * The error responses (`errorResponseRefs`) are appended to every route's own.
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createXRoute = <P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }>(config: R): Route<P, R> => {
  const extensionMiddleware = collectExtensionMiddleware(config);
  const existing = config.middleware ? (Array.isArray(config.middleware) ? config.middleware : [config.middleware]) : [];

  // The error page first, so every refusal finds it, a gate leading `xGuard` included.
  const errorPage = '302' in config.responses ? [errorPageMiddleware] : [];
  const middleware = [...errorPage, ...extensionMiddleware, ...existing];

  const xMiddlewares = middleware.filter(
    (mw): mw is XMiddlewareHandler => '__extensionType' in mw && typeof (mw as XMiddlewareHandler).__extensionType === 'string',
  );
  const specificationExtensions = createSpecificationExtensions((key) =>
    xMiddlewares.filter((mw) => mw.__extensionType === key && mw.name).map((mw) => mw.name),
  );

  // Security follows the guard: the first guard that declares schemes decides; a route with none is cookie-only.
  const security = xMiddlewares.find((mw) => mw.__security !== undefined)?.__security ?? [{ cookieAuth: [] }];

  // Extension props leave the route config: middleware runs, metadata returns under its `x-*` key.
  const extensionPropIds = getExtensionPropIds();
  const cleanConfig = {
    ...Object.fromEntries(Object.entries(config).filter(([key]) => !extensionPropIds.includes(key))),
    ...createMetadataExtensions(config),
  } as Omit<R, ExtensionPropId>;

  return createRoute({ security, ...cleanConfig, responses: { ...config.responses, ...errorResponseRefs }, middleware, ...specificationExtensions });
};

/** A JSON response: `ctx.json(data, status)` is typed from `schema`. */
export type JsonResponse<S extends z.ZodType> = {
  description: string;
  content: { 'application/json': { schema: S; example?: unknown } };
};

export const json = <S extends z.ZodType>(description: string, schema: S, example?: unknown): JsonResponse<S> => ({
  description,
  content: { 'application/json': example === undefined ? { schema } : { schema, example } },
});

/** A required JSON request body: `ctx.req.valid('json')` is typed from `schema`. */
export type JsonBody<S extends z.ZodType> = { required: true; content: { 'application/json': { schema: S } } };

export const jsonBody = <S extends z.ZodType>(schema: S): JsonBody<S> => ({
  required: true,
  content: { 'application/json': { schema } },
});

/** Route options before `createXRoutes` fills in `operationId` (the key) and `tags` (the module's). */
type DraftOptions = Omit<RouteOptions, 'path' | 'operationId' | 'tags'> & { operationId?: string; tags?: string[] };

type Draft = DraftOptions & { path: string };

/** The route `createXRoutes` makes of a draft: what `createXRoute` returns for it. */
type XRoute<D extends Draft> = ReturnType<typeof createRoute<D['path'], Omit<D, ExtensionPropId> & { responses: typeof errorResponseRefs }>>;

/** One route of a `createXRoutes` module: keeps its literal types. */
export const xRoute = <P extends string, R extends DraftOptions & { path: P }>(config: R) => config;

/**
 * Finishes a module's routes with `createXRoute`: `operationId` defaults to the route's key and `tags` to the module's,
 * set before `summary` so the document keeps its key order.
 */
export const createXRoutes = <T extends Record<string, Draft>>(tags: string[], drafts: T): { [K in keyof T]: XRoute<T[K]> } =>
  Object.fromEntries(
    Object.entries(drafts).map(([key, draft]) => {
      const entries: [string, unknown][] = Object.entries(draft);
      if (!draft.tags) {
        const summary = entries.findIndex(([name]) => name === 'summary');
        entries.splice(summary === -1 ? entries.length : summary, 0, ['tags', tags]);
      }
      if (!draft.operationId) entries.unshift(['operationId', key]);
      return [key, createXRoute(Object.fromEntries(entries) as Parameters<typeof createXRoute>[0])];
    }),
  ) as { [K in keyof T]: XRoute<T[K]> };
