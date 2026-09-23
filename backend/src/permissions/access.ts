import type { Access, PredicateActor } from 'shared';
import type { Actor, ActorBinding } from '#/core/context';

/** The guard-populated context fields the access helpers read; the engine's `userId` is any actor id. */
export interface AccessContext {
  var: {
    actor?: Pick<Actor, 'id' | 'bindings' | 'scopes'>;
    isSystemAdmin?: boolean;
  };
}

/** The grant element type of a context's actor: membership rows for a `UserContext`, the union otherwise. */
export type BindingOf<C extends AccessContext> = NonNullable<C['var']['actor']>['bindings'][number] & ActorBinding;

/** Actor for compiled-predicate paths: a hand-assembled context without `actor` fail-closes every `'own'` grant. */
export const actorFrom = (ctx: AccessContext): PredicateActor =>
  ctx.var.actor
    ? { userId: ctx.var.actor.id, isSystemAdmin: ctx.var.isSystemAdmin, scopes: ctx.var.actor.scopes }
    : { anonymous: true };

/**
 * Actor AND grants in one object for `checkAccess`. Hand-assembling one risks pairing one
 * actor's grants with another's identity.
 */
export const accessFrom = <C extends AccessContext>(ctx: C): Access<BindingOf<C>> =>
  ctx.var.actor
    ? {
        userId: ctx.var.actor.id,
        isSystemAdmin: ctx.var.isSystemAdmin === true,
        memberships: ctx.var.actor.bindings as BindingOf<C>[],
        scopes: ctx.var.actor.scopes,
      }
    : { anonymous: true };
