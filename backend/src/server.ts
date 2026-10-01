import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { appErrorHandler } from '#/lib/error';
import { healthApp } from '#/lib/health';
import '#/lib/lens-telemetry'; // registers doba lens otel hooks
import { app as middlewares } from '#/middlewares/app';

/**
 * A base app: global middlewares, health, the mount-prefix strip, not-found and error handling, with no module routes.
 * Hono takes no routes after its first request, so a worker folded into the API process builds its own.
 */
export function createBaseApp() {
  const app = new OpenAPIHono<Env>();

  // The load balancer preserves same-origin `/api` and `/mcp` prefixes; redispatch through `mount()` strips them.
  app.mount('/api', (request, env, executionCtx) => app.fetch(request, env, executionCtx));
  app.mount('/mcp', (request, env, executionCtx) => app.fetch(request, env, executionCtx));

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
