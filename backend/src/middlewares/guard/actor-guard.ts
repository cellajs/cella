import { xMiddleware } from '#/core/x-middleware';
import { serviceGuard } from '#/middlewares/guard/service-guard';
import { userGuard } from '#/middlewares/guard/user-guard';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { bearerChallenge } from '#/modules/oauth-server/resources';
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
    limiters: serviceGuard.__limiters,
    name: 'Actor',
    description: 'Works with a signed-in session, a secret API key or an access token. The request acts as the user or service account behind it.',
  },
  (ctx, next) => {
    if (hasApiKeyHeader(ctx) || bearerJwtFrom(ctx)) return serviceGuard(ctx, next);
    // No proof at all, which the session guard refuses: the challenge tells a machine caller where to get a token
    // (RFC 9728 §5.1). A request with a session cookie keeps the session's own refusal: no scheme names a cookie.
    if (!getAuthCookie(ctx, 'session')) {
      const tenantId = ctx.req.param('tenantId')?.toLowerCase();
      ctx.header('WWW-Authenticate', bearerChallenge(tenantId ? { face: 'api', tenantId } : null));
    }
    return userGuard(ctx, next);
  },
);
