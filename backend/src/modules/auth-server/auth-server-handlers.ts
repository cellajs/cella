import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { OIDC_MOUNT_PATH } from '#/modules/auth-server/oidc-constants';
import { getOidcProvider } from '#/modules/auth-server/oidc-provider';
import '#/modules/auth-server/auth-server-module';

/**
 * Bridges `node-oidc-provider` (a Koa app) into Cella's Hono/node-server stack.
 *
 * `provider.callback()` is a raw Node `(req, res)` listener, so we hand it the
 * unwrapped Node request/response from `@hono/node-server` bindings and return
 * `RESPONSE_ALREADY_SENT` to tell Hono the response was written directly.
 *
 * The sub-app is mounted at `/oauth`, but the raw `incoming.url` still carries
 * the full `/oauth/...` path. The provider's routes live at its own root
 * (`/token`, `/auth`, `/.well-known/openid-configuration`, `/jwks`, ...), so we
 * strip the mount prefix first — exactly what Express's `app.use('/oauth', ...)`
 * does. The issuer path (`/oauth`) is only used to build absolute URLs.
 */
const app = new OpenAPIHono<Env>();

app.all('/*', async (c) => {
  const provider = await getOidcProvider();
  const { incoming, outgoing } = c.env;

  // Strip the `/oauth` mount prefix so the provider matches its root routes.
  const original = incoming.url ?? '/';
  incoming.url = original.slice(OIDC_MOUNT_PATH.length) || '/';

  provider.callback()(incoming, outgoing);
  return RESPONSE_ALREADY_SENT;
});

export const authServerHandlers = app;
