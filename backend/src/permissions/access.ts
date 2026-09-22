import type { Access, Actor } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/** The guard-populated context fields the access helpers read; the engine's `userId` is any principal id. */
export interface AccessContext {
  var: {
    principalId?: string;
    isSystemAdmin?: boolean;
    grants?: MembershipBaseModel[];
  };
}

/** Actor for compiled-predicate paths: a hand-assembled one that omits `principalId` fail-closes every `'own'` grant. */
export const actorFrom = (ctx: AccessContext): Actor =>
  ctx.var.principalId ? { userId: ctx.var.principalId, isSystemAdmin: ctx.var.isSystemAdmin } : { anonymous: true };

/**
 * Actor AND grants in one object for `checkAccess`. Hand-assembling one risks pairing one
 * principal's grants with another's identity.
 */
export const accessFrom = (ctx: AccessContext): Access<MembershipBaseModel> =>
  ctx.var.principalId
    ? { userId: ctx.var.principalId, isSystemAdmin: ctx.var.isSystemAdmin === true, memberships: ctx.var.grants ?? [] }
    : { anonymous: true };
