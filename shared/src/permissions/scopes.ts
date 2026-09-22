import type { EntityActionType, EntityType } from '../../types.ts';
import type { PolicyMatrix } from './types.ts';

/** `write` implies `read`; the two verbs are the whole vocabulary a credential can be narrowed to. */
export const scopeVerbs = { read: ['read'], write: ['create', 'read', 'update', 'delete'] } as const;
export type ScopeVerb = keyof typeof scopeVerbs;

/** `attachment:read`, `task:write`, …: one pair per entity type that carries a policy. */
export type EntityScope = `${Exclude<EntityType, 'user'>}:${ScopeVerb}`;

export interface Scopes {
  /** Every derivable scope: the OpenAPI security scheme, `scopes_supported` in discovery documents, the consent screen. */
  all: readonly EntityScope[];
  /** The scope a credential needs for an action on an entity type: `read` for reads, `write` for everything else. */
  required: (entityType: EntityType, action: EntityActionType) => EntityScope;
  /** Whether a credential's scopes cover the action. An unscoped credential (`null`) always does. */
  allows: (scopes: readonly string[] | null | undefined, entityType: EntityType, action: EntityActionType) => boolean;
}

/**
 * Scopes are derived from the policy matrix, never listed by hand: an entity type with a policy has a `read` and a
 * `write` scope, and a credential holding neither cannot reach that type at all. Renaming an entity type renames its
 * scopes; a credential still holding the old name fails closed with `insufficient_scope`.
 */
export const deriveScopes = (policyMatrix: PolicyMatrix): Scopes => {
  const types = Object.keys(policyMatrix) as Exclude<EntityType, 'user'>[];
  const all = types.flatMap((type) => [`${type}:read`, `${type}:write`] as const satisfies readonly EntityScope[]);
  const required: Scopes['required'] = (type, action) =>
    `${type as Exclude<EntityType, 'user'>}:${action === 'read' ? 'read' : 'write'}`;
  return {
    all,
    required,
    allows: (scopes, type, action) =>
      scopes == null ||
      scopes.includes(required(type, action)) ||
      (action === 'read' && scopes.includes(`${type}:write`)),
  };
};
