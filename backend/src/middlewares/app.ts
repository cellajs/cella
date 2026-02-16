import { httpInstrumentationMiddleware } from '@hono/otel';
import { OpenAPIHono } from '@hono/zod-openapi';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { appConfig } from 'shared';
import type { Env } from '#/lib/context';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { loggerMiddleware } from '#/middlewares/logger';
import { monitoringMiddleware } from '#/middlewares/monitoring';
import { observabilityMiddleware } from '#/middlewares/observability';

const app = new OpenAPIHono<Env>();

// Secure headers
app.use('*', secureHeaders({ referrerPolicy: 'strict-origin-when-cross-origin' }));

// OpenTelemetry HTTP instrumentation (route-aware spans)
app.use(
  '*',
  httpInstrumentationMiddleware({
    serviceName: appConfig.name,
    serviceVersion: '1.0',
  }),
);

// Get metrics and trace (prom-client)
app.use('*', observabilityMiddleware);

// Error and perf monitoring (Sentry)
app.use('*', monitoringMiddleware);

// Logger (pino)
app.use('*', loggerMiddleware);

const corsOptions: Parameters<typeof cors>[0] = {
  origin: appConfig.frontendUrl,
  credentials: true,
  allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
  allowHeaders: [],
};

// CORS
app.use('*', cors(corsOptions));

// CSRF protection
app.use('*', csrf({ origin: appConfig.frontendUrl }));

// Body limit
app.use('*', dynamicBodyLimit);

// Compress with gzip Apply gzip compression only to GET requests
app.use('*', (c, next) => {
  if (c.req.method === 'GET') {
    return compress()(c, next);
  }
  return next();
});

// Health check for render.com
app.get('/ping', (c) => c.text('pong'));

export default app;
