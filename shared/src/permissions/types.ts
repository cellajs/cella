import type { ContextEntityType, EntityActionType, EntityRole, EntityType, ProductEntityType } from '../../types';

/**
 * Permission value for access policy entries.
 *
 * - `1` = allowed for all entities of this type (unconditional)
 * - `0` = denied
 * - `'own'` = allowed only when the actor is the entity's creator (implicit "owner" relation).
 *   This is equivalent to a Zanzibar-style `owner` relation check on the entity,
 *   derived from the `createdBy` field rather than an explicit relation tuple.
 *   Evaluates to `true` when `entity.createdBy === userId`, `false` otherwise.
 */
export type PermissionValue = 0 | 1 | 'own';

/**
 * Entity action permission set mapping each action to a permission value.
 */
export type EntityActionPermissions = Record<EntityActionType, PermissionValue>;

/**
 * Access policy entry for a specific context and role combination.
 */
export interface AccessPolicyEntry {
  contextType: ContextEntityType;
  role: EntityRole;
  permissions: EntityActionPermissions;
}

/**
 * Access policies for a subject (entity type).
 */
export type SubjectAccessPolicies = AccessPolicyEntry[];

/**
 * Full access policy configuration mapping subjects to their policies.
 * Only context and product entities have access policies — user access uses separate logic.
 */
export type AccessPolicies = Partial<Record<ContextEntityType | ProductEntityType, SubjectAccessPolicies>>;

/**
 * Context builder for fluent access policy configuration.
 * Maps entity roles to their permission setters.
 */
export type ContextPolicyBuilder = {
  [R in EntityRole]: (permissions: EntityActionPermissions) => void;
};

/**
 * Configuration passed to access policy callback.
 */
export interface AccessPolicyConfiguration {
  subject: { name: EntityType };
  contexts: Record<ContextEntityType, ContextPolicyBuilder>;
}

/**
 * Callback function for configuring access policies.
 */
export type AccessPolicyCallback = (config: AccessPolicyConfiguration) => void;
