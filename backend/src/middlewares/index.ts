import { sentry } from '@hono/sentry';
import { config } from 'config';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { errorResponse } from '#/lib/errors';
import { observabilityMiddleware } from '#/middlewares/observability/';
import { CustomHono } from '#/types/common';
import { logEvent } from './logger/log-event';
import { logger } from './logger/logger';

const app = new CustomHono();

// Secure headers
app.use('*', secureHeaders());

// Get metrics and trace
app.use('*', observabilityMiddleware);

// Sentry
app.use('*', sentry({ dsn: config.sentryDsn }));

// Health check for render.com
app.get('/ping', (c) => c.text('pong'));

// Logger
app.use('*', logger(logEvent));

const electricHeaders = ['electric-cursor', 'electric-handle', 'electric-schema', 'electric-offset', 'electric-up-to-date'];
const corsOptions: Parameters<typeof cors>[0] = {
  origin: config.frontendUrl,
  credentials: true,
  allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
  allowHeaders: [],
  exposeHeaders: electricHeaders,
};

// CORS
app.use('*', cors(corsOptions));

// CSRF protection
app.use('*', csrf({ origin: config.frontendUrl }));

// Body limit
app.use(
  '*',
  bodyLimit({
    maxSize: 1 * 1024 * 1024, // 1mb
    onError: (ctx) => {
      return errorResponse(ctx, 413, 'body_too_large', 'warn', undefined, { path: ctx.req.path });
    },
  }),
);

// Compress with gzip
// Apply gzip compression only to GET requests
app.use('*', (c, next) => {
  if (c.req.method === 'GET') {
    return compress()(c, next);
  }
  return next();
});

export default app;
