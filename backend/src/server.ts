import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { contextStorage } from 'hono/context-storage';
import type { Env } from '#/lib/context';
import { AppError, handleAppError } from '#/lib/errors';
import middlewares from '#/middlewares/app';

const baseApp = new OpenAPIHono<Env>();

// Redirect favicon
baseApp.get('/favicon.ico', (c) => c.redirect(`${appConfig.frontendUrl}/favicon.ico`, 301));

// Add context storage
baseApp.use(contextStorage());

// Add global middleware
baseApp.route('/', middlewares);

// Health check for render.com
baseApp.get('/ping', (c) => c.text('pong'));

// Not found handler
baseApp.notFound(() => {
  throw new AppError({ status: 404, type: 'route_not_found', severity: 'warn' });
});

// Error handler
baseApp.onError(handleAppError);

export default baseApp;
