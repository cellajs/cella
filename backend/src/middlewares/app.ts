import type { Env } from '#/lib/context';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { loggerMiddleware } from '#/middlewares/logger';
import { monitoringMiddleware } from '#/middlewares/monitoring';
import { observabilityMiddleware } from '#/middlewares/observability';
import { OpenAPIHono } from '@hono/zod-openapi';
import { config } from 'config';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';

const app = new OpenAPIHono<Env>();

// Secure headers
app.use('*', secureHeaders());

// Get metrics and trace
app.use('*', observabilityMiddleware);

// Error and perf monitoring
app.use('*', monitoringMiddleware);

// Logger
app.use('*', loggerMiddleware);

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
app.use('*', dynamicBodyLimit);

// Compress with gzip Apply gzip compression only to GET requests
app.use('*', (c, next) => {
  if (c.req.method === 'GET') {
    return compress()(c, next);
  }
  return next();
});

export default app;
