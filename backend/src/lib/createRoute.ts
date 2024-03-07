import { createRoute } from '@hono/zod-openapi';
import { MiddlewareHandler } from 'hono';

export type RouteConfig = Parameters<typeof createRoute>[0] & {
  guard: 'auth' | 'tenant' | 'system' | 'public';
  middlewares?: MiddlewareHandler[];
};

export const createRouteConfig = ({ middlewares, guard, ...routeConfig }: RouteConfig) => ({
  route: createRoute(routeConfig),
  guard,
  middlewares,
});
