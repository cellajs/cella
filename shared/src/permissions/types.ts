import type { ChannelEntityType, EntityActionType, EntityRole, EntityType, ProductEntityType } from '../../types';
import type { PublicReadMode } from './public-read';
import type { RowConditionName } from './row-conditions';

/**
 * Closed policy-cell values: deny, unconditional allow, or creator-only allow.
 * @see row-conditions.ts
 */
export type PermissionValue = 0 | 1 | 'own';

/**
 * Permission value the engine and downstream consumers read. A cell is the config literal
 * verbatim: there is no object to normalize into, the `'own'` name IS the value. Typed as the
 * full {@link RowConditionName} union because the engine supports conditions beyond `'own'` and that is the vocabulary
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
 * "self" rows omit `create`: creation is granted on ancestor rows, not from inside the entity).
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
 * Resolved action state: unconditional boolean or a row condition evaluated per entity.
 * The closed condition union keeps downstream resolution exhaustive.
 */
export type ActionPermissionState = boolean | RowConditionName;
