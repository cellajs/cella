import type { ChannelEntityType, EntityActionType, EntityType, ProductEntityType } from '../../types';
import type { PublicReadGrants } from './public-read';
import { isRowCondition } from './row-conditions';
import type {
  PolicyMatrix,
  PolicyCallback,
  PolicyConfiguration,
  PolicyEntry,
  ChannelPolicyBuilder,
  EntityActionPermissions,
  PolicyCellInput,
  EntityPolicies,
} from './types';
import { type HierarchyOverrides, resolveHierarchy } from './engine/resolve-hierarchy';

/**
 * Creates a channel policy builder for fluent role-permission configuration.
 */
const createChannelPolicyBuilder = (
  channelType: ChannelEntityType,
  roles: readonly string[],
  entries: PolicyEntry[],
  entityActions: readonly EntityActionType[],
): ChannelPolicyBuilder => {

  const builder: Record<string, (permissions: Partial<Record<EntityActionType, PolicyCellInput>>) => void> = {};

  for (const role of roles) {
    builder[role] = (permissions: Partial<Record<EntityActionType, PolicyCellInput>>) => {
      // Expand to a full record so the engine always reads an explicit value: any action the
      // policy omits defaults to 0 (denied). A cell is the config literal verbatim. The `'own'`
      // name IS the value the engine reads, so there is nothing to normalize.
      const fullPermissions = {} as EntityActionPermissions;
      for (const action of entityActions) {
        const value = permissions[action] ?? 0;
        // A row-conditioned create is invalid because its absent row cannot satisfy the condition.
        if (action === 'create' && isRowCondition(value)) {
          throw new Error(
            `[Permission] "${channelType}.${role}" uses a row condition ('${value}') on 'create', ` +
              `which can never match: the row does not exist yet. Use 1 or 0 for create.`,
          );
        }
        fullPermissions[action] = value;
      }
      entries.push({ channelType, role, permissions: fullPermissions });
    };
  }

  return builder as ChannelPolicyBuilder;
};

/**
 * Creates a channels object with builders for all channel types.
 */
const createChannelBuilders = (
  entries: PolicyEntry[],
  channelEntityTypes: readonly ChannelEntityType[],
  getRoles: (channelType: string) => readonly string[],
  entityActions: readonly EntityActionType[],
): Record<ChannelEntityType, ChannelPolicyBuilder> => {
  const channels = {} as Record<ChannelEntityType, ChannelPolicyBuilder>;

  for (const channelType of channelEntityTypes) {
    const roles = getRoles(channelType);
    channels[channelType] = createChannelPolicyBuilder(channelType, roles, entries, entityActions);
  }

  return channels;
};

/** Result of `configurePermissions`: the role x channel policy matrix + per-entity-type grants. */
export interface PermissionsConfigResult {
  policyMatrix: PolicyMatrix;
  publicReadGrants: PublicReadGrants;
}

/**
 * Configures entity policies through per-entity-type role/channel builders and a
 * per-entity-type public-read grant.
 * @see public-read.ts
 */
export const configurePermissions = (
  entityTypes: readonly EntityType[],
  callback: PolicyCallback,
  overrides?: HierarchyOverrides,
): PermissionsConfigResult => {
  const policies: PolicyMatrix = {};
  const publicReadGrants: PublicReadGrants = {};

  // Hierarchy defaults to the app's real config; tests pass a synthetic one (wide-fixture.ts).
  const { entityActions, channelEntityTypes, getRoles } = resolveHierarchy(overrides);

  const permissionableTypes = entityTypes.filter(
    (type): type is ChannelEntityType | ProductEntityType => type !== 'user',
  );

  for (const entityType of permissionableTypes) {
    const entries: PolicyEntry[] = [];
    const channels = createChannelBuilders(entries, channelEntityTypes, getRoles, entityActions);

    const config: PolicyConfiguration = {
      entityType,
      channels,
      publicRead: () => {
        if (publicReadGrants[entityType]) {
          throw new Error(`[Permission] publicRead() called twice for "${entityType}"`);
        }
        publicReadGrants[entityType] = true;
      },
    };

    callback(config);

    if (entries.length > 0) {
      policies[entityType] = entries;
    }
  }

  return { policyMatrix: policies, publicReadGrants };
};

/**
 * Configures a policy matrix only (no public read grants). Kept for tests and callers
 * that drive the engine with synthetic policies; app configs should use
 * `configurePermissions`.
 */
export const configurePolicyMatrix = (
  entityTypes: readonly EntityType[],
  callback: PolicyCallback,
  overrides?: HierarchyOverrides,
): PolicyMatrix => {
  return configurePermissions(entityTypes, callback, overrides).policyMatrix;
};

/**
 * Gets the policy entries for a specific entity type.
 */
export const getEntityPolicies = (
  entityType: ChannelEntityType | ProductEntityType,
  policies: PolicyMatrix,
): EntityPolicies => {
  return policies[entityType] ?? [];
};

/**
 * Gets the permissions for a specific channel and role combination.
 */
export const getPolicyPermissions = (
  policies: EntityPolicies,
  channelType: ChannelEntityType,
  role: string,
): EntityActionPermissions | undefined => {
  const entry = policies.find((p) => p.channelType === channelType && p.role === role);
  return entry?.permissions;
};
