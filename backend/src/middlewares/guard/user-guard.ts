import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { loadMemberships } from '#/middlewares/guard/membership-cache';
import { updateLastSeenAt } from '#/middlewares/update-last-seen';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { resolveSession } from '#/modules/auth/sessions/operations/resolve-session';
import { isSystemAccessAllowed } from '#/utils/system-access';

/**
 * Authenticates the session and sets user, session facts, memberships and base db context: the session comes from the
 * session cache or one read shared by the requests presenting it, the memberships from the cache at its bindings
 * version.
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
    ctx.set('memberships', memberships);
    ctx.set('actor', {
      kind: 'user',
      id: user.id,
      bindings: memberships,
      scopes: null,
      authStrategy: session.authStrategy,
      connectionId: session.connectionId,
    });

    if (ctx.req.method === 'GET') updateLastSeenAt(user.id);

    await next();
  },
);
