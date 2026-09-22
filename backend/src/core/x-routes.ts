import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import type { ServiceGate, XMiddlewareHandler } from '#/core/openapi-extensions';
import {
  collectExtensionMiddleware,
  createSpecificationExtensions,
  type ExtensionPropId,
  getExtensionPropIds,
  type XMiddlewareOptions,
  type XToolMetadata,
} from '#/core/openapi-extensions';
import { type RegisteredTool, registerRouteTool } from '#/core/tool-registry';
import { actorGuard } from '#/middlewares/guard/actor-guard';
import { publicGuard } from '#/middlewares/guard/public-guard';
import { serviceGuard } from '#/middlewares/guard/service-guard';
import { tokenGuard } from '#/middlewares/guard/token-guard';

/** Runs before guards so a disabled service 404s without exposing auth behavior. Read per request. */
const createServiceGate =
  (service: ServiceGate): MiddlewareHandler =>
  async (_ctx, next) => {
    if (appConfig.services[service]?.enabled === false) throw new AppError(404, 'route_not_found', 'warn');
    await next();
  };

type RouteOptions = Parameters<typeof createRoute>[0] & XMiddlewareOptions & { operationId: string };

type Route<P extends string, R extends Omit<RouteOptions, 'path' | 'x-tool' | 'request'> & { path: P }> = ReturnType<
  typeof createRoute<P, Omit<R, ExtensionPropId>>
>;

/**
 * Wraps `createRoute` with extension middleware (xGuard, xRateLimiter), documented in OpenAPI as `x-*` properties.
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createXRoute = <
  P extends string,
  Req extends RouteOptions['request'],
  R extends Omit<RouteOptions, 'path' | 'x-tool' | 'request'> & { path: P },
>(
  // `x-tool.execute` is typed from this route's own `request`, so an operation receives the request parts it expects.
  config: R & { request?: Req; 'x-tool'?: XToolMetadata<Req> },
): Route<P, R & { request?: Req }> => {
  const extensionMiddleware = collectExtensionMiddleware(config);
  const existing = config.middleware
    ? Array.isArray(config.middleware)
      ? config.middleware
      : [config.middleware]
    : [];

  // Service gate (from declarative `x-service`) runs first so disabled services 404 before guards.
  const service = config['x-service'] as ServiceGate | undefined;
  const serviceGate = service ? [createServiceGate(service)] : [];
  const middleware = [...serviceGate, ...extensionMiddleware, ...existing];

  const xMiddlewares = middleware.filter(
    (mw): mw is XMiddlewareHandler =>
      '__extensionType' in mw && typeof (mw as XMiddlewareHandler).__extensionType === 'string',
  );
  const specificationExtensions = createSpecificationExtensions((key) =>
    xMiddlewares.filter((mw) => mw.__extensionType === key && mw.name).map((mw) => mw.name),
  );

  // Security follows the guard: none for public, any credential for actorGuard, a key or token for serviceGuard, a
  // token for tokenGuard, a cookie otherwise
  const security = extensionMiddleware.includes(publicGuard)
    ? []
    : extensionMiddleware.includes(actorGuard)
      ? [{ cookieAuth: [] }, { apiKey: [] }, { oauth2: [] }]
      : extensionMiddleware.includes(serviceGuard)
        ? [{ apiKey: [] }, { oauth2: [] }]
        : extensionMiddleware.includes(tokenGuard)
          ? [{ oauth2: [] }]
          : [{ cookieAuth: [] }];

  // Strip extension props to prevent them leaking as null in OpenAPI
  const extensionPropIds = getExtensionPropIds();
  const cleanConfig = Object.fromEntries(
    Object.entries(config).filter(([key]) => !extensionPropIds.includes(key)),
  ) as Omit<R, ExtensionPropId>;

  // A route carrying `x-tool` registers itself as an MCP tool; the spec keeps the metadata, never `execute`.
  const tool = config['x-tool'];
  if (tool?.enabled) {
    registerRouteTool(
      { operationId: config.operationId, method: config.method, request: config.request },
      tool as RegisteredTool,
    );
    const { execute: _execute, ...spec } = tool;
    Object.assign(cleanConfig, { 'x-tool': spec });
  }

  return createRoute({
    security,
    ...cleanConfig,
    middleware,
    ...specificationExtensions,
  });
};
