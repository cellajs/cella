import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { createHealthApp } from 'shared/health-app';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { env } from '#/env';
import { appErrorHandler } from '#/lib/error';
import { getHealthResponse } from '#/lib/health';
import '#/lib/lens-telemetry'; // registers doba lens otel hooks
import { app as middlewares } from '#/middlewares/app';

const baseApp = new OpenAPIHono<Env>();

// The load balancer preserves same-origin `/api` and `/mcp` prefixes; redispatch through `mount()` strips them.
baseApp.mount('/api', (request, env, executionCtx) => baseApp.fetch(request, env, executionCtx));
baseApp.mount('/mcp', (request, env, executionCtx) => baseApp.fetch(request, env, executionCtx));

baseApp.get('/favicon.ico', (c) => c.redirect(`${appConfig.frontendUrl}/favicon.ico`, 301));

baseApp.route('/', middlewares);

// Shallow health checks return 204, full checks 200 or 503; both carry the release SHA the LB contract requires.
baseApp.route(
  '/',
  createHealthApp({
    version: env.RELEASE_SHA,
    full: async () => {
      const { response, httpStatus } = await getHealthResponse();
      return { httpStatus, body: { ...response, version: env.RELEASE_SHA } };
    },
  }),
);

baseApp.notFound(() => {
  throw new AppError(404, 'route_not_found', 'warn');
});

baseApp.onError(appErrorHandler);

export { baseApp };
