import type { Access, Actor } from 'shared';
import type { Actor as ContextActor } from '#/core/context';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/** The guard-populated context fields the access helpers read; the engine's `userId` is any principal id. */
export interface AccessContext {
  var: {
    actor?: Pick<ContextActor, 'id' | 'grants' | 'scopes'>;
    isSystemAdmin?: boolean;
  };
}

/** Actor for compiled-predicate paths: a hand-assembled context without `actor` fail-closes every `'own'` grant. */
export const actorFrom = (ctx: AccessContext): Actor =>
  ctx.var.actor
    ? { userId: ctx.var.actor.id, isSystemAdmin: ctx.var.isSystemAdmin, scopes: ctx.var.actor.scopes }
    : { anonymous: true };

/**
 * Actor AND grants in one object for `checkAccess`. Hand-assembling one risks pairing one
 * principal's grants with another's identity.
 */
export const accessFrom = (ctx: AccessContext): Access<MembershipBaseModel> =>
  ctx.var.actor
    ? {
        userId: ctx.var.actor.id,
        isSystemAdmin: ctx.var.isSystemAdmin === true,
        memberships: ctx.var.actor.grants,
        scopes: ctx.var.actor.scopes,
      }
    : { anonymous: true };
