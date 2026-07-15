import { httpInstrumentationMiddleware } from '@hono/otel';
import { OpenAPIHono } from '@hono/zod-openapi';
import { compress } from 'hono/compress';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { clientVersionMiddleware } from '#/middlewares/client-version';
import { loggerMiddleware } from '#/middlewares/logger';
import { runWithLogContext } from '#/utils/logger';

const app = new OpenAPIHono<Env>();

// Ambient log context: stores the live ctx in AsyncLocalStorage so the log
// facade binds request ids without call sites passing ctx. First in the chain
// so every downstream log (including error handling) carries context.
app.use('*', (ctx, next) => runWithLogContext(ctx, () => next()));

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

// No CORS middleware: every consumer is same-origin (the API lives under the
// app origin at /api; dev and tunnel proxy through the Vite origin). Requests
// from other origins simply get no CORS grant — the browser blocks them.

// CSRF protection: rejects state-changing requests whose Origin header is not
// the app origin (defense in depth now that same-origin is structural).
app.use('*', csrf({ origin: appConfig.frontendUrl }));

// Client schema-version telemetry (fleet floor for lens contract gating)
app.use('*', clientVersionMiddleware);

// Body limit
app.use('*', dynamicBodyLimit);

// Compress with gzip Apply gzip compression only to GET requests
app.use('*', (c, next) => {
  if (c.req.method === 'GET') {
    return compress()(c, next);
  }
  return next();
});

export { app };
