import type { Access, Actor } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * The guard-populated context fields the access helpers read.
 *
 * Stating them structurally lets route handlers, middleware, and cache presets share one entry
 * point: every context that carries the guard's identity fields satisfies it, and one that does
 * not is rejected at the call site.
 */
export interface AccessContext {
  var: {
    userId?: string;
    isSystemAdmin?: boolean;
    memberships?: MembershipBaseModel[];
  };
}

/**
 * The acting user for a compiled-predicate path (the SQL twin: row predicates, collection
 * scopes, catchup reads), from a request context.
 *
 * Handlers must not assemble actors by hand: a call site that silently omits `userId`
 * fail-closes every `'own'` grant. A context without a signed-in user yields a stated
 * `{ anonymous: true }`, matching {@link accessFrom}.
 */
export const actorFrom = (ctx: AccessContext): Actor =>
  ctx.var.userId ? { userId: ctx.var.userId, isSystemAdmin: ctx.var.isSystemAdmin } : { anonymous: true };

/**
 * The full access for a `checkAccess` call: actor AND memberships in one object, from the
 * guard-populated context. Handlers must not assemble accesses by hand: pairing one user's
 * memberships with another's identity is exactly the mismatch this helper closes off.
 * A context without a signed-in user yields a stated `{ anonymous: true }`.
 */
export const accessFrom = (ctx: AccessContext): Access<MembershipBaseModel> =>
  ctx.var.userId
    ? { userId: ctx.var.userId, isSystemAdmin: ctx.var.isSystemAdmin === true, memberships: ctx.var.memberships ?? [] }
    : { anonymous: true };
