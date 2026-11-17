import { OpenAPIHono } from '@hono/zod-openapi';
import { getPath as requestPath } from 'hono/utils/url';
import { appConfig, servicePaths } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { routablePath } from '#/core/openapi-validation';
import { appErrorHandler } from '#/lib/error';
import { healthApp } from '#/lib/health';
import '#/lib/lens-telemetry'; // registers doba lens otel hooks
import { app as middlewares } from '#/middlewares/app';
import { defaultHook } from '#/utils/default-hook';

/** The path prefixes the load balancer keeps on same-origin requests, each stripped once before routing. */
const mountedPrefixes = [servicePaths.backend, servicePaths.mcp];

/**
 * The path a request is routed at: a mounted prefix stripped once, a custom method `<resource>:<verb>` at its routable
 * `/~verb`. It never throws: Hono calls it outside its error handling. A path under a prefix twice keeps the second
 * prefix, which no route serves (404).
 */
const routedPath = (request: Request) => {
  const path = requestPath(request);
  const prefix = mountedPrefixes.find((mounted) => path === mounted || path.startsWith(`${mounted}/`));
  const inner = prefix ? path.slice(prefix.length) || '/' : path;
  return routablePath(inner) ?? inner;
};

/**
 * A base app: global middlewares, health, not-found and error handling, with no module routes. It routes each request
 * at `routedPath`: `ctx.req.path` is the routed path and `ctx.req.url` keeps what the client sent. Routes take its
 * `defaultHook`. A worker folded into the API process builds its own: Hono takes no routes after its first request.
 */
export function createBaseApp() {
  const app = new OpenAPIHono<Env>({ defaultHook, getPath: routedPath });

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
