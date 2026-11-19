import type { EntityActionType, EntityType } from '../../types.ts';
import type { PolicyMatrix } from './types.ts';

/** `write` implies `read`; the two verbs are the whole vocabulary a key or token can be narrowed to. */
const scopeVerbs = ['read', 'write'] as const;
type ScopeVerb = (typeof scopeVerbs)[number];

/** Entity types a key or token can be narrowed to with both verbs: every type with a policy but people. */
export type AccessScopedEntityType = Exclude<EntityType, 'user'>;

/** `attachment:read`, `task:write`, …: one pair per entity type that carries a policy, and `user:read` for people. */
export type AccessScope = `${AccessScopedEntityType}:${ScopeVerb}` | 'user:read';

export interface AccessScopes {
  /** Every derivable scope: what a token may carry and a route may declare. Empty only for a configuration without a single policy. */
  all: readonly AccessScope[];
  /**
   * The scopes an API key, a consent screen and a discovery document offer: every one but `user:read`, which a route
   * reads only for an installed LTI tool.
   */
  offered: readonly AccessScope[];
  /** The scope a key or token needs for an action on an entity type: `read` for reads, `write` for everything else. */
  required: (entityType: AccessScopedEntityType, action: EntityActionType) => AccessScope;
  /** The scopes in a space-separated `scope` value that this vocabulary knows; anything else is dropped. */
  parse: (value: string | undefined | null) => AccessScope[];
  /** Whether `held` holds `scope`: the scope itself, or the `write` scope of its type for a `read` one. */
  covers: (held: readonly AccessScope[], scope: AccessScope) => boolean;
  /**
   * Whether a key's or token's scopes cover the action. An unscoped one (`null` or absent) always does; people are read
   * with `user:read` alone, so a scoped one without it reads no one.
   */
  allows: (scopes: readonly AccessScope[] | null | undefined, entityType: EntityType, action: EntityActionType) => boolean;
}

/**
 * AccessScopes are derived from the policy matrix, never listed by hand: an entity type with a policy has a `read` and a
 * `write` scope, and a key or token holding neither cannot reach that type at all. People take `user:read` alone, since
 * their policy grants only `read`. Renaming an entity type renames its scopes; a key or token still holding the old
 * name fails closed (403, like any denied action).
 */
export const deriveAccessScopes = (policyMatrix: PolicyMatrix): AccessScopes => {
  const types = Object.keys(policyMatrix).filter((type): type is AccessScopedEntityType => type !== 'user');
  const people: AccessScope[] = Object.hasOwn(policyMatrix, 'user') ? ['user:read'] : [];
  const offered: AccessScopes['offered'] = types.flatMap((type) => scopeVerbs.map((verb): AccessScope => `${type}:${verb}`));
  const all: AccessScopes['all'] = [...offered, ...people];
  const known = new Set<string>(all);
  const required: AccessScopes['required'] = (type, action) => `${type}:${action === 'read' ? 'read' : 'write'}`;
  const writeOfRead = new Map(types.map((type): [AccessScope, AccessScope] => [`${type}:read`, `${type}:write`]));
  const covers: AccessScopes['covers'] = (held, scope) => {
    const write = writeOfRead.get(scope);
    return held.includes(scope) || (!!write && held.includes(write));
  };
  return {
    all,
    offered,
    required,
    parse: (value) => (value ?? '').split(' ').filter((scope): scope is AccessScope => known.has(scope)),
    covers,
    allows: (scopes, type, action) => {
      if (scopes == null) return true;
      if (type === 'user') return action === 'read' && scopes.includes('user:read');
      return covers(scopes, required(type, action));
    },
  };
};
