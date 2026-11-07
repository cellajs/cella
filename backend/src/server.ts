import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig, servicePaths } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { routablePath } from '#/core/openapi-validation';
import { appErrorHandler } from '#/lib/error';
import { healthApp } from '#/lib/health';
import '#/lib/lens-telemetry'; // registers doba lens otel hooks
import { app as middlewares } from '#/middlewares/app';

/** The path prefixes the load balancer keeps on same-origin requests, each stripped once before routing. */
const mountedPrefixes = [servicePaths.backend, servicePaths.mcp];

/** The Fetch standard's forbidden methods: `new Request` throws on them, and no route serves them. */
const forbiddenMethods = new Set(['CONNECT', 'TRACE', 'TRACK']);

const startsWithMountedPrefix = (path: string) => mountedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * The request at another path, rebuilt from named fields. `mount()`'s own `new Request(url, request)` reads the request
 * as a `RequestInit`, and the node server's request is a plain object in front of `Request.prototype`: `duplex`, which
 * it does not define itself, reaches the native getter, and on Node 26.11 that getter throws for anything but a real
 * `Request`.
 */
const requestAtPath = (request: Request, path: string) => {
  const url = new URL(request.url);
  url.pathname = path;
  // A stream body needs `duplex`, which the lib's `RequestInit` leaves out.
  const init: RequestInit & { duplex?: 'half' } = { method: request.method, headers: request.headers, signal: request.signal };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }
  return new Request(url, init);
};

/**
 * Serves a path prefix by redispatching each request under it through the app, with the prefix off its path.
 * @throws AppError 404 `route_not_found` for a path still under a mounted prefix after the strip, so a request
 *   redispatches once at most, and for a forbidden method.
 */
function mountPrefix(app: OpenAPIHono<Env>, prefix: string) {
  app.mount(prefix, (request, env, executionCtx) => app.fetch(request, env, executionCtx), {
    replaceRequest: (request) => {
      const path = app.getPath(request).slice(prefix.length) || '/';
      if (startsWithMountedPrefix(path) || forbiddenMethods.has(request.method.toUpperCase())) throw new AppError(404, 'route_not_found', 'warn');
      return requestAtPath(request, path);
    },
  });
}

/**
 * Serves custom methods (`<resource>:<verb>`) by redispatching each request for one through the app at the path its
 * route declares (`routablePath`), before the global middlewares, so they run once, on the redispatch. A request for
 * that routable path itself (`…/~verb`) reaches the route as sent, through the same middlewares and guards.
 */
function routeCustomMethods(app: OpenAPIHono<Env>) {
  app.use('*', async (ctx, next) => {
    const path = routablePath(new URL(ctx.req.url).pathname);
    if (!path || forbiddenMethods.has(ctx.req.method.toUpperCase())) return next();
    return app.fetch(requestAtPath(ctx.req.raw, path), ctx.env);
  });
}

/**
 * A base app: global middlewares, health, the mount-prefix strip, not-found and error handling, with no module routes.
 * Hono takes no routes after its first request, so a worker folded into the API process builds its own.
 */
export function createBaseApp() {
  const app = new OpenAPIHono<Env>();

  for (const prefix of mountedPrefixes) mountPrefix(app, prefix);
  routeCustomMethods(app);

  app.get('/favicon.ico', (ctx) => ctx.redirect(`${appConfig.frontendUrl}/favicon.ico`, 301));

  app.route('/', middlewares);

  app.route('/', healthApp);

  app.notFound(() => {
    throw new AppError(404, 'route_not_found', 'warn');
  });

  app.onError(appErrorHandler);

  return app;
}

/** The API's app. */
export const baseApp = createBaseApp();
