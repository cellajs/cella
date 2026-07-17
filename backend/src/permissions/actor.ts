import type { Actor } from 'shared';
import type { AuthContext } from '#/core/context';

/**
 * The acting user for a permission check, from an authenticated request context.
 *
 * Every authenticated route has both `userId` and `isSystemAdmin` set by the guard chain, so
 * handlers must not assemble actors by hand because that lets call sites
 * ended up silently omitting `userId` and fail-closing every `'own'` grant.
 */
export const actorFrom = (ctx: AuthContext): Actor => ({
  userId: ctx.var.userId,
  isSystemAdmin: ctx.var.isSystemAdmin,
});
