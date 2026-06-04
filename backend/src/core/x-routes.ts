import { createRoute } from '@hono/zod-openapi';
import type { XMiddlewareHandler } from '#/core/extensions';
import {
  collectExtensionMiddleware,
  createSpecificationExtensions,
  type ExtensionPropId,
  getExtensionPropIds,
  type XMiddlewareOptions,
} from '#/core/extensions';
import { publicGuard } from '#/middlewares/guard/public-guard';

type RouteOptions = Parameters<typeof createRoute>[0] & XMiddlewareOptions & { operationId: string };

type Route<P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }> = ReturnType<
  typeof createRoute<P, Omit<R, ExtensionPropId>>
>;

/**
 * Custom wrapper around hono/zod-openapi createRoute to extend it with extension middleware.
 * Extension middleware (xGuard, xRateLimiter) are documented in OpenAPI via x-* properties.
 *
 * @param config - Route configuration with extension middleware
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
  const middleware = [...extensionMiddleware, ...existing];

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
