import type { ChannelEntityType, EntityRole, EntityType, ProductEntityType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { recordFromKeys } from '../config-builder/utils.ts';
import { type AccessScopes, deriveAccessScopes } from './access-scopes.ts';
import { type HierarchyOverrides, resolveHierarchy } from './engine/resolve-hierarchy.ts';
import type { PublicReadGrants } from './public-read.ts';
import { isRowCondition } from './row-conditions.ts';
import type {
  ChannelPolicyBuilder,
  EntityActionPermissions,
  EntityPolicies,
  PolicyCallback,
  PolicyConfiguration,
  PolicyEntry,
  PolicyMatrix,
} from './types.ts';

const createChannelPolicyBuilder = (channelType: ChannelEntityType, roles: readonly string[], entries: PolicyEntry[]): ChannelPolicyBuilder => {
  const builder: Record<string, ChannelPolicyBuilder[EntityRole]> = {};

  for (const role of roles) {
    builder[role] = (permissions) => {
      // Expand to a full record so the engine always reads an explicit value; an omitted action
      // defaults to 0 (denied).
      const fullPermissions = recordFromKeys(appConfig.entityActions, (action) => {
        const value = permissions[action] ?? 0;
        // A row-conditioned create is invalid because its absent row cannot satisfy the condition.
        if (action === 'create' && isRowCondition(value)) {
          throw new Error(
            `[Permission] "${channelType}.${role}" uses a row condition ('${value}') on 'create', ` +
              'which can never match: the row does not exist yet. Use 1 or 0 for create.',
          );
        }
        return value;
      });
      entries.push({ channelType, role, permissions: fullPermissions });
    };
  }

  return builder as ChannelPolicyBuilder;
};

export interface PermissionsConfigResult {
  policyMatrix: PolicyMatrix;
  publicReadGrants: PublicReadGrants;
  /** Derived from the matrix: the access scope vocabulary for API keys and access tokens. @see access-scopes.ts */
  accessScopes: AccessScopes;
}

/** @see public-read.ts */
export const configurePermissions = (
  entityTypes: readonly EntityType[],
  callback: PolicyCallback,
  overrides?: HierarchyOverrides,
): PermissionsConfigResult => {
  const policies: PolicyMatrix = {};
  const publicReadGrants: PublicReadGrants = {};

  const { channelEntityTypes, getRoles } = resolveHierarchy(overrides);

  const permissionableTypes = entityTypes.filter((type): type is ChannelEntityType | ProductEntityType => type !== 'user');

  for (const entityType of permissionableTypes) {
    const entries: PolicyEntry[] = [];
    const channels = recordFromKeys(channelEntityTypes, (channelType) => createChannelPolicyBuilder(channelType, getRoles(channelType), entries));

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

  return { policyMatrix: policies, publicReadGrants, accessScopes: deriveAccessScopes(policies) };
};

/** No public read grants. For tests and callers driving the engine with synthetic policies. */
export const configurePolicyMatrix = (entityTypes: readonly EntityType[], callback: PolicyCallback, overrides?: HierarchyOverrides): PolicyMatrix => {
  return configurePermissions(entityTypes, callback, overrides).policyMatrix;
};

/**
 * Total lookup: an entity type the matrix does not cover yields no entries, which the engine
 * reads as denied. Callers hold runtime strings, so a miss is a normal result.
 */
export const getEntityPolicies = (entityType: string, policies: PolicyMatrix): EntityPolicies => {
  const byEntityType: Partial<Record<string, EntityPolicies>> = policies;
  return byEntityType[entityType] ?? [];
};

/** A channel/role pair with no entry yields `undefined`, which callers read as denied. */
export const getPolicyPermissions = (policies: EntityPolicies, channelType: string, role: string): EntityActionPermissions | undefined => {
  const entry = policies.find((p) => p.channelType === channelType && p.role === role);
  return entry?.permissions;
};
