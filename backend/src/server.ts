import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { appErrorHandler } from '#/lib/error';
import { healthApp } from '#/lib/health';
import '#/lib/lens-telemetry'; // registers doba lens otel hooks
import { app as middlewares } from '#/middlewares/app';

/**
 * Serves a path prefix by redispatching each request under it through the app, with the prefix off its path. The
 * request is rebuilt from named fields. `mount()`'s own `new Request(url, request)` reads the request as a
 * `RequestInit`, and the node server's request is a plain object in front of `Request.prototype`: `duplex`, which it
 * does not define itself, reaches the native getter, and on Node 26.11 that getter throws for anything but a real
 * `Request`.
 * @param app - The app that serves the prefix and takes the redispatch.
 * @param prefix - The path prefix to strip, such as `/api`.
 */
function mountPrefix(app: OpenAPIHono<Env>, prefix: string) {
  app.mount(prefix, (request, env, executionCtx) => app.fetch(request, env, executionCtx), {
    replaceRequest: (request) => {
      const url = new URL(request.url);
      url.pathname = app.getPath(request).slice(prefix.length) || '/';
      // A stream body needs `duplex`, which the lib's `RequestInit` leaves out.
      const init: RequestInit & { duplex?: 'half' } = { method: request.method, headers: request.headers, signal: request.signal };
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
        init.duplex = 'half';
      }
      return new Request(url, init);
    },
  });
}

/**
 * A base app: global middlewares, health, the mount-prefix strip, not-found and error handling, with no module routes.
 * Hono takes no routes after its first request, so a worker folded into the API process builds its own.
 */
export function createBaseApp() {
  const app = new OpenAPIHono<Env>();

  // The load balancer preserves same-origin `/api` and `/mcp` prefixes; the redispatch strips them.
  mountPrefix(app, '/api');
  mountPrefix(app, '/mcp');

  app.get('/favicon.ico', (c) => c.redirect(`${appConfig.frontendUrl}/favicon.ico`, 301));

  app.route('/', middlewares);

  app.route('/', healthApp);

  app.notFound(() => {
    throw new AppError(404, 'route_not_found', 'warn');
  });

  app.onError(appErrorHandler);

  return app;
}

/** The API's app; `#/routes` mounts every module's routes on it. */
const baseApp = createBaseApp();

export { baseApp };
