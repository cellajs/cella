import { contextStorage } from 'hono/context-storage';

import type { Env } from '#/types/app';
import { errorResponse } from './lib/errors';
import middlewares from './middlewares';
import defaultHook from './utils/default-hook';

import { CustomHono } from '#/types/common';

// Set default hook to catch validation errors
const baseApp = new CustomHono<Env>({
  defaultHook,
});

baseApp.use(contextStorage());

// Add global middleware
baseApp.route('/', middlewares);

// Not found handler
baseApp.notFound((ctx) => {
  // t('common:error.route_not_found.text')
  return errorResponse(ctx, 404, 'route_not_found', 'warn', undefined, { path: ctx.req.path });
});

// Error handler
baseApp.onError((err, ctx) => {
  // t('common:error.server_error.text')
  return errorResponse(ctx, 500, 'server_error', 'error', undefined, {}, err);
});

export default baseApp;
