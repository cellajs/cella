import { createRoute } from '@hono/zod-openapi';
import { MiddlewareHandler } from 'hono';

export type RouteOptions = Parameters<typeof createRoute>[0] & {
  guard: 'auth' | 'tenant' | 'tenant-system' | 'system' | 'public';
  middlewares?: MiddlewareHandler[];
};

export type RouteConfig = {
  route: ReturnType<typeof createRoute>;
  guard: RouteOptions['guard'];
  middlewares?: MiddlewareHandler[];
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
