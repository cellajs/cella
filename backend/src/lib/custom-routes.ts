import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/lib/context';
import { enhanceOpenAPIDescription, getMiddlewareDescriptor } from '#/lib/openapi-describer';

type NonEmptyArray<T> = readonly [T, ...T[]];

type RouteOptions = Parameters<typeof createRoute>[0] & {
  operationId: string;
  guard: MiddlewareHandler<Env> | NonEmptyArray<MiddlewareHandler<Env>>;
  middleware?: MiddlewareHandler<Env> | NonEmptyArray<MiddlewareHandler<Env>>;
};

type Route<P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }> = ReturnType<
  typeof createRoute<P, Omit<R, 'guard'>>
>;

/**
 * Custom wrapper around hono/zod-openapi createRoute to extend it with setting guard and other middleware.
 * The goal is to make setting a guard middleware explicit and required.
 *
 * @param routeConfig
 * @link https://github.com/honojs/middleware/tree/main/packages/zod-openapi#configure-middleware-for-each-endpoint
 */
export const createCustomRoute = <P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }>({
  guard,
  ...routeConfig
}: R): Route<P, R> => {
  const initGuard = Array.isArray(guard) ? guard : [guard];
  const initMiddleware = routeConfig.middleware
    ? Array.isArray(routeConfig.middleware)
      ? routeConfig.middleware
      : [routeConfig.middleware]
    : [];
  const middleware = [...initGuard, ...initMiddleware];

  // Extend the OpenAPI description with authentication details
  const enhancedDescription = enhanceOpenAPIDescription(
    routeConfig.description,
    middleware, // optionally check all middleware too
  );

  // Determine OpenAPI security automatically based on middleware guards
  const security = initGuard.some((guard) => getMiddlewareDescriptor(guard)?.level === 'authenticated')
    ? [{ cookieAuth: [] }] // protected route
    : []; // public route

  return createRoute({
    security,
    ...routeConfig, // allow routeConfig to override security
    middleware,
    description: enhancedDescription,
  });
};
