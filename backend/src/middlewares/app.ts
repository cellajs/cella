import { httpInstrumentationMiddleware } from '@hono/otel';
import { OpenAPIHono } from '@hono/zod-openapi';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
// DORMANT (lens system): import { clientVersionMiddleware } from '#/middlewares/client-version';
import { loggerMiddleware } from '#/middlewares/logger';

const app = new OpenAPIHono<Env>();

// Secure headers
app.use(
  '*',
  secureHeaders({
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  }),
);

// OpenTelemetry HTTP instrumentation (route-aware spans)
app.use(
  '*',
  httpInstrumentationMiddleware({
    serviceName: appConfig.name,
    serviceVersion: '1.0',
  }),
);

// Logger (pino)
app.use('*', loggerMiddleware);

const corsOptions: Parameters<typeof cors>[0] = {
  origin: appConfig.frontendUrl,
  credentials: true,
  allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
  // DORMANT (lens system): add 'x-client-version' to allowHeaders when reconnecting.
  allowHeaders: ['content-type', 'x-cache-token', 'traceparent', 'tracestate'],
  maxAge: 7200,
};

// CORS
app.use('*', cors(corsOptions));

// CSRF protection
app.use('*', csrf({ origin: appConfig.frontendUrl }));

// DORMANT (lens system): client schema-version telemetry.
// app.use('*', clientVersionMiddleware);

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
