import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { loadMemberships } from '#/middlewares/guard/membership-cache';
import { tenantsRefusingActor } from '#/middlewares/guard/sign-in-policy';
import { updateLastSeenAt } from '#/middlewares/update-last-seen';
import { getAuthCookie, resolveSession } from '#/modules/auth/core';
import { isSystemAccessAllowed } from '#/utils/system-access';

/**
 * Authenticates the session and sets user, session facts, memberships and base db context: the session comes from the
 * session cache or one read shared by the requests presenting it, the memberships from the cache at its bindings
 * version. The actor's bindings leave out the memberships of a tenant whose sign-in policy refuses the session.
 */
export const userGuard = xMiddleware(
  {
    functionName: 'userGuard',
    type: 'x-guard',
    errors: [401],
    security: [{ cookieAuth: [] }],
    provides: ['actor', 'session'],
    name: 'User',
    description: 'Only a signed-in session works here, no API key or access token. The request acts as that user.',
  },
  async (ctx, next) => {
    // A refused cookie is deleted, so the browser stops presenting it.
    const { session, user, hasSystemRole, bindingsVersion } = await resolveSession(ctx, { clearOnError: true });

    ctx.set('user', user);
    ctx.set('session', session);
    ctx.set('stepUpCookie', getAuthCookie(ctx, 'session-step-up'));
    ctx.set('isSystemAdmin', hasSystemRole && isSystemAccessAllowed(ctx));
    ctx.set('db', baseDb);

    const memberships = await loadMemberships(user.id, bindingsVersion);
    const actor = {
      kind: 'user',
      id: user.id,
      bindings: memberships,
      scopes: null,
      authStrategy: session.authStrategy,
      connectionId: session.connectionId,
    } as const;
    const refused = ctx.var.isSystemAdmin ? new Set<string>() : await tenantsRefusingActor(ctx, actor, memberships);
    ctx.set('memberships', memberships);
    ctx.set('actor', refused.size ? { ...actor, bindings: memberships.filter(({ tenantId }) => !refused.has(tenantId)) } : actor);

    if (ctx.req.method === 'GET') updateLastSeenAt(user.id);

    await next();
  },
);
