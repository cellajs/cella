import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { appErrorHandler } from '#/lib/error';
import { getHealthResponse } from '#/lib/health';
import middlewares from '#/middlewares/app';

const baseApp = new OpenAPIHono<Env>();

// Redirect favicon
baseApp.get('/favicon.ico', (c) => c.redirect(`${appConfig.frontendUrl}/favicon.ico`, 301));

// Add global middleware
baseApp.route('/', middlewares);

/**
 * Health check: `/health` returns 204 (shallow probe for LBs/frontend).
 * `/health?depth=full` returns JSON diagnostics with 200 or 503.
 */
baseApp.get('/health', async (c) => {
  const depth = c.req.query('depth') ?? 'shallow';

  if (depth === 'shallow') {
    c.header('Cache-Control', 'public, max-age=5');
    return c.body(null, 204);
  }

  const { response, httpStatus } = await getHealthResponse();
  if (httpStatus >= 200 && httpStatus < 300) {
    c.header('Cache-Control', 'public, max-age=10, stale-while-revalidate=5');
  }
  return c.json(response, httpStatus as 200);
});

// Not found handler
baseApp.notFound(() => {
  throw new AppError(404, 'route_not_found', 'warn');
});

// Error handler
baseApp.onError(appErrorHandler);

export default baseApp;
