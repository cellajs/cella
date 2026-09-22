import type { EntityActionType, EntityType } from '../../types.ts';
import type { PolicyMatrix } from './types.ts';

/** `write` implies `read`; the two verbs are the whole vocabulary a credential can be narrowed to. */
const scopeVerbs = ['read', 'write'] as const;
type ScopeVerb = (typeof scopeVerbs)[number];

/** Entity types a credential can be narrowed to: every type with a policy; users are never a scope. */
export type ScopedEntityType = Exclude<EntityType, 'user'>;

/** `attachment:read`, `task:write`, …: one pair per entity type that carries a policy. */
export type EntityScope = `${ScopedEntityType}:${ScopeVerb}`;

export interface Scopes {
  /** Every derivable scope: the credential form's enum, `scopes_supported` in discovery documents, the consent screen. Empty only for a configuration without a single policy. */
  all: readonly EntityScope[];
  /** The scope a credential needs for an action on an entity type: `read` for reads, `write` for everything else. */
  required: (entityType: ScopedEntityType, action: EntityActionType) => EntityScope;
  /** The scopes in a space-separated `scope` value that this vocabulary knows; anything else is dropped. */
  parse: (value: string | undefined | null) => EntityScope[];
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
  const types = Object.keys(policyMatrix) as ScopedEntityType[];
  const all: Scopes['all'] = types.flatMap((type) => scopeVerbs.map((verb): EntityScope => `${type}:${verb}`));
  const known = new Set<string>(all);
  const required: Scopes['required'] = (type, action) => `${type}:${action === 'read' ? 'read' : 'write'}`;
  return {
    all,
    required,
    parse: (value) => (value ?? '').split(' ').filter((scope): scope is EntityScope => known.has(scope)),
    allows: (scopes, type, action) =>
      scopes == null ||
      scopes.includes(required(type as ScopedEntityType, action)) ||
      (action === 'read' && scopes.includes(`${type as ScopedEntityType}:write`)),
  };
};
