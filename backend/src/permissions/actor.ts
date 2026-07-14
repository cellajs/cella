import type { Actor } from 'shared';
import type { AuthContext } from '#/core/context';

/**
 * The acting user for a permission check, from an authenticated request context.
 *
 * Every authenticated route has both `userId` and `isSystemAdmin` set by the guard chain, so
 * there is no reason for a handler to assemble an actor by hand — doing so is how call sites
 * ended up silently omitting `userId` and fail-closing every `'own'` grant.
 */
export const actorFrom = (ctx: AuthContext): Actor => ({
  userId: ctx.var.userId,
  isSystemAdmin: ctx.var.isSystemAdmin,
});
