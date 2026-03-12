import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/lib/context';
import { AppError, appErrorHandler } from '#/lib/error';
import { getHealthResponse } from '#/lib/health';
import middlewares from '#/middlewares/app';

const baseApp = new OpenAPIHono<Env>();

// Redirect favicon
baseApp.get('/favicon.ico', (c) => c.redirect(`${appConfig.frontendUrl}/favicon.ico`, 301));

// Add global middleware
baseApp.route('/', middlewares);

/**
 * Health check endpoint with two depth levels:
 *
 * - `/health?depth=shallow` — Lightweight connectivity probe (no DB, no JSON).
 *   Returns 204. Used by frontend `checkConnectivity()` to detect "WiFi connected
 *   but no internet" scenarios. CDN-cacheable for 5s to absorb probe storms when
 *   many clients reconnect simultaneously.
 *
 * - `/health` or `/health?depth=full` — Full diagnostics (DB check, memory, uptime).
 *   Returns JSON with 200 (healthy) or 503 (unhealthy). Used by monitoring tools,
 *   Kubernetes readiness probes, and stream-store circuit breaker recovery.
 *   CDN-cacheable for 10s with 5s stale-while-revalidate.
 */
baseApp.get('/health', async (c) => {
  const depth = c.req.query('depth') ?? 'full';

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
