import { createRoute } from '@hono/zod-openapi';
import { MiddlewareHandler } from 'hono';
import { NonEmptyArray } from '../types/common';

export type RouteOptions = Parameters<typeof createRoute>[0] & {
  guard: NonEmptyArray<MiddlewareHandler | 'public'>
  middlewares?: MiddlewareHandler[];
};

export type RouteConfig = {
  route: ReturnType<typeof createRoute>;
  guard: RouteOptions['guard'];
  middlewares?: RouteOptions['middlewares'];
}

export type Route<P extends string, R extends Omit<RouteOptions, 'path'> & {
  path: P;
}> = ReturnType<typeof createRoute<P, Omit<R, 'guard' | 'middlewares'>>>;

export const createRouteConfig = <P extends string, R extends Omit<RouteOptions, "path"> & {
  path: P;
}>({ middlewares, guard, ...routeConfig }: R): {
  route: Route<P, R>;
  guard: RouteConfig['guard'];
  middlewares: RouteConfig['middlewares'];
} => ({
  route: createRoute(routeConfig),
  guard,
  middlewares,
});
