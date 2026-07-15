import type { ChannelEntityType, EntityActionType, EntityRole, EntityType, ProductEntityType } from '../../types';
import type { PublicReadMode } from './public-read';
import type { RowConditionName } from './row-conditions';

/**
 * Permission value accepted in access policy configuration.
 *
 * - `1` = allowed for all entities of this type (unconditional)
 * - `0` = denied
 * - `'own'` = the built-in owner condition (actor is the entity's creator).
 *
 * Row conditions are a closed set (`own`, and the public read grant), not a fork extension
 * point. So a config cell is one of exactly these three literals.
 *
 * @see row-conditions.ts
 */
export type PermissionValue = 0 | 1 | 'own';

/**
 * Permission value the engine and downstream consumers read. A cell is the config literal
 * verbatim — there is no object to normalize into, the `'own'` name IS the value. Typed as the
 * full {@link RowConditionName} union (rather than just `'own'`) because that is the vocabulary
 * the name-keyed switches close over; `'public'` never actually appears as a cell.
 */
export type NormalizedPermissionValue = 0 | 1 | RowConditionName;

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
  channelType: ChannelEntityType;
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
export type AccessPolicies = Partial<Record<ChannelEntityType | ProductEntityType, SubjectAccessPolicies>>;

/**
 * Fluent per-role permission setters for a context. Permissions are partial: any omitted action
 * defaults to `0` (denied), so a policy lists only what it grants (e.g. a channel entity's own
 * "self" rows omit `create` — creation is granted on ancestor rows, not from inside the entity).
 */
export type ChannelPolicyBuilder = {
  [R in EntityRole]: (permissions: Partial<Record<EntityActionType, PermissionValue>>) => void;
};

/**
 * Configuration passed to access policy callback.
 */
export interface AccessPolicyConfiguration {
  subject: { name: EntityType };
  contexts: Record<ChannelEntityType, ChannelPolicyBuilder>;
  /**
   * Declare the subject-level public read grant for this subject.
   *
   * @see public-read.ts
   */
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
 * - a {@link RowConditionName} (e.g. `'own'`) = allowed only for rows satisfying that row
 *   condition; resolve per row via `resolvePermission`. Narrowed to the closed name union (not a
 *   bare `string`) so `resolvePermission`'s switch is exhaustive — a new condition name is a
 *   compile error there, not a silent frontend denial.
 */
export type ActionPermissionState = boolean | RowConditionName;
