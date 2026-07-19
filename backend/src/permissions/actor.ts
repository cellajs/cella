import type { Access, Actor } from 'shared';
import type { AuthContext } from '#/core/context';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * The acting user for a compiled-predicate path (the SQL twin: row predicates, collection
 * scopes, catchup reads), from an authenticated request context.
 *
 * Every authenticated route has both `userId` and `isSystemAdmin` set by the guard chain, so
 * handlers must not assemble actors by hand because that lets call sites
 * ended up silently omitting `userId` and fail-closing every `'own'` grant.
 */
export const actorFrom = (ctx: AuthContext): Actor => ({
  userId: ctx.var.userId,
  isSystemAdmin: ctx.var.isSystemAdmin,
});

/**
 * The full access for a `checkAccess` call: actor AND memberships in one object, from the
 * guard-populated context. Handlers must not assemble accesses by hand: pairing one user's
 * memberships with another's identity is exactly the mismatch this helper closes off.
 * A context without a signed-in user yields a stated `{ anonymous: true }`.
 */
export const accessFrom = (ctx: AuthContext): Access<MembershipBaseModel> =>
  ctx.var.userId
    ? { userId: ctx.var.userId, isSystemAdmin: ctx.var.isSystemAdmin === true, memberships: ctx.var.memberships ?? [] }
    : { anonymous: true };
