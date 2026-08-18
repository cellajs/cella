import type { Access, Actor } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/** The guard-populated context fields the access helpers read. */
export interface AccessContext {
  var: {
    userId?: string;
    isSystemAdmin?: boolean;
    memberships?: MembershipBaseModel[];
  };
}

/** Actor for compiled-predicate paths: a hand-assembled one that omits `userId` fail-closes every `'own'` grant. */
export const actorFrom = (ctx: AccessContext): Actor =>
  ctx.var.userId ? { userId: ctx.var.userId, isSystemAdmin: ctx.var.isSystemAdmin } : { anonymous: true };

/**
 * Actor AND memberships in one object for `checkAccess`. Hand-assembling one risks pairing one
 * user's memberships with another's identity.
 */
export const accessFrom = (ctx: AccessContext): Access<MembershipBaseModel> =>
  ctx.var.userId
    ? { userId: ctx.var.userId, isSystemAdmin: ctx.var.isSystemAdmin === true, memberships: ctx.var.memberships ?? [] }
    : { anonymous: true };
