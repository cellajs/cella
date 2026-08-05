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

// The load balancer preserves same-origin `/api` and `/mcp` prefixes. Redispatching
// through `mount()` strips the prefix and applies global middleware once.
baseApp.mount('/api', (request, env, executionCtx) => baseApp.fetch(request, env, executionCtx));
baseApp.mount('/mcp', (request, env, executionCtx) => baseApp.fetch(request, env, executionCtx));

// Redirect favicon
baseApp.get('/favicon.ico', (c) => c.redirect(`${appConfig.frontendUrl}/favicon.ico`, 301));

// Add global middleware
baseApp.route('/', middlewares);

// Shallow health checks return 204; full checks return diagnostics with 200 or 503.
// Both include the release SHA so deployment verification preserves the LB contract.
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

// Not found handler
baseApp.notFound(() => {
  throw new AppError(404, 'route_not_found', 'warn');
});

// Error handler
baseApp.onError(appErrorHandler);

export { baseApp };
