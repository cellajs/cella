import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { resolveSession } from '#/modules/auth/sessions/operations/resolve-session';
import { isSystemAccessAllowed } from '#/utils/system-access';
import { updateLastSeenAt } from '../update-last-seen';
import { loadMemberships } from './membership-cache';

/**
 * Authenticates the session (an impersonation only on top of its admin's session) and sets user, session facts,
 * memberships and base db context: the session is read per request, the memberships come from the cache at its
 * bindings version.
 */
export const userGuard = xMiddleware(
  {
    functionName: 'userGuard',
    type: 'x-guard',
    security: [{ cookieAuth: [] }],
    name: 'user',
    description: 'Requires a session cookie; acts as the signed-in user',
  },
  async (ctx, next) => {
    // A refused cookie is deleted, so the browser stops presenting it.
    const { session, user, hasSystemRole, bindingsVersion } = await resolveSession(ctx, { clearOnError: true });

    ctx.set('user', user);
    ctx.set('userId', user.id);
    ctx.set('session', session);
    ctx.set('sessionId', session.id);
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
