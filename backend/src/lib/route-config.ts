import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { NonEmptyArray } from '../types/common';

export type RouteOptions = Parameters<typeof createRoute>[0] & {
  guard: MiddlewareHandler | NonEmptyArray<MiddlewareHandler>;
};

export type RouteConfig = {
  route: ReturnType<typeof createRoute>;
  guard: RouteOptions['guard'];
};

export type Route<
  P extends string,
  R extends Omit<RouteOptions, 'path'> & {
    path: P;
  },
> = ReturnType<typeof createRoute<P, Omit<R, 'guard'>>>;

export const createRouteConfig = <
  P extends string,
  R extends Omit<RouteOptions, 'path'> & {
    path: P;
  },
>({
  guard,
  ...routeConfig
}: R): Route<P, R> => {
  const initGuard = Array.isArray(guard) ? guard : [guard];
  const initMiddleware = routeConfig.middleware ? (Array.isArray(routeConfig.middleware) ? routeConfig.middleware : [routeConfig.middleware]) : [];
  const middleware = [...initGuard, ...initMiddleware];

  return createRoute({
    ...routeConfig,
    middleware,
  });
};
