import type { ChannelEntityType, EntityActionType, EntityRole, EntityType, ProductEntityType } from '../../types';
import type { RowConditionName } from './row-conditions';

/**
 * Policy cell value the engine and downstream consumers read. A cell is the config literal
 * verbatim: the `'own'` name IS the value, there is nothing to normalize. Typed as the full
 * {@link RowConditionName} union because that is the vocabulary the name-keyed switches close
 * over; `'public'` never actually appears as a cell.
 */
export type PolicyCell = 0 | 1 | RowConditionName;

/**
 * Closed config-facing policy-cell values: deny, unconditional allow, or creator-only allow.
 * `'public'` is excluded: public read is declared per entity type via `publicRead()`, never as
 * a cell.
 * @see row-conditions.ts
 */
export type PolicyCellInput = Exclude<PolicyCell, 'public'>;

/**
 * Entity action permission set mapping each action to a policy cell.
 */
export type EntityActionPermissions = Record<EntityActionType, PolicyCell>;

/**
 * Policy entry for a specific channel and role combination.
 *
 * `role` is a plain string: roles arrive from the (possibly synthetic) hierarchy's `getRoles`
 * and are only ever equality-compared / index-keyed here, never narrowed to `EntityRole`.
 */
export interface PolicyEntry {
  channelType: ChannelEntityType;
  role: string;
  permissions: EntityActionPermissions;
}

/**
 * Policy entries for one entity type.
 */
export type EntityPolicies = PolicyEntry[];

/**
 * Full policy matrix mapping entity types to their policies.
 * Only channel and product entities have policies: user access uses separate logic.
 */
export type PolicyMatrix = Partial<Record<ChannelEntityType | ProductEntityType, EntityPolicies>>;

/**
 * Fluent per-role permission setters for a channel. Permissions are partial: any omitted action
 * defaults to `0` (denied), so a policy lists only what it grants (e.g. a channel entity's own
 * "self" rows omit `create`: creation is granted on ancestor rows, not from inside the entity).
 */
export type ChannelPolicyBuilder = {
  [R in EntityRole]: (permissions: Partial<Record<EntityActionType, PolicyCellInput>>) => void;
};

/**
 * Configuration passed to the policy callback, once per entity type.
 */
export interface PolicyConfiguration {
  entityType: EntityType;
  channels: Record<ChannelEntityType, ChannelPolicyBuilder>;
  /**
   * Opt this entity type into public read: rows whose own `publicAt` is set become readable by
   * any actor, anonymous included. Call it at most once per entity type; omitting it keeps
   * `publicAt` dormant for the type.
   *
   * @see public-read.ts
   */
  publicRead: () => void;
}

/**
 * Callback function for configuring the policy matrix.
 */
export type PolicyCallback = (config: PolicyConfiguration) => void;

/**
 * Resolved action state: unconditional boolean or a row condition evaluated per entity.
 * The closed condition union keeps downstream resolution exhaustive.
 */
export type CanState = boolean | RowConditionName;
