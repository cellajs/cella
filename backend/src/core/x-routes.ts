import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import type { FeatureFlag, XMiddlewareHandler } from '#/core/extensions';
import {
  collectExtensionMiddleware,
  createSpecificationExtensions,
  type ExtensionPropId,
  getExtensionPropIds,
  type XMiddlewareOptions,
} from '#/core/extensions';
import { publicGuard } from '#/middlewares/guard/public-guard';

/**
 * Build a feature-gate middleware for a route declaring `x-feature`.
 * Runs before guards so a disabled feature 404s without exposing auth behavior.
 * The flag is read per-request, so test config overrides are respected.
 */
const createFeatureGate =
  (feature: FeatureFlag): MiddlewareHandler =>
  async (_ctx, next) => {
    if (!appConfig.features[feature]) throw new AppError(404, 'route_not_found', 'warn');
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

  // Feature gate (from declarative `x-feature`) runs first so disabled features 404 before guards.
  const feature = config['x-feature'] as FeatureFlag | undefined;
  const featureGate = feature ? [createFeatureGate(feature)] : [];
  const middleware = [...featureGate, ...extensionMiddleware, ...existing];

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
