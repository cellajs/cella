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

// Ambient log context in AsyncLocalStorage, first in the chain so every downstream log carries request ids
app.use('*', (ctx, next) => runWithLogContext(ctx, () => next()));

// The invoke-token URL carries a single-use secret in its path, so `no-referrer` keeps it out of the Referer.
// Registered before secureHeaders so it runs after it on unwind and overrides the global referrer policy.
app.use('*', async (ctx, next) => {
  await next();
  if (ctx.req.path.includes('/invoke-token/')) ctx.res.headers.set('Referrer-Policy', 'no-referrer');
});

app.use(
  '*',
  secureHeaders({
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  }),
);

app.use(
  '*',
  httpInstrumentationMiddleware({
    serviceName: appConfig.name,
    serviceVersion: '1.0',
  }),
);

app.use('*', loggerMiddleware);

// No CORS middleware: the API is same-origin under /api, so other origins get no grant and the browser blocks them.
// CSRF rejects state-changing requests whose Origin header is not the app origin.
app.use('*', csrf({ origin: appConfig.frontendUrl }));

app.use('*', clientVersionMiddleware);

app.use('*', dynamicBodyLimit);

// gzip compression for GET requests only
app.use('*', (c, next) => {
  if (c.req.method === 'GET') {
    return compress()(c, next);
  }
  return next();
});

export { app };
