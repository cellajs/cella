import type { EntityActionType, EntityType } from '../../types.ts';
import type { PolicyMatrix } from './types.ts';

/** `write` implies `read`; the two verbs are the whole vocabulary a credential can be narrowed to. */
const scopeVerbs = ['read', 'write'] as const;
type ScopeVerb = (typeof scopeVerbs)[number];

/** `attachment:read`, `task:write`, …: one pair per entity type that carries a policy. */
export type EntityScope = `${Exclude<EntityType, 'user'>}:${ScopeVerb}`;

export interface Scopes {
  /** Every derivable scope, non-empty: the credential form's enum, `scopes_supported` in discovery documents, the consent screen. */
  all: readonly [EntityScope, ...EntityScope[]];
  /** The scope a credential needs for an action on an entity type: `read` for reads, `write` for everything else. */
  required: (entityType: EntityType, action: EntityActionType) => EntityScope;
  /** Whether a credential's scopes cover the action. An unscoped credential (`null` or absent) always does. */
  allows: (
    scopes: readonly EntityScope[] | null | undefined,
    entityType: EntityType,
    action: EntityActionType,
  ) => boolean;
}

/**
 * Scopes are derived from the policy matrix, never listed by hand: an entity type with a policy has a `read` and a
 * `write` scope, and a credential holding neither cannot reach that type at all. Renaming an entity type renames its
 * scopes; a credential still holding the old name fails closed (403, like any denied action).
 */
export const deriveScopes = (policyMatrix: PolicyMatrix): Scopes => {
  const types = Object.keys(policyMatrix) as Exclude<EntityType, 'user'>[];
  const list = types.flatMap((type) => scopeVerbs.map((verb): EntityScope => `${type}:${verb}`));
  const [first, ...rest] = list;
  if (!first) throw new Error('[Permission] No entity type carries a policy, so no scope can be derived');
  const all: Scopes['all'] = [first, ...rest];
  const required: Scopes['required'] = (type, action) =>
    `${type as Exclude<EntityType, 'user'>}:${action === 'read' ? 'read' : 'write'}`;
  return {
    all,
    required,
    allows: (scopes, type, action) =>
      scopes == null ||
      scopes.includes(required(type, action)) ||
      (action === 'read' && scopes.includes(`${type as Exclude<EntityType, 'user'>}:write`)),
  };
};
