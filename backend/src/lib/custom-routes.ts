import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/lib/context';

type NonEmptyArray<T> = readonly [T, ...T[]];

type RouteOptions = Parameters<typeof createRoute>[0] & {
  operationId: string;
  guard: MiddlewareHandler<Env> | NonEmptyArray<MiddlewareHandler<Env>>;
  middleware?: MiddlewareHandler<Env> | NonEmptyArray<MiddlewareHandler<Env>>;
};

type Route<P extends string, R extends Omit<RouteOptions, 'path'> & { path: P }> = ReturnType<typeof createRoute<P, Omit<R, 'guard'>>>;

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
  const initMiddleware = routeConfig.middleware ? (Array.isArray(routeConfig.middleware) ? routeConfig.middleware : [routeConfig.middleware]) : [];
  const middleware = [...initGuard, ...initMiddleware];

  // Extend the OpenAPI description with authentication details
  const enhancedDescription = extendOpenAPIDescription(
    routeConfig.description,
    middleware, // optionally check all middleware too
  );

  return createRoute({
    ...routeConfig,
    middleware,
    description: enhancedDescription,
  });
};

/**
 * Function to extend the OpenAPI description with authentication details based on middleware metadata.
 * It checks for specific middleware handlers that indicate authentication requirements and appends
 * the relevant information to the original OpenAPI description.
 *
 * @param {string | undefined} original - The original OpenAPI description string.
 * @param {MiddlewareHandler} middlewares - An array of middleware handlers to check for OpenAPI metadata.
 * @returns {string} - The extended OpenAPI description string with authentication details.
 */
function extendOpenAPIDescription(original: string | undefined, middlewares: MiddlewareHandler[]): string {
  // Prepare flags to track authentication requirements
  let isAuth = false;
  let isPublic = false;
  let hasOrgAccess = false;
  let hasSystemAccess = false;
  let isSystemAdmin = false;

  // Iterate through the middlewares to check for OpenAPI metadata
  for (const mw of middlewares) {
    // biome-ignore lint/suspicious/noExplicitAny: Check for OpenAPI metadata
    const meta = (mw as any).__openapi;

    switch (meta?.name) {
      case 'isAuthenticated':
        isAuth = true;
        break;
      case 'isPublicAccess':
        isPublic = true;
        break;
      case 'hasOrgAccess':
        hasOrgAccess = true;
        break;
      case 'hasSystemAccess':
        hasSystemAccess = true;
        break;
      case 'isSystemAdmin':
        isSystemAdmin = true;
        break;
    }
  }

  // Construct the authentication line based on the flags
  let authLine = '';

  if (isPublic) {
    authLine = '🌐 Public access.';
  } else if (isSystemAdmin) {
    authLine = '🛡️ Requires authentication (system admin privileges).';
  } else if (isAuth) {
    // If authenticated, check for specific access types
    const scopes = [];
    if (hasSystemAccess) {
      scopes.push('system');
    }
    if (hasOrgAccess) {
      scopes.push('organization');
    }

    if (scopes.length > 0) {
      authLine = `🛡️ Requires authentication (${scopes.join(', ')} access).`;
    } else {
      authLine = '🛡️ Requires authentication.';
    }
  }

  return authLine ? `${authLine}\n\n${original?.trim() ?? ''}`.trim() : (original?.trim() ?? '');
}
