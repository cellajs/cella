import { xMiddleware } from '#/core/x-middleware';
import { bearerJwtFrom } from '#/modules/oauth-server/verify-access-token';
import { hasApiKeyHeader } from '#/modules/service-accounts/helpers/api-key';
import { serviceGuard } from './service-guard';
import { userGuard } from './user-guard';

/**
 * One guard for routes any actor may call: a request carrying an API key goes through `serviceGuard`, everything
 * else through `userGuard`. Only mount it on routes whose operations take `ActorContext`; a user-only operation
 * behind this guard would read `ctx.var.user` off a service actor.
 */
export const actorGuard = xMiddleware(
  {
    functionName: 'actorGuard',
    type: 'x-guard',
    name: 'actor',
    description: 'Accepts a session cookie or a secret API key and sets the actor',
  },
  async (ctx, next) => (hasApiKeyHeader(ctx) || bearerJwtFrom(ctx) ? serviceGuard(ctx, next) : userGuard(ctx, next)),
);
