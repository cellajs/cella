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

// Health check endpoint
baseApp.get('/health', async (c) => {
  const { response, httpStatus } = await getHealthResponse();
  return c.json(response, httpStatus as 200);
});

// Not found handler
baseApp.notFound(() => {
  throw new AppError(404, 'route_not_found', 'warn');
});

// Error handler
baseApp.onError(appErrorHandler);

export default baseApp;
