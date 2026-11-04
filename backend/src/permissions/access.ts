import type { Access } from 'shared';
import type { Actor, ActorBinding } from '#/core/context';

/** The guard-populated context fields the access helpers read; the engine's `actorId` is a user's or a service account's id. */
export interface AccessContext {
  var: { actor?: Pick<Actor, 'id' | 'bindings' | 'scopes'>; isSystemAdmin?: boolean };
}

/**
 * Actor AND grants in one object for every check and read scope. Hand-assembling one risks pairing one
 * actor's grants with another's identity.
 */
export const accessFrom = (ctx: AccessContext): Access<ActorBinding> =>
  ctx.var.actor
    ? {
        actorId: ctx.var.actor.id,
        isSystemAdmin: ctx.var.isSystemAdmin === true,
        memberships: ctx.var.actor.bindings,
        scopes: ctx.var.actor.scopes,
      }
    : { anonymous: true };
