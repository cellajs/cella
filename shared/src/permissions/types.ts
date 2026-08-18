import type { ChannelEntityType, EntityActionType, EntityRole, EntityType, ProductEntityType } from '../../types.ts';
import type { RowConditionName } from './row-conditions.ts';

/**
 * A cell is the config literal verbatim: the `'own'` name is the value, with nothing to
 * normalize. Typed as the full {@link RowConditionName} union because the name-keyed switches
 * close over that vocabulary, though `'public'` never appears as a cell.
 */
export type PolicyCell = 0 | 1 | RowConditionName;

/** `'public'` is excluded: public read is declared per entity type, never as a cell. */
export type PolicyCellInput = Exclude<PolicyCell, 'public'>;

export type EntityActionPermissions = Record<EntityActionType, PolicyCell>;

/**
 * `role` is a plain string: roles arrive from the possibly synthetic hierarchy's `getRoles` and
 * are only equality-compared or index-keyed here, never narrowed to `EntityRole`.
 */
export interface PolicyEntry {
  channelType: ChannelEntityType;
  role: string;
  permissions: EntityActionPermissions;
}

export type EntityPolicies = PolicyEntry[];

/** Only channel and product entities have policies; user access uses separate logic. */
export type PolicyMatrix = Partial<Record<ChannelEntityType | ProductEntityType, EntityPolicies>>;

/** Permissions are partial: an omitted action denies, so a policy lists only what it grants. */
export type ChannelPolicyBuilder = {
  [R in EntityRole]: (permissions: Partial<Record<EntityActionType, PolicyCellInput>>) => void;
};

/** Passed to the policy callback once per entity type. */
export interface PolicyConfiguration {
  entityType: EntityType;
  channels: Record<ChannelEntityType, ChannelPolicyBuilder>;
  /** Call at most once per entity type; omitting it leaves `publicAt` dormant. @see public-read.ts */
  publicRead: () => void;
}

export type PolicyCallback = (config: PolicyConfiguration) => void;

/** Unconditional boolean, or a row condition evaluated per entity. */
export type CanState = boolean | RowConditionName;
