import { xMiddleware } from '#/core/x-middleware';
import { serviceGuard } from '#/middlewares/guard/service-guard';
import { userGuard } from '#/middlewares/guard/user-guard';
import { bearerJwtFrom } from '#/modules/oauth-server/verify-access-token';
import { hasApiKeyHeader } from '#/modules/service-accounts/helpers/api-key';

/**
 * One guard for routes any actor may call: a request carrying an API key goes through `serviceGuard`, everything
 * else through `userGuard`. Only mount it on routes whose operations take `ActorContext`; a user-only operation
 * behind this guard would read `ctx.var.user` off a service actor.
 */
export const actorGuard = xMiddleware(
  {
    functionName: 'actorGuard',
    type: 'x-guard',
    errors: [401, 403],
    security: [{ cookieAuth: [] }, { apiKey: [] }, { oauth2: [] }],
    provides: ['actor'],
    name: 'actor',
    description: 'Requires a session cookie, a secret API key or an access token; acts as the user or service account it proves',
  },
  (ctx, next) => (hasApiKeyHeader(ctx) || bearerJwtFrom(ctx) ? serviceGuard(ctx, next) : userGuard(ctx, next)),
);
