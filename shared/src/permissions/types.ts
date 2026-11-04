import type { ChannelEntityType, ChannelRoleOf, EntityActionType, EntityRole, EntityType, ProductEntityType } from '../../types.ts';
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

export interface PolicyEntry {
  channelType: ChannelEntityType;
  role: EntityRole;
  permissions: EntityActionPermissions;
}

export type EntityPolicies = PolicyEntry[];

/** Only channel and product entities have policies; user access uses separate logic. */
export type PolicyMatrix = Partial<Record<ChannelEntityType | ProductEntityType, EntityPolicies>>;

/** Permissions are partial: an omitted action denies, so a policy lists only what it grants. */
export type PolicySetter = (permissions: Partial<Record<EntityActionType, PolicyCellInput>>) => void;

/** Each channel keyed by the roles the hierarchy declares for it, so a role the channel lacks fails to compile. */
export type ChannelPolicyBuilder = { [C in ChannelEntityType]: Record<ChannelRoleOf<C>, PolicySetter> };

/** Passed to the policy callback once per entity type. */
export interface PolicyConfiguration {
  entityType: EntityType;
  channels: ChannelPolicyBuilder;
  /** Call at most once per entity type; omitting it leaves the `public` flag dormant. @see public-read.ts */
  publicRead: () => void;
}

export type PolicyCallback = (config: PolicyConfiguration) => void;
