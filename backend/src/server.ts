import { contextStorage } from 'hono/context-storage';

import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/lib/context';
import { errorResponse } from './lib/errors';
import middlewares from './middlewares';
import defaultHook from './utils/default-hook';

// Set default hook to catch validation errors
const baseApp = new OpenAPIHono<Env>({
  defaultHook,
});

baseApp.use(contextStorage());

// Add global middleware
baseApp.route('/', middlewares);

// Not found handler
baseApp.notFound((ctx) => {
  return errorResponse(ctx, 404, 'route_not_found', 'warn', undefined, { path: ctx.req.path });
});

// Error handler
baseApp.onError((err, ctx) => {
  return errorResponse(ctx, 500, 'server_error', 'error', undefined, {}, err);
});

export default baseApp;
