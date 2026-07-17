import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
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
baseApp.get('/health', async (c) => {
  const depth = c.req.query('depth') ?? 'shallow';
  const version = env.RELEASE_SHA;
  c.header('X-App-Version', version);

  if (depth === 'shallow') {
    c.header('Cache-Control', 'public, max-age=5');
    return c.body(null, 204);
  }

  const { response, httpStatus } = await getHealthResponse();
  if (httpStatus >= 200 && httpStatus < 300) {
    c.header('Cache-Control', 'public, max-age=10, stale-while-revalidate=5');
  }
  return c.json({ ...response, version }, httpStatus as 200);
});

// Not found handler
baseApp.notFound(() => {
  throw new AppError(404, 'route_not_found', 'warn');
});

// Error handler
baseApp.onError(appErrorHandler);

export { baseApp };
