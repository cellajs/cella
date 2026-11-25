import { httpInstrumentationMiddleware } from '@hono/otel';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { env } from '#/env';
import { requestSpanAttributes, setRequestSpanAttributes } from '#/lib/request-span';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { clientVersionMiddleware } from '#/middlewares/client-version';
import { compressResponse } from '#/middlewares/compress';
import { loggerMiddleware } from '#/middlewares/logger';
import { bearerJwtFrom } from '#/modules/oauth-server/verify-access-token';
import { hasApiKeyHeader } from '#/modules/service-accounts/helpers/api-key';
import { runWithLogContext } from '#/utils/logger';

export const app = new OpenAPIHono<Env>();

// Ambient log context in AsyncLocalStorage, first in the chain so every downstream log carries request ids
app.use('*', (ctx, next) => runWithLogContext(ctx, () => next()));

// A page that names its own `frame-ancestors` (an LTI platform frames it) sends no X-Frame-Options, which would refuse
// the frame in a browser that reads it alone. Mounted ahead of secureHeaders, so it runs after the header is set.
app.use('*', async (ctx, next) => {
  await next();
  if (ctx.res.headers.get('Content-Security-Policy')?.includes('frame-ancestors')) ctx.res.headers.delete('X-Frame-Options');
});

app.use(
  '*',
  secureHeaders({
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    // A route that sets one of these headers keeps its own value.
    overwrite: false,
  }),
);

const requestIdHeader = 'X-Request-Id';

// The span records the request id from the response header, so a trace is searchable by the id a user quotes.
const instrumentRequest = httpInstrumentationMiddleware({
  serviceName: appConfig.name,
  serviceVersion: env.RELEASE_SHA,
  captureResponseHeaders: [requestIdHeader],
});
// The span also names the tenant, organization and user the guards set, read before the tracing middleware ends it.
app.use('*', (ctx, next) =>
  instrumentRequest(ctx, async () => {
    await next();
    setRequestSpanAttributes(requestSpanAttributes(ctx.var));
  }),
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
// request that carries an API key (the service guard rejects browser origins itself) or an access token skips it: a
// page on another origin cannot add either header without that grant. So does a mail provider's one-click unsubscribe
// (RFC 8058): a form post with no Origin, authorized by the token in its URL alone. So do an LTI platform's login
// initiation and launch, cross-site form posts by design: a one-use nonce and the value the frame keeps hold them.
const csrfMiddleware = csrf({ origin: appConfig.frontendUrl });
const isOneClickUnsubscribe = (ctx: Context<Env>) => ctx.req.method === 'POST' && ctx.req.path.endsWith('/notifications/unsubscribe');
const ltiProtocolPosts = new Set(['/auth/lti/login', '/auth/lti/launch']);
const isLtiProtocolPost = (ctx: Context<Env>) => ctx.req.method === 'POST' && ltiProtocolPosts.has(ctx.req.path);
const carriesMachineProof = (ctx: Context<Env>) => hasApiKeyHeader(ctx) || bearerJwtFrom(ctx) !== null;
app.use('*', (ctx, next) => (carriesMachineProof(ctx) || isOneClickUnsubscribe(ctx) || isLtiProtocolPost(ctx) ? next() : csrfMiddleware(ctx, next)));

app.use('*', clientVersionMiddleware);

app.use('*', dynamicBodyLimit);

app.use('*', compressResponse);
