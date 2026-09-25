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
    ? { actorId: ctx.var.actor.id, isSystemAdmin: ctx.var.isSystemAdmin, scopes: ctx.var.actor.scopes }
    : { anonymous: true };

export interface AccessOptions {
  /**
   * Leave the key's or token's scope mask out of this check; the actor's own grants still decide.
   * For a read that the caller's scoped action implies and already covers, such as an attachment
   * write resolving its home channel: the mask names `attachment:write`, never the home's `read`.
   */
  unmasked?: boolean;
}

/**
 * Actor AND grants in one object for `checkAccess`. Hand-assembling one risks pairing one
 * actor's grants with another's identity.
 */
export const accessFrom = <C extends AccessContext>(ctx: C, options: AccessOptions = {}): Access<BindingOf<C>> =>
  ctx.var.actor
    ? {
        actorId: ctx.var.actor.id,
        isSystemAdmin: ctx.var.isSystemAdmin === true,
        memberships: ctx.var.actor.bindings as BindingOf<C>[],
        scopes: options.unmasked ? null : ctx.var.actor.scopes,
      }
    : { anonymous: true };
