import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { resolveSession } from '#/modules/auth/sessions/operations/resolve-session';
import { isSystemAccessAllowed } from '#/utils/system-access';
import { updateLastSeenAt } from '../update-last-seen';
import { loadMemberships } from './membership-cache';

/**
 * Authenticates the session (an impersonation only on top of its admin's session) and sets user, session facts, the
 * admin behind an impersonation, memberships and base db context: the session comes from the session cache or one
 * read shared by the requests presenting it, the memberships from the cache at its bindings version.
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
    const { session, user, hasSystemRole, bindingsVersion, impersonator } = await resolveSession(ctx, { clearOnError: true });

    ctx.set('user', user);
    ctx.set('userId', user.id);
    ctx.set('session', session);
    ctx.set('sessionId', session.id);
    ctx.set('impersonator', impersonator);
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

    // An impersonation's requests are its admin's: only a session of the user's own marks the user as seen.
    if (ctx.req.method === 'GET' && !impersonator) updateLastSeenAt(user.id);

    await next();
  },
);
