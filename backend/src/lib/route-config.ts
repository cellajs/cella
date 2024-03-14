import { createRoute as baseCreateRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { CustomHono, NonEmptyArray } from '../types/common';

export type RouteOptions = Parameters<typeof baseCreateRoute>[0] & {
  guard: NonEmptyArray<MiddlewareHandler | 'public'>;
  middlewares?: MiddlewareHandler[];
};

const isNotPublicRoute = (guard: RouteOptions['guard']): guard is NonEmptyArray<MiddlewareHandler> => {
  return !guard.includes('public');
};

export const createRoute = <
  P extends string,
  R extends Omit<RouteOptions, 'path'> & {
    path: P;
  },
>(
  app: CustomHono,
  { middlewares, guard, ...routeConfig }: R,
) => {
  const handlers = [];

  if (isNotPublicRoute(guard)) {
    handlers.push(...guard);
  }

  if (middlewares && middlewares.length > 0) {
    handlers.push(...middlewares);
  }

  const route = baseCreateRoute(routeConfig);

  // add guards and middlewares
  app[route.method as 'get' | 'post' | 'put' | 'delete'](route.getRoutingPath(), ...handlers);

  return route;
};
