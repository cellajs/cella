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
} from '#/core/openapi-extensions';
import { publicGuard } from '#/middlewares/guard/public-guard';

/**
 * Build a service-gate middleware for a route declaring `x-service`.
 * Runs before guards so a disabled feature 404s without exposing auth behavior.
 * The service entry is read per-request, so test config overrides are respected.
 */
const createServiceGate =
  (service: ServiceGate): MiddlewareHandler =>
  async (_ctx, next) => {
    if (appConfig.services[service]?.enabled === false) throw new AppError(404, 'route_not_found', 'warn');
    await next();
  };

type RouteOptions = Parameters<typeof createRoute>[0] & XMiddlewareOptions & { operationId: string };

type Route<P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }> = ReturnType<
  typeof createRoute<P, Omit<R, ExtensionPropId>>
>;

/**
 * Custom wrapper around hono/zod-openapi createRoute to extend it with extension middleware.
 * Extension middleware (xGuard, xRateLimiter) are documented in OpenAPI via x-* properties.
 *
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createXRoute = <P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }>(
  config: R,
): Route<P, R> => {
  // Collect extension middleware dynamically from registry and combine with existing
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

  // Get specification extensions (x-*) from middleware
  const xMiddlewares = middleware.filter(
    (mw): mw is XMiddlewareHandler =>
      '__extensionType' in mw && typeof (mw as XMiddlewareHandler).__extensionType === 'string',
  );
  const specificationExtensions = createSpecificationExtensions((key) =>
    xMiddlewares.filter((mw) => mw.__extensionType === key && mw.name).map((mw) => mw.name),
  );

  // Public routes have no security, authenticated routes require cookie auth
  const security = extensionMiddleware.includes(publicGuard) ? [] : [{ cookieAuth: [] }];

  // Strip extension props to prevent them leaking as null in OpenAPI
  const extensionPropIds = getExtensionPropIds();
  const cleanConfig = Object.fromEntries(
    Object.entries(config).filter(([key]) => !extensionPropIds.includes(key)),
  ) as Omit<R, ExtensionPropId>;

  return createRoute({
    security,
    ...cleanConfig,
    middleware,
    ...specificationExtensions,
  });
};
