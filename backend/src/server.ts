import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { appErrorHandler } from '#/lib/error';
import { healthApp } from '#/lib/health';
import '#/lib/lens-telemetry'; // registers doba lens otel hooks
import { app as middlewares } from '#/middlewares/app';

const baseApp = new OpenAPIHono<Env>();

// The load balancer preserves same-origin `/api` and `/mcp` prefixes; redispatch through `mount()` strips them.
baseApp.mount('/api', (request, env, executionCtx) => baseApp.fetch(request, env, executionCtx));
baseApp.mount('/mcp', (request, env, executionCtx) => baseApp.fetch(request, env, executionCtx));

baseApp.get('/favicon.ico', (c) => c.redirect(`${appConfig.frontendUrl}/favicon.ico`, 301));

baseApp.route('/', middlewares);

baseApp.route('/', healthApp);

baseApp.notFound(() => {
  throw new AppError(404, 'route_not_found', 'warn');
});

baseApp.onError(appErrorHandler);

export { baseApp };
