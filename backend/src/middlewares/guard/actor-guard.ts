import { xMiddleware } from '#/core/x-middleware';
import { authGuard } from './auth-guard';
import { hasMachineCredential, machineGuard } from './machine-guard';

/**
 * One guard for routes any actor may call: a request carrying an API key goes through `machineGuard`, everything
 * else through `authGuard`. Only mount it on routes whose operations take `ActorContext`; a user-only operation
 * behind this guard would read `ctx.var.user` off a service actor.
 */
export const actorGuard = xMiddleware(
  {
    functionName: 'actorGuard',
    type: 'x-guard',
    name: 'actor',
    description: 'Accepts a session cookie or a secret API key and sets the actor',
  },
  async (ctx, next) => (hasMachineCredential(ctx) ? machineGuard(ctx, next) : authGuard(ctx, next)),
);
