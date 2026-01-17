import { createRoute } from '@hono/zod-openapi';
import {
  collectExtensionMiddleware,
  type ExtensionPropId,
  getExtensionPropIds,
  type XMiddlewareOptions,
} from '#/docs/extensions-config';
import { getSpecificationExtensions } from '#/docs/openapi-describer';
import { toMiddlewareArray } from '#/docs/utils';
import { isPublicAccess } from '#/middlewares/guard/is-public-access';

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
  const middleware = [...extensionMiddleware, ...toMiddlewareArray(config.middleware)];

  // Get specification extensions (x-*) from middleware
  const specificationExtensions = getSpecificationExtensions(middleware);

  // Public routes have no security, authenticated routes require cookie auth
  const security = extensionMiddleware.includes(isPublicAccess) ? [] : [{ cookieAuth: [] }];

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
