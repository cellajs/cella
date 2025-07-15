import { OpenAPIHono } from '@hono/zod-openapi';
import { config } from 'config';
import { contextStorage } from 'hono/context-storage';
import type { Env } from '#/lib/context';
import { CustomError, errorResponse } from '#/lib/errors';
import middlewares from '#/middlewares/app';

const baseApp = new OpenAPIHono<Env>();

// Redirect favicon
baseApp.get('/favicon.ico', (c) => c.redirect(`${config.frontendUrl}/favicon.ico`, 301));

// Add context storage
baseApp.use(contextStorage());

// Add global middleware
baseApp.route('/', middlewares);

// Health check for render.com
baseApp.get('/ping', (c) => c.text('pong'));

// Not found handler
baseApp.notFound((ctx) => {
  return errorResponse(ctx, 404, 'route_not_found', 'warn', undefined, { path: ctx.req.path });
});

// Error handler
baseApp.onError((err, ctx) => {
  // TODO improve not recreate it in errorResponse and just send it out
  if (err instanceof CustomError) return errorResponse(ctx, err.status, err.type, err.severity, err.entityType);
  return errorResponse(ctx, 500, 'server_error', 'error', undefined, {}, err);
});

export default baseApp;
