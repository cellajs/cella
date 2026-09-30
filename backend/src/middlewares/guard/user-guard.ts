import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { resolveSession } from '#/modules/auth/general/helpers/session';
import { isSystemAccessAllowed } from '#/utils/system-access';
import { updateLastSeenAt } from '../update-last-seen';
import { loadMemberships } from './auth-cache';

/**
 * Authenticates the session (an impersonation only on top of its admin's session) and sets user, session facts,
 * memberships and base db context from short TTL caches.
 */
export const userGuard = xMiddleware(
  {
    functionName: 'userGuard',
    type: 'x-guard',
    security: [{ cookieAuth: [] }],
    name: 'user',
    description: 'Requires valid session and sets auth context (user, memberships, baseDb)',
  },
  async (ctx, next) => {
    // A refused cookie is deleted, so the browser stops presenting it.
    const { session, user, hasSystemRole } = await resolveSession(ctx, { clearOnError: true });

    ctx.set('user', user);
    ctx.set('userId', user.id);
    ctx.set('session', session);
    ctx.set('sessionId', session.id);
    ctx.set('isSystemAdmin', hasSystemRole && isSystemAccessAllowed(ctx));
    ctx.set('db', baseDb);

    // Memberships cached separately with longer TTL (keyed by userId)
    const memberships = await loadMemberships(user.id);
    ctx.set('memberships', memberships);
    ctx.set('actor', { kind: 'user', id: user.id, bindings: memberships, scopes: null });

    if (ctx.req.method === 'GET') updateLastSeenAt(user.id);

    await next();
  },
);
