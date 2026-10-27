import { httpInstrumentationMiddleware } from '@hono/otel';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { compress } from 'hono/compress';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { env } from '#/env';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { clientVersionMiddleware } from '#/middlewares/client-version';
import { loggerMiddleware } from '#/middlewares/logger';
import { hasApiKeyHeader } from '#/modules/service-accounts/helpers/api-key';
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

const requestIdHeader = 'X-Request-Id';

// The span records the request id from the response header, so a trace is searchable by the id a user quotes.
app.use(
  '*',
  httpInstrumentationMiddleware({ serviceName: appConfig.name, serviceVersion: env.RELEASE_SHA, captureResponseHeaders: [requestIdHeader] }),
);

// One id per request, generated here and never taken from the caller, so no two requests share one.
app.use('*', (ctx, next) => {
  const requestId = crypto.randomUUID();
  ctx.set('requestId', requestId);
  ctx.header(requestIdHeader, requestId);
  return next();
});

app.use('*', loggerMiddleware);

// No CORS middleware: the API is same-origin under /api, so other origins get no grant and the browser blocks them.
// CSRF rejects state-changing requests whose Origin header is not the app origin. It protects cookie auth only, so a
// request that carries an API key skips it (the service guard rejects browser origins itself), and so does a mail
// provider's one-click unsubscribe (RFC 8058): a form post with no Origin, authorized by the token in its URL alone.
const csrfMiddleware = csrf({ origin: appConfig.frontendUrl });
const isOneClickUnsubscribe = (ctx: Context<Env>) => ctx.req.method === 'POST' && ctx.req.path.endsWith('/notifications/unsubscribe');
app.use('*', (ctx, next) => (hasApiKeyHeader(ctx) || isOneClickUnsubscribe(ctx) ? next() : csrfMiddleware(ctx, next)));

app.use('*', clientVersionMiddleware);

app.use('*', dynamicBodyLimit);

const compressMiddleware = compress();
app.use('*', (ctx, next) => (ctx.req.method === 'GET' ? compressMiddleware(ctx, next) : next()));

export { app };
