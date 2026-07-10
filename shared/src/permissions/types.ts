import type { ContextEntityType, EntityActionType, EntityRole, EntityType, ProductEntityType } from '../../types';
import type { PublicReadMode } from './public-read';
import type { RowCondition } from './row-conditions';

/**
 * Permission value accepted in access policy configuration.
 *
 * - `1` = allowed for all entities of this type (unconditional)
 * - `0` = denied
 * - `RowCondition` = allowed only for rows satisfying the condition (see `row-conditions.ts`)
 * - `'own'` = sugar for the built-in `own` condition (actor is the entity's creator);
 *   normalized to the condition object when policies are configured.
 */
export type PermissionValue = 0 | 1 | 'own' | RowCondition;

/**
 * Permission value after configuration-time normalization (`'own'` sugar resolved).
 * This is the only vocabulary the engine and downstream consumers see.
 */
export type NormalizedPermissionValue = 0 | 1 | RowCondition;

/**
 * Entity action permission set mapping each action to a normalized permission value.
 */
export type EntityActionPermissions = Record<EntityActionType, NormalizedPermissionValue>;

/**
 * Access policy entry for a specific context and role combination.
 *
 * `role` is a plain string: roles arrive from the (possibly synthetic) hierarchy's `getRoles`
 * and are only ever equality-compared / index-keyed here, never narrowed to `EntityRole`.
 */
export interface AccessPolicyEntry {
  contextType: ContextEntityType;
  role: string;
  permissions: EntityActionPermissions;
}

/**
 * Access policies for a subject (entity type).
 */
export type SubjectAccessPolicies = AccessPolicyEntry[];

/**
 * Full access policy configuration mapping subjects to their policies.
 * Only context and product entities have access policies: user access uses separate logic.
 */
export type AccessPolicies = Partial<Record<ContextEntityType | ProductEntityType, SubjectAccessPolicies>>;

/**
 * Context builder for fluent access policy configuration.
 * Maps entity roles to their permission setters.
 *
 * Permissions are partial: any action you omit defaults to `0` (denied). This lets a policy list
 * only the actions it grants (e.g. a context entity's own ("self") rows can omit `create`, since
 * an entity can never be created from inside itself: creation is granted on ancestor rows).
 */
export type ContextPolicyBuilder = {
  [R in EntityRole]: (permissions: Partial<Record<EntityActionType, PermissionValue>>) => void;
};

/**
 * Configuration passed to access policy callback.
 */
export interface AccessPolicyConfiguration {
  subject: { name: EntityType };
  contexts: Record<ContextEntityType, ContextPolicyBuilder>;
  /** Declare the subject-level public read grant for this subject (see `public-read.ts`). */
  publicRead: (mode: PublicReadMode) => void;
}

/**
 * Callback function for configuring access policies.
 */
export type AccessPolicyCallback = (config: AccessPolicyConfiguration) => void;

/**
 * Per-action permission state resolved for a specific entity type.
 *
 * - `true` = unconditionally allowed
 * - `false` = denied
 * - condition name (e.g. `'own'`) = allowed only for rows satisfying that row condition;
 *   resolve per row via `resolvePermission` (built-in `'own'`) or the condition's `matches`.
 */
export type ActionPermissionState = boolean | string;
