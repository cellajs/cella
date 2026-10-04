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
import { configSwitchGate } from '#/middlewares/config-switch';
import { errorResponseRefs } from '#/schemas/error-response-schemas';

/**
 * A route that answers 302 is a browser navigation: whatever refuses the request, the switch gate, a guard, a limiter
 * or the handler, answers with a redirect to the error page (`appErrorHandler`). Set before anything can refuse; a
 * handler may point it elsewhere.
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
 * Wraps `createRoute` with extension middleware, documented in OpenAPI as `x-*` properties. A request passes, in this
 * order: the error page (a 302 route), the config switch gate (`xEnabledBy`), `xGuard`, `xRateLimiter`, `xCache`, the
 * route's own `middleware`, then validation and the handler. The switch needs no caller, so a route that is off
 * answers before any guard shows how it authenticates; `middleware` runs after the guards and may read the actor.
 * The error responses (`errorResponseRefs`) are appended to every route's own.
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createXRoute = <P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }>(config: R): Route<P, R> => {
  const extensionMiddleware = collectExtensionMiddleware(config);
  const existing = [config.middleware ?? []].flat();

  // The error page first, so every refusal finds it, the switch gate's included.
  const errorPage = '302' in config.responses ? [errorPageMiddleware] : [];
  const switchGate = config.xEnabledBy ? [configSwitchGate(config.xEnabledBy)] : [];
  const middleware = [...errorPage, ...switchGate, ...extensionMiddleware, ...existing];

  const xMiddlewares = middleware.filter(
    (mw): mw is XMiddlewareHandler => '__extensionType' in mw && typeof (mw as XMiddlewareHandler).__extensionType === 'string',
  );
  const specificationExtensions = createSpecificationExtensions((key) =>
    xMiddlewares.filter((mw) => mw.__extensionType === key && mw.name).map((mw) => mw.name),
  );

  // Security follows the guard: the first guard that declares schemes decides; a route with none is cookie-only.
  const security = xMiddlewares.find((mw) => mw.__security !== undefined)?.__security ?? [{ cookieAuth: [] }];

  // An MCP call carries the caller's access token and nothing else, so a tool route whose guards take none can never run.
  const accepted = config.security ?? security;
  if (config.xTool && accepted.length && !accepted.some((requirement) => 'oauth2' in requirement)) {
    const schemes = accepted.flatMap((requirement) => Object.keys(requirement)).join(', ');
    throw new Error(
      `[MCP] The tool route ${config.operationId} (${config.method} ${config.path}) takes no access token: its guards accept ${schemes} only. ` +
        'Guard it with actorGuard or serviceGuard, or remove xTool.',
    );
  }

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
